"""Resumen general de la plataforma (centro de mando) y textos legibles de la bitácora."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import ahora
from ..models import (
    AlertaPrecio,
    Automatizacion,
    Bitacora,
    CompraItem,
    Ejecucion,
    FuenteDatos,
    LugarPoblado,
    PrecioRecolectado,
    PrecioReferencia,
    ProyeccionPoblacion,
    SerieIndice,
    SolicitudPrecio,
    Usuario,
)
from .hallazgos import puntaje

ACCIONES = {
    "auth.login": "inició sesión",
    "auth.logout": "cerró sesión",
    "auth.login_fallido": "intento fallido de inicio de sesión",
    "auth.registro": "solicitó una cuenta",
    "auth.correo_verificado": "verificó su correo",
    "auth.mfa_activado": "activó el segundo factor",
    "auth.cuenta_bloqueada": "cuenta bloqueada por intentos fallidos",
    "usuarios.aprobado": "aprobó una cuenta",
    "usuarios.rechazado": "rechazó una solicitud de cuenta",
    "usuarios.roles": "cambió roles de una cuenta",
    "automatizacion.ejecutada": "ejecutó una automatización",
    "automatizacion.creada": "creó una automatización",
    "dpir.solicitud_creada": "registró una solicitud de precio de referencia",
    "dpir.avance": "avanzó una solicitud de precio de referencia",
    "dpir.informe": "generó un informe de precio de referencia",
    "indices.alerta_revisada": "revisó una alerta de precio",
    "calidad.validacion": "validó un archivo de datos",
    "tableros.generado": "generó un tablero desde texto",
    "privacidad.retencion_aplicada": "aplicó las políticas de retención",
    "acceso.denegado": "intentó una acción sin permiso",
    "seguridad.limite_excedido": "superó el límite de solicitudes",
}


def describir(evento: Bitacora) -> str:
    quien = evento.usuario_nombre or "El sistema"
    return f"{quien} {ACCIONES.get(evento.accion, evento.accion)}"


def _ultimo(bd: Session, indicador: str, ambito: str, clave: str | None = None):
    q = select(SerieIndice).where(SerieIndice.indicador == indicador, SerieIndice.ambito == ambito)
    if clave:
        q = q.where(SerieIndice.clave == clave)
    return bd.execute(q.order_by(SerieIndice.anio.desc(), SerieIndice.mes.desc()).limit(1)).scalar()


def resumen_general(bd: Session) -> dict:
    t = ahora()
    ipc = _ultimo(bd, "IPC", "republica")
    inter = _ultimo(bd, "IPC", "republica_var", "Variación interanual")
    mensual = _ultimo(bd, "IPC", "republica_var", "Variación mensual")
    cba_u = _ultimo(bd, "CBA", "urbana")
    cba_r = _ultimo(bd, "CBA", "rural")
    contar = lambda m, *c: bd.execute(select(func.count()).select_from(m).where(*c)).scalar() or 0  # noqa: E731
    anio_actual = t.year
    poblacion = bd.execute(select(func.sum(ProyeccionPoblacion.poblacion))
                           .where(ProyeccionPoblacion.anio == anio_actual)).scalar() or 0
    registros = sum(f.filas or 0 for f in bd.execute(select(FuenteDatos)).scalars())
    return {
        "indicadores": {
            "ipc_indice": round(ipc.valor, 2) if ipc else None,
            "ipc_interanual": round(inter.valor, 2) if inter else 0.0,
            "ipc_mensual": round(mensual.valor, 2) if mensual else 0.0,
            "ipc_periodo": f"{ipc.anio}-{ipc.mes:02d}" if ipc else "",
            "cba_urbana": round(cba_u.valor, 2) if cba_u else 0.0,
            "cba_rural": round(cba_r.valor, 2) if cba_r else 0.0,
            "cba_periodo": f"{cba_u.anio}-{cba_u.mes:02d}" if cba_u else "",
            "alertas_nuevas": contar(AlertaPrecio, AlertaPrecio.estado == "nueva"),
            "alertas_altas": contar(AlertaPrecio, AlertaPrecio.estado == "nueva", AlertaPrecio.severidad == "alta"),
            "solicitudes_abiertas": contar(SolicitudPrecio, SolicitudPrecio.estado != "entregada",
                                           SolicitudPrecio.rechazada.is_(False)),
            "solicitudes_vencidas": contar(SolicitudPrecio, SolicitudPrecio.estado != "entregada",
                                           SolicitudPrecio.rechazada.is_(False),
                                           SolicitudPrecio.fecha_limite < t.date()),
            "automatizaciones_activas": contar(Automatizacion, Automatizacion.activa.is_(True)),
            "ejecuciones_24h": contar(Ejecucion, Ejecucion.inicio > t - timedelta(hours=24)),
            "fallas_24h": contar(Ejecucion, Ejecucion.inicio > t - timedelta(hours=24), Ejecucion.estado == "error"),
            "puntaje_seguridad": puntaje(bd, "seguridad"),
            "puntaje_ti": puntaje(bd, "ti"),
            "usuarios_activos": contar(Usuario, Usuario.estado == "activo"),
            "pendientes_aprobacion": contar(Usuario, Usuario.estado == "pendiente_aprobacion"),
            "compras_analizables": contar(CompraItem),
            "precios_referencia": contar(PrecioReferencia),
            "precios_recolectados": contar(PrecioRecolectado),
            "lugares_poblados": contar(LugarPoblado),
            "poblacion_proyectada": int(poblacion),
            "anio_poblacion": anio_actual,
            "fuentes": contar(FuenteDatos),
            "registros_totales": int(registros),
        },
        "generado_en": t.isoformat(timespec="seconds"),
    }


def actividad(bd: Session, limite: int = 12, modulo: str | None = None) -> list[dict]:
    q = select(Bitacora).order_by(Bitacora.id.desc()).limit(limite)
    if modulo:
        q = q.where(Bitacora.modulo == modulo)
    return [{"id": e.id, "ts": e.ts.isoformat(), "texto": describir(e), "modulo": e.modulo, "resultado": e.resultado}
            for e in bd.execute(q).scalars()]
