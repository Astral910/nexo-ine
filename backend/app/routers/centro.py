"""Centro de mando general, notificaciones y búsqueda global."""

from __future__ import annotations

import threading
import time
from functools import lru_cache

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..db import SesionLocal, ahora, obtener_bd
from ..deps import Contexto, contexto, requiere
from ..models import ConjuntoCkan, LugarPoblado, Notificacion, PrecioRecolectado, SolicitudPrecio
from ..services.centro import actividad, resumen_general
from ..texto import fichas, normalizar

router = APIRouter(prefix="/api", tags=["centro de mando"])

MODULOS = [
    {"id": "precios", "titulo": "Precios de Referencia", "ruta": "/precios", "permiso": ["dpir:ver", "dpir:solicitar"],
     "descripcion": "Solicitudes, investigación de mercado automática e informe técnico.", "area": "DPIR"},
    {"id": "indices", "titulo": "Índices y alertas de precios", "ruta": "/indices", "permiso": ["indices:ver"],
     "descripcion": "IPC, IPMC, canasta básica y crítica de precios recolectados.", "area": "DIEC"},
    {"id": "hba", "titulo": "Hoja de Balance de Alimentos", "ruta": "/hba", "permiso": ["hba:ver"],
     "descripcion": "Suministro, disponibilidad per cápita y calculadora de derivados.", "area": "DIEC"},
    {"id": "territorio", "titulo": "Territorio y operativos", "ruta": "/territorio", "permiso": ["territorio:ver"],
     "descripcion": "Municipios, lugares poblados, proyecciones y avance de campo.", "area": "DCE · DCR"},
    {"id": "calidad", "titulo": "Validador de calidad", "ruta": "/calidad", "permiso": ["calidad:usar"],
     "descripcion": "Crítica de bases, códigos 98/99, pocos casos y datos personales.", "area": "DESA · DCE"},
    {"id": "tableros", "titulo": "Tableros generativos", "ruta": "/tableros", "permiso": ["tableros:ver"],
     "descripcion": "Escriba lo que desea ver y Nexo arma el tablero con datos oficiales.", "area": "Todas"},
    {"id": "automatizaciones", "titulo": "Automatizaciones", "ruta": "/automatizaciones",
     "permiso": ["automatizaciones:ver"], "descripcion": "Tareas programadas y manuales con historial.", "area": "Todas"},
    {"id": "datos", "titulo": "Catálogo y linaje de datos", "ruta": "/datos", "permiso": ["datos:ver"],
     "descripcion": "Fuentes, fechas de descarga, huellas y catálogo del INE.", "area": "Todas"},
    {"id": "seguridad", "titulo": "Centro de ciberseguridad", "ruta": "/seguridad", "permiso": ["seguridad:ver"],
     "descripcion": "Agente de seguridad, riesgos, incidentes y controles.", "area": "Seguridad"},
    {"id": "ti", "titulo": "Salud de TI", "ruta": "/ti", "permiso": ["ti:ver"],
     "descripcion": "Agente de TI, componentes y respaldos.", "area": "Informática"},
    {"id": "bitacora", "titulo": "Bitácora inalterable", "ruta": "/bitacora", "permiso": ["bitacora:ver"],
     "descripcion": "Cada acción queda encadenada con SHA-256.", "area": "Auditoría"},
    {"id": "privacidad", "titulo": "Privacidad y retención", "ruta": "/privacidad", "permiso": [],
     "descripcion": "Mis datos, aviso de privacidad y políticas de retención.", "area": "Todas"},
    {"id": "admin", "titulo": "Usuarios y roles", "ruta": "/admin", "permiso": ["usuarios:administrar"],
     "descripcion": "Aprobación de cuentas y asignación de roles.", "area": "Informática"},
    {"id": "jurado", "titulo": "Modo Jurado", "ruta": "/jurado", "permiso": ["jurado:ver"],
     "descripcion": "Rúbrica del Datatón con evidencia en vivo.", "area": "Evaluación"},
]


def modulos_de(ctx: Contexto) -> list[dict]:
    return [m for m in MODULOS if not m["permiso"] or any(ctx.puede(p) for p in m["permiso"])]


@router.get("/centro/resumen")
def resumen(ctx: Contexto = Depends(requiere("centro:ver")), bd: Session = Depends(obtener_bd)):
    datos = resumen_general(bd)
    calentar_busqueda()
    datos["modulos"] = modulos_de(ctx)
    datos["actividad"] = actividad(bd, 12)
    return datos


@router.get("/centro/modulos")
def mis_modulos(ctx: Contexto = Depends(contexto)):
    return modulos_de(ctx)


