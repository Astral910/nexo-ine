"""Sesiones del lado del servidor con cookie HttpOnly y token CSRF de doble envío.

- El navegador solo guarda un token aleatorio; en la base de datos se guarda su hash.
- Expiran por inactividad y por duración máxima, y se pueden revocar una por una.
- El identificador cambia al iniciar sesión y al completar el segundo factor (evita fijación).
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from fastapi import Request, Response
from sqlalchemy import update
from sqlalchemy.orm import Session

from ..config import obtener_config
from ..db import ahora
from ..models import Sesion
from .passwords import hash_token

NOMBRE_COOKIE = "nexo_sesion"
NOMBRE_COOKIE_CSRF = "nexo_csrf"


def _nombre_cookie() -> str:
    # El prefijo __Host- obliga a Secure, Path=/ y sin dominio: solo en HTTPS.
    return f"__Host-{NOMBRE_COOKIE}" if obtener_config().usar_cookie_segura else NOMBRE_COOKIE


def ip_cliente(request: Request) -> str:
    return request.client.host if request.client else ""


def crear_sesion(bd: Session, usuario_id: int, request: Request, mfa_ok: bool) -> tuple[str, Sesion]:
    cfg = obtener_config()
    token = secrets.token_urlsafe(32)
    ses = Sesion(
        id=hash_token(token),
        usuario_id=usuario_id,
        csrf=secrets.token_urlsafe(32),
        mfa_ok=mfa_ok,
        expira_en=ahora() + timedelta(hours=cfg.sesion_maxima_horas),
        ip=ip_cliente(request),
        agente=(request.headers.get("user-agent") or "")[:200],
    )
    bd.add(ses)
    bd.commit()
    return token, ses


def escribir_cookies(respuesta: Response, token: str, ses: Sesion) -> None:
    cfg = obtener_config()
    segura = cfg.usar_cookie_segura
    max_age = cfg.sesion_maxima_horas * 3600
    respuesta.set_cookie(_nombre_cookie(), token, max_age=max_age, httponly=True, secure=segura,
                         samesite="strict", path="/")
    # El token CSRF sí lo lee el frontend para reenviarlo en la cabecera X-CSRF-Token.
    respuesta.set_cookie(NOMBRE_COOKIE_CSRF, ses.csrf, max_age=max_age, httponly=False, secure=segura,
                         samesite="strict", path="/")


def borrar_cookies(respuesta: Response) -> None:
    respuesta.delete_cookie(_nombre_cookie(), path="/")
    respuesta.delete_cookie(NOMBRE_COOKIE_CSRF, path="/")


def obtener_sesion(bd: Session, request: Request) -> Sesion | None:
    token = request.cookies.get(_nombre_cookie())
    if not token or len(token) > 100:
        return None
    ses = bd.get(Sesion, hash_token(token))
    if ses is None or ses.revocada_en is not None:
        return None
    cfg = obtener_config()
    momento = ahora()
    if momento >= ses.expira_en or momento - ses.ultima_actividad > timedelta(minutes=cfg.sesion_inactividad_min):
        ses.revocada_en = momento
        bd.commit()
        return None
    if (momento - ses.ultima_actividad).total_seconds() > 30:
        ses.ultima_actividad = momento
        bd.commit()
    return ses


def revocar(bd: Session, ses: Sesion) -> None:
    ses.revocada_en = ahora()
    bd.commit()


def revocar_todas(bd: Session, usuario_id: int, excepto: str | None = None) -> int:
    consulta = update(Sesion).where(Sesion.usuario_id == usuario_id, Sesion.revocada_en.is_(None))
    if excepto:
        consulta = consulta.where(Sesion.id != excepto)
    r = bd.execute(consulta.values(revocada_en=ahora()))
    bd.commit()
    return r.rowcount or 0
