"""Catálogo y linaje de datos: qué se usó, de dónde, cuándo se descargó y con qué huella."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import obtener_bd
from ..deps import Contexto, requiere
from ..etl.descargar import leer_manifiesto
from ..models import ConjuntoCkan, FuenteDatos
from ..services import catalogo as sincronizador
from ..texto import fichas

router = APIRouter(prefix="/api/datos", tags=["datos"])


@router.get("/fuentes")
def fuentes(ctx: Contexto = Depends(requiere("datos:ver")), bd: Session = Depends(obtener_bd)):
    return [{"id": f.id, "titulo": f.titulo, "publicador": f.publicador, "conjunto": f.conjunto, "url": f.url,
             "pagina": f.pagina, "licencia": f.licencia, "formato": f.formato, "clasificacion": f.clasificacion,
             "periodicidad": f.periodicidad, "usado_en": f.usado_en, "filas": f.filas, "bytes": f.bytes,
             "sha256": f.sha256, "notas": f.notas,
             "descargado_en": f.descargado_en.isoformat() if f.descargado_en else None,
             "cargado_en": f.cargado_en.isoformat() if f.cargado_en else None}
            for f in bd.execute(select(FuenteDatos).order_by(FuenteDatos.publicador, FuenteDatos.id)).scalars()]


@router.get("/catalogo")
def catalogo(texto: str | None = Query(default=None, max_length=100), solo_usados: bool = False,
             ctx: Contexto = Depends(requiere("datos:ver")), bd: Session = Depends(obtener_bd)):
    q = select(ConjuntoCkan)
    for f in fichas(texto or "")[:4]:
        q = q.where(func.lower(ConjuntoCkan.titulo + " " + ConjuntoCkan.nombre).like(f"%{f}%"))
    if solo_usados:
        q = q.where(ConjuntoCkan.usado_por_nexo.is_(True))
    filas = bd.execute(q.order_by(ConjuntoCkan.usado_por_nexo.desc(), ConjuntoCkan.titulo).limit(300)).scalars().all()
    ultima = bd.execute(select(func.max(ConjuntoCkan.sincronizado_en))).scalar()
    total = bd.execute(select(func.count()).select_from(ConjuntoCkan)).scalar()
    return {"total": total, "sincronizado_en": ultima.isoformat() if ultima else None, "conjuntos": [
        {"id": c.id, "nombre": c.nombre, "titulo": c.titulo, "organizacion": c.organizacion, "recursos": c.recursos,
         "formatos": c.formatos, "modificado": c.modificado, "url": c.url, "usado_por_nexo": c.usado_por_nexo}
        for c in filas]}


@router.post("/catalogo/sincronizar")
def sincronizar(ctx: Contexto = Depends(requiere("datos:sincronizar")), bd: Session = Depends(obtener_bd)):
    try:
        r = sincronizador.sincronizar(bd)
    except Exception as e:
        bitacora.registrar("datos.sincronizacion", usuario=ctx.usuario, modulo="datos", resultado="error",
                           detalle={"error": str(e)[:200]}, ip=ctx.ip)
        raise HTTPException(502, "No se pudo consultar el portal del INE. Intente más tarde.") from e
    bitacora.registrar("datos.sincronizacion", usuario=ctx.usuario, modulo="datos", detalle=r["metricas"], ip=ctx.ip)
    return r


@router.get("/manifiesto")
def manifiesto(ctx: Contexto = Depends(requiere("datos:ver"))):
    return leer_manifiesto()
