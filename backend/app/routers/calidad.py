"""Validador de calidad de datos: crítica, inconsistencias y protección del secreto estadístico."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import bitacora
from ..avisos import notificar_permiso
from ..config import obtener_config
from ..db import obtener_bd
from ..deps import Contexto, requiere
from ..models import Validacion
from ..security.limites import limitador
from ..services.codificador import codificar_lote
from ..services.validador import ArchivoInvalido, reporte_csv, validar

router = APIRouter(prefix="/api/calidad", tags=["calidad de datos"])


@router.post("/validar", status_code=201)
async def validar_archivo(request: Request, archivo: UploadFile = File(...),
                          ctx: Contexto = Depends(requiere("calidad:usar")), bd: Session = Depends(obtener_bd)):
    if not limitador.permitir(f"validar:{ctx.usuario.id}", 20, 3600):
        raise HTTPException(429, "Límite de validaciones por hora alcanzado.")
    maximo = obtener_config().subida_max_mb * 1024 * 1024
    datos = await archivo.read(maximo + 1)
    if len(datos) > maximo:
        raise HTTPException(413, f"El archivo supera {obtener_config().subida_max_mb} MB.")
    nombre = (archivo.filename or "archivo").replace("/", "_").replace("\\", "_")[:200]
    try:
        informe = validar(nombre, datos)
    except ArchivoInvalido as e:
        raise HTTPException(422, str(e)) from e
    finally:
        del datos  # el archivo no se guarda en ningún lado
    v = Validacion(usuario_id=ctx.usuario.id, archivo=informe["archivo"], sha256=informe["sha256"],
                   filas=informe["filas"], columnas=informe["columnas"], puntaje=informe["puntaje"],
                   bloqueante=informe["bloqueante"], informe=informe)
    bd.add(v)
    bd.commit()
    bitacora.registrar("calidad.validacion", usuario=ctx.usuario, modulo="calidad", objeto=f"validacion:{v.id}",
                       detalle={"sha256": informe["sha256"], "puntaje": informe["puntaje"],
                                "datos_personales": informe["bloqueante"]}, ip=ctx.ip)
    if informe["bloqueante"]:
        notificar_permiso(bd, "seguridad:gestionar", "Archivo con posibles datos personales",
                          f"{ctx.usuario.nombre} validó «{informe['archivo']}»; se marcó como bloqueante.", "alerta",
                          "/seguridad")
    return {"id": v.id, **informe}


@router.get("/validaciones")
def mis_validaciones(ctx: Contexto = Depends(requiere("calidad:usar")), bd: Session = Depends(obtener_bd)):
    q = select(Validacion).order_by(Validacion.creada_en.desc()).limit(50)
    if not ctx.puede("privacidad:administrar"):
        q = q.where(Validacion.usuario_id == ctx.usuario.id)
    return [{"id": v.id, "archivo": v.archivo, "filas": v.filas, "columnas": v.columnas, "puntaje": v.puntaje,
             "bloqueante": v.bloqueante, "creada_en": v.creada_en.isoformat()} for v in bd.execute(q).scalars()]


def _propia(bd: Session, ctx: Contexto, vid: int) -> Validacion:
    v = bd.get(Validacion, vid)
    if v is None or (v.usuario_id != ctx.usuario.id and not ctx.puede("privacidad:administrar")):
        raise HTTPException(404, "Validación no encontrada.")
    return v


@router.get("/validaciones/{vid}")
def ver_validacion(vid: int, ctx: Contexto = Depends(requiere("calidad:usar")), bd: Session = Depends(obtener_bd)):
    v = _propia(bd, ctx, vid)
    return {"id": v.id, "creada_en": v.creada_en.isoformat(), **v.informe}


@router.get("/validaciones/{vid}/inconsistencias.csv")
def inconsistencias(vid: int, ctx: Contexto = Depends(requiere("calidad:usar")), bd: Session = Depends(obtener_bd)):
    v = _propia(bd, ctx, vid)
    return Response(reporte_csv(v.informe), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="inconsistencias-{v.id}.csv"'})


class Respuestas(BaseModel):
    respuestas: list[str] = Field(min_length=1, max_length=5000)


@router.post("/codificar")
def codificar_respuestas(datos: Respuestas, ctx: Contexto = Depends(requiere("calidad:usar"))):
    """Sugiere el código CIUO-08 de cada respuesta abierta de ocupación (propuesta de la DCE). No guarda las respuestas."""
    resultado = codificar_lote([r[:300] for r in datos.respuestas])
    bitacora.registrar("calidad.codificacion", usuario=ctx.usuario, modulo="calidad",
                       detalle={"respuestas": resultado["total"], "automaticas": resultado["automaticas"]}, ip=ctx.ip)
    return resultado
