#!/usr/bin/env bash
# Instala y arranca Nexo en macOS o Linux sin Docker (SQLite local). Uso: ./iniciar.sh
set -euo pipefail
cd "$(dirname "$0")"
PY=""
for c in python3.12 python3.13 python3.11 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "Se necesita Python 3.11 o superior (recomendado 3.12): https://www.python.org/downloads/"; exit 1; }
echo "› Usando $($PY --version)"
cd backend
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet --require-hashes -r requirements.txt
.venv/bin/python -m app.cli init
if [ ! -f ../var/nexo.db ] || [ "${RECARGAR_DATOS:-0}" = "1" ] || ! .venv/bin/python -c "
from app.db import SesionLocal; from app.models import CompraItem; from sqlalchemy import func, select
import sys; bd = SesionLocal(); sys.exit(0 if bd.execute(select(func.count()).select_from(CompraItem)).scalar() else 1)"; then
  echo "› Cargando los datos oficiales procesados (aprox. 20 segundos)…"
  .venv/bin/python -m app.cli datos
fi
[ -f ../var/credenciales-demo.txt ] || .venv/bin/python -m app.cli demo
echo
echo "✓ Nexo está listo en http://localhost:8000"
echo "  Cuentas de demostración: var/credenciales-demo.txt"
echo "  Detener: Ctrl+C"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
