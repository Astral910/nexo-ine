"""Salud de TI: métricas, hallazgos del agente, respaldos e inventario de componentes de terceros."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from importlib import metadata

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import bitacora
from ..config import RAIZ
from ..db import obtener_bd
from ..deps import Contexto, requiere
from ..services import agente_ti
from ..services.hallazgos import puntaje

router = APIRouter(prefix="/api/ti", tags=["ti"])


@router.get("/salud")
def salud(ctx: Contexto = Depends(requiere("ti:ver")), bd: Session = Depends(obtener_bd)):
    return {"puntaje": puntaje(bd, "ti"), "metricas": agente_ti.metricas(bd)}


@router.post("/revisar")
def revisar(ctx: Contexto = Depends(requiere("ti:ver")), bd: Session = Depends(obtener_bd)):
    r = agente_ti.revisar(bd)
    bitacora.registrar("ti.revision_manual", usuario=ctx.usuario, modulo="ti", detalle=r, ip=ctx.ip)
    return r


def _licencia_python(dist: metadata.Distribution) -> str:
    meta = dist.metadata
    lic = meta.get("License-Expression") or ""
    if not lic:
        clasif = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
        lic = ", ".join(clasif) or (meta.get("License") or "")[:60]
    return lic or "No declarada"


@lru_cache
def componentes() -> dict:
    """Inventario de dependencias (Python y JavaScript) con versión y licencia."""
    requeridos = set()
    req = RAIZ / "backend" / "requirements.txt"
    if req.exists():
        for linea in req.read_text().splitlines():
            m = re.match(r"^([A-Za-z0-9_.\-]+)==", linea)
            if m:
                requeridos.add(m.group(1).lower())
    python = []
    for dist in metadata.distributions():
        nombre = (dist.metadata.get("Name") or "").lower()
        if nombre in requeridos:
            python.append({"nombre": dist.metadata["Name"], "version": dist.version, "licencia": _licencia_python(dist)})
    js = []
    lock = RAIZ / "frontend" / "package-lock.json"
    if lock.exists():
        datos = json.loads(lock.read_text())
        directos = set((datos.get("packages", {}).get("", {}).get("dependencies") or {}).keys())
        for ruta, p in (datos.get("packages") or {}).items():
            nombre = ruta.split("node_modules/")[-1] if ruta else ""
            if nombre in directos:
                js.append({"nombre": nombre, "version": p.get("version", ""), "licencia": p.get("license", "No declarada")})
    return {"python": sorted(python, key=lambda x: x["nombre"].lower()),
            "javascript": sorted(js, key=lambda x: x["nombre"])}


@router.get("/componentes")
def ver_componentes(ctx: Contexto = Depends(requiere("ti:ver", "jurado:ver"))):
    return componentes()
