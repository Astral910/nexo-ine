"""Bitácora de auditoría con evidencia de manipulación.

- Cada registro se encadena con el anterior mediante HMAC-SHA256 con una llave del servidor: quien tenga
  acceso a la base de datos no puede alterar un registro y recalcular la cadena sin esa llave.
- Cada verificación deja un "ancla" (último id y hash) en un archivo de solo anexado fuera de la base. Si
  alguien borra los registros finales, la cadena restante sigue siendo válida, pero el ancla lo delata.
- En producción, las anclas deben enviarse además a un almacenamiento externo (syslog o WORM).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import threading
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import obtener_config
from .db import SesionLocal, ahora, es_postgres
from .models import Bitacora

log = logging.getLogger("nexo.bitacora")
_candado = threading.Lock()
GENESIS = "0" * 64
_SENSIBLES_EXACTOS = {"password", "contrasena", "clave", "nueva", "actual", "token", "secreto", "csrf", "codigo",
                      "codigo_mfa", "codigos_recuperacion", "otp"}
_SENSIBLES_SUFIJOS = ("_password", "_token", "_secreto", "_clave_secreta")


class BitacoraNoDisponible(RuntimeError):
    """Se lanza en acciones críticas cuando no se pudo registrar el evento (la acción no debe seguir)."""


@lru_cache
def _llave() -> bytes:
    from .security.cifrado import llave

    return llave("bitacora")


def _sanear(valor: Any, profundidad: int = 0) -> Any:
    """Quita secretos en cualquier nivel y convierte todo a tipos JSON (fechas y decimales a texto)."""
    if profundidad > 5:
        return "[…]"
    if isinstance(valor, dict):
        limpio = {}
        for k, v in list(valor.items())[:50]:
            k = str(k)
            if k.lower() in _SENSIBLES_EXACTOS or k.lower().endswith(_SENSIBLES_SUFIJOS):
                limpio[k] = "[omitido]"
            else:
                limpio[k] = _sanear(v, profundidad + 1)
        return limpio
    if isinstance(valor, (list, tuple, set)):
        return [_sanear(v, profundidad + 1) for v in list(valor)[:50]]
    if isinstance(valor, str):
        return valor[:500] + "…" if len(valor) > 500 else valor
    if valor is None or isinstance(valor, (bool, int, float)):
        return valor
    return str(valor)


def calcular_hash(reg: dict[str, Any]) -> str:
    canon = json.dumps(reg, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":"))
    return hmac.new(_llave(), canon.encode(), hashlib.sha256).hexdigest()


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


def registrar(accion: str, *, usuario=None, modulo: str = "", objeto: str = "", detalle: dict[str, Any] | None = None,
              resultado: str = "ok", ip: str = "", critico: bool = False) -> bool:
    """Escribe un evento en su propia transacción. Si `critico` y falla, lanza BitacoraNoDisponible."""
    detalle = _sanear(detalle) if detalle else None
    usuario_id = getattr(usuario, "id", None)
    usuario_nombre = getattr(usuario, "nombre", "") or ""
    for intento in range(3):
        with _candado:
            bd = SesionLocal()
            try:
                if es_postgres():
                    bd.execute(text("SELECT pg_advisory_xact_lock(424242)"))
                ultimo = bd.execute(select(Bitacora.hash).order_by(Bitacora.id.desc()).limit(1)).scalar()
                previo = ultimo or GENESIS
                ts = ahora()
                cont = _contenido(ts, usuario_id, usuario_nombre, accion, modulo, objeto, detalle, resultado, ip, previo)
                bd.add(Bitacora(ts=ts, usuario_id=usuario_id, usuario_nombre=usuario_nombre, accion=accion,
                                modulo=modulo, objeto=objeto[:120], detalle=detalle, resultado=resultado, ip=ip,
                                hash_previo=previo, hash=calcular_hash(cont)))
                bd.commit()
                return True
            except IntegrityError:  # otra escritura tomó el mismo eslabón: se reintenta sin bifurcar la cadena
                bd.rollback()
                continue
            except Exception:
                bd.rollback()
                log.exception("No se pudo escribir en la bitácora: %s (intento %s)", accion, intento + 1)
            finally:
                bd.close()
    if critico:
        raise BitacoraNoDisponible("La acción se detuvo porque no se pudo registrar en la bitácora.")
    return False


# ---------------------------------------------------------------------------
# Verificación y anclas
# ---------------------------------------------------------------------------


def ruta_anclas() -> Path:
    return obtener_config().directorio_var / "anclas-bitacora.log"


def leer_ultima_ancla() -> dict | None:
    ruta = ruta_anclas()
    if not ruta.exists():
        return None
    lineas = [x for x in ruta.read_text().splitlines() if x.strip()]
    if not lineas:
        return None
    ts, id_, h = lineas[-1].split()
    return {"ts": ts, "id": int(id_), "hash": h}


def anclar(id_: int, hash_: str) -> None:
    with ruta_anclas().open("a") as f:
        f.write(f"{ahora().isoformat(timespec='seconds')} {id_} {hash_}\n")


def verificar_cadena(bd: Session, anclar_resultado: bool = True) -> dict[str, Any]:
    """Recalcula la cadena completa y la compara con la última ancla externa."""
    previo, total, ultimo_id = GENESIS, 0, 0
    hashes: dict[int, str] = {}
    for reg in bd.execute(select(Bitacora).order_by(Bitacora.id)).scalars():
        total += 1
        cont = _contenido(reg.ts, reg.usuario_id, reg.usuario_nombre, reg.accion, reg.modulo, reg.objeto,
                          reg.detalle, reg.resultado, reg.ip, reg.hash_previo)
        if reg.hash_previo != previo or not hmac.compare_digest(calcular_hash(cont), reg.hash):
            return {"integra": False, "registros": total, "roto_en": reg.id, "motivo": "eslabón alterado",
                    "verificado_en": ahora().isoformat()}
        previo, ultimo_id = reg.hash, reg.id
        hashes[reg.id] = reg.hash
    ancla = leer_ultima_ancla()
    if ancla and hashes.get(ancla["id"]) != ancla["hash"]:
        return {"integra": False, "registros": total, "roto_en": ancla["id"],
                "motivo": "faltan registros que ya estaban anclados (posible borrado del final)",
                "ancla": ancla, "verificado_en": ahora().isoformat()}
    if anclar_resultado and ultimo_id and (not ancla or ancla["id"] != ultimo_id):
        anclar(ultimo_id, previo)
    return {"integra": True, "registros": total, "roto_en": None, "ultimo_hash": previo, "ancla": leer_ultima_ancla(),
            "verificado_en": ahora().isoformat()}
