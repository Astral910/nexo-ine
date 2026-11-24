"""Precios de Referencia (DPIR): flujo de 6 pasos, investigación de mercado e informe técnico."""

from __future__ import annotations

import hashlib
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..avisos import enviar_correo, notificar, notificar_permiso
from ..db import ahora, obtener_bd
from ..deps import Contexto, contexto, requiere
from ..models import ESTADOS_SOLICITUD, Cotizacion, EventoSolicitud, PrecioReferencia, SolicitudPrecio, Usuario
from ..services import precios_ref
from ..texto import fichas

router = APIRouter(prefix="/api/precios", tags=["precios de referencia"])
ORDEN = [e for e, _ in ESTADOS_SOLICITUD]
ETIQUETAS = dict(ESTADOS_SOLICITUD)


def _sumar_habiles(desde: date, dias: int) -> date:
    d = desde
    while dias > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            dias -= 1
    return d


def _puede_ver(ctx: Contexto, sol: SolicitudPrecio) -> bool:
    return ctx.puede("dpir:ver") or (ctx.puede("dpir:solicitar") and sol.solicitante_id == ctx.usuario.id)


def _obtener(bd: Session, ctx: Contexto, sol_id: int) -> SolicitudPrecio:
    sol = bd.get(SolicitudPrecio, sol_id)
    if sol is None or not _puede_ver(ctx, sol):
        raise HTTPException(404, "Solicitud no encontrada.")
    return sol


def _json(sol: SolicitudPrecio, bd: Session, detalle: bool = False) -> dict:
    asignado = bd.get(Usuario, sol.asignada_a) if sol.asignada_a else None
    dias = (sol.fecha_limite - date.today()).days if sol.fecha_limite else None
    d = {"id": sol.id, "codigo": sol.codigo, "entidad": sol.entidad, "producto": sol.producto, "unidad": sol.unidad,
         "cantidad": sol.cantidad, "modalidad": sol.modalidad, "estado": sol.estado, "etapa": ETIQUETAS[sol.estado],
         "paso": ORDEN.index(sol.estado) + 1, "rechazada": sol.rechazada,
         "fecha_limite": sol.fecha_limite.isoformat() if sol.fecha_limite else None, "dias_restantes": dias,
         "vencida": dias is not None and dias < 0 and sol.estado != "entregada",
         "asignada_a": asignado.nombre if asignado else None, "creada_en": sol.creada_en.isoformat(),
         "precio_referencia": (sol.resultado or {}).get("precio_referencia")}
    if detalle:
        d.update({"especificaciones": sol.especificaciones, "justificacion": sol.justificacion,
                  "terminos_busqueda": sol.terminos_busqueda, "resultado": sol.resultado,
                  "informe_sha256": sol.informe_sha256,
                  "entregada_en": sol.entregada_en.isoformat() if sol.entregada_en else None})
    return d


def _evento(bd: Session, sol: SolicitudPrecio, ctx: Contexto, de: str | None, a: str, comentario: str = "") -> None:
    bd.add(EventoSolicitud(solicitud_id=sol.id, usuario_id=ctx.usuario.id, usuario_nombre=ctx.usuario.nombre,
                           de_estado=de, a_estado=a, comentario=comentario[:1000]))


class NuevaSolicitud(BaseModel):
    entidad: str = Field(default="", max_length=200)
    producto: str = Field(min_length=3, max_length=300)
    especificaciones: str = Field(default="", max_length=3000)
    unidad: str = Field(default="Unidad", max_length=80)
    cantidad: float = Field(gt=0, le=1e9)
    modalidad: str = Field(default="", max_length=120)
    justificacion: str = Field(default="", max_length=2000)
    terminos_busqueda: str = Field(default="", max_length=300)


