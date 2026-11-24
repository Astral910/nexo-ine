"""Cifrado de secretos en reposo (AES-256-GCM) con una llave derivada de NEXO_CLAVE_SECRETA."""

from __future__ import annotations

import base64
import os
from functools import lru_cache

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from ..config import obtener_config


@lru_cache
def llave(contexto: str) -> bytes:
    secreto = obtener_config().clave_secreta.encode()
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=b"nexo-ine-2026", info=contexto.encode()).derive(secreto)


def cifrar(texto: str, contexto: str = "mfa") -> str:
    nonce = os.urandom(12)
    datos = AESGCM(llave(contexto)).encrypt(nonce, texto.encode(), contexto.encode())
    return base64.urlsafe_b64encode(nonce + datos).decode()


def descifrar(token: str, contexto: str = "mfa") -> str:
    crudo = base64.urlsafe_b64decode(token.encode())
    return AESGCM(llave(contexto)).decrypt(crudo[:12], crudo[12:], contexto.encode()).decode()
