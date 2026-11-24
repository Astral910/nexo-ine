"""Registro, verificación de correo, inicio de sesión con MFA, contraseñas y sesiones."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

import pyotp
import segno
from cryptography.exceptions import InvalidTag
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..avisos import enviar_correo, notificar_permiso
from ..config import obtener_config
from ..db import ahora, obtener_bd
from ..deps import Contexto, contexto, contexto_parcial, permisos_de, requiere_mfa
from ..models import CorreoSaliente, IntentoLogin, Rol, Sesion, TokenUnUso, Usuario
from ..security.cifrado import cifrar, descifrar
from ..security.limites import limitador
from ..security.passwords import (
    LONGITUD_MINIMA,
    evaluar_password,
    hash_password,
    hash_token,
    hmac_token,
    necesita_rehash,
    verificar_password,
)
from ..security.sesiones import borrar_cookies, crear_sesion, escribir_cookies, ip_cliente, revocar, revocar_todas

router = APIRouter(prefix="/api/auth", tags=["autenticación"])
VERSION_CONSENTIMIENTO = "2026-11-v1"
MENSAJE_GENERICO = "Correo o contraseña incorrectos."
MENSAJE_DEMASIADOS = "Demasiados intentos fallidos. Espere unos minutos antes de volver a intentar."
UMBRAL_GLOBAL = 20  # fallos de una cuenta desde cualquier IP antes de bloquearla para todos


def _limitar(request: Request, accion: str, maximo: int, ventana_s: int) -> None:
    if not limitador.permitir(f"{accion}:{ip_cliente(request)}", maximo, ventana_s):
        bitacora.registrar("seguridad.limite_excedido", modulo="seguridad", objeto=accion,
                           resultado="denegado", ip=ip_cliente(request))
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Espere unos minutos.")


def _crear_token(bd: Session, usuario: Usuario, tipo: str, minutos: int) -> str:
    token = secrets.token_urlsafe(32)
    bd.add(TokenUnUso(usuario_id=usuario.id, tipo=tipo, token_hash=hash_token(token),
                      expira_en=ahora() + timedelta(minutes=minutos)))
    bd.commit()
    return token


def _consumir_token(bd: Session, token: str, tipo: str) -> Usuario:
    reg = bd.execute(select(TokenUnUso).where(TokenUnUso.token_hash == hash_token(token or ""),
                                              TokenUnUso.tipo == tipo)).scalar()
    if reg is None or reg.usado_en is not None or reg.expira_en < ahora():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El enlace no es válido o ya venció.")
    reg.usado_en = ahora()
    usuario = bd.get(Usuario, reg.usuario_id)
    bd.commit()
    if usuario is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El enlace no es válido.")
    return usuario


def info_usuario(bd: Session, usuario: Usuario, ses: Sesion | None) -> dict:
    roles, perms = permisos_de(bd, usuario)
    return {
        "id": usuario.id,
        "nombre": usuario.nombre,
        "email": usuario.email,
        "unidad": usuario.unidad,
        "roles": [{"codigo": ur.rol.codigo, "nombre": ur.rol.nombre, "area": ur.rol.area} for ur in usuario.roles],
        "permisos": sorted(perms),
        "mfa_activo": usuario.mfa_activo,
        "mfa_por_verificar": bool(usuario.mfa_activo and ses is not None and not ses.mfa_ok),
        "mfa_por_configurar": bool(requiere_mfa(roles) and not usuario.mfa_activo),
        "ultimo_acceso": usuario.ultimo_acceso.isoformat() if usuario.ultimo_acceso else None,
        "preferencias": usuario.preferencias or {},
        "es_demo": usuario.es_demo,
    }


# ---------------------------------------------------------------------------
# Configuración pública para las pantallas de acceso
# ---------------------------------------------------------------------------


@router.get("/config")
def config_publica(bd: Session = Depends(obtener_bd)):
    cfg = obtener_config()
    roles = bd.execute(select(Rol).where(Rol.autoregistro.is_(True)).order_by(Rol.id)).scalars()
    return {
        "roles": [{"codigo": r.codigo, "nombre": r.nombre, "descripcion": r.descripcion, "area": r.area}
                  for r in roles],
        "dominios_permitidos": cfg.dominios_permitidos,
        "password_minimo": LONGITUD_MINIMA,
        "version_consentimiento": VERSION_CONSENTIMIENTO,
        "buzon_demo": cfg.mostrar_buzon_demo,
        "entorno": cfg.entorno,
    }


# ---------------------------------------------------------------------------
# Registro y verificación
# ---------------------------------------------------------------------------


class Registro(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    email: EmailStr
    unidad: str = Field(default="", max_length=120)
    rol_solicitado: str = Field(max_length=40)
    motivo: str = Field(default="", max_length=500)
    password: str = Field(max_length=256)
    acepta_privacidad: bool


@router.post("/registro", status_code=202)
def registrar(datos: Registro, request: Request, bd: Session = Depends(obtener_bd)):
    _limitar(request, "registro", 5, 600)
    cfg = obtener_config()
    email = datos.email.lower().strip()
    if not datos.acepta_privacidad:
        raise HTTPException(422, "Debe aceptar el aviso de privacidad para continuar.")
    dominio = email.rsplit("@", 1)[-1]
    if cfg.dominios_permitidos and dominio not in cfg.dominios_permitidos:
        raise HTTPException(422, "Use su correo institucional: " + ", ".join(cfg.dominios_permitidos))
    rol = bd.execute(select(Rol).where(Rol.codigo == datos.rol_solicitado, Rol.autoregistro.is_(True))).scalar()
    if rol is None:
        raise HTTPException(422, "El rol solicitado no está disponible para registro.")
    problemas = evaluar_password(datos.password, email, datos.nombre)
    if problemas:
        raise HTTPException(422, " ".join(problemas))
    respuesta = {"mensaje": "Si los datos son válidos, recibirá un correo para verificar su cuenta."}
    existente = bd.execute(select(Usuario).where(Usuario.email == email)).scalar()
    hash_nuevo = hash_password(datos.password)  # se calcula siempre: el tiempo de respuesta no revela si existe
    if existente:
        # No se revela si el correo ya existe: se avisa al titular por correo.
        enviar_correo(bd, email, "Intento de registro con su correo",
                      "Alguien intentó crear una cuenta en Nexo con su correo. Si fue usted, inicie sesión "
                      "o restablezca su contraseña. Si no, puede ignorar este mensaje.")
        bitacora.registrar("auth.registro_duplicado", modulo="acceso", ip=ip_cliente(request))
        return respuesta
    usuario = Usuario(
        email=email, nombre=datos.nombre.strip(), unidad=datos.unidad.strip(), password_hash=hash_nuevo,
        rol_solicitado=rol.codigo, motivo_solicitud=datos.motivo.strip(), estado="pendiente_verificacion",
        consentimiento_version=VERSION_CONSENTIMIENTO, consentimiento_en=ahora(),
    )
    bd.add(usuario)
    bd.commit()
    token = _crear_token(bd, usuario, "verificar_correo", 60 * 24)
    clave_buzon = enviar_correo(bd, email, "Verifique su correo en Nexo",
                                f"Estimado(a) {usuario.nombre}: confirme su correo para continuar con su solicitud de acceso "
                                f"como «{rol.nombre}». El enlace vence en 24 horas.",
                                f"{cfg.url_publica}/verificar?token={token}", visible_en_demo=True)
    if clave_buzon:
        respuesta["clave_buzon"] = clave_buzon
    bitacora.registrar("auth.registro", usuario=usuario, modulo="acceso", objeto=f"usuario:{usuario.id}",
                       detalle={"rol_solicitado": rol.codigo}, ip=ip_cliente(request))
    return respuesta


class TokenEntrada(BaseModel):
    token: str = Field(max_length=200)


@router.post("/verificar-correo")
def verificar_correo(datos: TokenEntrada, request: Request, bd: Session = Depends(obtener_bd)):
    _limitar(request, "verificar", 20, 600)
    usuario = _consumir_token(bd, datos.token, "verificar_correo")
    if usuario.estado == "pendiente_verificacion":
        usuario.estado = "pendiente_aprobacion"
        usuario.email_verificado_en = ahora()
        bd.commit()
        notificar_permiso(bd, "usuarios:administrar", "Nueva solicitud de acceso",
                          f"{usuario.nombre} ({usuario.unidad or 'sin unidad'}) pide el rol {usuario.rol_solicitado}.",
                          "alerta", "/admin/usuarios")
        bitacora.registrar("auth.correo_verificado", usuario=usuario, modulo="acceso",
                           objeto=f"usuario:{usuario.id}", ip=ip_cliente(request))
    return {"estado": usuario.estado,
            "mensaje": "Correo verificado. Un administrador revisará su solicitud y le avisará por correo."}


# ---------------------------------------------------------------------------
# Inicio de sesión y segundo factor
# ---------------------------------------------------------------------------


class Login(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)


def _registrar_intento(bd: Session, email: str, ip: str, exito: bool, motivo: str) -> None:
    bd.add(IntentoLogin(email_hash=hmac_token(email), ip=ip, exito=exito, motivo=motivo))
    bd.commit()


def _fallos_recientes(bd: Session, email: str, ip: str | None) -> int:
    desde = ahora() - timedelta(minutes=obtener_config().bloqueo_minutos)
    q = select(func.count()).select_from(IntentoLogin).where(
        IntentoLogin.email_hash == hmac_token(email), IntentoLogin.exito.is_(False), IntentoLogin.creado_en > desde)
    if ip is not None:
        q = q.where(IntentoLogin.ip == ip)
    return bd.execute(q).scalar() or 0


@router.post("/login")
def login(datos: Login, request: Request, response: Response, bd: Session = Depends(obtener_bd)):
    _limitar(request, "login", 20, 300)
    cfg = obtener_config()
    ip = ip_cliente(request)
    email = datos.email.lower().strip()
    usuario = bd.execute(select(Usuario).where(Usuario.email == email)).scalar()
    # Bloqueo por cuenta + IP (un atacante no puede bloquear a la persona desde otro equipo) y bloqueo global
    # tras muchos fallos desde varias IP. La respuesta es la misma exista o no la cuenta (sin enumeración).
    if (_fallos_recientes(bd, email, ip) >= cfg.login_max_intentos
            or _fallos_recientes(bd, email, None) >= UMBRAL_GLOBAL
            or (usuario and usuario.bloqueado_hasta and usuario.bloqueado_hasta > ahora())):
        verificar_password(datos.password, None)  # mismo costo de tiempo
        _registrar_intento(bd, email, ip, False, "bloqueado")
        bitacora.registrar("auth.login_bloqueado", usuario=usuario, modulo="acceso", resultado="denegado", ip=ip)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, MENSAJE_DEMASIADOS)
    valida = verificar_password(datos.password, usuario.password_hash if usuario else None)
    if not usuario or not valida:
        _registrar_intento(bd, email, ip, False, "credenciales")
        if usuario and _fallos_recientes(bd, email, None) >= UMBRAL_GLOBAL:
            usuario.bloqueado_hasta = ahora() + timedelta(minutes=cfg.bloqueo_minutos)
            bd.commit()
            bitacora.registrar("auth.cuenta_bloqueada", usuario=usuario, modulo="seguridad",
                               detalle={"minutos": cfg.bloqueo_minutos, "motivo": "fallos desde varias IP"},
                               resultado="denegado", ip=ip)
            notificar_permiso(bd, "seguridad:gestionar", "Posible ataque distribuido a una cuenta",
                              f"Se bloqueó temporalmente la cuenta de {usuario.nombre}.", "critico", "/seguridad")
        bitacora.registrar("auth.login_fallido", usuario=usuario, modulo="acceso", resultado="denegado", ip=ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, MENSAJE_GENERICO)

    estados = {
        "pendiente_verificacion": "Primero verifique su correo con el enlace que le enviamos.",
        "pendiente_aprobacion": "Su solicitud está pendiente de aprobación por un administrador.",
        "rechazado": "Su solicitud de acceso no fue aprobada.",
        "desactivado": "Su cuenta está desactivada. Contacte a Informática.",
    }
    if usuario.estado != "activo":
        _registrar_intento(bd, email, ip, False, usuario.estado)
        raise HTTPException(status.HTTP_403_FORBIDDEN, estados.get(usuario.estado, "Cuenta no habilitada."))

    if necesita_rehash(usuario.password_hash):
        usuario.password_hash = hash_password(datos.password)
    usuario.bloqueado_hasta = None
    bd.commit()
    token, ses = crear_sesion(bd, usuario.id, request, mfa_ok=not usuario.mfa_activo)
    escribir_cookies(response, token, ses)
    _registrar_intento(bd, email, ip, True, "ok" if not usuario.mfa_activo else "falta_mfa")
    if not usuario.mfa_activo:
        usuario.ultimo_acceso = ahora()
        bd.commit()
        bitacora.registrar("auth.login", usuario=usuario, modulo="acceso", ip=ip)
    return info_usuario(bd, usuario, ses)


class CodigoMfa(BaseModel):
    codigo: str = Field(min_length=6, max_length=40)


def _verificar_totp(usuario: Usuario, codigo: str, secreto: str) -> bool:
    totp = pyotp.TOTP(secreto)
    codigo = codigo.replace(" ", "")
    ahora_paso = totp.timecode(datetime.now(UTC))  # hora con zona: no depende de la hora local del servidor
    for desfase in (-1, 0, 1):
        paso = ahora_paso + desfase
        if usuario.mfa_ultimo_paso is not None and paso <= usuario.mfa_ultimo_paso:
            continue  # evita reutilizar un código ya usado
        if secrets.compare_digest(totp.generate_otp(paso), codigo):
            usuario.mfa_ultimo_paso = paso
            return True
    return False


def _usar_codigo_recuperacion(usuario: Usuario, codigo: str) -> bool:
    h = hmac_token(codigo.replace("-", "").replace(" ", "").strip().upper())
    codigos = list(usuario.codigos_recuperacion or [])
    if h in codigos:
        codigos.remove(h)
        usuario.codigos_recuperacion = codigos
        return True
    return False


def _secreto(cifrado: str) -> str:
    try:
        return descifrar(cifrado)
    except (InvalidTag, ValueError) as e:
        raise HTTPException(409, "No se pudo leer su segundo factor (la llave del servidor cambió). "
                                 "Pida a Informática que lo restablezca.") from e


def _rotar(bd: Session, request: Request, response: Response, ses: Sesion, usuario: Usuario) -> Sesion:
    revocar(bd, ses)
    token, nueva = crear_sesion(bd, usuario.id, request, mfa_ok=True)
    escribir_cookies(response, token, nueva)
    return nueva


@router.post("/mfa/verificar")
def mfa_verificar(datos: CodigoMfa, request: Request, response: Response,
                  ctx: Contexto = Depends(contexto_parcial), bd: Session = Depends(obtener_bd)):
    _limitar(request, f"mfa:{ctx.usuario.id}", 8, 300)
    usuario = bd.get(Usuario, ctx.usuario.id)
    ses = bd.get(Sesion, ctx.sesion.id)
    if not limitador.permitir(f"mfa-cuenta:{usuario.id}", 10, 900):  # tope por cuenta aunque rote la IP
        revocar(bd, ses)
        bitacora.registrar("auth.mfa_fuerza_bruta", usuario=usuario, modulo="seguridad", resultado="denegado", ip=ctx.ip)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados códigos incorrectos. Inicie sesión de nuevo más tarde.")
    if not usuario.mfa_activo or not usuario.mfa_secreto_cifrado:
        raise HTTPException(400, "Su cuenta no tiene segundo factor configurado.")
    ok = _verificar_totp(usuario, datos.codigo, _secreto(usuario.mfa_secreto_cifrado))
    via = "totp"
    if not ok and _usar_codigo_recuperacion(usuario, datos.codigo):
        ok, via = True, "codigo_recuperacion"
    if not ok:
        bd.commit()
        bitacora.registrar("auth.mfa_fallido", usuario=usuario, modulo="acceso", resultado="denegado", ip=ctx.ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "El código no es válido.")
    usuario.ultimo_acceso = ahora()
    bd.commit()
    nueva = _rotar(bd, request, response, ses, usuario)
    bitacora.registrar("auth.login", usuario=usuario, modulo="acceso", detalle={"segundo_factor": via}, ip=ctx.ip)
    return info_usuario(bd, usuario, nueva)


class Reconfirmacion(BaseModel):
    password: str = Field(default="", max_length=256)


@router.post("/mfa/iniciar")
def mfa_iniciar(datos: Reconfirmacion | None = None, ctx: Contexto = Depends(contexto_parcial),
                bd: Session = Depends(obtener_bd)):
    usuario = bd.get(Usuario, ctx.usuario.id)
    if usuario.mfa_activo:
        # Cambiar un segundo factor existente exige sesión verificada y la contraseña actual.
        if not ctx.sesion.mfa_ok or not datos or not verificar_password(datos.password, usuario.password_hash):
            raise HTTPException(403, "Para reemplazar su segundo factor confirme su contraseña actual.")
    secreto = pyotp.random_base32()
    usuario.mfa_pendiente_cifrado = cifrar(secreto)
    bd.commit()
    uri = pyotp.TOTP(secreto).provisioning_uri(name=usuario.email, issuer_name="Nexo INE")
    # Data URI con el espacio de nombres SVG: así el navegador lo dibuja como imagen (svg_inline no lo incluye).
    qr = segno.make(uri, error="m").svg_data_uri(scale=5, dark="#004080")
    return {"secreto": secreto, "uri": uri, "qr_data_uri": qr}


@router.post("/mfa/activar")
def mfa_activar(datos: CodigoMfa, request: Request, response: Response,
                ctx: Contexto = Depends(contexto_parcial), bd: Session = Depends(obtener_bd)):
    _limitar(request, f"mfa-activar:{ctx.usuario.id}", 8, 300)
    usuario = bd.get(Usuario, ctx.usuario.id)
    ses = bd.get(Sesion, ctx.sesion.id)
    if not usuario.mfa_pendiente_cifrado:
        raise HTTPException(400, "Primero genere el código QR.")
    secreto = _secreto(usuario.mfa_pendiente_cifrado)
    if not _verificar_totp(usuario, datos.codigo, secreto):
        bd.commit()
        raise HTTPException(400, "El código no coincide. Revise la hora de su teléfono e intente de nuevo.")
    crudos = [secrets.token_hex(10).upper() for _ in range(8)]  # 80 bits cada uno
    codigos = ["-".join(c[i:i + 5] for i in range(0, 20, 5)) for c in crudos]
    usuario.mfa_secreto_cifrado = cifrar(secreto)
    usuario.mfa_pendiente_cifrado = None
    usuario.mfa_activo = True
    usuario.codigos_recuperacion = [hmac_token(c) for c in crudos]
    usuario.ultimo_acceso = ahora()
    bd.commit()
    nueva = _rotar(bd, request, response, ses, usuario)
    bitacora.registrar("auth.mfa_activado", usuario=usuario, modulo="acceso", ip=ctx.ip)
    return {"codigos_recuperacion": codigos, "usuario": info_usuario(bd, usuario, nueva)}


# ---------------------------------------------------------------------------
# Sesión actual
# ---------------------------------------------------------------------------


@router.get("/yo")
def yo(ctx: Contexto = Depends(contexto_parcial), bd: Session = Depends(obtener_bd)):
    return info_usuario(bd, ctx.usuario, ctx.sesion)


@router.post("/logout")
def logout(response: Response, ctx: Contexto = Depends(contexto_parcial), bd: Session = Depends(obtener_bd)):
    revocar(bd, bd.get(Sesion, ctx.sesion.id))
    borrar_cookies(response)
    bitacora.registrar("auth.logout", usuario=ctx.usuario, modulo="acceso", ip=ctx.ip)
    return {"ok": True}


class Preferencias(BaseModel):
    preferencias: dict


@router.put("/preferencias")
def guardar_preferencias(datos: Preferencias, ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    if len(str(datos.preferencias)) > 4000:
        raise HTTPException(413, "Preferencias demasiado grandes.")
    usuario = bd.get(Usuario, ctx.usuario.id)
    usuario.preferencias = datos.preferencias
    bd.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Contraseñas
# ---------------------------------------------------------------------------


class Olvide(BaseModel):
    email: EmailStr


@router.post("/password/olvide", status_code=202)
def olvide(datos: Olvide, request: Request, bd: Session = Depends(obtener_bd)):
    _limitar(request, "olvide", 5, 900)
    usuario = bd.execute(select(Usuario).where(Usuario.email == datos.email.lower().strip())).scalar()
    if usuario and usuario.estado == "activo":
        token = _crear_token(bd, usuario, "restablecer_password", 30)
        enviar_correo(bd, usuario.email, "Restablezca su contraseña de Nexo",
                      "Recibimos una solicitud para restablecer su contraseña. El enlace vence en 30 minutos. "
                      "Si no fue usted, ignore este mensaje y avise a Informática.",
                      f"{obtener_config().url_publica}/restablecer?token={token}")
        bitacora.registrar("auth.reset_solicitado", usuario=usuario, modulo="acceso", ip=ip_cliente(request))
    return {"mensaje": "Si el correo existe, recibirá instrucciones para restablecer su contraseña."}


class Restablecer(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=256)


@router.post("/password/restablecer")
def restablecer(datos: Restablecer, request: Request, bd: Session = Depends(obtener_bd)):
    _limitar(request, "restablecer", 10, 900)
    reg = bd.execute(select(TokenUnUso).where(TokenUnUso.token_hash == hash_token(datos.token),
                                              TokenUnUso.tipo == "restablecer_password")).scalar()
    if reg is None or reg.usado_en is not None or reg.expira_en < ahora():
        raise HTTPException(400, "El enlace no es válido o ya venció.")
    usuario = bd.get(Usuario, reg.usuario_id)
    problemas = evaluar_password(datos.password, usuario.email, usuario.nombre)
    if problemas:
        raise HTTPException(422, " ".join(problemas))
    reg.usado_en = ahora()
    usuario.password_hash = hash_password(datos.password)
    usuario.password_cambiada_en = ahora()
    usuario.intentos_fallidos = 0
    usuario.bloqueado_hasta = None
    bd.commit()
    revocar_todas(bd, usuario.id)
    enviar_correo(bd, usuario.email, "Su contraseña de Nexo cambió",
                  "Su contraseña se restableció y se cerraron todas sus sesiones abiertas.")
    bitacora.registrar("auth.password_restablecida", usuario=usuario, modulo="acceso", ip=ip_cliente(request))
    return {"mensaje": "Contraseña actualizada. Ya puede iniciar sesión."}


class CambioPassword(BaseModel):
    actual: str = Field(max_length=256)
    nueva: str = Field(max_length=256)


@router.post("/password/cambiar")
def cambiar_password(datos: CambioPassword, request: Request, ctx: Contexto = Depends(contexto),
                     bd: Session = Depends(obtener_bd)):
    _limitar(request, f"cambiar:{ctx.usuario.id}", 5, 900)
    usuario = bd.get(Usuario, ctx.usuario.id)
    if not verificar_password(datos.actual, usuario.password_hash):
        bitacora.registrar("auth.cambio_password_fallido", usuario=usuario, modulo="acceso", resultado="denegado",
                           ip=ctx.ip)
        raise HTTPException(400, "La contraseña actual no es correcta.")
    problemas = evaluar_password(datos.nueva, usuario.email, usuario.nombre)
    if problemas:
        raise HTTPException(422, " ".join(problemas))
    usuario.password_hash = hash_password(datos.nueva)
    usuario.password_cambiada_en = ahora()
    bd.commit()
    cerradas = revocar_todas(bd, usuario.id, excepto=ctx.sesion.id)
    bitacora.registrar("auth.password_cambiada", usuario=usuario, modulo="acceso",
                       detalle={"sesiones_cerradas": cerradas}, ip=ctx.ip)
    return {"mensaje": "Contraseña actualizada.", "sesiones_cerradas": cerradas}


class Evaluar(BaseModel):
    password: str = Field(max_length=256)
    email: str = ""
    nombre: str = ""


@router.post("/password/evaluar")
def evaluar(datos: Evaluar, request: Request):
    """Retroalimentación en vivo para el formulario (no guarda nada)."""
    _limitar(request, "evaluar", 120, 60)
    return {"problemas": evaluar_password(datos.password, datos.email, datos.nombre)}


# ---------------------------------------------------------------------------
# Sesiones activas
# ---------------------------------------------------------------------------


@router.get("/sesiones")
def mis_sesiones(ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(Sesion).where(Sesion.usuario_id == ctx.usuario.id, Sesion.revocada_en.is_(None),
                                            Sesion.expira_en > ahora()).order_by(Sesion.ultima_actividad.desc()))
    return [{"id": s.id[:16], "actual": s.id == ctx.sesion.id, "creada_en": s.creada_en.isoformat(),
             "ultima_actividad": s.ultima_actividad.isoformat(), "ip": s.ip, "agente": s.agente}
            for s in filas.scalars()]


@router.delete("/sesiones/{prefijo}")
def cerrar_sesion(prefijo: str, ctx: Contexto = Depends(contexto), bd: Session = Depends(obtener_bd)):
    if len(prefijo) != 16:
        raise HTTPException(400, "Identificador inválido.")
    for s in bd.execute(select(Sesion).where(Sesion.usuario_id == ctx.usuario.id,
                                             Sesion.revocada_en.is_(None))).scalars():
        if s.id.startswith(prefijo):
            revocar(bd, s)
            bitacora.registrar("auth.sesion_cerrada", usuario=ctx.usuario, modulo="acceso", ip=ctx.ip)
            return {"ok": True}
    raise HTTPException(404, "Sesión no encontrada.")


# ---------------------------------------------------------------------------
# Buzón de demostración (solo si NEXO_BUZON_DEMO está activo; nunca en producción)
# ---------------------------------------------------------------------------


@router.get("/buzon")
def buzon(clave: str, request: Request, bd: Session = Depends(obtener_bd)):
    """Muestra solo el correo de verificación de un registro hecho desde este navegador (con su clave)."""
    if not obtener_config().mostrar_buzon_demo or len(clave) > 100:
        raise HTTPException(404, "No disponible.")
    _limitar(request, "buzon", 30, 60)
    c = bd.execute(select(CorreoSaliente).where(CorreoSaliente.clave_lectura == hash_token(clave))).scalar()
    if c is None:
        raise HTTPException(404, "No encontrado.")
    return {"para": c.para, "asunto": c.asunto, "cuerpo": c.cuerpo, "enlace": c.enlace, "fecha": c.creado_en.isoformat()}
