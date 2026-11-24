"""Registro de hallazgos de los agentes automáticos (seguridad y TI)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import ahora
from ..models import Hallazgo

PESOS = {"critica": 25, "alta": 12, "media": 5, "baja": 2, "info": 0}


@dataclass
class Resultado:
    chequeo: str
    titulo: str
    ok: bool
    severidad: str = "media"
    detalle: str = ""
    recomendacion: str = ""
    referencias: str = ""


def registrar_resultados(bd: Session, agente: str, resultados: list[Resultado]) -> dict:
    """Abre, actualiza o resuelve hallazgos según el resultado de cada chequeo."""
    abiertos = {h.chequeo: h for h in bd.execute(
        select(Hallazgo).where(Hallazgo.agente == agente, Hallazgo.estado == "abierto")).scalars()}
    nuevos = resueltos = 0
    for r in resultados:
        h = abiertos.get(r.chequeo)
        if r.ok:
            if h is not None:
                h.estado, h.resuelto_en = "resuelto", ahora()
                resueltos += 1
            continue
        if h is None:
            aceptado = bd.execute(select(Hallazgo).where(Hallazgo.agente == agente, Hallazgo.chequeo == r.chequeo,
                                                         Hallazgo.estado == "aceptado")).scalar()
            if aceptado is not None:  # riesgo aceptado formalmente: no se reabre
                aceptado.ultima_vez, aceptado.detalle = ahora(), r.detalle
                continue
            h = Hallazgo(agente=agente, chequeo=r.chequeo)
            bd.add(h)
            nuevos += 1
        h.titulo, h.severidad, h.detalle = r.titulo, r.severidad, r.detalle
        h.recomendacion, h.referencias, h.ultima_vez = r.recomendacion, r.referencias, ahora()
    bd.commit()
    return {"chequeos": len(resultados), "fallidos": sum(1 for r in resultados if not r.ok), "nuevos": nuevos,
            "resueltos": resueltos}


def puntaje(bd: Session, agente: str) -> int:
    abiertos = bd.execute(select(Hallazgo.severidad).where(Hallazgo.agente == agente,
                                                           Hallazgo.estado == "abierto")).scalars().all()
    return max(0, 100 - sum(PESOS.get(s, 0) for s in abiertos))
