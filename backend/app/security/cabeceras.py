"""Cabeceras de seguridad HTTP para todas las respuestas."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from ..config import obtener_config

CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "  # ECharts aplica estilos en línea a sus tooltips
    "img-src 'self' data: blob:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'"
)


class CabecerasSeguridad(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        respuesta = await call_next(request)
        h = respuesta.headers
        h.setdefault("Content-Security-Policy", CSP)
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        h.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        if request.url.path.startswith("/api/"):
            h.setdefault("Cache-Control", "no-store")
        if obtener_config().es_produccion:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return respuesta
