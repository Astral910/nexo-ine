# Instala y arranca Nexo en Windows sin Docker (SQLite local). Uso (PowerShell):  .\iniciar.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$py = $null
foreach ($c in @("py -3.12", "py -3.13", "py -3.11", "python")) {
  try { & cmd /c "$c -c ""import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)""" 2>$null; if ($LASTEXITCODE -eq 0) { $py = $c; break } } catch {}
}
if (-not $py) { Write-Host "Se necesita Python 3.11 o superior (recomendado 3.12): https://www.python.org/downloads/"; exit 1 }
Set-Location backend
if (-not (Test-Path .venv)) { & cmd /c "$py -m venv .venv" }
$venv = ".\.venv\Scripts\python.exe"
& $venv -m pip install --quiet --upgrade pip
& $venv -m pip install --quiet --require-hashes -r requirements.txt
& $venv -m app.cli init
if (-not (Test-Path ..\var\credenciales-demo.txt)) {
  Write-Host "Cargando los datos oficiales procesados (aprox. 30 segundos)..."
  & $venv -m app.cli datos
  & $venv -m app.cli demo
}
Write-Host ""
Write-Host "Nexo esta listo en http://localhost:8000"
Write-Host "Cuentas de demostracion: var\credenciales-demo.txt"
& $venv -m uvicorn app.main:app --host 127.0.0.1 --port 8000
