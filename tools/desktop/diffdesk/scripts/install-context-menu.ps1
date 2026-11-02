# Optional. This writes two current-user Explorer commands. It does not need administrator rights.
# Run uninstall-context-menu.ps1 to remove them. DiffDesk does not install this by itself.
$ErrorActionPreference = "Stop"
$exe = Join-Path (Split-Path -Parent $PSScriptRoot) "artifacts\DiffDesk-win-x64\DiffDesk.exe"
if (-not (Test-Path $exe)) {
    Write-Error "Publish DiffDesk first. Expected $exe"
}
$select = "HKCU:\Software\Classes\Directory\shell\DiffDeskSelect"
$compare = "HKCU:\Software\Classes\Directory\shell\DiffDeskCompare"
New-Item -Path $select -Force | Out-Null
Set-ItemProperty -Path $select -Name "(default)" -Value "DiffDesk: select as left folder"
New-Item -Path "$select\command" -Force | Out-Null
Set-ItemProperty -Path "$select\command" -Name "(default)" -Value "`"$exe`" --select-left `"%1`""
New-Item -Path $compare -Force | Out-Null
Set-ItemProperty -Path $compare -Name "(default)" -Value "DiffDesk: compare this folder"
New-Item -Path "$compare\command" -Force | Out-Null
Set-ItemProperty -Path "$compare\command" -Name "(default)" -Value "`"$exe`" --folders `"%1`""
Write-Output "Explorer commands were added for the current user."
