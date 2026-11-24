"""Contraseñas: hash Argon2id y política basada en longitud y lista de bloqueo.

No se imponen reglas de composición (mayúsculas, símbolos): la guía actual de NIST y OWASP
prefiere longitud mínima, frases de paso y bloquear contraseñas comunes o filtradas.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from ..texto import normalizar

_hasher = PasswordHasher()  # Argon2id con parámetros recomendados por RFC 9106
_HASH_FICTICIO = _hasher.hash(secrets.token_urlsafe(24))

LONGITUD_MINIMA = 12
LONGITUD_MAXIMA = 128

# Lista corta de contraseñas y patrones comunes; en producción se recomienda además
# consultar una lista de contraseñas filtradas (k-anonimato) sin enviar la contraseña.
_COMUNES = {
    "123456789012", "contraseña123", "contrasena123", "password1234", "qwertyuiopas",
    "guatemala123", "guatemala2026", "guatemala2025", "ine123456789", "administrador",
    "bienvenido123", "123456789abc", "abc123456789", "iloveyou1234", "qwerty123456",
    "000000000000", "111111111111", "123123123123", "estadistica1", "estadistica2026",
    "datos12345678", "dataton2026ine", "passw0rd1234", "changeme1234", "admin1234567",
}


def hash_password(clave: str) -> str:
    return _hasher.hash(clave)


def verificar_password(clave: str, hash_guardado: str | None) -> bool:
    """Verifica en tiempo similar exista o no el usuario (evita enumeración por tiempo)."""
    try:
        return _hasher.verify(hash_guardado or _HASH_FICTICIO, clave) and hash_guardado is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def necesita_rehash(hash_guardado: str) -> bool:
    return _hasher.check_needs_rehash(hash_guardado)


def evaluar_password(clave: str, email: str = "", nombre: str = "") -> list[str]:
    """Devuelve la lista de problemas (vacía si la contraseña es aceptable)."""
    problemas: list[str] = []
    if len(clave) < LONGITUD_MINIMA:
        problemas.append(f"Debe tener al menos {LONGITUD_MINIMA} caracteres. Una frase de varias palabras funciona bien.")
    if len(clave) > LONGITUD_MAXIMA:
        problemas.append(f"Debe tener como máximo {LONGITUD_MAXIMA} caracteres.")
    n = normalizar(clave).replace(" ", "")
    if n in _COMUNES or re.fullmatch(r"(.)\1{5,}", n) or n.isdigit():
        problemas.append("Es demasiado común o predecible.")
    usuario = normalizar(email.split("@")[0]) if email else ""
    if usuario and len(usuario) >= 4 and usuario in n:
        problemas.append("No debe contener tu usuario de correo.")
    for parte in normalizar(nombre).split():
        if len(parte) >= 4 and parte in n:
            problemas.append("No debe contener tu nombre.")
            break
    if any(p in n for p in ("nexo", "dataton")) and len(n) < 16:
        problemas.append("No uses el nombre del sistema o del evento como base.")
    return problemas


def hash_token(token: str) -> str:
    """Hash SHA-256 para tokens de alta entropía (sesiones, enlaces, códigos de recuperación)."""
    return hashlib.sha256(token.encode()).hexdigest()


def iguales(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
