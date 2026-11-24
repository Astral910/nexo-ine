"""Pipeline de datos: python -m app.etl [descargar|procesar|cargar|todo] [--solo ...]"""

from __future__ import annotations

import argparse
import logging

from .cargar import cargar_todo
from .descargar import descargar_todo
from .procesar import procesar_todo


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    p = argparse.ArgumentParser(prog="python -m app.etl", description="Pipeline reproducible de datos de Nexo")
    p.add_argument("paso", choices=["descargar", "procesar", "cargar", "todo"])
    p.add_argument("--solo", nargs="*", help="Limitar a ciertas fuentes o tablas")
    p.add_argument("--sin-pesadas", action="store_true", help="Omitir archivos grandes (Guatecompras, precios 2023)")
    p.add_argument("--forzar", action="store_true", help="Volver a descargar aunque ya exista")
    a = p.parse_args()
    if a.paso in ("descargar", "todo"):
        for r in descargar_todo(a.solo, incluir_pesadas=not a.sin_pesadas, forzar=a.forzar):
            print(r.get("id"), r.get("bytes", ""), r.get("error", "ok"))
    if a.paso in ("procesar", "todo"):
        print(procesar_todo(a.solo))
    if a.paso in ("cargar", "todo"):
        print(cargar_todo(a.solo))


if __name__ == "__main__":
    main()
