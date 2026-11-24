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

    # Sesiones y acceso
    sesion_inactividad_min: int = 30
    sesion_maxima_horas: int = 12
    login_max_intentos: int = 5
    bloqueo_minutos: int = 15
    dominios_correo_permitidos: str = ""  # p. ej. "ine.gob.gt,minfin.gob.gt"; vacío = cualquiera
    roles_con_mfa_obligatorio: str = "admin_ti,seguridad"
    cookie_segura: bool | None = None  # None = automático (sí en producción)
    buzon_demo: bool | None = None  # buzón de correos visible en pantalla (solo demostración)

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
    def usar_cookie_segura(self) -> bool:
        return self.es_produccion if self.cookie_segura is None else self.cookie_segura

    @property
    def mostrar_buzon_demo(self) -> bool:
        return (not self.es_produccion) if self.buzon_demo is None else self.buzon_demo

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
    if not archivo.exists():
        archivo.write_text(secrets.token_urlsafe(48))
        os.chmod(archivo, 0o600)
        log.warning("Se generó una clave secreta local de desarrollo en %s", archivo)
    return archivo.read_text().strip()


@lru_cache
def obtener_config() -> Configuracion:
    cfg = Configuracion()
    cfg.clave_secreta = _resolver_clave(cfg)
    return cfg
