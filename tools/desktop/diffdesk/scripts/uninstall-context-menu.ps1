$ErrorActionPreference = "Stop"
Remove-Item -Path "HKCU:\Software\Classes\Directory\shell\DiffDeskSelect" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\Directory\shell\DiffDeskCompare" -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "DiffDesk Explorer commands were removed for the current user."
