"""Correos salientes y notificaciones internas."""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import obtener_config
from .models import CorreoSaliente, Notificacion, RolPermiso, Usuario, UsuarioRol

log = logging.getLogger("nexo.avisos")


def enviar_correo(bd: Session, para: str, asunto: str, cuerpo: str, enlace: str | None = None) -> None:
    """Envía por SMTP si está configurado. En demostración guarda una copia visible en pantalla."""
    cfg = obtener_config()
    host = os.getenv("NEXO_SMTP_HOST")
    if host:
        try:
            msg = EmailMessage()
            msg["From"] = os.getenv("NEXO_SMTP_REMITENTE", "no-responder@localhost")
            msg["To"] = para
            msg["Subject"] = asunto
            msg.set_content(cuerpo + (f"\n\n{enlace}" if enlace else ""))
            with smtplib.SMTP(host, int(os.getenv("NEXO_SMTP_PUERTO", "587")), timeout=10) as s:
                s.starttls()
                usuario = os.getenv("NEXO_SMTP_USUARIO")
                if usuario:
                    s.login(usuario, os.getenv("NEXO_SMTP_CLAVE", ""))
                s.send_message(msg)
        except Exception:
            log.exception("No se pudo enviar el correo '%s'", asunto)
    if cfg.mostrar_buzon_demo:
        bd.add(CorreoSaliente(para=para, asunto=asunto, cuerpo=cuerpo, enlace=enlace))
        bd.commit()


def notificar(bd: Session, usuario_id: int, titulo: str, cuerpo: str = "", nivel: str = "info",
              enlace: str | None = None) -> None:
    bd.add(Notificacion(usuario_id=usuario_id, titulo=titulo, cuerpo=cuerpo, nivel=nivel, enlace=enlace))
    bd.commit()


def usuarios_con_permiso(bd: Session, permiso: str) -> list[Usuario]:
    consulta = (
        select(Usuario)
        .join(UsuarioRol, UsuarioRol.usuario_id == Usuario.id)
        .join(RolPermiso, RolPermiso.rol_id == UsuarioRol.rol_id)
        .where(RolPermiso.permiso == permiso, Usuario.estado == "activo")
        .distinct()
    )
    return list(bd.execute(consulta).scalars())


def notificar_permiso(bd: Session, permiso: str, titulo: str, cuerpo: str = "", nivel: str = "info",
                      enlace: str | None = None) -> int:
    usuarios = usuarios_con_permiso(bd, permiso)
    for u in usuarios:
        bd.add(Notificacion(usuario_id=u.id, titulo=titulo, cuerpo=cuerpo, nivel=nivel, enlace=enlace))
    bd.commit()
    return len(usuarios)
