"""Preparación idempotente de la base: tablas, permisos, roles, políticas, automatizaciones,
riesgos y tableros base por rol. Se ejecuta al arrancar la API y con `python -m app.cli init`."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalogo_riesgos import RIESGOS_BASE
from .catalogos import AUTOMATIZACIONES_SISTEMA, PERMISOS, POLITICAS_RETENCION, ROLES
from .db import Base, SesionLocal, motor
from .models import Automatizacion, Permiso, PoliticaRetencion, Riesgo, Rol, RolPermiso, Tablero
from .services.programador import calcular_proxima
from .services.tableros_base import TABLEROS_POR_ROL

log = logging.getLogger("nexo.siembra")


def sembrar_catalogos(bd: Session) -> None:
    existentes = {p.codigo for p in bd.execute(select(Permiso)).scalars()}
    for codigo, descripcion, modulo in PERMISOS:
        if codigo not in existentes:
            bd.add(Permiso(codigo=codigo, descripcion=descripcion, modulo=modulo))
    bd.commit()
    for r in ROLES:
        rol = bd.execute(select(Rol).where(Rol.codigo == r["codigo"])).scalar()
        if rol is None:
            rol = Rol(codigo=r["codigo"])
            bd.add(rol)
        rol.nombre, rol.descripcion, rol.area = r["nombre"], r["descripcion"], r["area"]
        rol.privilegiado = r.get("privilegiado", False)
        rol.autoregistro = r.get("autoregistro", True)
        bd.flush()
        actuales = {rp.permiso for rp in rol.permisos}
        deseados = set(r["permisos"])
        for p in deseados - actuales:
            rol.permisos.append(RolPermiso(rol_id=rol.id, permiso=p))
        for rp in list(rol.permisos):
            if rp.permiso not in deseados:
                rol.permisos.remove(rp)
    bd.commit()


def sembrar_politicas(bd: Session) -> None:
    for p in POLITICAS_RETENCION:
        if bd.execute(select(PoliticaRetencion).where(PoliticaRetencion.clase == p["clase"])).scalar() is None:
            bd.add(PoliticaRetencion(**p))
    bd.commit()


def sembrar_automatizaciones(bd: Session) -> None:
    for a in AUTOMATIZACIONES_SISTEMA:
        if bd.execute(select(Automatizacion).where(Automatizacion.tarea == a["tarea"],
                                                   Automatizacion.sistema.is_(True))).scalar() is None:
            auto = Automatizacion(sistema=True, activa=True, parametros={}, **a)
            auto.proxima_ejecucion_en = calcular_proxima(auto)
            bd.add(auto)
    bd.commit()


def sembrar_riesgos(bd: Session) -> None:
    for r in RIESGOS_BASE:
        if bd.execute(select(Riesgo).where(Riesgo.codigo == r["codigo"])).scalar() is None:
            bd.add(Riesgo(**r))
    bd.commit()


def sembrar_tableros(bd: Session) -> None:
    for rol, spec in TABLEROS_POR_ROL.items():
        tablero = bd.execute(select(Tablero).where(Tablero.rol_codigo == rol, Tablero.origen == "sistema")).scalar()
        if tablero is None:
            tablero = Tablero(rol_codigo=rol, origen="sistema", titulo=spec["titulo"], spec=spec)
            bd.add(tablero)
        else:  # el tablero base se actualiza con cada versión; los personales no se tocan
            tablero.titulo, tablero.spec = spec["titulo"], spec
    bd.commit()


def preparar_base() -> None:
    Base.metadata.create_all(motor)
    bd = SesionLocal()
    try:
        sembrar_catalogos(bd)
        sembrar_politicas(bd)
        sembrar_automatizaciones(bd)
        sembrar_riesgos(bd)
        sembrar_tableros(bd)
    finally:
        bd.close()
