"""Agente de TI: salud del sistema, frescura de datos y operación de automatizaciones.

Es deliberadamente crítico: reporta todo lo que un jefe de Informática querría saber antes de
que un usuario lo note.
"""

from __future__ import annotations

import platform
import shutil
import sqlite3
import sys
import time
from datetime import timedelta
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..config import obtener_config
from ..db import ahora, motor
from ..models import (
    Automatizacion,
    CompraItem,
    ConjuntoCkan,
    Ejecucion,
    FuenteDatos,
    LugarPoblado,
    PrecioRecolectado,
    PrecioReferencia,
    SerieIndice,
)
from . import programador
from .hallazgos import Resultado, puntaje, registrar_resultados

UMBRAL_FRESCURA = {"Diaria": 3, "Mensual": 45, "Anual (meses)": 400, "Anual": 400}


def metricas(bd: Session) -> dict:
    cfg = obtener_config()
    t0 = time.perf_counter()
    bd.execute(text("SELECT 1"))
    latencia = round((time.perf_counter() - t0) * 1000, 2)
    uso = shutil.disk_usage(cfg.directorio_datos if cfg.directorio_datos.exists() else Path("."))
    tablas = {
        "compras_items": bd.execute(select(func.count()).select_from(CompraItem)).scalar() or 0,
        "pr_referencia": bd.execute(select(func.count()).select_from(PrecioReferencia)).scalar() or 0,
        "series_indices": bd.execute(select(func.count()).select_from(SerieIndice)).scalar() or 0,
        "precios_recolectados": bd.execute(select(func.count()).select_from(PrecioRecolectado)).scalar() or 0,
        "lugares_poblados": bd.execute(select(func.count()).select_from(LugarPoblado)).scalar() or 0,
    }
    tamano_bd = None
    if motor.dialect.name == "sqlite":
        ruta = Path(motor.url.database or "")
        tamano_bd = ruta.stat().st_size if ruta.exists() else None
    return {
        "latencia_bd_ms": latencia,
        "motor_bd": motor.dialect.name,
        "tamano_bd_bytes": tamano_bd,
        "disco_libre_pct": round(uso.free / uso.total * 100, 1),
        "programador_activo": programador.en_marcha(),
        "python": sys.version.split()[0],
        "sistema": platform.platform(terse=True),
        "filas_por_tabla": tablas,
        "medido_en": ahora().isoformat(timespec="seconds"),
    }


