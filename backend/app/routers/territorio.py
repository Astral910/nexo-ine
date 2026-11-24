"""Territorio: departamentos, municipios y lugares poblados (Censo 2018) y avance de operativos."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import AvanceOperativo, LugarPoblado
from ..services import territorio as consultas
from ..texto import departamento_canonico, fichas

router = APIRouter(prefix="/api/territorio", tags=["territorio"])


@router.get("/departamentos")
def departamentos(ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")), bd: Session = Depends(obtener_bd)):
    return consultas.departamentos(bd)


@router.get("/municipios")
def municipios(departamento: str | None = None, ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")),
               bd: Session = Depends(obtener_bd)):
    return consultas.municipios(bd, departamento)


@router.get("/municipios/{codigo}")
def ficha_municipio(codigo: str, ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")),
                    bd: Session = Depends(obtener_bd)):
    ficha = consultas.ficha_municipio(bd, codigo)
    if ficha is None:
        raise HTTPException(404, "Municipio no encontrado.")
    return ficha


@router.get("/lugares")
def buscar_lugares(texto: str = Query(min_length=2, max_length=100), departamento: str | None = None,
                   ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")), bd: Session = Depends(obtener_bd)):
    q = select(LugarPoblado)
    for f in fichas(texto)[:5]:
        q = q.where(LugarPoblado.texto_norm.like(f"%{f}%"))
    if departamento:
        q = q.where(LugarPoblado.departamento == (departamento_canonico(departamento) or departamento))
    return [{"codigo": lp.codigo, "nombre": lp.nombre, "municipio": lp.municipio, "cod_municipio": lp.cod_municipio,
             "departamento": lp.departamento, "poblacion": lp.poblacion, "area": lp.area, "lat": lp.lat, "lon": lp.lon}
            for lp in bd.execute(q.order_by(LugarPoblado.poblacion.desc()).limit(50)).scalars()]


@router.get("/mapa")
def mapa(departamento: str | None = None, ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")),
         bd: Session = Depends(obtener_bd)):
    """Puntos compactos [lon, lat, población, índice de departamento] para dibujar el país con datos reales."""
    return consultas.mapa(bd, departamento)


# ---------------------------------------------------------------------------
# Avance de operativos de campo (Coordinación Regional)
# ---------------------------------------------------------------------------


@router.get("/operativos")
def operativos(ctx: Contexto = Depends(requiere("territorio:ver")), bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(AvanceOperativo.operativo, func.sum(AvanceOperativo.meta), func.sum(AvanceOperativo.completados),
                              func.max(AvanceOperativo.es_demo).label("demo"), func.max(AvanceOperativo.actualizado_en))
                       .group_by(AvanceOperativo.operativo)).all()
    return [{"operativo": o, "meta": int(m or 0), "completados": int(c or 0),
             "avance_pct": round((c or 0) / m * 100, 1) if m else 0, "es_demo": bool(d),
             "actualizado_en": u.isoformat() if u else None} for o, m, c, d, u in filas]


@router.get("/operativos/{nombre}")
def detalle_operativo(nombre: str, ctx: Contexto = Depends(requiere("territorio:ver")), bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(AvanceOperativo).where(AvanceOperativo.operativo == nombre[:120])
                       .order_by(AvanceOperativo.departamento, AvanceOperativo.municipio)).scalars().all()
    if not filas:
        raise HTTPException(404, "Operativo no encontrado.")
    por_depto: dict[str, list[int]] = {}
    for f in filas:
        d = por_depto.setdefault(f.departamento, [0, 0, 0])
        d[0] += f.meta
        d[1] += f.completados
        d[2] += 1
    return {"operativo": nombre, "es_demo": any(f.es_demo for f in filas),
            "nota": "Universo real: lugares poblados del Censo 2018 por municipio. El avance es de demostración "
                    "hasta conectarlo con el sistema de captura de campo." if any(f.es_demo for f in filas) else "",
            "departamentos": [{"departamento": d, "meta": v[0], "completados": v[1], "municipios": v[2],
                               "avance_pct": round(v[1] / v[0] * 100, 1) if v[0] else 0} for d, v in por_depto.items()],
            "municipios": [{"codigo": f.cod_municipio, "municipio": f.municipio, "departamento": f.departamento,
                            "delegacion": f.delegacion, "meta": f.meta, "completados": f.completados,
                            "avance_pct": round(f.completados / f.meta * 100, 1) if f.meta else 0} for f in filas]}


class Avance(BaseModel):
    completados: int = Field(ge=0, le=100000)


@router.patch("/operativos/{nombre}/{codigo}")
def actualizar_avance(nombre: str, codigo: str, datos: Avance, ctx: Contexto = Depends(requiere("territorio:gestionar")),
                      bd: Session = Depends(obtener_bd)):
    fila = bd.execute(select(AvanceOperativo).where(AvanceOperativo.operativo == nombre[:120],
                                                    AvanceOperativo.cod_municipio == codigo[:6])).scalar()
    if fila is None:
        raise HTTPException(404, "Municipio no encontrado en el operativo.")
    fila.completados = min(datos.completados, fila.meta)
    fila.actualizado_en = ahora()
    bd.commit()
    bitacora.registrar("territorio.avance", usuario=ctx.usuario, modulo="territorio", objeto=f"{nombre}:{codigo}",
                       detalle={"completados": fila.completados}, ip=ctx.ip)
    return {"ok": True, "avance_pct": round(fila.completados / fila.meta * 100, 1) if fila.meta else 0}
