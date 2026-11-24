"""Bitácora de auditoría con cadena de hashes SHA-256.

Cada registro guarda el hash del anterior. Si alguien altera o borra un registro en la base de
datos, la verificación detecta en qué punto se rompe la cadena.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from datetime import datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .db import SesionLocal, ahora, es_postgres
from .models import Bitacora

log = logging.getLogger("nexo.bitacora")
_candado = threading.Lock()
GENESIS = "0" * 64
_CLAVES_SENSIBLES = {"password", "clave", "token", "codigo", "secreto", "csrf", "mfa"}


def _limpiar(detalle: dict[str, Any] | None) -> dict[str, Any] | None:
    """Nunca se escriben secretos en la bitácora."""
    if not detalle:
        return None
    limpio: dict[str, Any] = {}
    for k, v in detalle.items():
        if any(s in k.lower() for s in _CLAVES_SENSIBLES):
            limpio[k] = "[omitido]"
        elif isinstance(v, str) and len(v) > 500:
            limpio[k] = v[:500] + "…"
        else:
            limpio[k] = v
    return limpio


def calcular_hash(reg: dict[str, Any]) -> str:
    canon = json.dumps(reg, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()


def _contenido(ts: datetime, usuario_id, usuario_nombre, accion, modulo, objeto, detalle, resultado, ip, previo) -> dict:
    return {
        "ts": ts.isoformat(timespec="microseconds"),
        "usuario_id": usuario_id,
        "usuario_nombre": usuario_nombre or "",
        "accion": accion,
        "modulo": modulo or "",
        "objeto": objeto or "",
        "detalle": detalle,
        "resultado": resultado,
        "ip": ip or "",
        "hash_previo": previo,
    }


def registrar(
    accion: str,
    *,
    usuario=None,
    modulo: str = "",
    objeto: str = "",
    detalle: dict[str, Any] | None = None,
    resultado: str = "ok",
    ip: str = "",
) -> None:
    """Escribe un evento en su propia transacción (queda registrado aunque la acción falle)."""
    detalle = _limpiar(detalle)
    usuario_id = getattr(usuario, "id", None)
    usuario_nombre = getattr(usuario, "nombre", "") or ""
    with _candado:
        bd = SesionLocal()
        try:
            if es_postgres():
                bd.execute(text("SELECT pg_advisory_xact_lock(424242)"))
            ultimo = bd.execute(select(Bitacora.hash).order_by(Bitacora.id.desc()).limit(1)).scalar()
            previo = ultimo or GENESIS
            ts = ahora()
            cont = _contenido(ts, usuario_id, usuario_nombre, accion, modulo, objeto, detalle, resultado, ip, previo)
            bd.add(
                Bitacora(
                    ts=ts, usuario_id=usuario_id, usuario_nombre=usuario_nombre, accion=accion, modulo=modulo,
                    objeto=objeto, detalle=detalle, resultado=resultado, ip=ip, hash_previo=previo,
                    hash=calcular_hash(cont),
                )
            )
            bd.commit()
        except Exception:  # la bitácora nunca debe tumbar la operación principal
            bd.rollback()
            log.exception("No se pudo escribir en la bitácora: %s", accion)
        finally:
            bd.close()


def verificar_cadena(bd: Session) -> dict[str, Any]:
    """Recalcula toda la cadena. Devuelve si está íntegra y, si no, el primer registro roto."""
    previo = GENESIS
    total = 0
    for reg in bd.execute(select(Bitacora).order_by(Bitacora.id)).scalars():
        total += 1
        cont = _contenido(reg.ts, reg.usuario_id, reg.usuario_nombre, reg.accion, reg.modulo, reg.objeto,
                          reg.detalle, reg.resultado, reg.ip, reg.hash_previo)
        if reg.hash_previo != previo or calcular_hash(cont) != reg.hash:
            return {"integra": False, "registros": total, "roto_en": reg.id, "verificado_en": ahora().isoformat()}
        previo = reg.hash
    return {"integra": True, "registros": total, "roto_en": None, "ultimo_hash": previo,
            "verificado_en": ahora().isoformat()}
