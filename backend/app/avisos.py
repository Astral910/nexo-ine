"""Correos salientes y notificaciones internas."""

from __future__ import annotations

import logging
import secrets
import smtplib
import ssl
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import obtener_config
from .models import CorreoSaliente, Notificacion, RolPermiso, Usuario, UsuarioRol

log = logging.getLogger("nexo.avisos")


def enviar_correo(bd: Session, para: str, asunto: str, cuerpo: str, enlace: str | None = None,
                  visible_en_demo: bool = False) -> str | None:
    """Envía por SMTP si está configurado.

    Solo los correos marcados como visibles (verificación de una cuenta recién registrada) se copian al buzón
    de demostración, y únicamente se pueden leer con la clave que recibe quien hizo el registro. Los enlaces
    de restablecimiento de contraseña nunca se exponen. Devuelve esa clave de lectura o None.
    """
    cfg = obtener_config()
    if cfg.smtp_host:
        try:
            msg = EmailMessage()
            msg["From"] = cfg.smtp_remitente
            msg["To"] = para
            msg["Subject"] = asunto
            msg.set_content(cuerpo + (f"\n\n{enlace}" if enlace else ""))
            with smtplib.SMTP(cfg.smtp_host, cfg.smtp_puerto, timeout=10) as s:
                s.starttls(context=ssl.create_default_context())  # verifica el certificado del servidor
                if cfg.smtp_usuario:
                    s.login(cfg.smtp_usuario, cfg.smtp_clave)
                s.send_message(msg)
        except Exception:
            log.exception("No se pudo enviar el correo '%s'", asunto)
    if cfg.mostrar_buzon_demo and visible_en_demo:
        from .security.passwords import hash_token

        clave = secrets.token_urlsafe(24)
        bd.add(CorreoSaliente(para=para, asunto=asunto, cuerpo=cuerpo, enlace=enlace, clave_lectura=hash_token(clave)))
        bd.commit()
        return clave
    return None


def notificar(bd: Session, usuario_id: int, titulo: str, cuerpo: str = "", nivel: str = "info",
              enlace: str | None = None) -> None:
    bd.add(Notificacion(usuario_id=usuario_id, titulo=titulo, cuerpo=cuerpo, nivel=nivel, enlace=enlace))
    bd.commit()


def usuarios_con_permiso(bd: Session, permiso: str) -> list[Usuario]:
    # Subconsulta de ids: DISTINCT sobre la entidad completa falla en PostgreSQL por las columnas JSON.
    ids = (select(UsuarioRol.usuario_id).join(RolPermiso, RolPermiso.rol_id == UsuarioRol.rol_id)
           .where(RolPermiso.permiso == permiso))
    consulta = select(Usuario).where(Usuario.id.in_(ids), Usuario.estado == "activo")
    return list(bd.execute(consulta).scalars())


def notificar_permiso(bd: Session, permiso: str, titulo: str, cuerpo: str = "", nivel: str = "info",
                      enlace: str | None = None) -> int:
    usuarios = usuarios_con_permiso(bd, permiso)
    for u in usuarios:
        bd.add(Notificacion(usuario_id=u.id, titulo=titulo, cuerpo=cuerpo, nivel=nivel, enlace=enlace))
    bd.commit()
    return len(usuarios)
