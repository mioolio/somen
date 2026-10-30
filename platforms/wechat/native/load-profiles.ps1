# Boundary: discover data-only account profiles independently. One malformed file
# contributes a warning, while all remaining profiles and process scanning work.
function Import-AccountProfiles {
    param([string]$Directory)
    $profiles = New-Object 'System.Collections.Generic.List[Somen.Wechat.AccountProfile]'
    $diagnostics = New-Object System.Collections.Generic.List[object]
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return [PSCustomObject]@{ profiles=$profiles.ToArray(); warnings=$diagnostics.ToArray() }
    }
    try { $files = @(Get-ChildItem -LiteralPath $Directory -Filter '*.json' -File -ErrorAction Stop) }
    catch {
        $diagnostics.Add(@{code='ACCOUNT_PROFILES_UNAVAILABLE'; message='账号版本配置目录暂不可读取。'})
        return [PSCustomObject]@{ profiles=$profiles.ToArray(); warnings=$diagnostics.ToArray() }
    }
    foreach ($file in $files) {
        try {
            if ($file.Length -gt 16384) { throw 'Profile exceeds 16 KiB.' }
            $definition = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            $profile = New-Object Somen.Wechat.AccountProfile
            $profile.schemaVersion = [int]$definition.schemaVersion
            foreach ($field in @('reader','moduleName','version','architecture','dllSha256')) {
                $profile.$field = [string]$definition.$field
            }
            foreach ($field in @('managerPointerRva','managerVtableRva','ownerVtableRva','getterRva',
                'getterSlotOffset','ownerOffset','controlOffset','selfOffset','strongCountOffset')) {
                $value = [string]$definition.$field
                if ($value -notmatch '^0x[0-9a-fA-F]{1,8}$') { throw 'Invalid profile offset.' }
                $profile.$field = [Convert]::ToInt64($value.Substring(2), 16)
            }
            $checks = New-Object 'System.Collections.Generic.List[Somen.Wechat.AccountCodeCheck]'
            foreach ($definitionCheck in @($definition.codeChecks)) {
                $check = New-Object Somen.Wechat.AccountCodeCheck
                $rva = [string]$definitionCheck.rva
                $bytes = [string]$definitionCheck.bytes
                if ($rva -notmatch '^0x[0-9a-fA-F]{1,8}$' -or
                    $bytes -notmatch '^[0-9a-fA-F]{2}(?: [0-9a-fA-F]{2}){7,255}$') {
                    throw 'Invalid profile code check.'
                }
                $check.rva = [Convert]::ToInt64($rva.Substring(2), 16)
                $check.bytes = [byte[]]@($bytes.Split(' ') | ForEach-Object { [Convert]::ToByte($_, 16) })
                $checks.Add($check)
            }
            $profile.codeChecks = $checks.ToArray()
            $profile.Validate()
            $profiles.Add($profile)
        } catch {
            # File contents and parser exceptions are not echoed into API output.
            $diagnostics.Add(@{code='ACCOUNT_PROFILE_INVALID'; message="账号版本配置 $($file.Name) 暂不可用，已跳过。"})
        }
    }
    return [PSCustomObject]@{ profiles=$profiles.ToArray(); warnings=$diagnostics.ToArray() }
}
