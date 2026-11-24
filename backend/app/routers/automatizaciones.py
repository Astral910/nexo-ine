"""Automatizaciones: cada persona crea, pausa, ejecuta y revisa las suyas; Informática ve todas."""

from __future__ import annotations

import re
from dataclasses import asdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import Automatizacion, Ejecucion, Usuario
from ..services.programador import calcular_proxima, describir_frecuencia, ejecutar_automatizacion
from ..services.tareas import ESTADO_INTERNO, PLANTILLAS, TAREAS, Campo

router = APIRouter(prefix="/api/automatizaciones", tags=["automatizaciones"])


def _json(a: Automatizacion, bd: Session) -> dict:
    propietario = bd.get(Usuario, a.propietario_id) if a.propietario_id else None
    tarea = TAREAS.get(a.tarea)
    return {"id": a.id, "nombre": a.nombre, "descripcion": a.descripcion, "tarea": a.tarea,
            "tarea_nombre": tarea.nombre if tarea else a.tarea, "para_que": tarea.para_que if tarea else "",
            "categoria": tarea.categoria if tarea else "", "parametros": a.parametros or {},
            "frecuencia": a.frecuencia, "valor_frecuencia": a.valor_frecuencia, "frecuencia_texto": describir_frecuencia(a),
            "activa": a.activa, "sistema": a.sistema, "propietario": propietario.nombre if propietario else "Sistema",
            "propietario_id": a.propietario_id, "ultimo_estado": a.ultimo_estado,
            "ultima_ejecucion_en": a.ultima_ejecucion_en.isoformat() if a.ultima_ejecucion_en else None,
            "proxima_ejecucion_en": a.proxima_ejecucion_en.isoformat() if a.proxima_ejecucion_en else None}


def _puede_editar(ctx: Contexto, a: Automatizacion) -> bool:
    return ctx.puede("automatizaciones:administrar") or (not a.sistema and a.propietario_id == ctx.usuario.id
                                                         and ctx.puede("automatizaciones:gestionar"))


def _visibles(ctx: Contexto):
    """Cada persona ve las suyas y las del sistema; Informática (administrar) ve todas."""
    q = select(Automatizacion)
    if not ctx.puede("automatizaciones:administrar"):
        q = q.where(or_(Automatizacion.propietario_id == ctx.usuario.id, Automatizacion.sistema.is_(True)))
    return q


def _actividad_24h(bd: Session) -> dict[int, tuple[int, int]]:
    """Ejecuciones y errores de las últimas 24 horas por automatización (una sola consulta)."""
    filas = bd.execute(select(Ejecucion.automatizacion_id, func.count(),
                              func.sum(case((Ejecucion.estado == "error", 1), else_=0)))
                       .where(Ejecucion.inicio > ahora() - timedelta(hours=24))
                       .group_by(Ejecucion.automatizacion_id)).all()
    return {aid: (int(n or 0), int(e or 0)) for aid, n, e in filas}


def _ultimos_resumenes(bd: Session) -> dict[int, str]:
    """Resumen de la última ejecución terminada de cada automatización (una sola consulta)."""
    ultima = (select(func.max(Ejecucion.id).label("id")).where(Ejecucion.estado.in_(["ok", "error"]))
              .group_by(Ejecucion.automatizacion_id).subquery())
    return dict(bd.execute(select(Ejecucion.automatizacion_id, Ejecucion.resumen).join(ultima, Ejecucion.id == ultima.c.id)).all())


@router.get("")
def listar(ctx: Contexto = Depends(requiere("automatizaciones:ver")), bd: Session = Depends(obtener_bd)):
    autos = bd.execute(_visibles(ctx).order_by(Automatizacion.sistema.desc(), Automatizacion.id)).scalars().all()
    errores = dict(bd.execute(select(Ejecucion.automatizacion_id, func.count()).where(Ejecucion.estado == "error")
                              .group_by(Ejecucion.automatizacion_id)).all())
    recientes = _actividad_24h(bd)
    resumenes = _ultimos_resumenes(bd)
    return [{**_json(a, bd), "puede_editar": _puede_editar(ctx, a), "errores": errores.get(a.id, 0),
             "ultimo_resumen": resumenes.get(a.id), "ejecuciones_24h": recientes.get(a.id, (0, 0))[0],
             "errores_24h": recientes.get(a.id, (0, 0))[1]} for a in autos]


