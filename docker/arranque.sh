#!/bin/sh
# Prepara la base (idempotente), carga los datos si faltan y arranca la API con un solo proceso
# (el programador de automatizaciones vive en ese proceso).
set -e
cd /app/backend
python -m app.cli init
python - <<'PY'
from app.db import SesionLocal
from app.models import CompraItem
from sqlalchemy import func, select
with SesionLocal() as bd:
    vacia = (bd.execute(select(func.count()).select_from(CompraItem)).scalar() or 0) == 0
open("/tmp/nexo-vacia", "w").write("1" if vacia else "0")
PY
if [ "$(cat /tmp/nexo-vacia)" = "1" ]; then python -m app.cli datos; fi
if [ "${NEXO_CREAR_DEMO:-false}" = "true" ] && [ "${NEXO_ENTORNO:-desarrollo}" != "produccion" ]; then python -m app.cli demo; fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="${NEXO_PROXIES_CONFIABLES:-127.0.0.1}"
