"""Graba el video demostrativo (2 a 3 minutos) sin abrir ventanas: Edge headless + narración + subtítulos.

Requiere Nexo corriendo (por defecto en http://127.0.0.1:8011, variable NEXO_URL), las cuentas de demostración en
var/credenciales-demo.txt, los audios de voz/ (ver guion.json) y ffmpeg. Después: python montar.py
"""

import base64
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import fitz  # PyMuPDF
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
B = os.environ.get("NEXO_URL", "http://127.0.0.1:8011")
G = json.loads((AQUI / "guion.json").read_text(encoding="utf-8"))
CRED = {p[0]: (p[1], p[2]) for p in (l.split() for l in (RAIZ / "var/credenciales-demo.txt").read_text(encoding="utf-8", errors="ignore").splitlines()) if len(p) == 3}
TMP = AQUI / "_tmp"
shutil.rmtree(TMP, ignore_errors=True)
TMP.mkdir()

# Láminas de la presentación como imágenes a 1920 x 1080.
pdf = fitz.open(RAIZ / "entregables/01-presentacion-Nexo.pdf")
LAMINA = {}
for n in (0, 1, 10):
    pix = pdf[n].get_pixmap(matrix=fitz.Matrix(1920 / pdf[n].rect.width, 1920 / pdf[n].rect.width))
    LAMINA[n] = base64.b64encode(pix.tobytes("png")).decode()


def lamina(pg, n):
    pg.set_content(f'<body style="margin:0;background:#004080"><img style="width:1920px;height:1080px;display:block" src="data:image/png;base64,{LAMINA[n]}"></body>')


def entrar(ctx, pg, rol):
    ctx.request.post(f"{B}/api/auth/logout", fail_on_status_code=False)
    r = ctx.request.post(f"{B}/api/auth/login", data={"email": CRED[rol][0], "password": CRED[rol][1]})
    assert r.ok, r.text()


def ir(pg, ruta, espera=1800):
    pg.goto(B + ruta)
    pg.wait_for_timeout(espera)
    if pg.get_by_text("Explorar por mi cuenta").count():
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
    pg.add_style_tag(content=".avisos{display:none!important}")


def desplazar(pg, y, pasos=12):
    for _ in range(pasos):
        pg.mouse.wheel(0, y / pasos)
        pg.wait_for_timeout(40)


def escribir(pg, selector, texto):
    pg.locator(selector).first.click()
    pg.keyboard.type(texto, delay=55)


