"""Configuración central de Nexo.

Todo valor sensible se lee de variables de entorno (prefijo NEXO_) o de un archivo .env
que nunca se versiona. En el código no hay credenciales, contraseñas ni llaves.
"""

from __future__ import annotations

import logging
import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parents[2]  # raíz del repositorio
log = logging.getLogger("nexo.config")


class Configuracion(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXO_", env_file=str(RAIZ / ".env"), extra="ignore"
    )

    entorno: str = "desarrollo"  # desarrollo | produccion
    clave_secreta: str = ""
    base_datos_url: str = ""
    directorio_datos: Path = RAIZ / "data"
    directorio_var: Path = RAIZ / "var"
    url_publica: str = "http://localhost:8000"

    # Sesiones y acceso (inactividad: 30 min en producción; 240 en desarrollo y demostración)
    sesion_inactividad: int | None = None
    sesion_maxima_horas: int = 12
    login_max_intentos: int = 5
    bloqueo_minutos: int = 15
    dominios_correo_permitidos: str = ""  # p. ej. "ine.gob.gt,minfin.gob.gt"; vacío = cualquiera
    roles_con_mfa_obligatorio: str = "admin_ti,seguridad"
    cookie_segura: bool | None = None  # None = automático (sí en producción)
    buzon_demo: bool | None = None  # buzón de correos visible en pantalla (solo demostración)
    # Alta inmediata: la cuenta queda activa al registrarse, sin verificar el correo ni esperar aprobación.
    # None = automático (sí en desarrollo y demostración; en producción siempre se verifica y se aprueba).
    alta_inmediata: bool | None = None

    # Correo saliente (opcional)
    smtp_host: str = ""
    smtp_puerto: int = 587
    smtp_usuario: str = ""
    smtp_clave: str = ""
    smtp_remitente: str = "no-responder@localhost"

    # Datos y secreto estadístico
    subida_max_mb: int = 10
    k_minimo: int = 3  # celdas con menos observaciones se suprimen

    # Automatizaciones
    programador_activo: bool = True
    programador_intervalo_s: int = 20

    @property
    def es_produccion(self) -> bool:
        return self.entorno.lower() == "produccion"

    @property
    def sesion_inactividad_min(self) -> int:
        if self.sesion_inactividad:
            return self.sesion_inactividad
        return 30 if self.es_produccion else 240

    @property
    def usar_cookie_segura(self) -> bool:
        return self.es_produccion if self.cookie_segura is None else self.cookie_segura

    @property
    def mostrar_buzon_demo(self) -> bool:
        return (not self.es_produccion) if self.buzon_demo is None else self.buzon_demo

    @property
    def usar_alta_inmediata(self) -> bool:
        return (not self.es_produccion) if self.alta_inmediata is None else self.alta_inmediata

    @property
    def dominios_permitidos(self) -> list[str]:
        return [d.strip().lower() for d in self.dominios_correo_permitidos.split(",") if d.strip()]

    @property
    def roles_mfa(self) -> set[str]:
        return {r.strip() for r in self.roles_con_mfa_obligatorio.split(",") if r.strip()}

    @property
    def url_bd(self) -> str:
        if self.base_datos_url:
            return self.base_datos_url
        self.directorio_var.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.directorio_var / 'nexo.db'}"


def _validar_entorno(cfg: Configuracion) -> None:
    if cfg.entorno.lower() not in ("desarrollo", "produccion"):
        raise RuntimeError(f"NEXO_ENTORNO inválido: {cfg.entorno!r}. Use 'desarrollo' o 'produccion'.")


def _resolver_clave(cfg: Configuracion) -> str:
    """En producción la clave es obligatoria. En desarrollo se genera una local (0600)."""
    if cfg.clave_secreta:
        if len(cfg.clave_secreta) < 32:
            raise RuntimeError("NEXO_CLAVE_SECRETA debe tener al menos 32 caracteres.")
        return cfg.clave_secreta
    if cfg.es_produccion:
        raise RuntimeError("Falta NEXO_CLAVE_SECRETA: es obligatoria en producción.")
    cfg.directorio_var.mkdir(parents=True, exist_ok=True)
    archivo = cfg.directorio_var / ".clave_desarrollo"
    try:  # creación exclusiva con permisos 600 desde el primer byte (sin ventana de exposición)
        fd = os.open(archivo, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_urlsafe(48))
        log.warning("Se generó una clave secreta local de desarrollo en %s", archivo)
    except FileExistsError:
        pass
    return archivo.read_text(encoding="utf-8").strip()


@lru_cache
def obtener_config() -> Configuracion:
    cfg = Configuracion()
    _validar_entorno(cfg)
    cfg.clave_secreta = _resolver_clave(cfg)
    return cfg
