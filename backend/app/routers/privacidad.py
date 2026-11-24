"""Privacidad: aviso, registro de tratamientos, retención, «Mis datos» y solicitudes de los titulares."""

from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..avisos import notificar, notificar_permiso
from ..db import ahora, obtener_bd
from ..deps import Contexto, contexto, requiere
from ..models import (
    Automatizacion,
    Bitacora,
    Notificacion,
    PoliticaRetencion,
    Sesion,
    SolicitudPrivacidad,
    Tablero,
    Usuario,
    Validacion,
)
from ..security.passwords import hash_password
from ..security.sesiones import revocar_todas
from ..services import retencion
from .auth import VERSION_CONSENTIMIENTO

router = APIRouter(prefix="/api/privacidad", tags=["privacidad"])

AVISO = {
    "version": VERSION_CONSENTIMIENTO,
    "responsable": "Instituto Nacional de Estadística (en una adopción institucional). En este prototipo: el equipo del Datatón.",
    "finalidad": "Gestionar su acceso a la plataforma, registrar las acciones para auditoría y enviarle avisos del sistema.",
    "datos": ["Nombre", "correo institucional", "unidad", "roles", "registros de acceso (fecha, IP y navegador)",
              "acciones realizadas (bitácora)"],
    "no_recopilamos": ["Datos sensibles", "ubicación", "cookies de seguimiento o publicidad", "datos de terceros"],
    "cookies": "Solo dos cookies estrictamente necesarias: la de sesión (HttpOnly) y la de protección CSRF.",
    "conservacion": "Según las políticas de retención publicadas en esta misma página.",
    "derechos": "Puede ver y exportar sus datos, pedir su rectificación o la eliminación de su cuenta desde «Mis datos».",
    "marco": ["Ley de Acceso a la Información Pública (Decreto 57-2008): protección de datos personales",
              "Ley Orgánica del INE: confidencialidad de la información estadística",
              "Principios Fundamentales de las Estadísticas Oficiales de la ONU (principio 6)"],
}

TRATAMIENTOS = [
    {"actividad": "Gestión de cuentas y acceso", "datos": "nombre, correo, unidad, roles, hash de contraseña",
     "finalidad": "Autenticación y autorización", "base": "Función pública / consentimiento al registrarse",
     "conservacion": "Mientras la cuenta esté activa; solicitudes rechazadas se anonimizan a los 30 días"},
    {"actividad": "Seguridad y auditoría", "datos": "IP, navegador, acciones, intentos de acceso",
     "finalidad": "Detección de abusos y rendición de cuentas", "base": "Interés público y control interno",
     "conservacion": "Intentos: 90 días · Bitácora: 5 años"},
    {"actividad": "Avisos del sistema", "datos": "correo y notificaciones internas", "finalidad": "Comunicación operativa",
     "base": "Función pública", "conservacion": "Notificaciones leídas: 90 días · Correos: 30 días"},
    {"actividad": "Validación de archivos", "datos": "Informe de calidad con ejemplos enmascarados (el archivo no se guarda)",
     "finalidad": "Crítica de datos", "base": "Función estadística", "conservacion": "180 días"},
]


@router.get("/aviso")
def aviso():
    return {"aviso": AVISO, "tratamientos": TRATAMIENTOS}