def chequeos(bd: Session) -> list[Resultado]:
    cfg = obtener_config()
    t = ahora()
    m = metricas(bd)
    r: list[Resultado] = []
    r.append(Resultado("latencia_bd", "La base de datos responde lento", m["latencia_bd_ms"] < 200, "media",
                       f"Latencia: {m['latencia_bd_ms']} ms.", "Revisar carga del servidor e índices.", "ISO 27001 A.8.6"))
    r.append(Resultado("programador", "El motor de automatizaciones no está corriendo",
                       m["programador_activo"] or not cfg.programador_activo, "alta",
                       "El hilo del programador no responde.", "Reiniciar el servicio y revisar los registros.",
                       "ISO 27001 A.8.16"))
    errores = bd.execute(select(func.count()).select_from(Ejecucion).where(
        Ejecucion.estado == "error", Ejecucion.inicio > t - timedelta(hours=24))).scalar() or 0
    r.append(Resultado("automatizaciones_fallidas", "Automatizaciones con error en 24 h", errores == 0,
                       "alta" if errores > 3 else "media", f"{errores} ejecución(es) con error.",
                       "Abrir el historial de cada automatización y corregir la causa.", "ISO 27001 A.8.16"))
    atrasadas = bd.execute(select(func.count()).select_from(Automatizacion).where(
        Automatizacion.activa.is_(True), Automatizacion.proxima_ejecucion_en < t - timedelta(hours=1))).scalar() or 0
    r.append(Resultado("automatizaciones_atrasadas", "Automatizaciones atrasadas", atrasadas == 0, "media",
                       f"{atrasadas} automatización(es) con más de una hora de atraso.",
                       "Verificar que el programador esté activo.", "ISO 27001 A.8.6"))
    vacias = [k for k, v in m["filas_por_tabla"].items() if v == 0]
    r.append(Resultado("datos_cargados", "Tablas de datos vacías", not vacias, "alta",
                       f"Sin datos: {', '.join(vacias)}.", "Ejecutar: python -m app.etl cargar", "Calidad de datos"))
    viejas = []
    for f in bd.execute(select(FuenteDatos)).scalars():
        dias = UMBRAL_FRESCURA.get(f.periodicidad)
        if dias and f.descargado_en and f.descargado_en < t - timedelta(days=dias):
            viejas.append(f"{f.id} ({(t - f.descargado_en).days} días)")
    r.append(Resultado("frescura_datos", "Fuentes de datos desactualizadas", not viejas, "media",
                       "Descargadas hace demasiado: " + ", ".join(viejas[:6]) if viejas else "",
                       "Volver a descargar y procesar las fuentes (python -m app.etl todo).",
                       "Principios de Estadísticas Oficiales (oportunidad)"))
    ultima = bd.execute(select(func.max(ConjuntoCkan.sincronizado_en))).scalar()
    r.append(Resultado("catalogo_sincronizado", "El catálogo del INE no se ha sincronizado en 7 días",
                       bool(ultima and ultima > t - timedelta(days=7)), "baja",
                       f"Última sincronización: {ultima.isoformat() if ultima else 'nunca'}.",
                       "Ejecutar la automatización «Sincronizar catálogo del INE».", "Gestión de datos"))
    r.append(Resultado("disco", "Poco espacio en disco", m["disco_libre_pct"] > 10, "alta",
                       f"Libre: {m['disco_libre_pct']} %.", "Liberar espacio o ampliar el volumen.", "ISO 27001 A.8.6"))
    if cfg.es_produccion:
        r.append(Resultado("bd_produccion", "SQLite en producción", m["motor_bd"] != "sqlite", "media",
                           "SQLite no está pensado para varios usuarios simultáneos.",
                           "Usar PostgreSQL (docker compose ya lo incluye).", "Arquitectura"))
    respaldo = bd.execute(select(Automatizacion).where(Automatizacion.tarea == "ti.respaldar",
                                                       Automatizacion.activa.is_(True))).scalar()
    r.append(Resultado("respaldos", "No hay respaldos automáticos configurados", respaldo is not None, "media",
                       "Ninguna automatización activa de respaldo.",
                       "Crear la automatización «Respaldar base de datos» (diaria).",
                       "ISO 27001 A.8.13 · NIST CSF RC.RP"))
    return r


def revisar(bd: Session) -> dict:
    resumen = registrar_resultados(bd, "ti", chequeos(bd))
    resumen["puntaje"] = puntaje(bd, "ti")
    return resumen


def respaldar(destino: Path | None = None, conservar: int = 7) -> dict:
    """Respaldo en caliente de SQLite con la API oficial de copia. En PostgreSQL se usa pg_dump."""
    cfg = obtener_config()
    if motor.dialect.name != "sqlite":
        return {"resumen": "PostgreSQL: el respaldo se hace con pg_dump (ver docs/OPERACION.md).", "metricas": {}}
    origen = Path(motor.url.database)
    carpeta = destino or cfg.directorio_var / "respaldos"
    carpeta.mkdir(parents=True, exist_ok=True)
    archivo = carpeta / f"nexo-{ahora():%Y%m%d-%H%M%S}.db"
    with sqlite3.connect(origen) as fuente, sqlite3.connect(archivo) as copia:
        fuente.backup(copia)
    respaldos = sorted(carpeta.glob("nexo-*.db"))
    for viejo in respaldos[:-conservar]:
        viejo.unlink()
    return {"resumen": f"Respaldo creado ({archivo.stat().st_size // 1024} KB). Se conservan los últimos {conservar}.",
            "metricas": {"archivo": archivo.name, "bytes": archivo.stat().st_size}}
