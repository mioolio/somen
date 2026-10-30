# Boundary: one read-only snapshot of WeChat/Weixin process metadata and account
# evidence. This script has no messaging, file writes, or privilege elevation.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$warnings = New-Object System.Collections.Generic.List[object]
$rows = New-Object System.Collections.Generic.List[object]

try {
    $entries = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='Weixin.exe' OR Name='WeChat.exe'" -ErrorAction Stop)
} catch {
    # Failure must not masquerade as zero running clients.
    [Console]::Error.WriteLine('PROCESS_QUERY_FAILED: Windows process query unavailable.')
    exit 2
}

$nativeReady = $false
if ($entries.Count -gt 0) {
    try {
        Add-Type -Path @(
            (Join-Path $PSScriptRoot 'AccountProfile.cs'),
            (Join-Path $PSScriptRoot 'ProcessMemory.cs'),
            (Join-Path $PSScriptRoot 'CurrentAccount.cs'),
            (Join-Path $PSScriptRoot 'ActiveFileHandles.cs')
        ) -ErrorAction Stop
        $nativeReady = $true
    } catch {
        $warnings.Add(@{code='ACCOUNT_PROVIDER_UNAVAILABLE'; message='账号读取组件暂不可用，进程识别仍可使用。'})
    }
}

$profiles = @()
if ($nativeReady) {
    try {
        . (Join-Path $PSScriptRoot 'load-profiles.ps1')
        $loaded = Import-AccountProfiles -Directory (Join-Path $PSScriptRoot '../versions')
        $profiles = [Somen.Wechat.AccountProfile[]]$loaded.profiles
        foreach ($warning in $loaded.warnings) { $warnings.Add($warning) }
    } catch {
        $warnings.Add(@{code='ACCOUNT_PROFILES_UNAVAILABLE'; message='账号版本配置暂不可用，进程识别仍可使用。'})
    }
}

$knownIds = @{}
$startById = @{}
foreach ($entry in $entries) { $knownIds[[int]$entry.ProcessId] = $true }

foreach ($entry in $entries) {
    $processId = [int]$entry.ProcessId
    $parentId = [int]$entry.ParentProcessId
    $role = 'unknown'
    $command = [string]$entry.CommandLine
    if ($command -match '(?i)(?:^|\s)--type(?:=|\s)\S+') { $role = 'auxiliary' }
    elseif (-not $knownIds.ContainsKey($parentId)) { $role = 'main' }

    $windowTitle = ''; $version = ''; $startedAt = $null; $startTicks = 0L; $executablePath = [string]$entry.ExecutablePath
    try {
        $process = Get-Process -Id $processId -ErrorAction Stop
        $windowTitle = [string]$process.MainWindowTitle
        if (-not $executablePath) { $executablePath = [string]$process.Path }
        if ($executablePath) { $version = [string][Diagnostics.FileVersionInfo]::GetVersionInfo($executablePath).FileVersion }
        $startedAt = $process.StartTime.ToUniversalTime().ToString('o')
        $startTicks = $process.StartTime.ToUniversalTime().Ticks
        if ($null -eq $entry.CreationDate) {
            $startTicks = 0L
            $warnings.Add(@{code='PROCESS_IDENTITY_PARTIAL'; message="PID $processId 的创建时间不可核对，账号待识别。"})
        } else {
            $cimTicks = ([DateTime]$entry.CreationDate).ToUniversalTime().Ticks
            # CIM carries microseconds; FILETIME can carry 100 ns. Accept only
            # that serialization precision loss, not a different process lifetime.
            if ([Math]::Abs($startTicks - $cimTicks) -ge 10) {
                $warnings.Add(@{code='PROCESS_IDENTITY_CHANGED'; message="PID $processId 在扫描期间已变化，已跳过该进程。"})
                continue
            }
        }
    } catch {
        $startTicks = 0L
        $warnings.Add(@{code='PROCESS_METADATA_PARTIAL'; message="PID $processId 的部分信息暂不可读取。"})
    }
    if (-not $command) {
        $warnings.Add(@{code='PROCESS_ROLE_PARTIAL'; message="PID $processId 的命令行不可读取，实例归属可能不完整。"})
    }
    $accounts = New-Object System.Collections.Generic.List[object]
    if ($nativeReady -and $role -ne 'auxiliary' -and $startTicks -gt 0) {
        $result = [Somen.Wechat.CurrentAccount]::Read($processId, $startTicks, [Somen.Wechat.AccountProfile[]]$profiles)
        if ($null -ne $result.account) { $accounts.Add($result.account) }
        elseif ($result.code) {
            $warnings.Add(@{code=$result.code; message="PID ${processId}: $($result.message)"})
        }
    }
    $rows.Add([PSCustomObject]@{
        pid=$processId; parentPid=$parentId; processName=[string]$entry.Name
        commandLine=$command; executablePath=$executablePath; windowTitle=$windowTitle
        version=$version; startedAt=$startedAt; role=$role; accounts=$accounts
    })
    if ($startTicks -gt 0) { $startById[$processId] = $startTicks }
}

# The verified current-account adapter is preferred. Unknown binary versions can
# still expose active directory candidates; candidates never assert a login ID.
$unresolved = @($rows | Where-Object { $_.role -ne 'auxiliary' -and $_.accounts.Count -eq 0 -and $startById.ContainsKey([int]$_.pid) })
if ($nativeReady -and $unresolved.Count -gt 0) {
    try {
        $identities = @($unresolved | ForEach-Object {
            $identity = New-Object Somen.Wechat.ProcessIdentity
            $identity.pid = [int]$_.pid
            $identity.startTicks = [long]$startById[[int]$_.pid]
            $identity
        })
        $handleResult = [Somen.Wechat.ActiveFileHandles]::Read([Somen.Wechat.ProcessIdentity[]]$identities)
        foreach ($warning in $handleResult.warnings) { $warnings.Add($warning) }
        foreach ($path in $handleResult.paths) {
            $row = $rows | Where-Object { $_.pid -eq $path.pid } | Select-Object -First 1
            if ($null -ne $row) {
                $row.accounts.Add([PSCustomObject]@{
                    id=$path.directory; source='active-file-handle'; evidence=$path.path; verified=$false
                })
            }
        }
    } catch {
        $warnings.Add(@{code='ACCOUNT_PATH_UNAVAILABLE'; message='活跃账号目录线索暂不可读取。'})
    }
}

[PSCustomObject]@{processes=@($rows.ToArray()); warnings=@($warnings.ToArray())} | ConvertTo-Json -Depth 8 -Compress