@router.get("/politicas")
def politicas(ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    return [{"id": p.id, "clase": p.clase, "nombre": p.nombre, "descripcion": p.descripcion, "dias": p.dias,
             "accion": p.accion, "fundamento": p.fundamento, "activa": p.activa,
             "ultima_ejecucion": p.ultima_ejecucion.isoformat() if p.ultima_ejecucion else None,
             "ultimo_resultado": p.ultimo_resultado}
            for p in bd.execute(select(PoliticaRetencion).order_by(PoliticaRetencion.id)).scalars()]


class CambioPolitica(BaseModel):
    dias: int = Field(ge=1, le=3650)
    activa: bool
    justificacion: str = Field(min_length=5, max_length=500)


@router.put("/politicas/{pid}")
def cambiar_politica(pid: int, datos: CambioPolitica, ctx: Contexto = Depends(requiere("privacidad:administrar")),
                     bd: Session = Depends(obtener_bd)):
    p = bd.get(PoliticaRetencion, pid)
    if p is None:
        raise HTTPException(404, "Política no encontrada.")
    antes = {"dias": p.dias, "activa": p.activa}
    p.dias, p.activa = datos.dias, datos.activa
    bd.commit()
    bitacora.registrar("privacidad.politica_cambiada", usuario=ctx.usuario, modulo="privacidad", objeto=p.clase,
                       detalle={"antes": antes, "despues": {"dias": p.dias, "activa": p.activa},
                                "justificacion": datos.justificacion}, ip=ctx.ip)
    return {"ok": True}


@router.post("/aplicar")
def aplicar(ctx: Contexto = Depends(requiere("privacidad:administrar")), bd: Session = Depends(obtener_bd)):
    return retencion.aplicar_todas(bd)


def _mis_datos(bd: Session, u: Usuario) -> dict:
    eventos = bd.execute(select(Bitacora).where(Bitacora.usuario_id == u.id).order_by(Bitacora.id.desc()).limit(200)).scalars()
    return {
        "perfil": {"nombre": u.nombre, "email": u.email, "unidad": u.unidad, "estado": u.estado,
                   "roles": [ur.rol.nombre for ur in u.roles], "mfa_activo": u.mfa_activo,
                   "creado_en": u.creado_en.isoformat(),
                   "ultimo_acceso": u.ultimo_acceso.isoformat() if u.ultimo_acceso else None,
                   "consentimiento": {"version": u.consentimiento_version,
                                      "fecha": u.consentimiento_en.isoformat() if u.consentimiento_en else None}},
        "sesiones_activas": bd.execute(select(func.count()).select_from(Sesion).where(
            Sesion.usuario_id == u.id, Sesion.revocada_en.is_(None), Sesion.expira_en > ahora())).scalar(),
        "notificaciones": bd.execute(select(func.count()).select_from(Notificacion).where(
            Notificacion.usuario_id == u.id)).scalar(),
        "tableros_propios": bd.execute(select(func.count()).select_from(Tablero).where(Tablero.propietario_id == u.id)).scalar(),
        "automatizaciones": bd.execute(select(func.count()).select_from(Automatizacion).where(
            Automatizacion.propietario_id == u.id)).scalar(),
        "validaciones": bd.execute(select(func.count()).select_from(Validacion).where(Validacion.usuario_id == u.id)).scalar(),
        "actividad": [{"ts": e.ts.isoformat(), "accion": e.accion, "modulo": e.modulo, "resultado": e.resultado}
                      for e in eventos],
        "solicitudes": [{"id": s.id, "tipo": s.tipo, "estado": s.estado, "creada_en": s.creada_en.isoformat(),
                         "respuesta": s.respuesta} for s in bd.execute(
            select(SolicitudPrivacidad).where(SolicitudPrivacidad.usuario_id == u.id)).scalars()],
    }


@router.get("/mis-datos")
def mis_datos(ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    return _mis_datos(bd, bd.get(Usuario, ctx.usuario.id))


@router.get("/mis-datos/exportar")
def exportar(ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    datos = _mis_datos(bd, bd.get(Usuario, ctx.usuario.id))
    bitacora.registrar("privacidad.exportacion", usuario=ctx.usuario, modulo="privacidad", ip=ctx.ip)
    return Response(json.dumps(datos, ensure_ascii=False, indent=2), media_type="application/json",
                    headers={"Content-Disposition": 'attachment; filename="mis-datos-nexo.json"'})


class NuevaSolicitud(BaseModel):
    tipo: str = Field(pattern="^(eliminar|rectificar)$")
    detalle: str = Field(default="", max_length=1000)


@router.post("/solicitudes", status_code=201)
def solicitar(datos: NuevaSolicitud, ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    s = SolicitudPrivacidad(usuario_id=ctx.usuario.id, tipo=datos.tipo, detalle=datos.detalle)
    bd.add(s)
    bd.commit()
    notificar_permiso(bd, "privacidad:administrar", "Nueva solicitud de privacidad",
                      f"{ctx.usuario.nombre} pide {datos.tipo} sus datos.", "alerta", "/privacidad")
    bitacora.registrar("privacidad.solicitud", usuario=ctx.usuario, modulo="privacidad", detalle={"tipo": datos.tipo},
                       ip=ctx.ip)
    return {"id": s.id}


@router.get("/solicitudes")
def solicitudes(ctx: Contexto = Depends(requiere("privacidad:administrar")), bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(SolicitudPrivacidad).order_by(SolicitudPrivacidad.creada_en.desc())).scalars()
    salida = []
    for s in filas:
        u = bd.get(Usuario, s.usuario_id) if s.usuario_id else None
        salida.append({"id": s.id, "usuario": u.nombre if u else "—", "tipo": s.tipo, "detalle": s.detalle,
                       "estado": s.estado, "creada_en": s.creada_en.isoformat(), "respuesta": s.respuesta})
    return salida


class Resolucion(BaseModel):
    aprobar: bool
    respuesta: str = Field(min_length=3, max_length=1000)


@router.post("/solicitudes/{sid}/resolver")
def resolver(sid: int, datos: Resolucion, ctx: Contexto = Depends(requiere("privacidad:administrar")),
             bd: Session = Depends(obtener_bd)):
    s = bd.get(SolicitudPrivacidad, sid)
    if s is None or s.estado != "pendiente":
        raise HTTPException(404, "Solicitud no encontrada o ya resuelta.")
    s.estado = "atendida" if datos.aprobar else "rechazada"
    s.respuesta, s.atendida_en, s.atendida_por = datos.respuesta, ahora(), ctx.usuario.id
    u = bd.get(Usuario, s.usuario_id) if s.usuario_id else None
    if datos.aprobar and s.tipo == "eliminar" and u is not None:
        # La bitácora conserva el identificador numérico (rendición de cuentas), pero se borran los datos personales.
        revocar_todas(bd, u.id)
        u.email = f"eliminado-{u.id}@invalido.local"
        u.nombre, u.unidad, u.motivo_solicitud = "Cuenta eliminada", "", ""
        u.password_hash = hash_password(secrets.token_urlsafe(24))
        u.estado, u.mfa_activo, u.mfa_secreto_cifrado, u.preferencias = "desactivado", False, None, None
    bd.commit()
    if u is not None and s.tipo != "eliminar":
        notificar(bd, u.id, "Su solicitud de privacidad fue atendida", datos.respuesta, "info", "/privacidad")
    bitacora.registrar("privacidad.solicitud_resuelta", usuario=ctx.usuario, modulo="privacidad",
                       objeto=f"solicitud:{s.id}", detalle={"tipo": s.tipo, "aprobada": datos.aprobar}, ip=ctx.ip)
    return {"ok": True}