@router.get("/notificaciones")
def notificaciones(ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(Notificacion).where(Notificacion.usuario_id == ctx.usuario.id)
                       .order_by(Notificacion.creada_en.desc()).limit(40)).scalars().all()
    sin_leer = bd.execute(select(func.count()).select_from(Notificacion).where(
        Notificacion.usuario_id == ctx.usuario.id, Notificacion.leida_en.is_(None))).scalar()
    return {"sin_leer": sin_leer, "notificaciones": [
        {"id": n.id, "titulo": n.titulo, "cuerpo": n.cuerpo, "nivel": n.nivel, "enlace": n.enlace,
         "leida": n.leida_en is not None, "creada_en": n.creada_en.isoformat()} for n in filas]}


class Lectura(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=200)
    todas: bool = False


@router.post("/notificaciones/leer")
def leer(datos: Lectura, ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    q = update(Notificacion).where(Notificacion.usuario_id == ctx.usuario.id, Notificacion.leida_en.is_(None))
    if not datos.todas:
        q = q.where(Notificacion.id.in_(datos.ids))
    bd.execute(q.values(leida_en=ahora()))
    bd.commit()
    return {"ok": True}


@lru_cache(maxsize=2)
def _articulos_ipc(_ventana: int) -> list[tuple[str, str, str]]:
    """Artículos del IPC (código, nombre, nombre normalizado) en memoria durante 6 horas (cambian solo al recargar datos).
    Buscar con LIKE en el medio millón de precios recolectados tomaba más de un segundo por tecla; la lista de artículos
    tiene unos cientos de nombres y, normalizada, permite buscar sin tildes."""
    with SesionLocal() as bd:
        filas = bd.execute(select(PrecioRecolectado.cod_articulo, func.max(PrecioRecolectado.articulo))
                           .group_by(PrecioRecolectado.cod_articulo)).all()
    return [(cod, art, normalizar(art)) for cod, art in filas if art]


_VENTANA_S = 6 * 3600
_calentada = -1


def _ventana() -> int:
    return int(time.time() // _VENTANA_S)


def calentar_busqueda() -> None:
    """Precarga la lista de artículos en segundo plano: así la primera búsqueda no espera la lectura completa."""
    global _calentada
    if _calentada != _ventana():
        _calentada = _ventana()
        threading.Thread(target=_articulos_ipc, args=(_calentada,), daemon=True).start()


@router.get("/buscar")
def buscar(q: str = Query(min_length=2, max_length=100), ctx: Contexto = Depends(contexto),
           bd: Session = Depends(obtener_bd)):
    palabras = fichas(q)[:5]
    resultados: list[dict] = []
    for m in modulos_de(ctx):
        if any(p in (m["titulo"] + " " + m["descripcion"]).lower() for p in palabras):
            resultados.append({"tipo": "Módulo", "titulo": m["titulo"], "detalle": m["descripcion"], "ruta": m["ruta"]})
    if not palabras:
        return resultados
    if ctx.puede("territorio:ver") or ctx.puede("tableros:ver"):
        cq = select(LugarPoblado)
        for p in palabras:
            cq = cq.where(LugarPoblado.texto_norm.like(f"%{p}%"))
        for lp in bd.execute(cq.order_by(LugarPoblado.poblacion.desc()).limit(5)).scalars():
            resultados.append({"tipo": "Lugar poblado", "titulo": f"{lp.nombre}, {lp.municipio}",
                               "detalle": f"{lp.departamento} · {lp.poblacion or 0:,} habitantes (2018)",
                               "ruta": f"/territorio/municipio/{lp.cod_municipio}"})
    if ctx.puede("indices:ver"):
        coinciden = [(cod, art) for cod, art, norm in _articulos_ipc(_ventana()) if all(p in norm for p in palabras)]
        for cod, art in coinciden[:5]:
            resultados.append({"tipo": "Artículo del IPC", "titulo": art, "detalle": f"Código {cod}",
                               "ruta": f"/indices/articulo/{cod}"})
    if ctx.puede("dpir:ver"):
        sq = select(SolicitudPrecio)
        for p in palabras:
            sq = sq.where(func.lower(SolicitudPrecio.producto + " " + SolicitudPrecio.codigo).like(f"%{p}%"))
        for s in bd.execute(sq.limit(5)).scalars():
            resultados.append({"tipo": "Solicitud", "titulo": f"{s.codigo} · {s.producto}", "detalle": s.entidad,
                               "ruta": f"/precios/{s.id}"})
    if ctx.puede("datos:ver"):
        dq = select(ConjuntoCkan)
        for p in palabras:
            dq = dq.where(func.lower(ConjuntoCkan.titulo).like(f"%{p}%"))
        for c in bd.execute(dq.limit(5)).scalars():
            resultados.append({"tipo": "Conjunto de datos del INE", "titulo": c.titulo, "detalle": c.organizacion,
                               "ruta": "/datos", "externo": c.url})
    return resultados[:25]
