"""Configuración de pruebas: base de datos y carpeta temporales, sin programador ni red."""

from __future__ import annotations

import os
import tempfile
import time

_TMP = tempfile.mkdtemp(prefix="nexo-pruebas-")
os.environ.update({
    "NEXO_ENTORNO": "desarrollo",
    # Con NEXO_PRUEBAS_BD se prueban contra PostgreSQL (como en producción); por defecto, SQLite temporal.
    "NEXO_BASE_DATOS_URL": os.environ.get("NEXO_PRUEBAS_BD") or f"sqlite:///{_TMP}/pruebas.db",
    "NEXO_DIRECTORIO_VAR": _TMP,
    "NEXO_CLAVE_SECRETA": "clave-solo-para-pruebas-automaticas-0123456789",
    "NEXO_PROGRAMADOR_ACTIVO": "false",
    "TZ": "America/Guatemala",  # reproduce la hora local del equipo del INE (regresión del MFA)
})
if hasattr(time, "tzset"):
    time.tzset()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.cli import _crear_usuario  # noqa: E402
from app.db import SesionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.security.limites import limitador  # noqa: E402
from app.siembra import preparar_base  # noqa: E402

CLAVE = "una frase de paso larga y segura"


@pytest.fixture(scope="session", autouse=True)
def _base():
    preparar_base()


@pytest.fixture(autouse=True)
def _sin_limites():
    limitador.reiniciar()


def crear_usuario(email: str, roles: list[str], password: str = CLAVE, nombre: str = "Persona de prueba"):
    with SesionLocal() as bd:
        return _crear_usuario(bd, email, nombre, "Unidad de prueba", roles, password, demo=False)


def cliente() -> TestClient:
    return TestClient(app)


def csrf(c: TestClient) -> dict:
    return {"X-CSRF-Token": c.cookies.get("nexo_csrf", "")}


def iniciar_sesion(c: TestClient, email: str, password: str = CLAVE):
    return c.post("/api/auth/login", json={"email": email, "password": password})
