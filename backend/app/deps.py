"""Dependencias de FastAPI: usuario actual, permisos (RBAC) y verificación CSRF."""

from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import bitacora
from .config import obtener_config
from .db import obtener_bd
from .models import RolPermiso, Sesion, Usuario
from .security.passwords import iguales
from .security.sesiones import NOMBRE_COOKIE_CSRF, ip_cliente, obtener_sesion

METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


@dataclass
class Contexto:
    usuario: Usuario
    sesion: Sesion
    roles: list[str] = field(default_factory=list)
    permisos: set[str] = field(default_factory=set)
    ip: str = ""

    def puede(self, permiso: str) -> bool:
        return permiso in self.permisos


def permisos_de(bd: Session, usuario: Usuario) -> tuple[list[str], set[str]]:
    rol_ids = [ur.rol_id for ur in usuario.roles]
    roles = [ur.rol.codigo for ur in usuario.roles]
    if not rol_ids:
        return roles, set()
    perms = bd.execute(select(RolPermiso.permiso).where(RolPermiso.rol_id.in_(rol_ids))).scalars().all()
    return roles, set(perms)


def requiere_mfa(roles: list[str]) -> bool:
    return bool(obtener_config().roles_mfa.intersection(roles))


def _verificar_csrf(request: Request, sesion: Sesion) -> None:
    if request.method in METODOS_SEGUROS:
        return
    cabecera = request.headers.get("x-csrf-token", "")
    cookie = request.cookies.get(NOMBRE_COOKIE_CSRF, "")
    if not cabecera or not iguales(cabecera, sesion.csrf) or not iguales(cookie, sesion.csrf):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token CSRF inválido o ausente.")


def contexto_parcial(request: Request, bd: Session = Depends(obtener_bd)) -> Contexto:
    """Sesión válida aunque falte completar el segundo factor (para las rutas de MFA)."""
    ses = obtener_sesion(bd, request)
    if ses is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Su sesión no es válida o expiró.")
    usuario = bd.get(Usuario, ses.usuario_id)
    if usuario is None or usuario.estado != "activo":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Cuenta no habilitada.")
    _verificar_csrf(request, ses)
    roles, perms = permisos_de(bd, usuario)
    return Contexto(usuario=usuario, sesion=ses, roles=roles, permisos=perms, ip=ip_cliente(request))


def contexto(ctx: Contexto = Depends(contexto_parcial)) -> Contexto:
    """Sesión completa: si el rol exige MFA, debe estar configurado y verificado."""
    if ctx.usuario.mfa_activo and not ctx.sesion.mfa_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta verificar el segundo factor.")
    if requiere_mfa(ctx.roles) and not ctx.usuario.mfa_activo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "mfa_requerido")
    return ctx


def requiere(*permisos: str):
    """Exige al menos uno de los permisos indicados."""

    def _dep(request: Request, ctx: Contexto = Depends(contexto)) -> Contexto:
        if not any(p in ctx.permisos for p in permisos):
            bitacora.registrar("acceso.denegado", usuario=ctx.usuario, modulo="seguridad",
                               objeto=request.url.path, detalle={"requiere": list(permisos)},
                               resultado="denegado", ip=ctx.ip)
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tiene permiso para esta acción.")
        return ctx

    return _dep
