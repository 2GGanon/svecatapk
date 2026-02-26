param(
  [string]$SourceAppPath = "..\\export\\shadowverse-android-installable\\app",
  [string]$DestinationPath = ".\\assets\\www"
)

$ErrorActionPreference = "Stop"

$src = Resolve-Path $SourceAppPath
$dst = Resolve-Path $DestinationPath

Write-Host "Sync source: $src"
Write-Host "Sync destination: $dst"

Get-ChildItem -Force $dst | Remove-Item -Recurse -Force
Get-ChildItem -Force $src | ForEach-Object {
  Copy-Item -Recurse -Force $_.FullName $dst
}

Write-Host "Sync complete."
