"""Genera entregables/03-secuencia-del-trabajo.md: qué hizo el equipo cada día, con el historial de commits como evidencia.

Uso (desde la raíz del repositorio):  python scripts/secuencia.py
"""

from __future__ import annotations

import subprocess
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "entregables" / "03-secuencia-del-trabajo.md"

DIAS = {
    "23-11-2026": ("Lunes 23 de noviembre: apertura y base de la plataforma",
                   "Por la mañana, en las oficinas del INE, las Direcciones presentaron sus retos (DCE, DIEC con DESA y DCR, y DPIR) "
                   "y el equipo eligió el tema: unir esos procesos en una sola plataforma. Por la noche se creó el repositorio "
                   "(día 1) y se construyó la base: modelo de datos, seguridad, descarga reproducible de 26 fuentes con su huella "
                   "SHA-256, capa semántica con secreto estadístico, alertas Hidiroglou-Berthelot, los routers de todos los módulos, "
                   "el frontend con la identidad del INE y la documentación."),
    "24-11-2026": ("Martes 24 de noviembre: rigor, secreto estadístico y Nexo Abierto",
                   "Correcciones de las revisiones de seguridad y de rigor (supresión de celdas y conteos, TI sin códigos de "
                   "informante, Hidiroglou-Berthelot sin sesgo), rediseño formal con lenguaje institucional, despliegue con Docker y "
                   "PostgreSQL. Por la tarde: Nexo Abierto sin cuenta, vistas Resumen y Completa en cada pantalla, «Cómo leer esta "
                   "pantalla» y recorridos guiados."),
    "25-11-2026": ("Miércoles 25 de noviembre: propuestas pendientes de las Direcciones y entregables",
                   "Instalación en Windows verificada desde cero, solicitud de precio de referencia recorrida de punta a punta, "
                   "Recolección de precios del IPP, IPMC e ICC con alertas al capturar (DIEC), catálogo de campo instalable en el "
                   "teléfono que funciona sin internet (DIEC), codificador CIUO-08 de respuestas abiertas (DCE), mapa municipal, "
                   "presentación en PDF, video demostrativo y esta carpeta de entregables."),
    "26-11-2026": ("Jueves 26 de noviembre: entrega",
                   "Entrega de los proyectos a las 09:00, por el medio que indicó el INE."),
}


def main() -> None:
    log = subprocess.check_output(
        ["git", "log", "--reverse", "--date=format:%d-%m-%Y|%H:%M", "--format=%ad|%an|%s"], cwd=RAIZ, text=True, encoding="utf-8")
    por_dia: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for linea in log.strip().splitlines():
        dia, hora, autor, mensaje = linea.split("|", 3)
        por_dia[dia].append((hora, autor, mensaje))
    total = sum(len(v) for v in por_dia.values())
    partes = [
        "# Secuencia del trabajo, día por día",
        "",
        "Nexo · Datatón INE 2026, Categoría 2. Equipo: Josue David Sajche Boror, Jeferson Andre Cano López, "
        "Angel David Siliezar López y Ricardo Javier González Corado.",
        "",
        f"El repositorio se creó el 23 de noviembre de 2026 a las 22:09 (día 1) y tiene {total} commits. Cada fila de las tablas es "
        "un commit del historial de Git (hora de Guatemala): es la evidencia del trabajo realizado durante el evento. "
        "Este documento se genera con `python scripts/secuencia.py`.",
        "",
        "## Orden de los entregables",
        "",
        "1. [Repositorio](https://github.com/Astral910/nexo-ine), con el README (problema, arquitectura, instalación, datos, "
        "limitaciones, uso de IA).",
        "2. [Presentación en PDF](01-presentacion-Nexo.pdf) para la exposición de 7 minutos.",
        "3. [Video demostrativo](02-video-demostrativo.mp4), respaldo en caso de fallas durante la demostración en vivo.",
        "4. Esta secuencia del trabajo.",
        "5. [Matriz de cumplimiento de los lineamientos y la rúbrica](../docs/CUMPLIMIENTO.md).",
        "",
    ]
    for dia in sorted(set(DIAS) | set(por_dia), key=lambda d: tuple(reversed(d.split("-")))):
        titulo, resumen = DIAS.get(dia, (dia, ""))
        commits = por_dia.get(dia, [])
        partes += [f"## {titulo}", "", resumen, ""]
        if commits:
            partes += ["| Hora | Autor | Qué se hizo |", "|---|---|---|"]
            partes += [f"| {h} | {a} | {m.replace('|', '/')} |" for h, a, m in commits]
            partes.append("")
    SALIDA.write_text("\n".join(partes), encoding="utf-8")
    print("Listo:", SALIDA, f"({total} commits)")


if __name__ == "__main__":
    main()
