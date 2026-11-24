"""Descarga reproducible de las fuentes, con manifiesto de URL, fecha y huella SHA-256."""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from datetime import UTC, datetime
from pathlib import Path

import httpx

from ..config import obtener_config
from .fuentes import FUENTES, POR_ID, Fuente

log = logging.getLogger("nexo.etl")
AGENTE = "Nexo-ETL/1.0 (prototipo Dataton INE 2026)"


def dir_crudos() -> Path:
    d = obtener_config().directorio_datos / "crudos"
    d.mkdir(parents=True, exist_ok=True)
    return d


def ruta_manifiesto() -> Path:
    return obtener_config().directorio_datos / "manifiesto.json"


def leer_manifiesto() -> dict:
    p = ruta_manifiesto()
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def guardar_manifiesto(m: dict) -> None:
    ruta_manifiesto().write_text(json.dumps(m, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def sha256_archivo(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def descargar(fuente: Fuente, forzar: bool = False, origen_local: Path | None = None) -> dict:
    """Descarga una fuente a data/crudos/. Si ya existe, solo verifica su huella."""
    destino = dir_crudos() / fuente.archivo
    manifiesto = leer_manifiesto()
    if destino.exists() and not forzar and fuente.id in manifiesto:
        return manifiesto[fuente.id]
    if origen_local is not None:  # copia de una descarga previa (misma URL), útil sin red
        shutil.copyfile(origen_local, destino)
    else:
        temporal = destino.with_suffix(destino.suffix + ".parcial")
        with httpx.stream("GET", fuente.url, headers={"User-Agent": AGENTE}, timeout=httpx.Timeout(60, read=300),
                          follow_redirects=True) as r:
            r.raise_for_status()
            with temporal.open("wb") as f:
                for bloque in r.iter_bytes(1 << 20):
                    f.write(bloque)
        temporal.replace(destino)
    registro = {
        "id": fuente.id,
        "titulo": fuente.titulo,
        "url": fuente.url,
        "pagina": fuente.pagina,
        "publicador": fuente.publicador,
        "licencia": fuente.licencia,
        "archivo": fuente.archivo,
        "descargado_en": datetime.now(UTC).isoformat(timespec="seconds"),
        "bytes": destino.stat().st_size,
        "sha256": sha256_archivo(destino),
    }
    manifiesto[fuente.id] = registro
    guardar_manifiesto(manifiesto)
    log.info("Descargado %s (%s bytes)", fuente.id, registro["bytes"])
    return registro


def descargar_todo(ids: list[str] | None = None, incluir_pesadas: bool = True, forzar: bool = False) -> list[dict]:
    resultados = []
    for f in FUENTES:
        if ids and f.id not in ids:
            continue
        if f.pesada and not incluir_pesadas and not ids:
            continue
        try:
            resultados.append(descargar(f, forzar=forzar))
        except Exception as e:  # una fuente caída no detiene a las demás
            log.error("No se pudo descargar %s: %s", f.id, e)
            resultados.append({"id": f.id, "error": str(e)})
    return resultados


__all__ = ["descargar", "descargar_todo", "leer_manifiesto", "POR_ID", "sha256_archivo"]
