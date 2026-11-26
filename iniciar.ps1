# Instala y arranca Nexo en Windows sin Docker (SQLite local). Uso (PowerShell):  .\iniciar.ps1  [-Puerto 8000]
param([int]$Puerto = 8000)
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
# PowerShell no detiene el script cuando falla un programa externo: se revisa cada paso
function Paso($msg) { if ($LASTEXITCODE -ne 0) { Write-Host "Error: $msg (codigo $LASTEXITCODE)"; exit 1 } }
& $venv -m pip install --quiet --upgrade pip
Paso "no se pudo actualizar pip"
& $venv -m pip install --quiet --require-hashes -r requirements.txt
Paso "no se pudieron instalar las dependencias"
& $venv -m app.cli init
Paso "no se pudo preparar la base"
if (-not (Test-Path ..\var\credenciales-demo.txt)) {
  Write-Host "Cargando los datos oficiales procesados (aprox. 30 segundos)..."
  & $venv -m app.cli datos
  Paso "no se pudieron cargar los datos"
  & $venv -m app.cli demo
  Paso "no se pudieron crear las cuentas de demostracion"
}
Write-Host ""
Write-Host "Nexo esta listo en http://localhost:$Puerto"
Write-Host "Cuentas de demostracion: var\credenciales-demo.txt"
& $venv -m uvicorn app.main:app --host 127.0.0.1 --port $Puerto
