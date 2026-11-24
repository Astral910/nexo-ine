"""La bitácora detecta alteraciones, recálculos sin llave y borrados del final; no pierde eventos."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select

from app import bitacora
from app.db import SesionLocal
from app.models import Bitacora


def _ultimos(n: int) -> list[Bitacora]:
    with SesionLocal() as bd:
        return list(bd.execute(select(Bitacora).order_by(Bitacora.id.desc()).limit(n)).scalars())


def test_detalle_con_fechas_y_secretos_anidados_no_se_pierde():
    assert bitacora.registrar("prueba.tipos", detalle={"fecha": date(2026, 11, 24), "monto": Decimal("10.50"),
                                                       "cambios": {"password": "secreto", "codigo_articulo": "0111"}})
    ev = _ultimos(1)[0]
    assert ev.accion == "prueba.tipos"
    assert ev.detalle["fecha"] == "2026-11-24" and ev.detalle["monto"] == "10.50"
    assert ev.detalle["cambios"]["password"] == "[omitido]"
    assert ev.detalle["cambios"]["codigo_articulo"] == "0111"  # no se oculta de más


def test_alteracion_y_recalculo_sin_llave_se_detectan():
    for i in range(3):
        bitacora.registrar(f"prueba.cadena{i}")
    with SesionLocal() as bd:
        assert bitacora.verificar_cadena(bd)["integra"]
        # Un atacante con acceso a la base altera un registro y recalcula la cadena con SHA-256 simple
        regs = list(bd.execute(select(Bitacora).order_by(Bitacora.id)).scalars())
        regs[-2].accion = "prueba.alterada"
        previo = regs[-3].hash
        for r in regs[-2:]:
            r.hash_previo = previo
            canon = json.dumps(bitacora._contenido(r.ts, r.usuario_id, r.usuario_nombre, r.accion, r.modulo, r.objeto,
                                                   r.detalle, r.resultado, r.ip, previo), sort_keys=True,
                               ensure_ascii=False, default=str, separators=(",", ":"))
            r.hash = hashlib.sha256(canon.encode()).hexdigest()
            previo = r.hash
        bd.commit()
        assert bitacora.verificar_cadena(bd, anclar_resultado=False)["integra"] is False
        bd.execute(delete(Bitacora))  # se limpia para las demás pruebas
        bd.commit()
    bitacora.ruta_anclas().unlink(missing_ok=True)


def test_borrado_del_final_se_detecta_con_el_ancla():
    for i in range(4):
        bitacora.registrar(f"prueba.ancla{i}")
    with SesionLocal() as bd:
        assert bitacora.verificar_cadena(bd)["integra"]  # deja un ancla con el último registro
        ultimo = bd.execute(select(Bitacora).order_by(Bitacora.id.desc()).limit(1)).scalar()
        bd.delete(ultimo)
        bd.commit()
        r = bitacora.verificar_cadena(bd)
        assert r["integra"] is False and "ancla" in r["motivo"]  # «ancla» también cubre «anclados»
