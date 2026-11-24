"""Aplicación de las políticas de retención (minimización de datos personales y técnicos)."""

from __future__ import annotations

import secrets
from datetime import timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import ahora
from ..models import (
    CorreoSaliente,
    Ejecucion,
    IntentoLogin,
    Notificacion,
    PoliticaRetencion,
    Sesion,
    TokenUnUso,
    Usuario,
    Validacion,
)
from ..security.passwords import hash_password


def _aplicar(bd: Session, p: PoliticaRetencion) -> str:
    limite = ahora() - timedelta(days=p.dias)
    if p.accion == "conservar":
        return "Se conserva (no se elimina automáticamente)."
    if p.clase == "sesiones":
        n = bd.execute(delete(Sesion).where(or_(Sesion.revocada_en < limite, Sesion.expira_en < limite))).rowcount
    elif p.clase == "intentos_login":
        n = bd.execute(delete(IntentoLogin).where(IntentoLogin.creado_en < limite)).rowcount
    elif p.clase == "tokens":
        n = bd.execute(delete(TokenUnUso).where(TokenUnUso.creado_en < limite)).rowcount
    elif p.clase == "correos":
        n = bd.execute(delete(CorreoSaliente).where(CorreoSaliente.creado_en < limite)).rowcount
    elif p.clase == "notificaciones":
        n = bd.execute(delete(Notificacion).where(Notificacion.leida_en.is_not(None),
                                                  Notificacion.creada_en < limite)).rowcount
    elif p.clase == "validaciones":
        n = bd.execute(delete(Validacion).where(Validacion.creada_en < limite)).rowcount
    elif p.clase == "ejecuciones":
        n = bd.execute(delete(Ejecucion).where(Ejecucion.inicio < limite)).rowcount
    elif p.clase == "cuentas_rechazadas":
        n = 0
        for u in bd.execute(select(Usuario).where(Usuario.estado.in_(["rechazado", "pendiente_verificacion"]),
                                                  Usuario.creado_en < limite)).scalars():
            u.email = f"anonimizado-{u.id}@invalido.local"
            u.nombre, u.unidad, u.motivo_solicitud = "Cuenta anonimizada", "", ""
            u.password_hash = hash_password(secrets.token_urlsafe(24))
            u.estado = "desactivado"
            n += 1
    else:
        return "Clase sin regla de aplicación."
    bd.commit()
    return f"{n} registro(s) {'anonimizados' if p.accion == 'anonimizar' else 'eliminados'}."


def aplicar_todas(bd: Session) -> dict:
    resultados = {}
    for p in bd.execute(select(PoliticaRetencion).where(PoliticaRetencion.activa.is_(True))).scalars().all():
        texto = _aplicar(bd, p)
        p.ultima_ejecucion, p.ultimo_resultado = ahora(), texto
        bd.commit()
        resultados[p.clase] = texto
    bitacora.registrar("privacidad.retencion_aplicada", modulo="privacidad", detalle=resultados)
    return resultados
