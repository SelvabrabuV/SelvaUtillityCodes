$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dotnet = Join-Path $env:LOCALAPPDATA "Microsoft\dotnet\dotnet.exe"
if (-not (Test-Path $dotnet)) { $dotnet = "dotnet" }
$env:DOTNET_ROOT = Split-Path $dotnet
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"

$publishRoot = if ($env:DIFFDESK_PUBLISH_ROOT) { $env:DIFFDESK_PUBLISH_ROOT } else { Join-Path $root "artifacts" }
New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null
$publishRoot = (Resolve-Path $publishRoot).Path
$publishDrive = Get-PSDrive ([System.IO.Path]::GetPathRoot($publishRoot).TrimEnd('\').TrimEnd(':'))
if ($publishDrive.Free -lt 1500MB) {
    Write-Error "DiffDesk publish needs about 1500 MB free on $($publishDrive.Name):. Free now: $([math]::Round($publishDrive.Free / 1MB)) MB. Set DIFFDESK_PUBLISH_ROOT to a folder on a drive with space."
}

$profileDriveName = [System.IO.Path]::GetPathRoot($env:USERPROFILE).TrimEnd('\').TrimEnd(':')
$profileDrive = Get-PSDrive $profileDriveName
if ($profileDrive.Free -lt 800MB -and -not $env:NUGET_PACKAGES) {
    $env:NUGET_PACKAGES = Join-Path $publishRoot "_nuget"
}

$desktop = Join-Path $publishRoot "DiffDesk-win-x64"
$cli = Join-Path $publishRoot "diffdesk-cli-win-x64"
$intermediates = Join-Path $publishRoot "_msbuild\"
& $dotnet publish (Join-Path $root "src\DiffDesk.Desktop\DiffDesk.Desktop.csproj") -c Release -r win-x64 --self-contained true -o $desktop --artifacts-path $intermediates
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $dotnet publish (Join-Path $root "src\DiffDesk.Cli\DiffDesk.Cli.csproj") -c Release -r win-x64 --self-contained true -o $cli --artifacts-path $intermediates
exit $LASTEXITCODE
