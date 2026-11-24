"""Consulta, verificación y exportación de la bitácora inalterable."""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import obtener_bd
from ..deps import Contexto, requiere
from ..models import Bitacora
from ..services.centro import describir
from ..services.validador import neutralizar

router = APIRouter(prefix="/api/bitacora", tags=["bitácora"])


def _consulta(accion, modulo, resultado, usuario_id, desde, hasta):
    q = select(Bitacora)
    if accion:
        q = q.where(Bitacora.accion.like(f"{accion.replace('%', '')}%"))
    if modulo:
        q = q.where(Bitacora.modulo == modulo)
    if resultado:
        q = q.where(Bitacora.resultado == resultado)
    if usuario_id:
        q = q.where(Bitacora.usuario_id == usuario_id)
    if desde:
        q = q.where(Bitacora.ts >= datetime.combine(desde, time.min))
    if hasta:
        q = q.where(Bitacora.ts <= datetime.combine(hasta, time.max))
    return q


@router.get("")
def listar(accion: str | None = Query(default=None, max_length=80), modulo: str | None = Query(default=None, max_length=40),
           resultado: str | None = None, usuario_id: int | None = None, desde: date | None = None,
           hasta: date | None = None, pagina: int = Query(default=1, ge=1, le=2000),
           ctx: Contexto = Depends(requiere("bitacora:ver")), bd: Session = Depends(obtener_bd)):
    q = _consulta(accion, modulo, resultado, usuario_id, desde, hasta)
    total = bd.execute(select(func.count()).select_from(q.subquery())).scalar()
    filas = bd.execute(q.order_by(Bitacora.id.desc()).offset((pagina - 1) * 50).limit(50)).scalars()
    modulos = [m for (m,) in bd.execute(select(Bitacora.modulo).distinct()) if m]
    return {"total": total, "pagina": pagina, "modulos": sorted(modulos), "eventos": [
        {"id": e.id, "ts": e.ts.isoformat(), "usuario": e.usuario_nombre or "Sistema", "accion": e.accion,
         "texto": describir(e), "modulo": e.modulo, "objeto": e.objeto, "detalle": e.detalle, "resultado": e.resultado,
         "ip": e.ip, "hash": e.hash, "hash_previo": e.hash_previo} for e in filas]}


@router.get("/verificar")
def verificar(ctx: Contexto = Depends(requiere("bitacora:ver")), bd: Session = Depends(obtener_bd)):
    r = bitacora.verificar_cadena(bd)
    bitacora.registrar("bitacora.verificada", usuario=ctx.usuario, modulo="bitacora", detalle={"integra": r["integra"]},
                       resultado="ok" if r["integra"] else "error", ip=ctx.ip)
    return r


@router.get("/exportar.csv")
def exportar(accion: str | None = None, modulo: str | None = None, resultado: str | None = None,
             desde: date | None = None, hasta: date | None = None, ctx: Contexto = Depends(requiere("bitacora:ver")),
             bd: Session = Depends(obtener_bd)):
    q = _consulta(accion, modulo, resultado, None, desde, hasta).order_by(Bitacora.id).limit(100_000)
    salida = io.StringIO()
    w = csv.writer(salida)
    w.writerow(["id", "fecha_utc", "usuario", "accion", "modulo", "objeto", "resultado", "ip", "hash_previo", "hash"])
    for e in bd.execute(q).scalars():
        w.writerow([e.id, e.ts.isoformat(), neutralizar(e.usuario_nombre), e.accion, e.modulo, neutralizar(e.objeto),
                    e.resultado, e.ip, e.hash_previo, e.hash])
    bitacora.registrar("bitacora.exportada", usuario=ctx.usuario, modulo="bitacora", ip=ctx.ip)
    return Response(salida.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="bitacora-nexo.csv"'})
