"""Motor de automatizaciones: calcula la próxima ejecución y ejecuta tareas de una lista blanca.

Corre en un hilo dentro de la API (suficiente para una instancia). Para varias instancias se
recomienda un solo proceso programador o un bloqueo en base de datos (ver docs/ARQUITECTURA.md).
"""

from __future__ import annotations

import logging
import threading
import traceback
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import select

from .. import bitacora
from ..avisos import notificar
from ..config import obtener_config
from ..db import SesionLocal, ahora
from ..models import Automatizacion, Ejecucion

log = logging.getLogger("nexo.programador")
GUATEMALA = timezone(timedelta(hours=-6), "America/Guatemala")  # sin horario de verano
_parar = threading.Event()
_hilo: threading.Thread | None = None
_en_curso: set[int] = set()
_candado = threading.Lock()


def _a_utc(dt_local: datetime) -> datetime:
    return dt_local.astimezone(UTC).replace(tzinfo=None)


def calcular_proxima(auto: Automatizacion, desde: datetime | None = None) -> datetime | None:
    """Devuelve la próxima ejecución en UTC (sin zona) o None si es manual o está pausada."""
    if auto.frecuencia == "manual" or auto.activa is False:
        return None
    base = desde or ahora()
    if auto.frecuencia == "intervalo":
        minutos = max(5, int(auto.valor_frecuencia or 60))
        return base + timedelta(minutes=minutos)
    local = base.replace(tzinfo=UTC).astimezone(GUATEMALA)
    if auto.frecuencia == "diaria":
        hh, mm = (int(x) for x in (auto.valor_frecuencia or "07:00").split(":"))
        candidato = local.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidato <= local:
            candidato += timedelta(days=1)
        return _a_utc(candidato)
    if auto.frecuencia == "semanal":
        dia, hora = (auto.valor_frecuencia or "0@07:00").split("@")
        hh, mm = (int(x) for x in hora.split(":"))
        candidato = local.replace(hour=hh, minute=mm, second=0, microsecond=0)
        candidato += timedelta(days=(int(dia) - candidato.weekday()) % 7)
        if candidato <= local:
            candidato += timedelta(days=7)
        return _a_utc(candidato)
    return None


def describir_frecuencia(auto: Automatizacion) -> str:
    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    if auto.frecuencia == "intervalo":
        m = int(auto.valor_frecuencia or 60)
        return f"Cada {m // 60} h" if m % 60 == 0 and m >= 60 else f"Cada {m} min"
    if auto.frecuencia == "diaria":
        return f"Todos los días a las {auto.valor_frecuencia}"
    if auto.frecuencia == "semanal":
        d, h = (auto.valor_frecuencia or "0@07:00").split("@")
        return f"Cada {dias[int(d)]} a las {h}"
    return "Solo manual"


def ejecutar_automatizacion(auto_id: int, disparada_por: str = "programador", usuario=None) -> dict:
    """Ejecuta una automatización y guarda el resultado. Nunca lanza excepciones hacia afuera."""
    from .tareas import TAREAS  # importación diferida para evitar ciclos

    with _candado:
        if auto_id in _en_curso:
            return {"estado": "omitida", "resumen": "Ya hay una ejecución en curso."}
        _en_curso.add(auto_id)
    bd = SesionLocal()
    try:
        auto = bd.get(Automatizacion, auto_id)
        if auto is None:
            return {"estado": "error", "resumen": "Automatización inexistente."}
        ejec = Ejecucion(automatizacion_id=auto.id, disparada_por=disparada_por)
        bd.add(ejec)
        bd.commit()
        tarea = TAREAS.get(auto.tarea)
        try:
            if tarea is None:
                raise ValueError(f"Tarea no permitida: {auto.tarea}")
            resultado = tarea.funcion(bd, dict(auto.parametros or {}), auto) or {}
            ejec.estado = "ok"
            ejec.resumen = str(resultado.get("resumen", "Completado"))[:2000]
            ejec.metricas = resultado.get("metricas")
            if resultado.get("parametros") is not None:
                auto.parametros = resultado["parametros"]
            nivel = resultado.get("nivel", "info")
        except Exception as e:  # el error queda registrado y se avisa al responsable
            bd.rollback()
            ejec = bd.get(Ejecucion, ejec.id)
            auto = bd.get(Automatizacion, auto_id)
            ejec.estado = "error"
            ejec.resumen = f"{type(e).__name__}: {e}"[:2000]
            ejec.metricas = {"traza": traceback.format_exc(limit=3)[-1500:]}
            resultado, nivel = {"notificar": True}, "alerta"
            log.warning("Automatización %s falló: %s", auto_id, e)
        ejec.fin = ahora()
        auto.ultima_ejecucion_en = ejec.fin
        auto.ultimo_estado = ejec.estado
        auto.proxima_ejecucion_en = calcular_proxima(auto)
        bd.commit()
        if auto.propietario_id and (resultado.get("notificar") or ejec.estado == "error"):
            notificar(bd, auto.propietario_id, f"{auto.nombre}: {'error' if ejec.estado == 'error' else 'listo'}",
                      ejec.resumen, "critico" if ejec.estado == "error" else nivel, "/automatizaciones")
        bitacora.registrar("automatizacion.ejecutada", usuario=usuario, modulo="automatizaciones",
                           objeto=f"automatizacion:{auto.id}",
                           detalle={"tarea": auto.tarea, "estado": ejec.estado, "disparada_por": disparada_por},
                           resultado="ok" if ejec.estado == "ok" else "error")
        return {"estado": ejec.estado, "resumen": ejec.resumen, "ejecucion_id": ejec.id, "metricas": ejec.metricas}
    finally:
        bd.close()
        with _candado:
            _en_curso.discard(auto_id)


def _ciclo() -> None:
    intervalo = obtener_config().programador_intervalo_s
    while not _parar.wait(intervalo):
        try:
            bd = SesionLocal()
            try:
                pendientes = bd.execute(
                    select(Automatizacion.id).where(Automatizacion.activa.is_(True),
                                                    Automatizacion.proxima_ejecucion_en.is_not(None),
                                                    Automatizacion.proxima_ejecucion_en <= ahora())
                    .order_by(Automatizacion.proxima_ejecucion_en).limit(10)).scalars().all()
            finally:
                bd.close()
            for auto_id in pendientes:
                if _parar.is_set():
                    break
                ejecutar_automatizacion(auto_id)
        except Exception:
            log.exception("Error en el ciclo del programador")


def iniciar() -> None:
    global _hilo
    if _hilo and _hilo.is_alive():
        return
    _parar.clear()
    _hilo = threading.Thread(target=_ciclo, name="nexo-programador", daemon=True)
    _hilo.start()
    log.info("Programador de automatizaciones iniciado")


def detener() -> None:
    _parar.set()


def en_marcha() -> bool:
    return bool(_hilo and _hilo.is_alive())