ESCENAS = {
    "01-portada": lambda ctx, pg: lamina(pg, 0),
    "02-problema": lambda ctx, pg: lamina(pg, 1),
    "03-centro": lambda ctx, pg: (entrar(ctx, pg, "analista_dpir"), ir(pg, "/"), pg.wait_for_timeout(3500),
                                  pg.get_by_text("Completa", exact=True).first.click(), pg.wait_for_timeout(2500),
                                  pg.get_by_text("Resumen", exact=True).first.click()),
    "04-investigar": lambda ctx, pg: (ir(pg, "/precios/3"), pg.get_by_text("Completa", exact=True).first.click(), pg.wait_for_timeout(900),
                                      pg.get_by_role("button", name="Investigar").first.click(),
                                      pg.wait_for_timeout(3000), desplazar(pg, 500)),
    "05-entregada": lambda ctx, pg: (ir(pg, "/precios/5"), pg.get_by_text("Resumen", exact=True).first.click(), pg.wait_for_timeout(5000),
                                     desplazar(pg, 350)),
    "06-alertas": lambda ctx, pg: (entrar(ctx, pg, "analista_diec"), ir(pg, "/indices/alertas", 2500), pg.wait_for_timeout(4000), desplazar(pg, 450)),
    "07-recoleccion": lambda ctx, pg: (ir(pg, "/recoleccion", 2200), desplazar(pg, 520), pg.wait_for_timeout(600),
                                       pg.locator("select").nth(0).select_option(index=3), pg.wait_for_timeout(500),
                                       pg.locator("select").nth(1).select_option(label="Maíz blanco · Quintal"), pg.wait_for_timeout(500),
                                       escribir(pg, "input[type=number]", "315"), pg.wait_for_timeout(400),
                                       pg.get_by_role("button", name="Guardar precio").click(), pg.wait_for_timeout(1200),
                                       desplazar(pg, 220)),
    "08-campo": lambda ctx, pg: (ir(pg, "/campo", 600), pg.locator(".campo-lista li").first.wait_for(timeout=30000), escribir(pg, ".campo-buscar input", "frijol"), pg.wait_for_timeout(500),
                                 pg.locator(".campo-lista button").first.click()),
    "09-codificador": lambda ctx, pg: (entrar(ctx, pg, "analista_dce"), ir(pg, "/calidad", 2000),
                                       pg.get_by_text("Codificar respuestas abiertas").first.scroll_into_view_if_needed(), pg.wait_for_timeout(700),
                                       pg.get_by_role("button", name="Codificar").click(), pg.wait_for_timeout(1200), desplazar(pg, 420)),
    "10-tablero": lambda ctx, pg: (ir(pg, "/tableros"), escribir(pg, "input[type=text], input:not([type])", "IPC de Quetzaltenango"),
                                   pg.keyboard.press("Enter"), pg.wait_for_timeout(3500), desplazar(pg, 420)),
    "11-territorio": lambda ctx, pg: (ir(pg, "/territorio", 3500), pg.wait_for_timeout(1500), desplazar(pg, 400)),
    "12-abierto": lambda ctx, pg: (ir(pg, "/abierto/precios?q=computadora%20portatil", 800), pg.get_by_text("En pocas palabras").first.wait_for(timeout=30000),
                                   pg.wait_for_timeout(2500), desplazar(pg, 380)),
    "13-ficha": lambda ctx, pg: (ir(pg, "/abierto/municipios/0901", 2500), desplazar(pg, 520)),
    "14-confianza": lambda ctx, pg: (ir(pg, "/datos", 2500), pg.wait_for_timeout(2500), desplazar(pg, 450)),
    "15-jurado": lambda ctx, pg: (entrar(ctx, pg, "jurado"), ir(pg, "/jurado", 600), pg.get_by_text("Funcionalidad").first.wait_for(timeout=60000),
                                  pg.wait_for_timeout(800), desplazar(pg, 300)),
    "16-cierre": lambda ctx, pg: lamina(pg, 10),
}

marcas = []
with sync_playwright() as p:
    nav = p.chromium.launch(channel="msedge", headless=True, args=["--lang=es-GT", "--mute-audio", "--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"])
    ctx = nav.new_context(viewport={"width": 1920, "height": 1080}, locale="es-GT", record_video_dir=str(TMP),
                          record_video_size={"width": 1920, "height": 1080})
    # Sin la bienvenida de primera vez (es para personas nuevas, no para el video).
    ctx.add_init_script("try { for (let i = 1; i < 300; i++) localStorage.setItem('nexo:bienvenida:' + i, 'vista'); } catch (e) {}")
    # Calentar las cachés del servidor para que nada aparezca cargando en el video.
    for rol, ruta in (("analista_diec", "/api/publico/catalogo-campo"), ("jurado", "/api/jurado/evidencia"),
                      ("analista_dpir", "/api/publico/precios?q=computadora%20portatil")):
        entrar(ctx, None, rol)
        ctx.request.get(B + ruta, timeout=60000)
    pg = ctx.new_page()
    pg.goto("about:blank")
    pg.wait_for_timeout(1500)  # cuadros en blanco antes de la portada: marca de sincronía para montar.py
    t_inicio = time.monotonic()
    for e in G:
        t0 = time.monotonic() - t_inicio
        ESCENAS[e["id"]](ctx, pg)
        resto = e["dur"] + 0.8 - (time.monotonic() - t_inicio - t0)
        if resto > 0:
            pg.wait_for_timeout(int(resto * 1000))
        marcas.append({"id": e["id"], "inicio": t0, "fin": time.monotonic() - t_inicio, "texto": e["texto"], "dur": e["dur"]})
        print(f"{e['id']}: {t0:6.1f}s -> {marcas[-1]['fin']:6.1f}s")
    video = pg.video.path()
    ctx.close()
    nav.close()
(TMP / "marcas.json").write_text(json.dumps(marcas, ensure_ascii=False, indent=1), encoding="utf-8")
print("video crudo:", video)