@router.get("/tareas")
def tareas_disponibles(ctx: Contexto = Depends(requiere("automatizaciones:ver"))):
    return [{"clave": t.clave, "nombre": t.nombre, "descripcion": t.descripcion, "parametros": t.parametros,
             "para_que": t.para_que, "categoria": t.categoria, "campos": [asdict(c) for c in t.campos]}
            for t in TAREAS.values() if ctx.puede(t.permiso)]


@router.get("/plantillas")
def plantillas(ctx: Contexto = Depends(requiere("automatizaciones:ver"))):
    """Automatizaciones listas para usar, solo las que el rol de la persona puede ejecutar."""
    salida = []
    for p in PLANTILLAS:
        tarea = TAREAS[p.tarea]
        if not ctx.puede(tarea.permiso):
            continue
        muestra = Automatizacion(frecuencia=p.frecuencia, valor_frecuencia=p.valor_frecuencia)
        salida.append({"id": p.id, "titulo": p.titulo, "descripcion": p.descripcion, "tarea": p.tarea,
                       "tarea_nombre": tarea.nombre, "para_que": tarea.para_que, "parametros": dict(p.parametros),
                       "frecuencia": p.frecuencia, "valor_frecuencia": p.valor_frecuencia,
                       "frecuencia_texto": describir_frecuencia(muestra),
                       "puede_crear": ctx.puede("automatizaciones:gestionar")})
    return salida


@router.get("/resumen")
def resumen(ctx: Contexto = Depends(requiere("automatizaciones:ver")), bd: Session = Depends(obtener_bd)):
    """Estado general en una frase: cuántas hay, cuántas fallaron en 24 horas y cuál sigue."""
    autos = bd.execute(_visibles(ctx)).scalars().all()
    ids = [a.id for a in autos]
    desde = ahora() - timedelta(hours=24)
    ejecuciones = fallas = 0
    falla = None
    if ids:
        ejecuciones, fallas = bd.execute(select(func.count(), func.sum(case((Ejecucion.estado == "error", 1), else_=0)))
                                         .where(Ejecucion.automatizacion_id.in_(ids), Ejecucion.inicio > desde)).one()
        falla = bd.execute(select(Ejecucion).where(Ejecucion.automatizacion_id.in_(ids), Ejecucion.estado == "error")
                           .order_by(Ejecucion.inicio.desc()).limit(1)).scalar()
    programadas = sorted((a for a in autos if a.activa and a.proxima_ejecucion_en), key=lambda a: a.proxima_ejecucion_en)
    nombres = {a.id: a.nombre for a in autos}
    return {
        "total": len(autos), "activas": sum(1 for a in autos if a.activa), "pausadas": sum(1 for a in autos if not a.activa),
        "ejecuciones_24h": int(ejecuciones or 0), "fallas_24h": int(fallas or 0),
        "proxima": ({"id": programadas[0].id, "nombre": programadas[0].nombre,
                     "en": programadas[0].proxima_ejecucion_en.isoformat()} if programadas else None),
        "ultima_falla": ({"id": falla.automatizacion_id, "ejecucion_id": falla.id, "nombre": nombres.get(falla.automatizacion_id),
                          "resumen": falla.resumen, "en": falla.inicio.isoformat()} if falla else None),
    }