@router.get("/solicitudes")
def listar(estado: str | None = None, ctx: Contexto = Depends(requiere("dpir:ver", "dpir:solicitar")),
           bd: Session = Depends(obtener_bd)):
    q = select(SolicitudPrecio).order_by(SolicitudPrecio.creada_en.desc())
    if not ctx.puede("dpir:ver"):
        q = q.where(SolicitudPrecio.solicitante_id == ctx.usuario.id)
    if estado in ORDEN:
        q = q.where(SolicitudPrecio.estado == estado)
    return {"etapas": [{"id": e, "etiqueta": t} for e, t in ESTADOS_SOLICITUD],
            "solicitudes": [_json(s, bd) for s in bd.execute(q.limit(300)).scalars()]}


@router.post("/solicitudes", status_code=201)
def crear(datos: NuevaSolicitud, ctx: Contexto = Depends(requiere("dpir:solicitar", "dpir:gestionar")),
          bd: Session = Depends(obtener_bd)):
    entidad = datos.entidad.strip() or ctx.usuario.unidad or "Entidad no indicada"
    if ctx.puede("dpir:solicitar") and not ctx.puede("dpir:gestionar"):
        entidad = ctx.usuario.unidad or entidad
    anio = ahora().year
    n = (bd.execute(select(func.count()).select_from(SolicitudPrecio)
                    .where(SolicitudPrecio.codigo.like(f"PR-{anio}-%"))).scalar() or 0) + 1
    sol = SolicitudPrecio(codigo=f"PR-{anio}-{n:04d}", entidad=entidad, solicitante_id=ctx.usuario.id,
                          producto=datos.producto.strip(), especificaciones=datos.especificaciones.strip(),
                          unidad=datos.unidad.strip() or "Unidad", cantidad=datos.cantidad, modalidad=datos.modalidad,
                          justificacion=datos.justificacion, terminos_busqueda=datos.terminos_busqueda.strip()
                          or " ".join(fichas(datos.producto)[:4]),
                          fecha_limite=_sumar_habiles(date.today(), 8))
    bd.add(sol)
    bd.commit()
    _evento(bd, sol, ctx, None, "recibida", "Solicitud registrada")
    bd.commit()
    notificar_permiso(bd, "dpir:gestionar", f"Nueva solicitud {sol.codigo}", f"{sol.entidad}: {sol.producto}",
                      "info", f"/precios/{sol.id}")
    bitacora.registrar("dpir.solicitud_creada", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo, ip=ctx.ip)
    return _json(sol, bd, True)


