"""Punto de entrada de la API y del frontend compilado."""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import RAIZ, obtener_config
from .routers import (
    admin,
    auth,
    automatizaciones,
    bitacora_api,
    calidad,
    centro,
    datos,
    hba,
    indices,
    jurado,
    precios,
    privacidad,
    publico,
    seguridad,
    tableros,
    territorio,
    ti,
)
from .security.cabeceras import CabecerasSeguridad
from .services import programador
from .siembra import preparar_base

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nexo")
VERSION = "0.1.0"


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    preparar_base()
    cfg = obtener_config()
    if cfg.programador_activo:
        programador.iniciar()
    log.info("Nexo %s listo (entorno: %s)", VERSION, cfg.entorno)
    yield
    programador.detener()


def crear_app() -> FastAPI:
    cfg = obtener_config()
    app = FastAPI(
        title="Nexo · Plataforma integrada de automatización estadística",
        version=VERSION,
        description="Prototipo para el Datatón INE 2026. Fuente de los datos: Instituto Nacional de Estadística.",
        lifespan=ciclo_de_vida,
        docs_url=None if cfg.es_produccion else "/api/docs",
        redoc_url=None,
        openapi_url=None if cfg.es_produccion else "/api/openapi.json",
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(CabecerasSeguridad)

    for modulo in (auth, admin, centro, tableros, precios, indices, hba, territorio, calidad, automatizaciones,
                   datos, seguridad, ti, privacidad, bitacora_api, jurado, publico):
        app.include_router(modulo.router)

    @app.get("/api/salud", tags=["sistema"])
    def salud():
        return {"estado": "ok", "version": VERSION}

    @app.exception_handler(StarletteHTTPException)
    async def _http(_req: Request, exc: StarletteHTTPException):
        return JSONResponse({"detalle": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validacion(_req: Request, exc: RequestValidationError):
        errores = [{"campo": ".".join(str(x) for x in e.get("loc", [])[1:]), "mensaje": e.get("msg", "")}
                   for e in exc.errors()]
        return JSONResponse({"detalle": "Revise los datos enviados.", "errores": errores}, status_code=422)

    @app.exception_handler(Exception)
    async def _error(_req: Request, exc: Exception):
        referencia = secrets.token_hex(4)
        log.exception("Error no controlado (ref %s)", referencia, exc_info=exc)
        return JSONResponse({"detalle": f"Ocurrió un error inesperado. Referencia: {referencia}"}, status_code=500)

    _montar_frontend(app)
    return app


def _montar_frontend(app: FastAPI) -> None:
    """Sirve el frontend compilado (frontend/dist) con retorno a index.html para las rutas de la SPA."""
    dist = RAIZ / "frontend" / "dist"
    if not (dist / "index.html").exists():
        @app.get("/", include_in_schema=False)
        def sin_frontend():
            return JSONResponse({"mensaje": "API de Nexo en línea. Compile el frontend con: cd frontend && npm run build"})
        return

    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    indice = dist / "index.html"

    @app.get("/{ruta:path}", include_in_schema=False)
    def spa(ruta: str):
        if ruta.startswith("api/"):
            return JSONResponse({"detalle": "Ruta no encontrada."}, status_code=404)
        archivo = (dist / ruta).resolve()
        if ruta and archivo.is_file() and Path(dist.resolve()) in archivo.parents:
            return FileResponse(archivo)
        return FileResponse(indice, headers={"Cache-Control": "no-cache"})


app = crear_app()
