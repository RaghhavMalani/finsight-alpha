# Start the FinSight Forge live spine on Windows PowerShell.
#   .\live.ps1                 API + live feeds + frontend dev server
#   .\live.ps1 --no-frontend   API + live feeds
#   .\live.ps1 --offline       replay recorded segments, no network
# Ctrl+C stops everything. Uses .venv\Scripts\python.exe when present.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }
& $python -m finsight live @args
exit $LASTEXITCODE
