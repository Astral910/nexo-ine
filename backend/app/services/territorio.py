"""Consultas de territorio (Censo 2018 y proyecciones) que comparten el área interna y Nexo Abierto.

Todas son cifras que el INE ya publica: población censada por lugar poblado (Cuadro A1.3 y centroides) y las
estimaciones y proyecciones de población por municipio 2015-2030.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import ahora
from ..models import LugarPoblado, ProyeccionPoblacion
from ..texto import departamento_canonico

FUENTE_FICHA = "INE, Censo 2018 (Cuadro A1.3 y centroides) y proyecciones de población 2015-2030"


def anio_proyeccion() -> int:
    """Año en curso, dentro del horizonte publicado de las proyecciones (2015-2030)."""
    return min(max(ahora().year, 2015), 2030)


def departamentos(bd: Session) -> dict:
    anio = anio_proyeccion()
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


def municipios(bd: Session, departamento: str | None = None) -> list[dict]:
    q = select(LugarPoblado.cod_municipio, LugarPoblado.municipio, LugarPoblado.departamento,
               func.sum(LugarPoblado.poblacion), func.count())
    if departamento:
        q = q.where(LugarPoblado.departamento == (departamento_canonico(departamento) or departamento))
    filas = bd.execute(q.group_by(LugarPoblado.cod_municipio, LugarPoblado.municipio, LugarPoblado.departamento)
                       .order_by(LugarPoblado.cod_municipio)).all()
    return [{"codigo": c, "municipio": m, "departamento": d, "poblacion_2018": int(p or 0), "lugares_poblados": n}
            for c, m, d, p, n in filas]


def ficha_municipio(bd: Session, codigo: str, principales: int = 40) -> dict | None:
    """Ficha municipal o None si el código no existe."""
    lugares = bd.execute(select(LugarPoblado).where(LugarPoblado.cod_municipio == codigo[:6])
                         .order_by(LugarPoblado.poblacion.desc())).scalars().all()
    if not lugares:
        return None
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
                         "lat": lp.lat, "lon": lp.lon} for lp in lugares[:principales]],
        "puntos": [[lp.lon, lp.lat, lp.poblacion or 0] for lp in lugares if lp.lat and lp.lon],
        # Para el mapa de la ficha: nombre y área de cada lugar poblado (todo es público en el Censo 2018).
        "lugares": [[lp.lon, lp.lat, lp.poblacion or 0, lp.nombre, lp.area or ""] for lp in lugares if lp.lat and lp.lon],
        "fuente": FUENTE_FICHA,
    }


def mapa(bd: Session, departamento: str | None = None) -> dict:
    """Puntos compactos [lon, lat, población, índice de departamento] para dibujar el país con datos reales."""
    q = select(LugarPoblado.lon, LugarPoblado.lat, LugarPoblado.poblacion, LugarPoblado.cod_departamento).where(
        LugarPoblado.lat.is_not(None))
    if departamento:
        q = q.where(LugarPoblado.departamento == (departamento_canonico(departamento) or departamento))
    puntos = [[round(lon, 4), round(lat, 4), int(p or 0), int(cd or 0)] for lon, lat, p, cd in bd.execute(q)]
    return {"puntos": puntos, "fuente": "INE, centroides de lugares poblados, Censo 2018"}
