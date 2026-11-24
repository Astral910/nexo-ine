"""Detección de precios atípicos para la crítica de datos del IPC.

Dos métodos complementarios, ambos documentados en docs/METODOS.md:

1. Hidiroglou-Berthelot (HB) sobre relativos de precio (precio actual ÷ precio anterior) del
   mismo informante. Es el método de referencia en oficinas de estadística para variaciones
   atípicas. Se aplica por artículo y periodo.
2. Desvío de nivel (mediana y MAD sobre el logaritmo del precio) para el mismo artículo, cantidad y
   mes, cuando la fuente no permite seguir al mismo informante entre meses (archivo público 2023).
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..models import AlertaPrecio, PrecioRecolectado

MIN_GRUPO_HB = 5
MIN_GRUPO_NIVEL = 8


@dataclass
class ResultadoHB:
    puntaje: float
    limite_inferior: float
    limite_superior: float
    atipico: bool
    exceso: float  # cuántas veces el ancho de tolerancia se excede


def _cuartiles(valores: list[float]) -> tuple[float, float, float]:
    if len(valores) < 4:
        m = statistics.median(valores)
        return min(valores), m, max(valores)
    q1, q2, q3 = statistics.quantiles(valores, n=4, method="inclusive")
    return q1, q2, q3


def hidiroglou_berthelot(relativos: list[float], tamanos: list[float], u: float = 0.5, a: float = 0.05,
                         c: float = 4.0) -> list[ResultadoHB]:
    """Aplica HB a una lista de relativos con su tamaño (máximo entre precio anterior y actual).

    Si la mayoría de precios no cambia (relativo igual a la mediana), los límites se estiman con
    los precios que sí cambiaron; de lo contrario cualquier cambio mínimo quedaría marcado.
    """
    r_m = statistics.median(relativos)
    puntajes = []
    for r, t in zip(relativos, tamanos, strict=True):
        s = (1 - r_m / r) if r < r_m else (r / r_m - 1)
        puntajes.append(s * (max(t, 1e-9) ** u))
    base = [e for e, r in zip(puntajes, relativos, strict=True) if abs(r - r_m) > 1e-9]
    if len(base) < MIN_GRUPO_HB:
        base = puntajes
    e_q1, e_m, e_q3 = _cuartiles(base)
    d1 = max(e_m - e_q1, abs(a * e_m), 1e-9)
    d3 = max(e_q3 - e_m, abs(a * e_m), 1e-9)
    li, ls = e_m - c * d1, e_m + c * d3
    salida = []
    for e, r in zip(puntajes, relativos, strict=True):
        sin_cambio = abs(r - r_m) <= 1e-9  # un precio que se movió igual que la mediana nunca es atípico
        exceso = 0.0 if sin_cambio else (e - ls) / (c * d3) if e > ls else (li - e) / (c * d1) if e < li else 0.0
        salida.append(ResultadoHB(e, li, ls, (not sin_cambio) and (e < li or e > ls), exceso))
    return salida


def _severidad(exceso: float) -> str:
    return "alta" if exceso >= 1.0 else "media" if exceso >= 0.4 else "baja"


def detectar(bd: Session, anio: int, mes: int, c: float = 4.0) -> dict:
    """Recalcula las alertas del periodo indicado. Conserva las ya revisadas por una persona."""
    periodo = f"{anio}-{mes:02d}"
    revisadas = {
        (a.precio_id, a.metodo) for a in bd.execute(
            select(AlertaPrecio).where(AlertaPrecio.periodo == periodo, AlertaPrecio.estado != "nueva")).scalars()
    }
    bd.execute(delete(AlertaPrecio).where(AlertaPrecio.periodo == periodo, AlertaPrecio.estado == "nueva"))
    filas = bd.execute(select(PrecioRecolectado).where(PrecioRecolectado.anio == anio,
                                                       PrecioRecolectado.mes == mes)).scalars().all()
    nuevas: list[AlertaPrecio] = []
    con_relativo = [f for f in filas if f.relativo and f.precio_anterior and f.precio_actual]
    metodo = "hidiroglou-berthelot" if len(con_relativo) >= 0.5 * max(len(filas), 1) else "desvio-de-nivel"

    if metodo == "hidiroglou-berthelot":
        grupos: dict[str, list[PrecioRecolectado]] = defaultdict(list)
        for f in con_relativo:
            grupos[f.cod_articulo].append(f)
        evaluados = 0
        for obs in grupos.values():
            if len(obs) < MIN_GRUPO_HB:
                continue
            evaluados += len(obs)
            res = hidiroglou_berthelot([o.relativo for o in obs],
                                       [max(o.precio_anterior, o.precio_actual) for o in obs], c=c)
            mediana = statistics.median(o.relativo for o in obs)
            for o, r in zip(obs, res, strict=True):
                if r.atipico and (o.id, metodo) not in revisadas:
                    nuevas.append(_alerta(o, periodo, metodo, r.puntaje, r.limite_inferior, r.limite_superior,
                                          mediana, len(obs), _severidad(r.exceso), o.relativo))
    else:
        grupos2: dict[tuple, list[PrecioRecolectado]] = defaultdict(list)
        for f in filas:
            if f.precio_actual and f.precio_actual > 0:
                grupos2[(f.cod_articulo, f.cant_actual)].append(f)
        evaluados = 0
        for obs in grupos2.values():
            if len(obs) < MIN_GRUPO_NIVEL:
                continue
            evaluados += len(obs)
            logs = [math.log(o.precio_actual) for o in obs]
            med = statistics.median(logs)
            mad = statistics.median(abs(x - med) for x in logs)
            for o, x in zip(obs, logs, strict=True):
                if mad > 1e-9:
                    z = 0.6745 * (x - med) / mad
                    atipico, exceso = abs(z) > 3.5, (abs(z) - 3.5) / 3.5
                else:  # casi todos con el mismo precio: se marca lo que se aleja más de 50 %
                    z = x - med
                    atipico, exceso = abs(z) > math.log(1.5), abs(z) / math.log(1.5) - 1
                if atipico and (o.id, "desvio-de-nivel") not in revisadas:
                    nuevas.append(_alerta(o, periodo, "desvio-de-nivel", z, -3.5, 3.5, math.exp(med), len(obs),
                                          _severidad(exceso), o.precio_actual / math.exp(med)))
    bd.add_all(nuevas)
    bd.commit()
    return {"periodo": periodo, "metodo": metodo, "observaciones": len(filas), "evaluadas": evaluados,
            "alertas": len(nuevas), "proporcion": round(len(nuevas) / max(evaluados, 1), 4)}


def _alerta(o: PrecioRecolectado, periodo, metodo, puntaje, li, ls, mediana, n, severidad, relativo) -> AlertaPrecio:
    return AlertaPrecio(
        periodo=periodo, precio_id=o.id, cod_articulo=o.cod_articulo, articulo=o.articulo,
        departamento=o.departamento, municipio=o.municipio, cod_fuente=o.cod_fuente,
        precio_anterior=o.precio_anterior, precio_actual=o.precio_actual, relativo=round(relativo, 6),
        mediana_grupo=round(mediana, 6), puntaje=round(puntaje, 6), limite_inferior=round(li, 6),
        limite_superior=round(ls, 6), n_grupo=n, severidad=severidad, metodo=metodo)


def periodos_disponibles(bd: Session) -> list[str]:
    filas = bd.execute(select(PrecioRecolectado.anio, PrecioRecolectado.mes).distinct()
                       .order_by(PrecioRecolectado.anio, PrecioRecolectado.mes)).all()
    return [f"{a}-{m:02d}" for a, m in filas]
