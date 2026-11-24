"""Genera docs/DATOS.md y docs/TERCEROS.md a partir del manifiesto y de las dependencias fijadas.

Uso: backend/.venv/bin/python scripts/generar_docs.py
"""

from __future__ import annotations

import csv
import gzip
import json
import re
from importlib import metadata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def filas(nombre: str) -> int:
    with gzip.open(RAIZ / "data" / "procesados" / f"{nombre}.csv.gz", "rt", encoding="utf-8") as f:
        return sum(1 for _ in csv.reader(f)) - 1


def datos() -> None:
    m = json.loads((RAIZ / "data" / "manifiesto.json").read_text(encoding="utf-8"))
    lineas = ["# Conjuntos de datos utilizados", "",
              "Generado desde `data/manifiesto.json` con `scripts/generar_docs.py`. Fecha y hora de descarga en hora de "
              "Guatemala. La huella SHA-256 permite comprobar que el archivo es exactamente el mismo.", "",
              "Fuente principal: **Instituto Nacional de Estadística (INE), Guatemala**, portal de datos abiertos "
              "https://datos.ine.gob.gt (enlazado desde www.ine.gob.gt). Complemento: Guatecompras en formato OCDS.", "",
              "| Conjunto | Publicador | Licencia declarada | Descargado | Tamaño | SHA-256 |", "|---|---|---|---|---|---|"]
    for k in sorted(m, key=lambda x: (m[x]["publicador"] != m[next(iter(m))]["publicador"], x)):
        r = m[k]
        lineas.append(f"| [{r['titulo']}]({r['url']}) | {r['publicador']} | {r['licencia']} | "
                      f"{r.get('descargado_en_guatemala', r['descargado_en'])} | {r['bytes'] / 1e6:.2f} MB | `{r['sha256'][:16]}…` |")
    tablas = ["pr_referencia", "compras_items", "series_indices", "precios_recolectados", "hba_productos",
              "hba_conversiones", "lugares_poblados", "proyecciones_poblacion"]
    lineas += ["", "## Tablas procesadas (incluidas en `data/procesados`)", "", "| Tabla | Filas |", "|---|---|"]
    lineas += [f"| `{t}` | {filas(t):,} |" for t in tablas]
    lineas += ["", "Las tablas procesadas se regeneran con `python -m app.etl todo` (descarga, procesamiento y carga).",
               "Guatecompras se actualiza a diario: la semilla incluida corresponde a la descarga del 23-nov-2026."]
    (RAIZ / "docs" / "DATOS.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")


def _licencia(dist) -> str:
    meta = dist.metadata
    lic = meta.get("License-Expression") or ""
    if not lic:
        clasif = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
        lic = ", ".join(clasif) or (meta.get("License") or "")[:60]
    return lic or "No declarada"


def terceros() -> None:
    req = (RAIZ / "backend" / "requirements.txt").read_text()
    fijados = {m.group(1).lower(): m.group(2) for m in re.finditer(r"^([A-Za-z0-9_.\-]+)==([^\s\\]+)", req, re.M)}
    py = []
    for d in metadata.distributions():
        n = (d.metadata.get("Name") or "").lower()
        if n in fijados:
            py.append((d.metadata["Name"], d.version, _licencia(d)))
    lock = json.loads((RAIZ / "frontend" / "package-lock.json").read_text())
    raiz = lock["packages"][""]
    js = []
    for nombre in sorted({**raiz.get("dependencies", {}), **raiz.get("devDependencies", {})}):
        p = lock["packages"].get(f"node_modules/{nombre}", {})
        js.append((nombre, p.get("version", ""), p.get("license", "No declarada"),
                   "producción" if nombre in raiz.get("dependencies", {}) else "desarrollo"))
    lineas = ["# Componentes de terceros", "",
              "Las librerías y componentes de terceros conservan sus licencias originales (lineamientos del Datatón). "
              "Lista generada con `scripts/generar_docs.py` desde las dependencias fijadas.", "",
              "## Backend (Python)", "", "| Paquete | Versión | Licencia |", "|---|---|---|"]
    lineas += [f"| {n} | {v} | {l} |" for n, v, l in sorted(py, key=lambda x: x[0].lower())]
    lineas += ["", "## Frontend (JavaScript)", "", "| Paquete | Versión | Licencia | Uso |", "|---|---|---|---|"]
    lineas += [f"| {n} | {v} | {l} | {u} |" for n, v, l, u in js]
    lineas += ["", "## Identidad visual y otros recursos", "",
               "| Recurso | Origen | Uso |", "|---|---|---|",
               "| Logotipo del INE, ilustración de trabajo de campo y logotipo del Datatón (`frontend/public/marca/`) | "
               "Presentaciones oficiales del INE entregadas en el Datatón INE 2026 (23-nov-2026) | Identidad visual del "
               "prototipo; no implica que Nexo sea un sistema oficial del INE |",
               "| Paleta de colores y tipografía Ubuntu Sans | Tema de las presentaciones oficiales del INE | Diseño de la interfaz |",
               "| Fuente Ubuntu Sans (`@fontsource/ubuntu-sans`) | Canonical / Dalton Maag | Licencia de fuentes Ubuntu (UFL 1.0), autoalojada |",
               "", "No se usan servicios de pago ni en la nube."]
    (RAIZ / "docs" / "TERCEROS.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")


if __name__ == "__main__":
    datos()
    terceros()
    print("docs/DATOS.md y docs/TERCEROS.md generados")
