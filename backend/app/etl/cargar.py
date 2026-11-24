"""Carga las tablas procesadas (data/procesados/*.csv.gz) en la base de datos y registra el linaje."""

from __future__ import annotations

import csv
import gzip
import json
import logging
from datetime import date, datetime

from sqlalchemy import delete, insert
from sqlalchemy.orm import Session

from ..config import obtener_config
from ..db import SesionLocal, ahora
from ..models import (
    CompraItem,
    FuenteDatos,
    HbaConversion,
    HbaProducto,
    LugarPoblado,
    PrecioRecolectado,
    PrecioReferencia,
    ProyeccionPoblacion,
    SerieIndice,
)
from .descargar import leer_manifiesto
from .fuentes import FUENTES

log = logging.getLogger("nexo.etl")

# tabla procesada -> (modelo, fuentes que la alimentan)
TABLAS = {
    "pr_referencia": (PrecioReferencia, ["pr_2022", "pr_2023"]),
    "compras_items": (CompraItem, ["guatecompras_2025"]),
    "series_indices": (SerieIndice, ["ipc_republica", "ipc_region", "ipc_division", "ipc_division_nombres",
                                      "cba_urbana", "cba_rural"] + [f.id for f in FUENTES if f.id.startswith("ipmc_")]),
    "precios_recolectados": (PrecioRecolectado, ["precios_recolectados_2022_07", "precios_recolectados_2023"]),
    "hba_productos": (HbaProducto, ["hba_2024"]),
    "hba_conversiones": (HbaConversion, ["hba_cus_2024"]),
    "lugares_poblados": (LugarPoblado, ["lugares_poblados", "censo_a1"]),
    "proyecciones_poblacion": (ProyeccionPoblacion, ["proyecciones"]),
}


def _convertir(modelo, fila: dict) -> dict:
    salida = {}
    for col in modelo.__table__.columns:
        if col.name not in fila or col.name == "id":
            continue
        v = fila[col.name]
        tipo = col.type.python_type if hasattr(col.type, "python_type") else str
        if v == "" or v is None:
            salida[col.name] = None if col.nullable else ("" if tipo is str else 0)
        elif tipo is float:
            salida[col.name] = float(v)
        elif tipo is int:
            salida[col.name] = int(float(v))
        elif tipo is bool:
            salida[col.name] = v in ("1", "true", "True")
        elif tipo is date:
            salida[col.name] = date.fromisoformat(v[:10])
        elif tipo is dict:
            salida[col.name] = json.loads(v)
        else:
            salida[col.name] = v
    return salida


def cargar_tabla(bd: Session, nombre: str, lote: int = 5000) -> int:
    modelo, _ = TABLAS[nombre]
    ruta = obtener_config().directorio_datos / "procesados" / f"{nombre}.csv.gz"
    if not ruta.exists():
        log.warning("No existe %s; ejecuta primero el procesamiento.", ruta)
        return 0
    bd.execute(delete(modelo))
    n = 0
    buffer: list[dict] = []
    with gzip.open(ruta, "rt", encoding="utf-8", newline="") as f:
        for fila in csv.DictReader(f):
            buffer.append(_convertir(modelo, fila))
            if len(buffer) >= lote:
                bd.execute(insert(modelo), buffer)
                n += len(buffer)
                buffer.clear()
    if buffer:
        bd.execute(insert(modelo), buffer)
        n += len(buffer)
    bd.commit()
    log.info("Cargadas %s filas en %s", n, nombre)
    return n


def registrar_linaje(bd: Session, filas_por_tabla: dict[str, int]) -> None:
    manifiesto = leer_manifiesto()
    for f in FUENTES:
        reg = manifiesto.get(f.id, {})
        tablas = [t for t, (_, fuentes) in TABLAS.items() if f.id in fuentes]
        fd = bd.get(FuenteDatos, f.id) or FuenteDatos(id=f.id)
        fd.titulo, fd.publicador, fd.conjunto, fd.url = f.titulo, f.publicador, f.conjunto, f.url
        fd.pagina, fd.licencia, fd.formato, fd.periodicidad, fd.usado_en = (
            f.pagina, reg.get("licencia", f.licencia), f.formato, f.periodicidad, f.usado_en)
        fd.clasificacion = "publico"
        if reg.get("descargado_en"):
            fd.descargado_en = datetime.fromisoformat(reg["descargado_en"]).replace(tzinfo=None)
        fd.sha256, fd.bytes = reg.get("sha256"), reg.get("bytes")
        fd.filas = sum(filas_por_tabla.get(t, 0) for t in tablas) or fd.filas
        fd.cargado_en = ahora()
        fd.notas = reg.get("nota", "")
        bd.merge(fd)
    bd.commit()


def cargar_todo(tablas: list[str] | None = None) -> dict[str, int]:
    bd = SesionLocal()
    try:
        resultado = {nombre: cargar_tabla(bd, nombre) for nombre in TABLAS if not tablas or nombre in tablas}
        registrar_linaje(bd, resultado)
        return resultado
    finally:
        bd.close()
