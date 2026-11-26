"""Exporta presentacion.html a entregables/01-presentacion-Nexo.pdf con Chromium sin ventana (Playwright).

Uso:  python generar_pdf.py        (requiere `pip install playwright` y Edge o Chrome instalados)
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI.parents[1] / "entregables" / "01-presentacion-Nexo.pdf"

with sync_playwright() as p:
    for canal in ("msedge", "chrome", None):
        try:
            nav = p.chromium.launch(channel=canal, headless=True) if canal else p.chromium.launch(headless=True)
            break
        except Exception:  # noqa: BLE001 - se prueba el siguiente navegador disponible
            continue
    pagina = nav.new_page(viewport={"width": 1920, "height": 1080})
    pagina.goto((AQUI / "presentacion.html").as_uri())
    pagina.evaluate("document.fonts.ready")
    pagina.wait_for_timeout(500)
    pagina.pdf(path=str(SALIDA), width="1920px", height="1080px", print_background=True,
               prefer_css_page_size=True)
    nav.close()
print("Listo:", SALIDA)
