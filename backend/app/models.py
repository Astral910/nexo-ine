"""Modelo de datos de Nexo.

Se agrupa en: identidad y acceso, bitácora, automatizaciones, catálogo y linaje de datos,
datos de dominio (reales, del INE y de Guatecompras), flujos de trabajo, seguridad y privacidad.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, ahora

# ---------------------------------------------------------------------------
# Identidad y acceso
# ---------------------------------------------------------------------------


class Rol(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    area: Mapped[str] = mapped_column(String(80), default="")
    privilegiado: Mapped[bool] = mapped_column(Boolean, default=False)
    autoregistro: Mapped[bool] = mapped_column(Boolean, default=True)  # se puede pedir al registrarse
    permisos: Mapped[list[RolPermiso]] = relationship(cascade="all, delete-orphan")


class Permiso(Base):
    __tablename__ = "permisos"
    codigo: Mapped[str] = mapped_column(String(60), primary_key=True)
    descripcion: Mapped[str] = mapped_column(String(200))
    modulo: Mapped[str] = mapped_column(String(40))


class RolPermiso(Base):
    __tablename__ = "rol_permisos"
    rol_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permiso: Mapped[str] = mapped_column(ForeignKey("permisos.codigo", ondelete="CASCADE"), primary_key=True)


class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    unidad: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    password_cambiada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    # pendiente_verificacion | pendiente_aprobacion | activo | rechazado | desactivado
    estado: Mapped[str] = mapped_column(String(30), default="pendiente_verificacion", index=True)
    rol_solicitado: Mapped[str | None] = mapped_column(String(40))
    motivo_solicitud: Mapped[str] = mapped_column(Text, default="")
    email_verificado_en: Mapped[datetime | None] = mapped_column(DateTime)
    aprobado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    aprobado_en: Mapped[datetime | None] = mapped_column(DateTime)
    mfa_activo: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secreto_cifrado: Mapped[str | None] = mapped_column(Text)
    mfa_pendiente_cifrado: Mapped[str | None] = mapped_column(Text)
    mfa_ultimo_paso: Mapped[int | None] = mapped_column(Integer)  # evita reutilizar un código TOTP
    codigos_recuperacion: Mapped[list | None] = mapped_column(JSON)  # hashes SHA-256
    intentos_fallidos: Mapped[int] = mapped_column(Integer, default=0)
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime)
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime)
    consentimiento_version: Mapped[str | None] = mapped_column(String(20))
    consentimiento_en: Mapped[datetime | None] = mapped_column(DateTime)
    preferencias: Mapped[dict | None] = mapped_column(JSON)
    es_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    roles: Mapped[list[UsuarioRol]] = relationship(
        cascade="all, delete-orphan", foreign_keys="UsuarioRol.usuario_id", lazy="selectin"
    )


class UsuarioRol(Base):
    __tablename__ = "usuario_roles"
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    rol_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    asignado_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    asignado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    rol: Mapped[Rol] = relationship(lazy="selectin")


class Sesion(Base):
    __tablename__ = "sesiones"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # SHA-256 del token; el token no se guarda
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    mfa_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    ultima_actividad: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    expira_en: Mapped[datetime] = mapped_column(DateTime)
    ip: Mapped[str] = mapped_column(String(64), default="")
    agente: Mapped[str] = mapped_column(String(200), default="")
    revocada_en: Mapped[datetime | None] = mapped_column(DateTime)


class TokenUnUso(Base):
    __tablename__ = "tokens_un_uso"
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"))
    tipo: Mapped[str] = mapped_column(String(30))  # verificar_correo | restablecer_password
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expira_en: Mapped[datetime] = mapped_column(DateTime)
    usado_en: Mapped[datetime | None] = mapped_column(DateTime)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class IntentoLogin(Base):
    __tablename__ = "intentos_login"
    id: Mapped[int] = mapped_column(primary_key=True)
    email_hash: Mapped[str] = mapped_column(String(64), index=True)  # no se guarda el correo en claro
    ip: Mapped[str] = mapped_column(String(64), default="")
    exito: Mapped[bool] = mapped_column(Boolean, default=False)
    motivo: Mapped[str] = mapped_column(String(60), default="")
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora, index=True)


class CorreoSaliente(Base):
    """Buzón de salida. En demostración se muestra en pantalla; en producción iría por SMTP."""

    __tablename__ = "correos_salientes"
    id: Mapped[int] = mapped_column(primary_key=True)
    para: Mapped[str] = mapped_column(String(254))
    asunto: Mapped[str] = mapped_column(String(200))
    cuerpo: Mapped[str] = mapped_column(Text)
    enlace: Mapped[str | None] = mapped_column(String(500))
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Notificacion(Base):
    __tablename__ = "notificaciones"
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    titulo: Mapped[str] = mapped_column(String(200))
    cuerpo: Mapped[str] = mapped_column(Text, default="")
    nivel: Mapped[str] = mapped_column(String(20), default="info")  # info | alerta | critico | exito
    enlace: Mapped[str | None] = mapped_column(String(300))
    leida_en: Mapped[datetime | None] = mapped_column(DateTime)
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


# ---------------------------------------------------------------------------
# Bitácora inalterable (cadena de hashes)
# ---------------------------------------------------------------------------


class Bitacora(Base):
    __tablename__ = "bitacora"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=ahora, index=True)
    usuario_id: Mapped[int | None] = mapped_column(Integer, index=True)
    usuario_nombre: Mapped[str] = mapped_column(String(120), default="")
    accion: Mapped[str] = mapped_column(String(80), index=True)
    modulo: Mapped[str] = mapped_column(String(40), default="")
    objeto: Mapped[str] = mapped_column(String(120), default="")
    detalle: Mapped[dict | None] = mapped_column(JSON)
    resultado: Mapped[str] = mapped_column(String(20), default="ok")  # ok | denegado | error
    ip: Mapped[str] = mapped_column(String(64), default="")
    hash_previo: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64), unique=True)


# ---------------------------------------------------------------------------
# Automatizaciones
# ---------------------------------------------------------------------------


class Automatizacion(Base):
    __tablename__ = "automatizaciones"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    tarea: Mapped[str] = mapped_column(String(60))
    parametros: Mapped[dict | None] = mapped_column(JSON)
    frecuencia: Mapped[str] = mapped_column(String(20), default="manual")  # manual | intervalo | diaria | semanal
    valor_frecuencia: Mapped[str] = mapped_column(String(20), default="")  # minutos | "07:00" | "1@07:00"
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    sistema: Mapped[bool] = mapped_column(Boolean, default=False)
    propietario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    ultima_ejecucion_en: Mapped[datetime | None] = mapped_column(DateTime)
    ultimo_estado: Mapped[str | None] = mapped_column(String(20))
    proxima_ejecucion_en: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class Ejecucion(Base):
    __tablename__ = "ejecuciones"
    id: Mapped[int] = mapped_column(primary_key=True)
    automatizacion_id: Mapped[int] = mapped_column(ForeignKey("automatizaciones.id", ondelete="CASCADE"), index=True)
    inicio: Mapped[datetime] = mapped_column(DateTime, default=ahora, index=True)
    fin: Mapped[datetime | None] = mapped_column(DateTime)
    estado: Mapped[str] = mapped_column(String(20), default="en_curso")  # en_curso | ok | error
    disparada_por: Mapped[str] = mapped_column(String(60), default="programador")
    resumen: Mapped[str] = mapped_column(Text, default="")
    metricas: Mapped[dict | None] = mapped_column(JSON)


# ---------------------------------------------------------------------------
# Catálogo y linaje de datos
# ---------------------------------------------------------------------------


class FuenteDatos(Base):
    __tablename__ = "fuentes_datos"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    titulo: Mapped[str] = mapped_column(String(250))
    publicador: Mapped[str] = mapped_column(String(120))
    conjunto: Mapped[str] = mapped_column(String(160), default="")
    url: Mapped[str] = mapped_column(String(600))
    pagina: Mapped[str] = mapped_column(String(600), default="")
    licencia: Mapped[str] = mapped_column(String(120), default="")
    formato: Mapped[str] = mapped_column(String(20), default="")
    clasificacion: Mapped[str] = mapped_column(String(30), default="publico")
    periodicidad: Mapped[str] = mapped_column(String(40), default="")
    descargado_en: Mapped[datetime | None] = mapped_column(DateTime)
    sha256: Mapped[str | None] = mapped_column(String(64))
    bytes: Mapped[int | None] = mapped_column(Integer)
    filas: Mapped[int | None] = mapped_column(Integer)
    cargado_en: Mapped[datetime | None] = mapped_column(DateTime)
    usado_en: Mapped[str] = mapped_column(String(200), default="")
    notas: Mapped[str] = mapped_column(Text, default="")


class ConjuntoCkan(Base):
    __tablename__ = "catalogo_ckan"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    nombre: Mapped[str] = mapped_column(String(200), index=True)
    titulo: Mapped[str] = mapped_column(String(300))
    organizacion: Mapped[str] = mapped_column(String(200), default="")
    recursos: Mapped[int] = mapped_column(Integer, default=0)
    formatos: Mapped[str] = mapped_column(String(200), default="")
    modificado: Mapped[str] = mapped_column(String(40), default="")
    url: Mapped[str] = mapped_column(String(400), default="")
    usado_por_nexo: Mapped[bool] = mapped_column(Boolean, default=False)
    sincronizado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


# ---------------------------------------------------------------------------
# Datos de dominio (reales)
# ---------------------------------------------------------------------------


class PrecioReferencia(Base):
    """Precios de referencia publicados por el INE (DPIR)."""

    __tablename__ = "pr_referencia"
    id: Mapped[int] = mapped_column(primary_key=True)
    fuente_id: Mapped[str] = mapped_column(String(60), index=True)
    nog: Mapped[str] = mapped_column(String(30), default="", index=True)
    evento: Mapped[str] = mapped_column(String(120), default="")
    categoria: Mapped[str] = mapped_column(String(200), default="")
    entidad: Mapped[str] = mapped_column(String(250), default="")
    modalidad: Mapped[str] = mapped_column(String(200), default="")
    producto: Mapped[str] = mapped_column(String(500), default="")
    caracteristicas: Mapped[str] = mapped_column(Text, default="")
    presentacion: Mapped[str] = mapped_column(String(250), default="")
    precio: Mapped[float | None] = mapped_column(Float)
    fecha: Mapped[date | None] = mapped_column(Date, index=True)
    texto_norm: Mapped[str] = mapped_column(Text, default="")


class CompraItem(Base):
    """Compras públicas de un solo artículo (Guatecompras OCDS) con precio unitario calculable."""

    __tablename__ = "compras_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    ocid: Mapped[str] = mapped_column(String(60), index=True)
    nog: Mapped[str] = mapped_column(String(30), default="")
    fecha: Mapped[date | None] = mapped_column(Date, index=True)
    entidad: Mapped[str] = mapped_column(String(250), default="")
    departamento: Mapped[str | None] = mapped_column(String(40), index=True)
    modalidad: Mapped[str] = mapped_column(String(150), default="")
    categoria: Mapped[str] = mapped_column(String(20), default="")
    descripcion: Mapped[str] = mapped_column(Text, default="")
    unspsc: Mapped[str] = mapped_column(String(12), default="", index=True)
    unidad: Mapped[str] = mapped_column(String(120), default="")
    cantidad: Mapped[float] = mapped_column(Float)
    monto: Mapped[float] = mapped_column(Float)
    precio_unitario: Mapped[float] = mapped_column(Float)
    texto_norm: Mapped[str] = mapped_column(Text, default="")


class SerieIndice(Base):
    """Series de índices del INE: IPC (República, región, división), IPMC y costo de la CBA."""

    __tablename__ = "series_indices"
    id: Mapped[int] = mapped_column(primary_key=True)
    indicador: Mapped[str] = mapped_column(String(20), index=True)  # IPC | IPMC | CBA
    ambito: Mapped[str] = mapped_column(String(30))  # republica | region | division | material | urbana | rural
    clave: Mapped[str] = mapped_column(String(200))
    anio: Mapped[int] = mapped_column(Integer)
    mes: Mapped[int] = mapped_column(Integer)
    valor: Mapped[float] = mapped_column(Float)
    unidad: Mapped[str] = mapped_column(String(60), default="")
    base: Mapped[str] = mapped_column(String(40), default="")
    fuente_id: Mapped[str] = mapped_column(String(60), default="")
    __table_args__ = (Index("ix_serie_busqueda", "indicador", "ambito", "clave", "anio", "mes"),)


class PrecioRecolectado(Base):
    """Precios recolectados para el IPC. El informante solo aparece como código (secreto estadístico)."""

    __tablename__ = "precios_recolectados"
    id: Mapped[int] = mapped_column(primary_key=True)
    anio: Mapped[int] = mapped_column(Integer)
    mes: Mapped[int] = mapped_column(Integer)
    region: Mapped[str] = mapped_column(String(10), default="")
    departamento: Mapped[str] = mapped_column(String(40), index=True)
    municipio: Mapped[str] = mapped_column(String(80), default="")
    cod_articulo: Mapped[str] = mapped_column(String(20), index=True)
    articulo: Mapped[str] = mapped_column(String(200))
    cod_fuente: Mapped[str] = mapped_column(String(20))
    precio_anterior: Mapped[float | None] = mapped_column(Float)
    precio_actual: Mapped[float | None] = mapped_column(Float)
    cant_anterior: Mapped[float | None] = mapped_column(Float)
    cant_actual: Mapped[float | None] = mapped_column(Float)
    relativo: Mapped[float | None] = mapped_column(Float)
    __table_args__ = (Index("ix_pr_periodo_art", "anio", "mes", "cod_articulo"),)


class AlertaPrecio(Base):
    __tablename__ = "alertas_precio"
    id: Mapped[int] = mapped_column(primary_key=True)
    periodo: Mapped[str] = mapped_column(String(7), index=True)  # AAAA-MM
    precio_id: Mapped[int | None] = mapped_column(Integer)
    cod_articulo: Mapped[str] = mapped_column(String(20), index=True)
    articulo: Mapped[str] = mapped_column(String(200))
    departamento: Mapped[str] = mapped_column(String(40), index=True)
    municipio: Mapped[str] = mapped_column(String(80), default="")
    cod_fuente: Mapped[str] = mapped_column(String(20))
    precio_anterior: Mapped[float | None] = mapped_column(Float)
    precio_actual: Mapped[float | None] = mapped_column(Float)
    relativo: Mapped[float] = mapped_column(Float)
    mediana_grupo: Mapped[float] = mapped_column(Float)
    puntaje: Mapped[float] = mapped_column(Float)
    limite_inferior: Mapped[float] = mapped_column(Float)
    limite_superior: Mapped[float] = mapped_column(Float)
    n_grupo: Mapped[int] = mapped_column(Integer)
    severidad: Mapped[str] = mapped_column(String(10), index=True)  # alta | media | baja
    metodo: Mapped[str] = mapped_column(String(40), default="hidiroglou-berthelot")
    estado: Mapped[str] = mapped_column(String(20), default="nueva", index=True)
    comentario: Mapped[str] = mapped_column(Text, default="")
    revisada_por: Mapped[int | None] = mapped_column(Integer)
    revisada_en: Mapped[datetime | None] = mapped_column(DateTime)
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class HbaProducto(Base):
    """Hoja de Balance de Alimentos 2024 (INE)."""

    __tablename__ = "hba_productos"
    id: Mapped[int] = mapped_column(primary_key=True)
    grupo: Mapped[str] = mapped_column(String(120), default="")
    producto: Mapped[str] = mapped_column(String(160))
    es_grupo: Mapped[bool] = mapped_column(Boolean, default=False)
    valores: Mapped[dict] = mapped_column(JSON)  # columna original -> valor numérico
    orden: Mapped[int] = mapped_column(Integer, default=0)


class HbaConversion(Base):
    """Relaciones producto primario -> derivado tomadas de las Cuentas de Utilización y Suministro."""

    __tablename__ = "hba_conversiones"
    id: Mapped[int] = mapped_column(primary_key=True)
    primario: Mapped[str] = mapped_column(String(160))
    derivado: Mapped[str] = mapped_column(String(160))
    cantidad_primaria: Mapped[float] = mapped_column(Float)
    cantidad_derivada: Mapped[float] = mapped_column(Float)
    tasa_extraccion: Mapped[float] = mapped_column(Float)
    unidad: Mapped[str] = mapped_column(String(40), default="toneladas métricas")


class LugarPoblado(Base):
    __tablename__ = "lugares_poblados"
    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), index=True)
    nombre: Mapped[str] = mapped_column(String(160))
    categoria: Mapped[str] = mapped_column(String(60), default="")
    cod_departamento: Mapped[str] = mapped_column(String(4), default="")
    departamento: Mapped[str] = mapped_column(String(40), index=True)
    cod_municipio: Mapped[str] = mapped_column(String(6), default="", index=True)
    municipio: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    poblacion: Mapped[int | None] = mapped_column(Integer)
    hombres: Mapped[int | None] = mapped_column(Integer)
    mujeres: Mapped[int | None] = mapped_column(Integer)
    area: Mapped[str] = mapped_column(String(20), default="")
    texto_norm: Mapped[str] = mapped_column(String(300), default="")


class ProyeccionPoblacion(Base):
    __tablename__ = "proyecciones_poblacion"
    id: Mapped[int] = mapped_column(primary_key=True)
    cod_municipio: Mapped[str] = mapped_column(String(6), index=True)
    municipio: Mapped[str] = mapped_column(String(80))
    departamento: Mapped[str] = mapped_column(String(40), index=True)
    anio: Mapped[int] = mapped_column(Integer, index=True)
    poblacion: Mapped[int] = mapped_column(Integer)
    hombres: Mapped[int | None] = mapped_column(Integer)
    mujeres: Mapped[int | None] = mapped_column(Integer)


# ---------------------------------------------------------------------------
# Flujos de trabajo
# ---------------------------------------------------------------------------

ESTADOS_SOLICITUD = [
    ("recibida", "1. Solicitud"),
    ("revision", "2. Revisión"),
    ("investigacion", "3. Investigación de mercado"),
    ("analisis", "4. Análisis"),
    ("informe", "5. Informe"),
    ("entregada", "6. Entrega"),
]


class SolicitudPrecio(Base):
    __tablename__ = "solicitudes_pr"
    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    entidad: Mapped[str] = mapped_column(String(200))
    solicitante_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    producto: Mapped[str] = mapped_column(String(300))
    especificaciones: Mapped[str] = mapped_column(Text, default="")
    unidad: Mapped[str] = mapped_column(String(80), default="Unidad")
    cantidad: Mapped[float] = mapped_column(Float, default=1)
    modalidad: Mapped[str] = mapped_column(String(120), default="")
    justificacion: Mapped[str] = mapped_column(Text, default="")
    terminos_busqueda: Mapped[str] = mapped_column(String(300), default="")
    estado: Mapped[str] = mapped_column(String(20), default="recibida", index=True)
    rechazada: Mapped[bool] = mapped_column(Boolean, default=False)
    asignada_a: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    fecha_limite: Mapped[date | None] = mapped_column(Date)
    resultado: Mapped[dict | None] = mapped_column(JSON)
    informe_sha256: Mapped[str | None] = mapped_column(String(64))
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    actualizada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    entregada_en: Mapped[datetime | None] = mapped_column(DateTime)


class EventoSolicitud(Base):
    __tablename__ = "eventos_solicitud"
    id: Mapped[int] = mapped_column(primary_key=True)
    solicitud_id: Mapped[int] = mapped_column(ForeignKey("solicitudes_pr.id", ondelete="CASCADE"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    usuario_id: Mapped[int | None] = mapped_column(Integer)
    usuario_nombre: Mapped[str] = mapped_column(String(120), default="")
    de_estado: Mapped[str | None] = mapped_column(String(20))
    a_estado: Mapped[str] = mapped_column(String(20))
    comentario: Mapped[str] = mapped_column(Text, default="")


class Cotizacion(Base):
    __tablename__ = "cotizaciones"
    id: Mapped[int] = mapped_column(primary_key=True)
    solicitud_id: Mapped[int] = mapped_column(ForeignKey("solicitudes_pr.id", ondelete="CASCADE"), index=True)
    tipo: Mapped[str] = mapped_column(String(30))  # guatecompras | referencia_ine | cotizacion | catalogo
    descripcion: Mapped[str] = mapped_column(Text, default="")
    origen: Mapped[str] = mapped_column(String(250), default="")
    referencia: Mapped[str] = mapped_column(String(120), default="")  # NOG, ocid o enlace
    fecha: Mapped[date | None] = mapped_column(Date)
    precio: Mapped[float] = mapped_column(Float)
    precio_ajustado: Mapped[float | None] = mapped_column(Float)
    incluida: Mapped[bool] = mapped_column(Boolean, default=True)
    atipica: Mapped[bool] = mapped_column(Boolean, default=False)
    nota: Mapped[str] = mapped_column(Text, default="")
    creada_por: Mapped[int | None] = mapped_column(Integer)
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Tablero(Base):
    __tablename__ = "tableros"
    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(160))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    propietario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    rol_codigo: Mapped[str | None] = mapped_column(String(40), index=True)  # tablero base de un rol
    origen: Mapped[str] = mapped_column(String(20), default="usuario")  # sistema | usuario | generado
    consulta_texto: Mapped[str | None] = mapped_column(Text)
    spec: Mapped[dict] = mapped_column(JSON)
    fijado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Validacion(Base):
    """Resultado del validador de calidad. El archivo original no se guarda (minimización)."""

    __tablename__ = "validaciones"
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"), index=True)
    archivo: Mapped[str] = mapped_column(String(200))
    sha256: Mapped[str] = mapped_column(String(64))
    filas: Mapped[int] = mapped_column(Integer)
    columnas: Mapped[int] = mapped_column(Integer)
    puntaje: Mapped[float] = mapped_column(Float)
    bloqueante: Mapped[bool] = mapped_column(Boolean, default=False)
    informe: Mapped[dict] = mapped_column(JSON)
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class AvanceOperativo(Base):
    """Seguimiento de un operativo de campo por municipio (Coordinación Regional)."""

    __tablename__ = "avance_operativo"
    id: Mapped[int] = mapped_column(primary_key=True)
    operativo: Mapped[str] = mapped_column(String(120), index=True)
    cod_municipio: Mapped[str] = mapped_column(String(6))
    municipio: Mapped[str] = mapped_column(String(80))
    departamento: Mapped[str] = mapped_column(String(40), index=True)
    delegacion: Mapped[str] = mapped_column(String(80), default="")
    meta: Mapped[int] = mapped_column(Integer)  # lugares poblados a visitar (universo real del Censo 2018)
    completados: Mapped[int] = mapped_column(Integer, default=0)
    es_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    __table_args__ = (UniqueConstraint("operativo", "cod_municipio"),)


# ---------------------------------------------------------------------------
# Seguridad, TI y privacidad
# ---------------------------------------------------------------------------


class Hallazgo(Base):
    __tablename__ = "hallazgos"
    id: Mapped[int] = mapped_column(primary_key=True)
    agente: Mapped[str] = mapped_column(String(20), index=True)  # seguridad | ti
    chequeo: Mapped[str] = mapped_column(String(60), index=True)
    titulo: Mapped[str] = mapped_column(String(250))
    severidad: Mapped[str] = mapped_column(String(10))  # critica | alta | media | baja | info
    estado: Mapped[str] = mapped_column(String(20), default="abierto")  # abierto | resuelto | aceptado
    detalle: Mapped[str] = mapped_column(Text, default="")
    recomendacion: Mapped[str] = mapped_column(Text, default="")
    referencias: Mapped[str] = mapped_column(String(300), default="")
    primera_vez: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    ultima_vez: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    resuelto_en: Mapped[datetime | None] = mapped_column(DateTime)


class Riesgo(Base):
    __tablename__ = "riesgos"
    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    titulo: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    categoria: Mapped[str] = mapped_column(String(60), default="")
    probabilidad: Mapped[int] = mapped_column(Integer)
    impacto: Mapped[int] = mapped_column(Integer)
    controles: Mapped[str] = mapped_column(Text, default="")
    dueno: Mapped[str] = mapped_column(String(60), default="")
    estado: Mapped[str] = mapped_column(String(20), default="abierto")
    referencias: Mapped[str] = mapped_column(String(300), default="")
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Incidente(Base):
    __tablename__ = "incidentes"
    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    titulo: Mapped[str] = mapped_column(String(200))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    severidad: Mapped[str] = mapped_column(String(10), default="media")
    estado: Mapped[str] = mapped_column(String(20), default="abierto")  # abierto | contenido | resuelto | cerrado
    reportado_por: Mapped[int | None] = mapped_column(Integer)
    cronologia: Mapped[list | None] = mapped_column(JSON)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class PoliticaRetencion(Base):
    __tablename__ = "politicas_retencion"
    id: Mapped[int] = mapped_column(primary_key=True)
    clase: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(160))
    descripcion: Mapped[str] = mapped_column(Text, default="")
    dias: Mapped[int] = mapped_column(Integer)
    accion: Mapped[str] = mapped_column(String(20))  # eliminar | anonimizar | conservar
    fundamento: Mapped[str] = mapped_column(Text, default="")
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    ultima_ejecucion: Mapped[datetime | None] = mapped_column(DateTime)
    ultimo_resultado: Mapped[str] = mapped_column(String(200), default="")


class SolicitudPrivacidad(Base):
    __tablename__ = "solicitudes_privacidad"
    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id", ondelete="SET NULL"))
    tipo: Mapped[str] = mapped_column(String(20))  # exportar | eliminar | rectificar
    detalle: Mapped[str] = mapped_column(Text, default="")
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente | atendida | rechazada
    creada_en: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    atendida_en: Mapped[datetime | None] = mapped_column(DateTime)
    atendida_por: Mapped[int | None] = mapped_column(Integer)
    respuesta: Mapped[str] = mapped_column(Text, default="")