@router.get("/solicitudes/{sol_id}")
def detalle(sol_id: int, ctx: Contexto = Depends(requiere("dpir:ver", "dpir:solicitar")),
            bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    eventos = bd.execute(select(EventoSolicitud).where(EventoSolicitud.solicitud_id == sol.id)
                         .order_by(EventoSolicitud.ts)).scalars()
    cot = bd.execute(select(Cotizacion).where(Cotizacion.solicitud_id == sol.id)
                     .order_by(Cotizacion.tipo, Cotizacion.fecha.desc())).scalars()
    datos = _json(sol, bd, True)
    datos["eventos"] = [{"ts": e.ts.isoformat(), "usuario": e.usuario_nombre, "de": e.de_estado, "a": e.a_estado,
                         "etiqueta": ETIQUETAS.get(e.a_estado, e.a_estado), "comentario": e.comentario} for e in eventos]
    interno = ctx.puede("dpir:ver")
    datos["fuentes"] = [{"id": c.id, "tipo": c.tipo, "descripcion": c.descripcion, "origen": c.origen if interno else "",
                         "referencia": c.referencia, "fecha": c.fecha.isoformat() if c.fecha else None,
                         "precio": c.precio, "precio_ajustado": c.precio_ajustado, "incluida": c.incluida,
                         "atipica": c.atipica, "nota": c.nota} for c in cot] if interno else []
    return datos


class Comentario(BaseModel):
    comentario: str = Field(default="", max_length=1000)


@router.post("/solicitudes/{sol_id}/avanzar")
def avanzar(sol_id: int, datos: Comentario, ctx: Contexto = Depends(requiere("dpir:gestionar")),
            bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    if sol.rechazada or sol.estado == "entregada":
        raise HTTPException(409, "La solicitud ya está cerrada.")
    i = ORDEN.index(sol.estado)
    siguiente = ORDEN[i + 1]
    if siguiente == "analisis" and not bd.execute(select(func.count()).select_from(Cotizacion).where(
            Cotizacion.solicitud_id == sol.id, Cotizacion.incluida.is_(True))).scalar():
        raise HTTPException(409, "Antes del análisis incluye al menos una fuente de precio.")
    if siguiente == "informe":
        precios_ref.analizar_solicitud(bd, sol)
        if not (sol.resultado or {}).get("precio_referencia"):
            raise HTTPException(409, "El análisis no produjo un precio. Revisa las fuentes incluidas.")
    if siguiente == "entregada" and not sol.informe_sha256:
        raise HTTPException(409, "Genera el informe técnico antes de entregar.")
    de = sol.estado
    sol.estado = siguiente
    sol.actualizada_en = ahora()
    if sol.asignada_a is None:
        sol.asignada_a = ctx.usuario.id
    if siguiente == "entregada":
        sol.entregada_en = ahora()
        if sol.solicitante_id:
            notificar(bd, sol.solicitante_id, f"Tu precio de referencia {sol.codigo} está listo",
                      f"Precio de referencia: Q{sol.resultado.get('precio_referencia'):,.2f} por {sol.unidad}.", "exito",
                      f"/precios/{sol.id}")
            solicitante = bd.get(Usuario, sol.solicitante_id)
            if solicitante:
                enviar_correo(bd, solicitante.email, f"Precio de referencia {sol.codigo} entregado",
                              f"El informe técnico de «{sol.producto}» ya está disponible en Nexo.")
    _evento(bd, sol, ctx, de, siguiente, datos.comentario)
    bd.commit()
    bitacora.registrar("dpir.avance", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo,
                       detalle={"de": de, "a": siguiente}, ip=ctx.ip)
    return _json(sol, bd, True)


@router.post("/solicitudes/{sol_id}/devolver")
def devolver(sol_id: int, datos: Comentario, ctx: Contexto = Depends(requiere("dpir:gestionar")),
             bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    i = ORDEN.index(sol.estado)
    if i == 0 or sol.estado == "entregada":
        raise HTTPException(409, "No se puede devolver desde esta etapa.")
    de, sol.estado = sol.estado, ORDEN[i - 1]
    _evento(bd, sol, ctx, de, sol.estado, datos.comentario or "Devuelta a la etapa anterior")
    bd.commit()
    bitacora.registrar("dpir.avance", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo,
                       detalle={"de": de, "a": sol.estado, "devolucion": True}, ip=ctx.ip)
    return _json(sol, bd, True)


@router.post("/solicitudes/{sol_id}/rechazar")
def rechazar(sol_id: int, datos: Comentario, ctx: Contexto = Depends(requiere("dpir:gestionar")),
             bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    if not datos.comentario.strip():
        raise HTTPException(422, "Indica el motivo del rechazo.")
    sol.rechazada = True
    _evento(bd, sol, ctx, sol.estado, sol.estado, f"Rechazada: {datos.comentario}")
    bd.commit()
    if sol.solicitante_id:
        notificar(bd, sol.solicitante_id, f"Solicitud {sol.codigo} rechazada", datos.comentario, "alerta",
                  f"/precios/{sol.id}")
    bitacora.registrar("dpir.rechazo", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo, ip=ctx.ip)
    return _json(sol, bd, True)


class Investigacion(BaseModel):
    terminos: str = Field(min_length=2, max_length=200)
    unspsc: str | None = Field(default=None, max_length=12)
    meses: int = Field(default=24, ge=3, le=72)
    maximo: int = Field(default=30, ge=5, le=100)


@router.post("/solicitudes/{sol_id}/investigar")
def investigar_para_solicitud(sol_id: int, datos: Investigacion, ctx: Contexto = Depends(requiere("dpir:gestionar")),
                              bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    try:
        res = precios_ref.investigar(bd, datos.terminos, datos.unspsc, datos.meses)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    bd.execute(delete(Cotizacion).where(Cotizacion.solicitud_id == sol.id,
                                        Cotizacion.tipo.in_(["guatecompras", "referencia_ine"])))
    importadas = 0
    for f in [f for f in res["compras"] if not f["atipico"]][: datos.maximo] + res["referencias_ine"][:10]:
        bd.add(Cotizacion(solicitud_id=sol.id, tipo=f["tipo"], descripcion=f["descripcion"], origen=f["origen"] or "",
                          referencia=str(f.get("referencia") or ""), precio=f["precio"],
                          fecha=date.fromisoformat(f["fecha"]) if f.get("fecha") else None,
                          precio_ajustado=f["precio_ajustado"], incluida=f["tipo"] == "guatecompras",
                          creada_por=ctx.usuario.id))
        importadas += 1
    sol.terminos_busqueda = datos.terminos
    bd.commit()
    bitacora.registrar("dpir.investigacion", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo,
                       detalle={"terminos": datos.terminos, "importadas": importadas}, ip=ctx.ip)
    res["importadas"] = importadas
    res["compras"] = res["compras"][:150]
    return res


class NuevaFuente(BaseModel):
    tipo: str = Field(pattern="^(cotizacion|catalogo)$")
    descripcion: str = Field(min_length=2, max_length=500)
    origen: str = Field(min_length=2, max_length=250)
    referencia: str = Field(default="", max_length=120)
    fecha: date | None = None
    precio: float = Field(gt=0, le=1e10)
    nota: str = Field(default="", max_length=500)


@router.post("/solicitudes/{sol_id}/fuentes", status_code=201)
def agregar_fuente(sol_id: int, datos: NuevaFuente, ctx: Contexto = Depends(requiere("dpir:gestionar")),
                   bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    c = Cotizacion(solicitud_id=sol.id, tipo=datos.tipo, descripcion=datos.descripcion, origen=datos.origen,
                   referencia=datos.referencia, fecha=datos.fecha or date.today(), precio=datos.precio, nota=datos.nota,
                   creada_por=ctx.usuario.id)
    bd.add(c)
    bd.commit()
    bitacora.registrar("dpir.fuente_agregada", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo,
                       detalle={"tipo": datos.tipo, "precio": datos.precio}, ip=ctx.ip)
    return {"id": c.id}


class CambioFuente(BaseModel):
    incluida: bool


@router.patch("/solicitudes/{sol_id}/fuentes/{fuente_id}")
def cambiar_fuente(sol_id: int, fuente_id: int, datos: CambioFuente,
                   ctx: Contexto = Depends(requiere("dpir:gestionar")), bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    c = bd.get(Cotizacion, fuente_id)
    if c is None or c.solicitud_id != sol.id:
        raise HTTPException(404, "Fuente no encontrada.")
    c.incluida = datos.incluida
    bd.commit()
    return {"ok": True}


@router.delete("/solicitudes/{sol_id}/fuentes/{fuente_id}")
def borrar_fuente(sol_id: int, fuente_id: int, ctx: Contexto = Depends(requiere("dpir:gestionar")),
                  bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    c = bd.get(Cotizacion, fuente_id)
    if c is None or c.solicitud_id != sol.id:
        raise HTTPException(404, "Fuente no encontrada.")
    bd.delete(c)
    bd.commit()
    bitacora.registrar("dpir.fuente_eliminada", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo, ip=ctx.ip)
    return {"ok": True}


@router.post("/solicitudes/{sol_id}/analizar")
def analizar(sol_id: int, ctx: Contexto = Depends(requiere("dpir:gestionar")), bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    return precios_ref.analizar_solicitud(bd, sol)


@router.get("/solicitudes/{sol_id}/informe.pdf")
def informe(sol_id: int, ctx: Contexto = Depends(requiere("dpir:ver", "dpir:solicitar")),
            bd: Session = Depends(obtener_bd)):
    sol = _obtener(bd, ctx, sol_id)
    if not ctx.puede("dpir:ver") and sol.estado != "entregada":
        raise HTTPException(403, "El informe estará disponible cuando la DPIR lo entregue.")
    if not sol.resultado:
        raise HTTPException(409, "Primero analiza las fuentes de la solicitud.")
    cot = bd.execute(select(Cotizacion).where(Cotizacion.solicitud_id == sol.id)).scalars().all()
    if ctx.puede("dpir:gestionar") and sol.estado in ("informe", "analisis"):
        sol.informe_sha256 = precios_ref.huella_datos(sol, cot)
        bd.commit()
    pdf = precios_ref.informe_pdf(sol, cot, ctx.usuario.nombre)
    bitacora.registrar("dpir.informe", usuario=ctx.usuario, modulo="precios", objeto=sol.codigo,
                       detalle={"sha256_pdf": hashlib.sha256(pdf).hexdigest()}, ip=ctx.ip)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{sol.codigo}.pdf"'})


@router.get("/investigar")
def investigar_libre(terminos: str = Query(min_length=2, max_length=200), unspsc: str | None = None,
                     meses: int = Query(default=24, ge=3, le=72), ctx: Contexto = Depends(requiere("dpir:ver")),
                     bd: Session = Depends(obtener_bd)):
    try:
        res = precios_ref.investigar(bd, terminos, unspsc, meses)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    res["compras"] = res["compras"][:200]
    return res


@router.get("/referencias")
def buscar_referencias(texto: str = Query(min_length=2, max_length=200), ctx: Contexto = Depends(contexto),
                       bd: Session = Depends(obtener_bd)):
    conds = [PrecioReferencia.texto_norm.like(f"%{f}%") for f in fichas(texto)[:6]]
    if not conds:
        return []
    filas = bd.execute(select(PrecioReferencia).where(*conds).order_by(PrecioReferencia.fecha.desc()).limit(100)).scalars()
    return [{"nog": p.nog, "producto": p.producto, "caracteristicas": p.caracteristicas[:300],
             "presentacion": p.presentacion, "precio": p.precio, "fecha": p.fecha.isoformat() if p.fecha else None,
             "entidad": p.entidad, "categoria": p.categoria} for p in filas]


@router.get("/estadisticas")
def estadisticas(ctx: Contexto = Depends(requiere("dpir:ver")), bd: Session = Depends(obtener_bd)):
    por_estado = dict(bd.execute(select(SolicitudPrecio.estado, func.count()).group_by(SolicitudPrecio.estado)).all())
    entregadas = bd.execute(select(SolicitudPrecio).where(SolicitudPrecio.entregada_en.is_not(None))).scalars().all()
    dias = [(s.entregada_en - s.creada_en).total_seconds() / 86400 for s in entregadas]
    vencidas = bd.execute(select(func.count()).select_from(SolicitudPrecio).where(
        SolicitudPrecio.estado != "entregada", SolicitudPrecio.rechazada.is_(False),
        SolicitudPrecio.fecha_limite < date.today())).scalar()
    return {"por_estado": por_estado, "entregadas": len(entregadas), "vencidas": vencidas,
            "dias_promedio": round(sum(dias) / len(dias), 1) if dias else None,
            "mias": bd.execute(select(func.count()).select_from(SolicitudPrecio).where(
                or_(SolicitudPrecio.asignada_a == ctx.usuario.id), SolicitudPrecio.estado != "entregada")).scalar()}