class Programacion(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    tarea: str = Field(max_length=60)
    parametros: dict = Field(default_factory=dict)
    frecuencia: str = Field(pattern="^(manual|intervalo|diaria|semanal)$")
    valor_frecuencia: str = Field(default="", max_length=20)
    activa: bool = True


def _numero(v: float | None) -> str:
    return f"{v:g}" if v is not None else ""


def _valor_campo(campo: Campo, v: str | int | float):
    """Convierte y valida un dato según su tipo; None si quedó vacío (la tarea usa su valor por defecto)."""
    texto = str(v).strip()
    if texto == "":
        return None
    if campo.tipo == "numero":
        try:
            numero = float(texto.replace(",", "."))
        except ValueError:
            raise HTTPException(422, f"«{campo.etiqueta}» debe ser un número.") from None
        bajo, alto = campo.minimo, campo.maximo
        if (bajo is not None and numero < bajo) or (alto is not None and numero > alto):
            rango = (f"entre {_numero(bajo)} y {_numero(alto)}" if bajo is not None and alto is not None
                     else f"{_numero(bajo)} o más" if bajo is not None else f"{_numero(alto)} o menos")
            raise HTTPException(422, f"«{campo.etiqueta}» debe ser {rango}.")
        return int(numero) if numero.is_integer() else numero
    if campo.tipo == "periodo" and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", texto):
        raise HTTPException(422, f"«{campo.etiqueta}» debe escribirse como AAAA-MM, por ejemplo 2023-10.")
    return texto


def _validar(datos: Programacion, ctx: Contexto) -> dict:
    tarea = TAREAS.get(datos.tarea)
    if tarea is None or not ctx.puede(tarea.permiso):
        raise HTTPException(422, "Tarea no disponible para su rol.")
    campos = {c.clave: c for c in tarea.campos}
    params = {}
    for k, v in datos.parametros.items():
        if k in ESTADO_INTERNO:
            continue  # lo administra la propia tarea (por ejemplo, la última mediana vigilada)
        if k not in tarea.parametros:
            raise HTTPException(422, f"Parámetro no permitido: {k}")
        if not isinstance(v, (str, int, float)) or len(str(v)) > 200:
            raise HTTPException(422, f"Valor no válido para {k}")
        valor = _valor_campo(campos[k], v) if k in campos else v
        if valor is not None:
            params[k] = valor
    v = datos.valor_frecuencia
    if datos.frecuencia == "intervalo" and (not v.isdigit() or not 15 <= int(v) <= 10080):
        raise HTTPException(422, "El intervalo debe estar entre 15 minutos y 7 días.")
    if datos.frecuencia == "diaria" and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
        raise HTTPException(422, "Indique la hora como HH:MM.")
    if datos.frecuencia == "semanal" and not re.fullmatch(r"[0-6]@([01]\d|2[0-3]):[0-5]\d", v):
        raise HTTPException(422, "Indique el día y la hora como D@HH:MM (0 = lunes).")
    return params


@router.post("", status_code=201)
def crear(datos: Programacion, ctx: Contexto = Depends(requiere("automatizaciones:gestionar")),
          bd: Session = Depends(obtener_bd)):
    if bd.execute(select(func.count()).select_from(Automatizacion)
                  .where(Automatizacion.propietario_id == ctx.usuario.id)).scalar() >= 30:
        raise HTTPException(409, "Máximo 30 automatizaciones por persona.")
    params = _validar(datos, ctx)
    a = Automatizacion(nombre=datos.nombre, tarea=datos.tarea, parametros=params, frecuencia=datos.frecuencia,
                       valor_frecuencia=datos.valor_frecuencia, activa=datos.activa, propietario_id=ctx.usuario.id,
                       descripcion=TAREAS[datos.tarea].descripcion)
    a.proxima_ejecucion_en = calcular_proxima(a)
    bd.add(a)
    bd.commit()
    bitacora.registrar("automatizacion.creada", usuario=ctx.usuario, modulo="automatizaciones",
                       objeto=f"automatizacion:{a.id}", detalle={"tarea": a.tarea, "frecuencia": a.frecuencia}, ip=ctx.ip)
    return _json(a, bd)


@router.put("/{aid}")
def editar(aid: int, datos: Programacion, ctx: Contexto = Depends(requiere("automatizaciones:gestionar",
                                                                           "automatizaciones:administrar")),
           bd: Session = Depends(obtener_bd)):
    a = bd.get(Automatizacion, aid)
    if a is None or not _puede_editar(ctx, a):
        raise HTTPException(404, "Automatización no encontrada.")
    if a.sistema and datos.tarea != a.tarea:
        raise HTTPException(409, "No se puede cambiar la tarea de una automatización del sistema.")
    internos = {k: v for k, v in (a.parametros or {}).items() if k in ESTADO_INTERNO}
    a.parametros = {**_validar(datos, ctx), **internos}
    a.nombre, a.frecuencia, a.valor_frecuencia, a.activa = datos.nombre, datos.frecuencia, datos.valor_frecuencia, datos.activa
    a.proxima_ejecucion_en = calcular_proxima(a)
    bd.commit()
    bitacora.registrar("automatizacion.editada", usuario=ctx.usuario, modulo="automatizaciones",
                       objeto=f"automatizacion:{a.id}", ip=ctx.ip)
    return _json(a, bd)


@router.post("/{aid}/ejecutar")
def ejecutar(aid: int, ctx: Contexto = Depends(requiere("automatizaciones:gestionar", "automatizaciones:administrar")),
             bd: Session = Depends(obtener_bd)):
    a = bd.get(Automatizacion, aid)
    if a is None:
        raise HTTPException(404, "Automatización no encontrada.")
    tarea = TAREAS.get(a.tarea)
    if not (_puede_editar(ctx, a) or (a.sistema and tarea and ctx.puede(tarea.permiso))):
        raise HTTPException(403, "No puede ejecutar esta automatización.")
    return ejecutar_automatizacion(a.id, disparada_por=f"usuario:{ctx.usuario.id}", usuario=ctx.usuario)


class Estado(BaseModel):
    activa: bool


@router.post("/{aid}/estado")
def cambiar_estado(aid: int, datos: Estado, ctx: Contexto = Depends(requiere("automatizaciones:gestionar",
                                                                            "automatizaciones:administrar")),
                   bd: Session = Depends(obtener_bd)):
    a = bd.get(Automatizacion, aid)
    if a is None or not _puede_editar(ctx, a):
        raise HTTPException(404, "Automatización no encontrada.")
    a.activa = datos.activa
    a.proxima_ejecucion_en = calcular_proxima(a)
    bd.commit()
    bitacora.registrar("automatizacion.pausada" if not datos.activa else "automatizacion.reanudada", usuario=ctx.usuario,
                       modulo="automatizaciones", objeto=f"automatizacion:{a.id}", ip=ctx.ip)
    return _json(a, bd)


@router.delete("/{aid}")
def borrar(aid: int, ctx: Contexto = Depends(requiere("automatizaciones:gestionar")), bd: Session = Depends(obtener_bd)):
    a = bd.get(Automatizacion, aid)
    if a is None or a.sistema or not _puede_editar(ctx, a):
        raise HTTPException(404, "Automatización no encontrada.")
    bd.delete(a)
    bd.commit()
    bitacora.registrar("automatizacion.eliminada", usuario=ctx.usuario, modulo="automatizaciones",
                       objeto=f"automatizacion:{aid}", ip=ctx.ip)
    return {"ok": True}


@router.get("/{aid}/ejecuciones")
def historial(aid: int, ctx: Contexto = Depends(requiere("automatizaciones:ver")), bd: Session = Depends(obtener_bd)):
    a = bd.get(Automatizacion, aid)
    if a is None or not (a.sistema or a.propietario_id == ctx.usuario.id or ctx.puede("automatizaciones:administrar")):
        raise HTTPException(404, "Automatización no encontrada.")
    filas = bd.execute(select(Ejecucion).where(Ejecucion.automatizacion_id == aid)
                       .order_by(Ejecucion.inicio.desc()).limit(50)).scalars()
    return [{"id": e.id, "inicio": e.inicio.isoformat(), "fin": e.fin.isoformat() if e.fin else None,
             "estado": e.estado, "disparada_por": e.disparada_por, "resumen": e.resumen,
             "duracion_s": round((e.fin - e.inicio).total_seconds(), 2) if e.fin else None} for e in filas]
