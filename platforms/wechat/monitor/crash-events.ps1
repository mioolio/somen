param(
    [Parameter(Mandatory=$true)][string]$StartedAt,
    [Parameter(Mandatory=$true)][string]$Until,
    [Parameter(Mandatory=$true)][ValidateSet('Weixin.exe','WeChat.exe')][string]$ApplicationName
)
# Boundary: read Application Error/WER records for the selected client's time
# window. Transport contains only correlation IDs and content-free diagnostics.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$start = [DateTime]::Parse($StartedAt, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
$end = [DateTime]::Parse($Until, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
$fromXml = $start.ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ')
$toXml = $end.ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ')
$xpath = "*[System[(EventID=1000 or EventID=1001) and TimeCreated[@SystemTime >= '$fromXml' and @SystemTime <= '$toXml']]] and *[EventData[Data[@Name='AppName']='$ApplicationName' or Data[@Name='P1']='$ApplicationName']]"
try { $events = @(Get-WinEvent -LogName Application -FilterXPath $xpath -MaxEvents 100 -ErrorAction Stop) }
catch {
    if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { $events = @() }
    else { [Console]::Error.WriteLine('CRASH_EVENTS_UNAVAILABLE'); exit 2 }
}
$safe = @(foreach ($event in $events) {
    [xml]$xml = $event.ToXml()
    $fields = @{}
    foreach ($field in $xml.Event.EventData.Data) { $fields[[string]$field.Name] = [string]$field.'#text' }
    $app = [string]$fields.AppName
    if (-not $app) { $app = [string]$fields.P1 }
    if ($app -cne $ApplicationName) { continue }
    $module = [string]$fields.ModuleName
    $code = [string]$fields.ExceptionCode
    if ($event.Id -eq 1001) {
        $module = [string]$fields.P4
        if ($fields.EventName -eq 'APPCRASH') { $code = [string]$fields.P7 }
        elseif ($fields.EventName -eq 'BEX64' -or $fields.EventName -eq 'BEX') { $code = [string]$fields.P8 }
    }
    $creation = $null
    if ([string]$fields.ProcessCreationTime -match '^0x([0-9a-fA-F]{1,16})$') {
        try { $creation = [DateTime]::FromFileTimeUtc([Convert]::ToInt64($Matches[1], 16)).ToString('o') } catch { }
    }
    $reportId = [string]$fields.IntegratorReportId
    if (-not $reportId) { $reportId = [string]$fields.ReportId }
    [PSCustomObject]@{
        eventId=[int]$event.Id; time=$event.TimeCreated.ToUniversalTime().ToString('o')
        application=$app; pid=[string]$fields.ProcessId; processStartedAt=$creation
        reportId=$reportId; code=$code; faultModule=[IO.Path]::GetFileName($module); faultOffset=[string]$fields.FaultingOffset
    }
})
ConvertTo-Json -InputObject $safe -Depth 3 -Compress
