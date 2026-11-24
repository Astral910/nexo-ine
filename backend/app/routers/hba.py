"""Calculadora de la Hoja de Balance de Alimentos 2024 (reto propuesto por la DIEC)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import obtener_bd
from ..deps import Contexto, requiere
from ..models import HbaConversion, HbaProducto, ProyeccionPoblacion

router = APIRouter(prefix="/api/hba", tags=["hoja de balance"])
ANIO_HBA = 2024


def _poblacion(bd: Session) -> int:
    return int(bd.execute(select(func.sum(ProyeccionPoblacion.poblacion))
                          .where(ProyeccionPoblacion.anio == ANIO_HBA)).scalar() or 0)


@router.get("/productos")
def productos(ctx: Contexto = Depends(requiere("hba:ver")), bd: Session = Depends(obtener_bd)):
    poblacion = _poblacion(bd)
    salida = []
    for p in bd.execute(select(HbaProducto).order_by(HbaProducto.orden)).scalars():
        v = p.valores or {}
        produccion, importaciones = v.get("Producción", 0), v.get("Importaciones", 0)
        exportaciones, existencias = v.get("Exportaciones", 0), v.get("Cambio de existencias", 0)
        suministro = produccion + importaciones - exportaciones - existencias
        # Coeficientes del manual de Hojas de Balance de Alimentos de la FAO (2001): se calculan sobre
        # producción + importaciones − exportaciones, sin el cambio de existencias. Así la dependencia y la
        # autosuficiencia suman 100 % cuando no hay exportaciones, y no superan 100 % por acumulación de inventario.
        base_fao = produccion + importaciones - exportaciones
        alimentos = v.get("Alimentos", 0)
        salida.append({
            "producto": p.producto, "grupo": p.grupo, "es_grupo": p.es_grupo, "valores": v,
            "suministro_interno": round(suministro, 1),
            "dependencia_importaciones": round(importaciones / base_fao * 100, 1) if base_fao > 0 else None,
            "autosuficiencia": round(produccion / base_fao * 100, 1) if base_fao > 0 else None,
            "kg_persona_anio": round(alimentos * 1000 / poblacion, 2) if poblacion else None,
            "g_persona_dia": round(alimentos * 1e6 / poblacion / 365, 1) if poblacion else None,
        })
    return {"anio": ANIO_HBA, "poblacion": poblacion, "unidad": "toneladas métricas",
            "nota": "Suministro interno = producción + importaciones − exportaciones − cambio de existencias. "
                    "Disponibilidad per cápita con la población proyectada por el INE para 2024. "
                    "Dependencia de importaciones = importaciones ÷ (producción + importaciones − exportaciones), "
                    "según el manual de Hojas de Balance de Alimentos de la FAO.",
            "productos": salida}


@router.get("/conversiones")
def conversiones(ctx: Contexto = Depends(requiere("hba:ver")), bd: Session = Depends(obtener_bd)):
    grupos: dict[str, list] = {}
    for c in bd.execute(select(HbaConversion).order_by(HbaConversion.primario, HbaConversion.tasa_extraccion.desc())).scalars():
        grupos.setdefault(c.primario, []).append({"derivado": c.derivado, "tasa": c.tasa_extraccion,
                                                  "cantidad_primaria": c.cantidad_primaria,
                                                  "cantidad_derivada": c.cantidad_derivada})
    return [{"primario": k, "derivados": v} for k, v in grupos.items()]


class Calculo(BaseModel):
    primario: str = Field(max_length=160)
    cantidad: float = Field(gt=0, le=1e9)


@router.post("/calcular")
def calcular(datos: Calculo, ctx: Contexto = Depends(requiere("hba:ver")), bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(HbaConversion).where(HbaConversion.primario == datos.primario)).scalars().all()
    if not filas:
        raise HTTPException(404, "No hay relaciones de conversión para ese producto.")
    total_procesado = filas[0].cantidad_primaria
    return {
        "primario": datos.primario, "cantidad": datos.cantidad, "unidad": "toneladas métricas",
        "porcentaje_del_procesado_nacional": round(datos.cantidad / total_procesado * 100, 3) if total_procesado else None,
        "derivados": [{"derivado": f.derivado, "tasa": f.tasa_extraccion,
                       "cantidad_estimada": round(datos.cantidad * f.tasa_extraccion, 3)} for f in filas],
        "metodo": "Relación aparente observada en las Cuentas de Utilización y Suministro 2024 del INE: producción del "
                  "derivado ÷ cantidad procesada del producto primario. Algunos derivados provienen de etapas "
                  "intermedias (por ejemplo, pan a partir de harina), por eso las tasas no deben sumarse.",
    }
