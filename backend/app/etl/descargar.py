"""Descarga reproducible de las fuentes, con manifiesto de URL, fecha y huella SHA-256."""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import httpx

from ..config import obtener_config
from .fuentes import CKAN as CKAN_URL
from .fuentes import FUENTES, POR_ID, Fuente
from .fuentes import INE as INE_PUBLICADOR

log = logging.getLogger("nexo.etl")
AGENTE = "Nexo-ETL/1.0 (prototipo Dataton INE 2026)"
GUATEMALA = timezone(timedelta(hours=-6))
FIRMAS = {"XLSX": [b"PK\x03\x04"], "TAR.GZ": [b"\x1f\x8b"], "CSV": []}


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


def _validar_contenido(ruta: Path, fuente: Fuente) -> None:
    """Evita registrar como dato una página de error o de captcha que llegó con HTTP 200."""
    if ruta.stat().st_size < 512:
        raise ValueError(f"{fuente.id}: archivo demasiado pequeño")
    cabeza = ruta.open("rb").read(2048)
    firmas = FIRMAS.get(fuente.formato, [])
    if firmas and not any(cabeza.startswith(f) for f in firmas):
        raise ValueError(f"{fuente.id}: el contenido no es {fuente.formato} (¿página de error o captcha?)")
    if fuente.formato == "CSV" and cabeza.lstrip().lower().startswith((b"<!doctype", b"<html")):
        raise ValueError(f"{fuente.id}: se recibió HTML en lugar de CSV")


def licencia_ckan(fuente: Fuente) -> str:
    """Licencia declarada en el portal del INE para el conjunto (o «no especificada»)."""
    if fuente.publicador != INE_PUBLICADOR:
        return fuente.licencia
    try:
        r = httpx.get(f"{CKAN_URL}/api/3/action/package_show", params={"id": fuente.conjunto}, timeout=20,
                      headers={"User-Agent": AGENTE})
        datos = r.json().get("result", {})
        return datos.get("license_title") or "No especificada en el portal del INE (citar la fuente)"
    except Exception:
        return "No especificada en el portal del INE (citar la fuente)"


def descargar(fuente: Fuente, forzar: bool = False, origen_local: Path | None = None,
              fecha_origen: datetime | None = None) -> dict:
    """Descarga una fuente a data/crudos/. Si ya existe, recalcula su huella y la compara con el manifiesto.

    `origen_local` permite reutilizar una descarga previa del mismo URL: en ese caso `fecha_origen` (la fecha
    real de esa descarga) es obligatoria, para no registrar una fecha de descarga falsa.
    """
    destino = dir_crudos() / fuente.archivo
    manifiesto = leer_manifiesto()
    if destino.exists() and not forzar and fuente.id in manifiesto:
        previo = manifiesto[fuente.id]
        if sha256_archivo(destino) != previo.get("sha256"):
            raise ValueError(f"{fuente.id}: el archivo local no coincide con la huella del manifiesto")
        return previo
    if origen_local is not None:
        if fecha_origen is None:
            raise ValueError("Al reutilizar una descarga previa indica su fecha real (fecha_origen).")
        shutil.copyfile(origen_local, destino)
        momento = fecha_origen.astimezone(UTC)
    else:
        temporal = destino.with_suffix(destino.suffix + ".parcial")
        with httpx.stream("GET", fuente.url, headers={"User-Agent": AGENTE}, timeout=httpx.Timeout(60, read=300),
                          follow_redirects=True) as r:
            r.raise_for_status()
            with temporal.open("wb") as f:
                for bloque in r.iter_bytes(1 << 20):
                    f.write(bloque)
        _validar_contenido(temporal, fuente)
        temporal.replace(destino)
        momento = datetime.now(UTC)
    registro = {
        "id": fuente.id,
        "titulo": fuente.titulo,
        "url": fuente.url,
        "pagina": fuente.pagina,
        "publicador": fuente.publicador,
        "licencia": licencia_ckan(fuente),
        "archivo": fuente.archivo,
        "descargado_en": momento.isoformat(timespec="seconds"),
        "descargado_en_guatemala": momento.astimezone(GUATEMALA).strftime("%d/%m/%Y %H:%M"),
        "bytes": destino.stat().st_size,
        "sha256": sha256_archivo(destino),
    }
    if origen_local is not None:
        registro["nota"] = "Copia local de una descarga previa del mismo URL; fecha de esa descarga original."
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
