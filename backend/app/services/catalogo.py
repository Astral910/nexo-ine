"""Sincronización del catálogo del portal de datos abiertos del INE (API CKAN, solo lectura)."""

from __future__ import annotations

import httpx
from sqlalchemy.orm import Session

from ..db import ahora
from ..etl.descargar import AGENTE
from ..etl.fuentes import CKAN, FUENTES
from ..models import ConjuntoCkan


def sincronizar(bd: Session, timeout: float = 40) -> dict:
    usados = {f.conjunto for f in FUENTES}
    paquetes: list[dict] = []
    inicio = 0
    with httpx.Client(timeout=timeout, headers={"User-Agent": AGENTE}) as cliente:
        while True:
            r = cliente.get(f"{CKAN}/api/3/action/package_search", params={"rows": 500, "start": inicio})
            r.raise_for_status()
            datos = r.json()
            if not datos.get("success"):
                raise RuntimeError("El portal del INE respondió sin éxito.")
            lote = datos["result"]["results"]
            paquetes.extend(lote)
            inicio += len(lote)
            if not lote or inicio >= datos["result"]["count"] or inicio > 5000:
                break
    momento = ahora()
    for p in paquetes:
        formatos = sorted({(x.get("format") or "").upper() for x in p.get("resources", []) if x.get("format")})
        bd.merge(ConjuntoCkan(
            id=p["id"], nombre=p.get("name", ""), titulo=(p.get("title") or p.get("name", ""))[:300],
            organizacion=((p.get("organization") or {}).get("title") or "")[:200],
            recursos=len(p.get("resources", [])), formatos=", ".join(formatos)[:200],
            modificado=(p.get("metadata_modified") or "")[:40], url=f"{CKAN}/dataset/{p.get('name', '')}",
            usado_por_nexo=p.get("name") in usados, sincronizado_en=momento))
    bd.commit()
    return {"resumen": f"Catálogo sincronizado: {len(paquetes)} conjuntos de datos del INE.",
            "metricas": {"conjuntos": len(paquetes), "usados_por_nexo": sum(1 for p in paquetes if p.get('name') in usados)}}
