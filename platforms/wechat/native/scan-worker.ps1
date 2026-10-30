# Boundary: fixed read-only scan requests over private stdio. No arbitrary commands,
# messaging, writes or injected callbacks; EOF releases this scanner normally.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$scanScript = Join-Path $PSScriptRoot 'scan.ps1'
while ($null -ne ($scanRequest = [Console]::ReadLine())) {
    if ($scanRequest -ne 'scan') {
        [Console]::WriteLine('{"ok":false,"code":"INVALID_SCAN_REQUEST"}')
        continue
    }
    try {
        $global:LASTEXITCODE = 0
        $scanJson = & $scanScript
        if ($LASTEXITCODE -ne 0) { throw 'Read-only scan failed.' }
        $snapshot = $scanJson | ConvertFrom-Json
        [Console]::WriteLine((@{ok=$true; snapshot=$snapshot} | ConvertTo-Json -Depth 10 -Compress))
    } catch {
        # Error details may contain process paths; return a fixed transport code.
        [Console]::WriteLine('{"ok":false,"code":"PROCESS_QUERY_FAILED"}')
    }
}
