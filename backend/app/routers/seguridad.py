"""Centro de ciberseguridad: postura, hallazgos del agente, riesgos, incidentes, eventos y controles."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import Hallazgo, Incidente, IntentoLogin, Riesgo, Rol, Sesion, Usuario, UsuarioRol
from ..services import agente_seguridad
from ..services.hallazgos import puntaje

router = APIRouter(prefix="/api/seguridad", tags=["ciberseguridad"])

# Controles implementados, con evidencia en el código, para revisión del jurado y de Informática.
CONTROLES = [
    ("Contraseñas con Argon2id y política por longitud con lista de bloqueo", "backend/app/security/passwords.py",
     "ISO 27001 A.5.17 · NIST SP 800-63B · OWASP ASVS (Autenticación)"),
    ("Segundo factor TOTP con códigos de recuperación y antirreutilización", "backend/app/routers/auth.py",
     "ISO 27001 A.8.5 · NIST CSF PR.AA"),
    ("Secretos de MFA cifrados en reposo (AES-256-GCM, llave derivada con HKDF)", "backend/app/security/cifrado.py",
     "ISO 27001 A.8.24"),
    ("Sesiones del lado del servidor; solo se guarda el hash del token; expiración y revocación",
     "backend/app/security/sesiones.py", "ISO 27001 A.8.5 · OWASP ASVS (Sesiones)"),
    ("Cookies HttpOnly, SameSite=Strict y Secure con prefijo __Host- en producción", "backend/app/security/sesiones.py",
     "OWASP ASVS (Sesiones)"),
    ("Protección CSRF de doble envío en toda operación que modifica datos", "backend/app/deps.py", "OWASP Top 10"),
    ("Bloqueo de cuenta y límite de tasa en rutas sensibles", "backend/app/routers/auth.py", "ISO 27001 A.8.5"),
    ("Mensajes que no revelan si un correo existe (anti-enumeración)", "backend/app/routers/auth.py", "OWASP ASVS"),
    ("Control de acceso por roles y permisos (mínimo privilegio), un usuario puede tener varios roles",
     "backend/app/catalogos.py", "ISO 27001 A.5.15, A.8.2 · NIST CSF PR.AA"),
    ("Registro con verificación de correo y aprobación de un administrador", "backend/app/routers/admin.py",
     "ISO 27001 A.5.16, A.5.18"),
    ("Bitácora inalterable con cadena de hashes SHA-256 y verificación automática", "backend/app/bitacora.py",
     "ISO 27001 A.8.15 · NIST CSF DE.CM"),
    ("Cabeceras de seguridad: CSP, HSTS, X-Frame-Options, nosniff, Referrer y Permissions-Policy",
     "backend/app/security/cabeceras.py", "OWASP Secure Headers"),
    ("Consultas solo por capa semántica con lista blanca (sin SQL del usuario)", "backend/app/services/semantica.py",
     "ISO 27001 A.8.28 · OWASP Top 10 (Inyección)"),
    ("Supresión automática de celdas pequeñas (secreto estadístico)", "backend/app/services/semantica.py",
     "Principio 6 ONU · ISO 27001 A.5.34"),
    ("Validador sin almacenamiento del archivo, detector de datos personales y protección ante bombas zip",
     "backend/app/services/validador.py", "ISO 27001 A.5.34, A.8.7"),
    ("Neutralización de fórmulas en exportaciones CSV", "backend/app/services/validador.py", "OWASP (CSV injection)"),
    ("Políticas de retención con purga y anonimización automáticas", "backend/app/services/retencion.py",
     "ISO 27001 A.8.10, A.5.34"),
    ("Automatizaciones restringidas a una lista blanca de tareas", "backend/app/services/tareas.py", "ISO 27001 A.8.9"),
    ("Agente de seguridad con chequeos reproducibles y puntaje de postura", "backend/app/services/agente_seguridad.py",
     "NIST CSF DE.CM, ID.RA"),
    ("Dependencias fijadas con hash y auditoría en integración continua", "backend/requirements.txt",
     "ISO 27001 A.8.8 · NIST CSF GV.SC"),
    ("Sin credenciales en el código: configuración por variables de entorno", "backend/app/config.py",
     "Lineamientos del Datatón · ISO 27001 A.8.4"),
    ("Errores sin trazas hacia el usuario y documentación de la API desactivada en producción", "backend/app/main.py",
     "OWASP ASVS (Errores)"),
]


@router.get("/postura")
def postura(ctx: Contexto = Depends(requiere("seguridad:ver")), bd: Session = Depends(obtener_bd)):
    t = ahora()
    activos = bd.execute(select(func.count()).select_from(Usuario).where(Usuario.estado == "activo")).scalar() or 0
    con_mfa = bd.execute(select(func.count()).select_from(Usuario).where(Usuario.estado == "activo",
                                                                         Usuario.mfa_activo.is_(True))).scalar() or 0
    priv = bd.execute(select(Usuario).join(UsuarioRol, UsuarioRol.usuario_id == Usuario.id)
                      .join(Rol, Rol.id == UsuarioRol.rol_id).where(Rol.privilegiado.is_(True), Usuario.estado == "activo")
                      .distinct()).scalars().all()
    por_sev = dict(bd.execute(select(Hallazgo.severidad, func.count()).where(
        Hallazgo.agente == "seguridad", Hallazgo.estado == "abierto").group_by(Hallazgo.severidad)).all())
    ultima = bd.execute(select(func.max(Hallazgo.ultima_vez)).where(Hallazgo.agente == "seguridad")).scalar()
    return {
        "puntaje": puntaje(bd, "seguridad"), "hallazgos_por_severidad": por_sev,
        "ultima_revision": ultima.isoformat() if ultima else None,
        "usuarios_activos": activos, "mfa_pct": round(con_mfa / activos * 100, 1) if activos else 0,
        "privilegiados": len(priv), "privilegiados_con_mfa": sum(1 for u in priv if u.mfa_activo),
        "intentos_fallidos_24h": bd.execute(select(func.count()).select_from(IntentoLogin).where(
            IntentoLogin.exito.is_(False), IntentoLogin.creado_en > t - timedelta(hours=24))).scalar(),
        "cuentas_bloqueadas": bd.execute(select(func.count()).select_from(Usuario).where(
            Usuario.bloqueado_hasta > t)).scalar(),
        "sesiones_activas": bd.execute(select(func.count()).select_from(Sesion).where(
            Sesion.revocada_en.is_(None), Sesion.expira_en > t)).scalar(),
        "incidentes_abiertos": bd.execute(select(func.count()).select_from(Incidente).where(
            Incidente.estado.in_(["abierto", "contenido"]))).scalar(),
        "riesgos_altos": bd.execute(select(func.count()).select_from(Riesgo).where(
            Riesgo.estado == "abierto", Riesgo.probabilidad * Riesgo.impacto >= 15)).scalar(),
    }


@router.get("/hallazgos")
def hallazgos(agente: str = "seguridad", estado: str | None = None,
              ctx: Contexto = Depends(requiere("seguridad:ver", "ti:ver")), bd: Session = Depends(obtener_bd)):
    if agente not in ("seguridad", "ti") or not ctx.puede(f"{agente}:ver"):
        raise HTTPException(403, "No puedes ver estos hallazgos.")
    q = select(Hallazgo).where(Hallazgo.agente == agente)
    if estado:
        q = q.where(Hallazgo.estado == estado)
    orden = {"critica": 0, "alta": 1, "media": 2, "baja": 3, "info": 4}
    filas = sorted(bd.execute(q).scalars(), key=lambda h: (h.estado != "abierto", orden.get(h.severidad, 9)))
    return [{"id": h.id, "chequeo": h.chequeo, "titulo": h.titulo, "severidad": h.severidad, "estado": h.estado,
             "detalle": h.detalle, "recomendacion": h.recomendacion, "referencias": h.referencias,
             "primera_vez": h.primera_vez.isoformat(), "ultima_vez": h.ultima_vez.isoformat()} for h in filas]


class DecisionHallazgo(BaseModel):
    estado: str = Field(pattern="^(abierto|aceptado|resuelto)$")
    justificacion: str = Field(min_length=5, max_length=500)


@router.patch("/hallazgos/{hid}")
def decidir(hid: int, datos: DecisionHallazgo, ctx: Contexto = Depends(requiere("seguridad:gestionar")),
            bd: Session = Depends(obtener_bd)):
    h = bd.get(Hallazgo, hid)
    if h is None:
        raise HTTPException(404, "Hallazgo no encontrado.")
    h.estado = datos.estado
    h.detalle = f"{h.detalle}\n[{ahora():%d/%m/%Y}] {ctx.usuario.nombre}: {datos.justificacion}"[-3000:]
    bd.commit()
    bitacora.registrar("seguridad.hallazgo_decidido", usuario=ctx.usuario, modulo="seguridad", objeto=f"hallazgo:{h.id}",
                       detalle={"estado": datos.estado, "justificacion": datos.justificacion}, ip=ctx.ip)
    return {"ok": True}


@router.post("/revisar")
def revisar(ctx: Contexto = Depends(requiere("seguridad:gestionar")), bd: Session = Depends(obtener_bd)):
    r = agente_seguridad.revisar(bd)
    bitacora.registrar("seguridad.revision_manual", usuario=ctx.usuario, modulo="seguridad", detalle=r, ip=ctx.ip)
    return r


@router.get("/riesgos")
def riesgos(ctx: Contexto = Depends(requiere("seguridad:ver")), bd: Session = Depends(obtener_bd)):
    return [{"id": r.id, "codigo": r.codigo, "titulo": r.titulo, "descripcion": r.descripcion, "categoria": r.categoria,
             "probabilidad": r.probabilidad, "impacto": r.impacto, "puntaje": r.probabilidad * r.impacto,
             "controles": r.controles, "dueno": r.dueno, "estado": r.estado, "referencias": r.referencias}
            for r in bd.execute(select(Riesgo).order_by((Riesgo.probabilidad * Riesgo.impacto).desc())).scalars()]


class DatosRiesgo(BaseModel):
    titulo: str = Field(min_length=3, max_length=200)
    descripcion: str = Field(default="", max_length=2000)
    categoria: str = Field(default="", max_length=60)
    probabilidad: int = Field(ge=1, le=5)
    impacto: int = Field(ge=1, le=5)
    controles: str = Field(default="", max_length=2000)
    dueno: str = Field(default="", max_length=60)
    estado: str = Field(default="abierto", pattern="^(abierto|mitigado|aceptado)$")
    referencias: str = Field(default="", max_length=300)


@router.post("/riesgos", status_code=201)
def crear_riesgo(datos: DatosRiesgo, ctx: Contexto = Depends(requiere("seguridad:gestionar")),
                 bd: Session = Depends(obtener_bd)):
    n = (bd.execute(select(func.count()).select_from(Riesgo)).scalar() or 0) + 1
    r = Riesgo(codigo=f"R-{n:02d}", **datos.model_dump())
    bd.add(r)
    bd.commit()
    bitacora.registrar("seguridad.riesgo_creado", usuario=ctx.usuario, modulo="seguridad", objeto=r.codigo, ip=ctx.ip)
    return {"id": r.id, "codigo": r.codigo}


@router.put("/riesgos/{rid}")
def editar_riesgo(rid: int, datos: DatosRiesgo, ctx: Contexto = Depends(requiere("seguridad:gestionar")),
                  bd: Session = Depends(obtener_bd)):
    r = bd.get(Riesgo, rid)
    if r is None:
        raise HTTPException(404, "Riesgo no encontrado.")
    for k, v in datos.model_dump().items():
        setattr(r, k, v)
    r.actualizado_en = ahora()
    bd.commit()
    bitacora.registrar("seguridad.riesgo_editado", usuario=ctx.usuario, modulo="seguridad", objeto=r.codigo, ip=ctx.ip)
    return {"ok": True}


@router.get("/incidentes")
def incidentes(ctx: Contexto = Depends(requiere("seguridad:ver")), bd: Session = Depends(obtener_bd)):
    return [{"id": i.id, "codigo": i.codigo, "titulo": i.titulo, "descripcion": i.descripcion, "severidad": i.severidad,
             "estado": i.estado, "cronologia": i.cronologia or [], "creado_en": i.creado_en.isoformat(),
             "actualizado_en": i.actualizado_en.isoformat()}
            for i in bd.execute(select(Incidente).order_by(Incidente.creado_en.desc())).scalars()]


class NuevoIncidente(BaseModel):
    titulo: str = Field(min_length=3, max_length=200)
    descripcion: str = Field(default="", max_length=3000)
    severidad: str = Field(default="media", pattern="^(critica|alta|media|baja)$")


@router.post("/incidentes", status_code=201)
def crear_incidente(datos: NuevoIncidente, ctx: Contexto = Depends(requiere("seguridad:gestionar")),
                    bd: Session = Depends(obtener_bd)):
    n = (bd.execute(select(func.count()).select_from(Incidente)).scalar() or 0) + 1
    i = Incidente(codigo=f"INC-{ahora():%Y}-{n:03d}", titulo=datos.titulo, descripcion=datos.descripcion,
                  severidad=datos.severidad, reportado_por=ctx.usuario.id,
                  cronologia=[{"ts": ahora().isoformat(), "usuario": ctx.usuario.nombre, "nota": "Incidente registrado"}])
    bd.add(i)
    bd.commit()
    bitacora.registrar("seguridad.incidente_creado", usuario=ctx.usuario, modulo="seguridad", objeto=i.codigo,
                       detalle={"severidad": i.severidad}, ip=ctx.ip)
    return {"id": i.id, "codigo": i.codigo}


class AvanceIncidente(BaseModel):
    estado: str = Field(pattern="^(abierto|contenido|resuelto|cerrado)$")
    nota: str = Field(min_length=3, max_length=1000)


@router.patch("/incidentes/{iid}")
def avanzar_incidente(iid: int, datos: AvanceIncidente, ctx: Contexto = Depends(requiere("seguridad:gestionar")),
                      bd: Session = Depends(obtener_bd)):
    i = bd.get(Incidente, iid)
    if i is None:
        raise HTTPException(404, "Incidente no encontrado.")
    i.estado = datos.estado
    i.cronologia = [*(i.cronologia or []), {"ts": ahora().isoformat(), "usuario": ctx.usuario.nombre,
                                            "nota": f"[{datos.estado}] {datos.nota}"}]
    i.actualizado_en = ahora()
    bd.commit()
    bitacora.registrar("seguridad.incidente_actualizado", usuario=ctx.usuario, modulo="seguridad", objeto=i.codigo,
                       detalle={"estado": datos.estado}, ip=ctx.ip)
    return {"ok": True}


@router.get("/eventos")
def eventos(horas: int = 24, ctx: Contexto = Depends(requiere("seguridad:ver")), bd: Session = Depends(obtener_bd)):
    horas = max(1, min(horas, 24 * 30))
    desde = ahora() - timedelta(hours=horas)
    filas = bd.execute(select(IntentoLogin).where(IntentoLogin.creado_en > desde)).scalars().all()
    por_hora: dict[str, list[int]] = {}
    for f in filas:
        clave = f.creado_en.strftime("%Y-%m-%d %H:00")
        par = por_hora.setdefault(clave, [0, 0])
        par[0 if f.exito else 1] += 1
    ips: dict[str, int] = {}
    for f in filas:
        if not f.exito:
            ips[f.ip] = ips.get(f.ip, 0) + 1
    return {"por_hora": [{"hora": k, "exitosos": v[0], "fallidos": v[1]} for k, v in sorted(por_hora.items())],
            "ips_con_mas_fallos": sorted(({"ip": k, "fallos": v} for k, v in ips.items()), key=lambda x: -x["fallos"])[:10],
            "motivos": {m: sum(1 for f in filas if f.motivo == m) for m in {f.motivo for f in filas}}}


@router.get("/controles")
def controles(ctx: Contexto = Depends(requiere("seguridad:ver", "jurado:ver"))):
    return [{"control": c, "evidencia": e, "referencias": r} for c, e, r in CONTROLES]
