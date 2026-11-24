"""Agente de ciberseguridad: chequeos automáticos de la postura de seguridad de la plataforma.

Cada chequeo es una regla concreta y verificable contra la base de datos o la configuración.
No usa modelos de lenguaje: sus conclusiones son reproducibles y auditables.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..bitacora import verificar_cadena
from ..config import RAIZ, obtener_config
from ..db import ahora
from ..models import (
    Bitacora,
    Incidente,
    IntentoLogin,
    PoliticaRetencion,
    Riesgo,
    Rol,
    Sesion,
    Usuario,
    UsuarioRol,
    Validacion,
)
from .hallazgos import Resultado, puntaje, registrar_resultados


def _usuarios_con_rol(bd: Session, codigos: set[str]) -> list[Usuario]:
    ids = select(UsuarioRol.usuario_id).join(Rol, Rol.id == UsuarioRol.rol_id).where(Rol.codigo.in_(codigos))
    q = select(Usuario).where(Usuario.id.in_(ids), Usuario.estado == "activo")
    return list(bd.execute(q).scalars())


def chequeos(bd: Session) -> list[Resultado]:
    cfg = obtener_config()
    t = ahora()
    r: list[Resultado] = []

    sin_mfa = [u for u in _usuarios_con_rol(bd, cfg.roles_mfa | {"admin_ti", "seguridad"}) if not u.mfa_activo]
    r.append(Resultado("mfa_privilegiados", "Cuentas privilegiadas sin segundo factor", not sin_mfa, "alta",
                       f"{len(sin_mfa)} cuenta(s) privilegiada(s) sin MFA." if sin_mfa else "",
                       "Exigir que configuren el segundo factor; la plataforma ya bloquea su acceso hasta hacerlo.",
                       "ISO 27001 A.8.5 · NIST CSF PR.AA"))

    admins = _usuarios_con_rol(bd, {"admin_ti"})
    r.append(Resultado("admins_excesivos", "Demasiadas cuentas de administración", len(admins) <= 3, "media",
                       f"Hay {len(admins)} administradores activos.", "Mantener como máximo 3 y revisar cada trimestre.",
                       "ISO 27001 A.8.2 · Mínimo privilegio"))

    inactivas = bd.execute(select(func.count()).select_from(Usuario).where(
        Usuario.estado == "activo", Usuario.es_demo.is_(False),
        func.coalesce(Usuario.ultimo_acceso, Usuario.creado_en) < t - timedelta(days=90))).scalar() or 0
    r.append(Resultado("cuentas_inactivas", "Cuentas sin uso por más de 90 días", inactivas == 0, "media",
                       f"{inactivas} cuenta(s) activa(s) sin acceso en 90 días.",
                       "Desactivar cuentas que ya no se usan.", "ISO 27001 A.5.18 · NIST CSF PR.AA"))

    fallidos_hora = bd.execute(select(func.count()).select_from(IntentoLogin).where(
        IntentoLogin.exito.is_(False), IntentoLogin.creado_en > t - timedelta(hours=1))).scalar() or 0
    por_ip = bd.execute(select(IntentoLogin.ip, func.count()).where(
        IntentoLogin.exito.is_(False), IntentoLogin.creado_en > t - timedelta(hours=1))
        .group_by(IntentoLogin.ip).order_by(func.count().desc()).limit(1)).first()
    sospecha = fallidos_hora > 30 or (por_ip is not None and por_ip[1] > 15)
    r.append(Resultado("fuerza_bruta", "Posible ataque de fuerza bruta", not sospecha, "alta",
                       f"{fallidos_hora} intentos fallidos en la última hora"
                       + (f"; máximo desde una IP: {por_ip[1]}" if por_ip else "") + ".",
                       "Revisar el origen; considerar bloquear la IP en el proxy y forzar MFA.",
                       "ISO 27001 A.8.16 · NIST CSF DE.CM"))

    bloqueadas = bd.execute(select(func.count()).select_from(Usuario).where(Usuario.bloqueado_hasta > t)).scalar() or 0
    r.append(Resultado("cuentas_bloqueadas", "Cuentas bloqueadas por intentos fallidos", bloqueadas == 0, "baja",
                       f"{bloqueadas} cuenta(s) bloqueada(s) en este momento.",
                       "Confirmar con cada titular que fue un error propio y no un ataque.", "ISO 27001 A.8.5"))

    cadena = verificar_cadena(bd)
    r.append(Resultado("bitacora_integra", "Integridad de la bitácora", cadena["integra"], "critica",
                       "" if cadena["integra"] else f"La cadena se rompe en el registro {cadena['roto_en']}.",
                       "Tratar como incidente: preservar copia de la base y revisar accesos directos a la BD.",
                       "ISO 27001 A.8.15, A.5.28 · NIST CSF DE.CM"))

    if cfg.es_produccion:
        problemas = []
        if not cfg.usar_cookie_segura:
            problemas.append("cookies sin atributo Secure")
        if cfg.mostrar_buzon_demo:
            problemas.append("buzón de demostración activo")
        if cfg.url_bd.startswith("sqlite"):
            problemas.append("base SQLite en producción")
        r.append(Resultado("configuracion_produccion", "Configuración insegura en producción", not problemas, "alta",
                           ", ".join(problemas), "Ajustar las variables NEXO_* según docs/SEGURIDAD.md.",
                           "ISO 27001 A.8.9 · NIST CSF PR.PS"))
        demo = bd.execute(select(func.count()).select_from(Usuario).where(Usuario.es_demo.is_(True),
                                                                          Usuario.estado == "activo")).scalar() or 0
        r.append(Resultado("usuarios_demo", "Cuentas de demostración activas en producción", demo == 0, "alta",
                           f"{demo} cuenta(s) de demostración activas.", "Desactivarlas antes de operar.",
                           "ISO 27001 A.5.18"))
    else:
        r.append(Resultado("entorno_desarrollo", "La plataforma corre en modo desarrollo", False, "info",
                           "Modo de demostración: cookies sin Secure (HTTP local) y buzón de correos visible.",
                           "En producción usar NEXO_ENTORNO=produccion con HTTPS y PostgreSQL.", "ISO 27001 A.8.9"))

    politicas = bd.execute(select(PoliticaRetencion).where(PoliticaRetencion.activa.is_(True))).scalars().all()
    atrasadas = [p.nombre for p in politicas if p.accion != "conservar"
                 and (p.ultima_ejecucion is None or p.ultima_ejecucion < t - timedelta(days=2))]
    r.append(Resultado("retencion_al_dia", "Políticas de retención sin aplicar", not atrasadas, "media",
                       f"Sin aplicar en 48 h: {', '.join(atrasadas[:4])}" if atrasadas else "",
                       "Ejecutar la automatización «Aplicar políticas de retención».",
                       "ISO 27001 A.8.10, A.5.34"))

    multisesion = bd.execute(select(Sesion.usuario_id, func.count()).where(
        Sesion.revocada_en.is_(None), Sesion.expira_en > t).group_by(Sesion.usuario_id)
        .having(func.count() > 5)).all()
    r.append(Resultado("sesiones_concurrentes", "Usuarios con muchas sesiones abiertas", not multisesion, "baja",
                       f"{len(multisesion)} usuario(s) con más de 5 sesiones activas.",
                       "Verificar que no se compartan credenciales.", "ISO 27001 A.5.17"))

    pendientes = bd.execute(select(func.count()).select_from(Usuario).where(
        Usuario.estado == "pendiente_aprobacion", Usuario.email_verificado_en < t - timedelta(days=3))).scalar() or 0
    r.append(Resultado("aprobaciones_pendientes", "Solicitudes de acceso sin atender", pendientes == 0, "baja",
                       f"{pendientes} solicitud(es) con más de 3 días.", "Aprobar o rechazar desde Administración.",
                       "ISO 27001 A.5.18"))

    altos = bd.execute(select(func.count()).select_from(Riesgo).where(
        Riesgo.estado == "abierto", Riesgo.probabilidad * Riesgo.impacto >= 15)).scalar() or 0
    r.append(Resultado("riesgos_altos", "Riesgos altos sin tratamiento", altos == 0, "media",
                       f"{altos} riesgo(s) con puntaje ≥ 15 siguen abiertos.",
                       "Asignar plan de tratamiento o aceptar formalmente.", "ISO 27001 cláusula 6.1.3 · NIST CSF ID.RA"))

    viejos = bd.execute(select(func.count()).select_from(Incidente).where(
        Incidente.estado.in_(["abierto", "contenido"]), Incidente.creado_en < t - timedelta(days=7))).scalar() or 0
    r.append(Resultado("incidentes_abiertos", "Incidentes abiertos por más de 7 días", viejos == 0, "media",
                       f"{viejos} incidente(s).", "Cerrar o escalar.", "ISO 27001 A.5.26 · NIST CSF RS.MA"))

    con_pii = bd.execute(select(func.count()).select_from(Validacion).where(
        Validacion.bloqueante.is_(True), Validacion.creada_en > t - timedelta(days=7))).scalar() or 0
    r.append(Resultado("datos_personales_detectados", "Archivos con posibles datos personales", con_pii == 0, "media",
                       f"{con_pii} archivo(s) validado(s) en 7 días contenían posibles datos personales.",
                       "Confirmar que no se publicaron y capacitar sobre secreto estadístico.",
                       "ISO 27001 A.5.34 · Principio 6 ONU"))

    denegados = bd.execute(select(Bitacora.usuario_id, func.count()).where(
        Bitacora.accion == "acceso.denegado", Bitacora.ts > t - timedelta(hours=24))
        .group_by(Bitacora.usuario_id).having(func.count() > 10)).all()
    r.append(Resultado("sondeo_privilegios", "Intentos repetidos de acceder sin permiso", not denegados, "media",
                       f"{len(denegados)} usuario(s) con más de 10 accesos denegados en 24 h.",
                       "Revisar con el titular; puede indicar abuso o un rol mal asignado.",
                       "ISO 27001 A.8.16 · NIST CSF DE.AE"))

    req = RAIZ / "backend" / "requirements.txt"
    con_hash = req.exists() and "--hash=sha256:" in req.read_text()
    lock = (RAIZ / "frontend" / "package-lock.json").exists()
    r.append(Resultado("dependencias_fijadas", "Dependencias sin versión fija o sin hash", con_hash and lock, "media",
                       f"requirements con hash: {'sí' if con_hash else 'no'}; package-lock: {'sí' if lock else 'no'}.",
                       "Fijar versiones con hash y auditar en CI.", "ISO 27001 A.8.8 · NIST CSF GV.SC"))

    env = RAIZ / ".env"
    permisos_env = oct(env.stat().st_mode)[-3:] if env.exists() else None
    r.append(Resultado("permisos_env", "El archivo .env es legible por otros usuarios",
                       permisos_env is None or permisos_env in ("600", "400"), "media",
                       f"Permisos actuales: {permisos_env}.", "chmod 600 .env", "ISO 27001 A.8.4"))
    return r


def revisar(bd: Session) -> dict:
    resumen = registrar_resultados(bd, "seguridad", chequeos(bd))
    resumen["puntaje"] = puntaje(bd, "seguridad")
    return resumen
