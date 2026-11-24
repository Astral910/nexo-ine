"""Administración de cuentas y roles (aprobación de accesos, roles, bloqueo y desbloqueo)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..avisos import enviar_correo, notificar
from ..config import obtener_config
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import Permiso, Rol, RolPermiso, Usuario, UsuarioRol
from ..security.sesiones import revocar_todas

router = APIRouter(prefix="/api/admin", tags=["administración"])


def _json(u: Usuario) -> dict:
    return {"id": u.id, "nombre": u.nombre, "email": u.email, "unidad": u.unidad, "estado": u.estado,
            "roles": [{"codigo": ur.rol.codigo, "nombre": ur.rol.nombre} for ur in u.roles],
            "rol_solicitado": u.rol_solicitado, "motivo": u.motivo_solicitud, "mfa_activo": u.mfa_activo,
            "bloqueado": bool(u.bloqueado_hasta and u.bloqueado_hasta > ahora()),
            "ultimo_acceso": u.ultimo_acceso.isoformat() if u.ultimo_acceso else None,
            "creado_en": u.creado_en.isoformat(), "es_demo": u.es_demo}


def _usuario(bd: Session, uid: int) -> Usuario:
    u = bd.get(Usuario, uid)
    if u is None:
        raise HTTPException(404, "Usuario no encontrado.")
    return u


@router.get("/usuarios")
def listar(estado: str | None = None, ctx: Contexto = Depends(requiere("usuarios:administrar")),
           bd: Session = Depends(obtener_bd)):
    q = select(Usuario).where(Usuario.estado != "desactivado" if estado is None else Usuario.estado == estado)
    usuarios = bd.execute(q.order_by(Usuario.estado != "pendiente_aprobacion", Usuario.creado_en.desc())).scalars()
    conteo = dict(bd.execute(select(Usuario.estado, func.count()).group_by(Usuario.estado)).all())
    return {"conteo": conteo, "usuarios": [_json(u) for u in usuarios]}


class Roles(BaseModel):
    roles: list[str] = Field(min_length=1, max_length=6)


def _asignar(bd: Session, u: Usuario, codigos: list[str], por: Usuario) -> list[str]:
    roles = bd.execute(select(Rol).where(Rol.codigo.in_(codigos))).scalars().all()
    if len(roles) != len(set(codigos)):
        raise HTTPException(422, "Algún rol no existe.")
    u.roles.clear()
    bd.flush()
    for r in roles:
        u.roles.append(UsuarioRol(usuario_id=u.id, rol_id=r.id, asignado_por=por.id))
    return [r.codigo for r in roles]


@router.post("/usuarios/{uid}/aprobar")
def aprobar(uid: int, datos: Roles, ctx: Contexto = Depends(requiere("usuarios:administrar")),
            bd: Session = Depends(obtener_bd)):
    u = _usuario(bd, uid)
    if u.estado not in ("pendiente_aprobacion", "rechazado"):
        raise HTTPException(409, "La cuenta no está pendiente de aprobación.")
    asignados = _asignar(bd, u, datos.roles, ctx.usuario)
    u.estado, u.aprobado_por, u.aprobado_en = "activo", ctx.usuario.id, ahora()
    bd.commit()
    mfa = obtener_config().roles_mfa.intersection(asignados)
    enviar_correo(bd, u.email, "Tu acceso a Nexo fue aprobado",
                  f"Ya puedes iniciar sesión. Roles: {', '.join(asignados)}."
                  + (" Al entrar, configura tu segundo factor (MFA)." if mfa else ""),
                  f"{obtener_config().url_publica}/login")
    notificar(bd, u.id, "Bienvenida a Nexo", "Tu cuenta fue aprobada.", "exito", "/")
    bitacora.registrar("usuarios.aprobado", usuario=ctx.usuario, modulo="usuarios", objeto=f"usuario:{u.id}",
                       detalle={"roles": asignados}, ip=ctx.ip)
    return _json(u)


class Motivo(BaseModel):
    motivo: str = Field(min_length=3, max_length=500)


@router.post("/usuarios/{uid}/rechazar")
def rechazar(uid: int, datos: Motivo, ctx: Contexto = Depends(requiere("usuarios:administrar")),
             bd: Session = Depends(obtener_bd)):
    u = _usuario(bd, uid)
    u.estado = "rechazado"
    bd.commit()
    enviar_correo(bd, u.email, "Tu solicitud de acceso a Nexo", f"No fue aprobada. Motivo: {datos.motivo}")
    bitacora.registrar("usuarios.rechazado", usuario=ctx.usuario, modulo="usuarios", objeto=f"usuario:{u.id}", ip=ctx.ip)
    return _json(u)


@router.put("/usuarios/{uid}/roles")
def cambiar_roles(uid: int, datos: Roles, ctx: Contexto = Depends(requiere("usuarios:administrar")),
                  bd: Session = Depends(obtener_bd)):
    u = _usuario(bd, uid)
    if u.id == ctx.usuario.id and "admin_ti" not in datos.roles:
        raise HTTPException(409, "No puedes quitarte tu propio rol de administración.")
    antes = [ur.rol.codigo for ur in u.roles]
    despues = _asignar(bd, u, datos.roles, ctx.usuario)
    bd.commit()
    bitacora.registrar("usuarios.roles", usuario=ctx.usuario, modulo="usuarios", objeto=f"usuario:{u.id}",
                       detalle={"antes": antes, "despues": despues}, ip=ctx.ip)
    return _json(u)


@router.post("/usuarios/{uid}/desactivar")
def desactivar(uid: int, ctx: Contexto = Depends(requiere("usuarios:administrar")), bd: Session = Depends(obtener_bd)):
    u = _usuario(bd, uid)
    if u.id == ctx.usuario.id:
        raise HTTPException(409, "No puedes desactivar tu propia cuenta.")
    u.estado = "desactivado"
    bd.commit()
    cerradas = revocar_todas(bd, u.id)
    bitacora.registrar("usuarios.desactivado", usuario=ctx.usuario, modulo="usuarios", objeto=f"usuario:{u.id}",
                       detalle={"sesiones_cerradas": cerradas}, ip=ctx.ip)
    return _json(u)


@router.post("/usuarios/{uid}/reactivar")
def reactivar(uid: int, ctx: Contexto = Depends(requiere("usuarios:administrar")), bd: Session = Depends(obtener_bd)):
    u = _usuario(bd, uid)
    if u.estado != "desactivado" or not u.roles:
        raise HTTPException(409, "Solo se reactivan cuentas desactivadas que tengan roles.")
    u.estado = "activo"
    bd.commit()
    bitacora.registrar("usuarios.reactivado", usuario=ctx.usuario, modulo="usuarios", objeto=f"usuario:{u.id}", ip=ctx.ip)
    return _json(u)


@router.post("/usuarios/{uid}/desbloquear")
def desbloquear(uid: int, ctx: Contexto = Depends(requiere("usuarios:administrar")), bd: Session = Depends(obtener_bd)):
    u = _usuario(bd, uid)
    u.bloqueado_hasta, u.intentos_fallidos = None, 0
    bd.commit()
    bitacora.registrar("usuarios.desbloqueado", usuario=ctx.usuario, modulo="usuarios", objeto=f"usuario:{u.id}", ip=ctx.ip)
    return _json(u)


@router.post("/usuarios/{uid}/restablecer-mfa")
def restablecer_mfa(uid: int, ctx: Contexto = Depends(requiere("usuarios:administrar")),
                    bd: Session = Depends(obtener_bd)):
    u = _usuario(bd, uid)
    u.mfa_activo, u.mfa_secreto_cifrado, u.codigos_recuperacion, u.mfa_ultimo_paso = False, None, None, None
    bd.commit()
    revocar_todas(bd, u.id)
    enviar_correo(bd, u.email, "Tu segundo factor fue restablecido",
                  "Informática restableció tu segundo factor. Al iniciar sesión deberás configurarlo de nuevo. "
                  "Si no lo solicitaste, avisa de inmediato.")
    bitacora.registrar("usuarios.mfa_restablecido", usuario=ctx.usuario, modulo="seguridad", objeto=f"usuario:{u.id}",
                       ip=ctx.ip)
    return _json(u)


@router.get("/roles")
def roles(ctx: Contexto = Depends(requiere("usuarios:administrar", "seguridad:ver")), bd: Session = Depends(obtener_bd)):
    usuarios_por_rol = dict(bd.execute(select(UsuarioRol.rol_id, func.count()).group_by(UsuarioRol.rol_id)).all())
    permisos = {p.codigo: {"descripcion": p.descripcion, "modulo": p.modulo} for p in bd.execute(select(Permiso)).scalars()}
    salida = []
    for r in bd.execute(select(Rol).order_by(Rol.id)).scalars():
        codigos = sorted(rp.permiso for rp in bd.execute(select(RolPermiso).where(RolPermiso.rol_id == r.id)).scalars())
        salida.append({"codigo": r.codigo, "nombre": r.nombre, "area": r.area, "descripcion": r.descripcion,
                       "privilegiado": r.privilegiado, "autoregistro": r.autoregistro,
                       "usuarios": usuarios_por_rol.get(r.id, 0), "permisos": codigos})
    return {"roles": salida, "permisos": permisos}
