"""Territorio: departamentos, municipios y lugares poblados (Censo 2018) y avance de operativos."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import AvanceOperativo, LugarPoblado, ProyeccionPoblacion
from ..texto import departamento_canonico, fichas

router = APIRouter(prefix="/api/territorio", tags=["territorio"])


@router.get("/departamentos")
def departamentos(ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")), bd: Session = Depends(obtener_bd)):
    anio = min(max(ahora().year, 2015), 2030)
    proy = dict(bd.execute(select(ProyeccionPoblacion.departamento, func.sum(ProyeccionPoblacion.poblacion))
                           .where(ProyeccionPoblacion.anio == anio).group_by(ProyeccionPoblacion.departamento)).all())
    filas = bd.execute(select(LugarPoblado.departamento, LugarPoblado.cod_departamento, func.sum(LugarPoblado.poblacion),
                              func.count(), func.count(func.distinct(LugarPoblado.cod_municipio)),
                              func.avg(LugarPoblado.lat), func.avg(LugarPoblado.lon),
                              func.sum(LugarPoblado.mujeres))
                       .group_by(LugarPoblado.departamento, LugarPoblado.cod_departamento)
                       .order_by(LugarPoblado.cod_departamento)).all()
    return {"anio_proyeccion": anio, "departamentos": [
        {"departamento": d, "codigo": c, "poblacion_2018": int(p or 0), "lugares_poblados": n, "municipios": m,
         "lat": round(lat or 0, 4), "lon": round(lon or 0, 4), "mujeres_pct": round((mu or 0) / p * 100, 1) if p else None,
         "poblacion_proyectada": int(proy.get(d, 0))} for d, c, p, n, m, lat, lon, mu in filas]}


@router.get("/municipios")
def municipios(departamento: str | None = None, ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")),
               bd: Session = Depends(obtener_bd)):
    q = select(LugarPoblado.cod_municipio, LugarPoblado.municipio, LugarPoblado.departamento,
               func.sum(LugarPoblado.poblacion), func.count())
    if departamento:
        q = q.where(LugarPoblado.departamento == (departamento_canonico(departamento) or departamento))
    filas = bd.execute(q.group_by(LugarPoblado.cod_municipio, LugarPoblado.municipio, LugarPoblado.departamento)
                       .order_by(LugarPoblado.cod_municipio)).all()
    return [{"codigo": c, "municipio": m, "departamento": d, "poblacion_2018": int(p or 0), "lugares_poblados": n}
            for c, m, d, p, n in filas]


@router.get("/municipios/{codigo}")
def ficha_municipio(codigo: str, ctx: Contexto = Depends(requiere("territorio:ver", "tableros:ver")),
                    bd: Session = Depends(obtener_bd)):
    lugares = bd.execute(select(LugarPoblado).where(LugarPoblado.cod_municipio == codigo[:6])
                         .order_by(LugarPoblado.poblacion.desc())).scalars().all()
    if not lugares:
        raise HTTPException(404, "Municipio no encontrado.")
    proy = bd.execute(select(ProyeccionPoblacion).where(ProyeccionPoblacion.cod_municipio == codigo[:6])
                      .order_by(ProyeccionPoblacion.anio)).scalars().all()
    total = sum(lp.poblacion or 0 for lp in lugares)
    urbana = sum(lp.poblacion or 0 for lp in lugares if lp.area == "Urbana")
    return {
        "codigo": codigo, "municipio": lugares[0].municipio, "departamento": lugares[0].departamento,
        "poblacion_2018": total, "hombres": sum(lp.hombres or 0 for lp in lugares),
        "mujeres": sum(lp.mujeres or 0 for lp in lugares), "urbana_pct": round(urbana / total * 100, 1) if total else None,
        "lugares_poblados": len(lugares),
        "proyeccion": [{"anio": p.anio, "poblacion": p.poblacion, "hombres": p.hombres, "mujeres": p.mujeres} for p in proy],
        "principales": [{"codigo": lp.codigo, "nombre": lp.nombre, "poblacion": lp.poblacion, "area": lp.area,
                         "lat": lp.lat, "lon": lp.lon} for lp in lugares[:40]],
        "puntos": [[lp.lon, lp.lat, lp.poblacion or 0] for lp in lugares if lp.lat and lp.lon],
        "fuente": "INE, Censo 2018 (Cuadro A1.3 y centroides) y proyecciones de población 2015-2030",
    }


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
    q = select(LugarPoblado.lon, LugarPoblado.lat, LugarPoblado.poblacion, LugarPoblado.cod_departamento).where(
        LugarPoblado.lat.is_not(None))
    if departamento:
        q = q.where(LugarPoblado.departamento == (departamento_canonico(departamento) or departamento))
    puntos = [[round(lon, 4), round(lat, 4), int(p or 0), int(cd or 0)] for lon, lat, p, cd in bd.execute(q)]
    return {"puntos": puntos, "fuente": "INE, centroides de lugares poblados, Censo 2018"}


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
