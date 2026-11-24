"""Investigación de mercado y análisis estadístico para precios de referencia (DPIR).

Sigue el criterio que la DPIR presentó en el Datatón:
- Fuentes primarias (cotizaciones del mercado relevante) y secundarias (Guatecompras, bases internas).
- Se recomienda que más del 50 % de las fuentes sean cotizaciones del mercado relevante.
- Se calculan media, mediana y moda; la media cuando los precios son parecidos, la mediana cuando hay
  atípicos y la moda para conocer el precio más frecuente.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import date, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from ..db import ahora
from ..models import CompraItem, Cotizacion, PrecioReferencia, SerieIndice, SolicitudPrecio
from ..texto import fichas

PRIMARIAS = {"cotizacion", "catalogo"}
GUATECOMPRAS_URL = "https://www.guatecompras.gt/concursos/consultaConcurso.aspx?nog={nog}"


# ---------------------------------------------------------------------------
# Ajuste por inflación con el IPC del INE
# ---------------------------------------------------------------------------


class AjusteIPC:
    """Lleva precios de un mes a quetzales del último mes publicado del IPC (República, 2024=100)."""

    def __init__(self, bd: Session):
        filas = bd.execute(select(SerieIndice.anio, SerieIndice.mes, SerieIndice.valor).where(
            SerieIndice.indicador == "IPC", SerieIndice.ambito == "republica")).all()
        self.indice = {(a, m): v for a, m, v in filas}
        self.ultimo = max(self.indice) if self.indice else None

    @property
    def periodo(self) -> str:
        return f"{self.ultimo[0]}-{self.ultimo[1]:02d}" if self.ultimo else ""

    def factor(self, fecha: date | None) -> float | None:
        """Factor de actualización o None si no hay índice para esa fecha (el precio queda sin ajustar)."""
        if not fecha or not self.ultimo:
            return None
        if (fecha.year, fecha.month) > self.ultimo:
            return 1.0  # posterior al último IPC publicado: ya está en quetzales corrientes
        base = self.indice.get((fecha.year, fecha.month))
        return self.indice[self.ultimo] / base if base else None

    def ajustar(self, precio: float, fecha: date | None) -> tuple[float, bool]:
        f = self.factor(fecha)
        return (precio * f, True) if f else (precio, False)


# ---------------------------------------------------------------------------
# Estadísticos
# ---------------------------------------------------------------------------


def _redondeo_relativo(v: float) -> float:
    """Tres cifras significativas: Q4,850 y Q4,849 cuentan igual; Q2.35 y Q2.36 no."""
    if v <= 0:
        return v
    return round(v, 2 - int(math.floor(math.log10(v))))


def moda(valores: list[float]) -> float | None:
    """Precio más repetido (con redondeo relativo). None si ningún precio se repite."""
    if not valores:
        return None
    conteo = Counter(_redondeo_relativo(v) for v in valores)
    valor, veces = conteo.most_common(1)[0]
    return float(valor) if veces > 1 else None


def atipicos_iqr(valores: list[float], k: float = 1.5) -> list[bool]:
    """Regla de Tukey sobre el logaritmo del precio (los precios son asimétricos)."""
    if len(valores) < 5:
        return [False] * len(valores)
    logs = [math.log(v) for v in valores]
    q1, _, q3 = statistics.quantiles(logs, n=4, method="inclusive")
    rango = q3 - q1
    li, ls = q1 - k * rango, q3 + k * rango
    return [x < li or x > ls for x in logs]


def estadisticos(valores: list[float]) -> dict:
    if not valores:
        return {"n": 0}
    n = len(valores)
    media = statistics.fmean(valores)
    desv = statistics.stdev(valores) if n > 1 else 0.0
    ordenados = sorted(valores)
    q1, q2, q3 = statistics.quantiles(ordenados, n=4, method="inclusive") if n >= 4 else (ordenados[0], statistics.median(ordenados), ordenados[-1])
    return {"n": n, "media": round(media, 2), "mediana": round(statistics.median(valores), 2), "moda": moda(valores),
            "minimo": round(ordenados[0], 2), "maximo": round(ordenados[-1], 2), "desviacion": round(desv, 2),
            "cv": round(desv / media * 100, 1) if media else None, "q1": round(q1, 2), "q3": round(q3, 2)}


def recomendar(est: dict, hay_atipicos: bool) -> tuple[str, str]:
    """Elige el estadístico con el criterio de la DPIR (diapositiva «Las 3 juntas: ¿Cuál usar?»)."""
    if est.get("n", 0) == 0:
        return "mediana", "Sin datos suficientes."
    if hay_atipicos or (est.get("cv") or 0) > 25:
        return "mediana", ("Hay precios atípicos o muy dispersos (CV {cv} %): la mediana no se afecta por los "
                           "extremos.").format(cv=est.get("cv"))
    return "media", f"Los precios son parecidos entre sí (CV {est.get('cv')} %): la media usa todos los datos."


# ---------------------------------------------------------------------------
# Investigación automática de fuentes secundarias
# ---------------------------------------------------------------------------


def _condiciones(columna, terminos: str) -> list:
    return [columna.like(f"%{f.replace('%', '').replace('_', '')}%") for f in fichas(terminos)[:8]]


def investigar(bd: Session, terminos: str, unspsc: str | None = None, meses: int = 24, incluir_obras: bool = False,
               limite: int = 400) -> dict:
    """Busca compras comparables en Guatecompras y precios de referencia históricos del INE."""
    conds = _condiciones(CompraItem.texto_norm, terminos)
    if not conds:
        raise ValueError("Escriba al menos una palabra para buscar el producto.")
    ultima = bd.execute(select(func.max(CompraItem.fecha))).scalar() or date.today()
    desde = ultima - timedelta(days=30 * meses)
    conds.append(CompraItem.fecha >= desde)
    if not incluir_obras:
        conds.append(CompraItem.categoria != "works")
    grupos_q = (select(CompraItem.unspsc, CompraItem.unidad, func.count(), func.min(CompraItem.descripcion))
                .where(and_(*conds)).group_by(CompraItem.unspsc, CompraItem.unidad).order_by(func.count().desc()).limit(8))
    grupos = [{"unspsc": u, "unidad": un, "n": n, "ejemplo": ej[:120]} for u, un, n, ej in bd.execute(grupos_q)]
    if unspsc:
        conds.append(CompraItem.unspsc == unspsc)
    compras = bd.execute(select(CompraItem).where(and_(*conds)).order_by(CompraItem.fecha.desc()).limit(limite)).scalars().all()
    ipc = AjusteIPC(bd)
    ajustes = [ipc.ajustar(c.precio_unitario, c.fecha) for c in compras]
    precios_aj = [a for a, _ in ajustes]
    marcas = atipicos_iqr(precios_aj)
    filas = [{"tipo": "guatecompras", "fecha": c.fecha.isoformat() if c.fecha else None, "origen": c.entidad,
              "descripcion": c.descripcion[:300], "unidad": c.unidad, "cantidad": c.cantidad,
              "precio": round(c.precio_unitario, 2), "precio_ajustado": round(pa, 2), "ajustado": aj, "atipico": at,
              "referencia": c.nog, "enlace": GUATECOMPRAS_URL.format(nog=c.nog), "departamento": c.departamento}
             for c, (pa, aj), at in zip(compras, ajustes, marcas, strict=True)]

    pr_conds = _condiciones(PrecioReferencia.texto_norm, terminos)
    referencias = bd.execute(select(PrecioReferencia).where(and_(*pr_conds), PrecioReferencia.precio.is_not(None))
                             .order_by(PrecioReferencia.fecha.desc()).limit(60)).scalars().all()
    filas_pr = [{"tipo": "referencia_ine", "fecha": p.fecha.isoformat() if p.fecha else None,
                 "origen": p.entidad or p.evento, "descripcion": f"{p.producto} — {p.caracteristicas[:200]}",
                 "producto": p.producto, "caracteristicas": p.caracteristicas[:200],
                 "unidad": p.presentacion, "precio": round(p.precio, 2),
                 "precio_ajustado": round(ipc.ajustar(p.precio, p.fecha)[0], 2), "ajustado": ipc.ajustar(p.precio, p.fecha)[1],
                 "referencia": p.nog, "atipico": False} for p in referencias]

    validos = [f["precio_ajustado"] for f in filas if not f["atipico"]]
    est = estadisticos(validos)
    est_todos = estadisticos([f["precio_ajustado"] for f in filas])
    sugerido, razon = recomendar(est_todos, any(marcas))
    return {
        "terminos": terminos, "periodo": {"desde": desde.isoformat(), "hasta": ultima.isoformat()},
        "ajuste_ipc": {"base": "IPC República 2024=100 (INE)", "a_precios_de": ipc.periodo},
        "grupos": grupos, "compras": filas, "referencias_ine": filas_pr,
        "estadisticos": est, "estadisticos_con_atipicos": est_todos,
        "atipicos": sum(marcas), "estadistico_recomendado": sugerido, "razon": razon,
        "precio_sugerido": est.get(sugerido) if est.get("n") else None,
        "sin_ajuste": sum(1 for f in filas if not f["ajustado"]),
        "notas": ["Precio unitario de Guatecompras = monto adjudicado ÷ cantidad (procesos de un solo artículo).",
                  f"Precios llevados a quetzales de {ipc.periodo} con el IPC República del INE.",
                  "Atípicos: regla de Tukey (1.5 × rango intercuartílico) sobre el logaritmo del precio."],
    }


# ---------------------------------------------------------------------------
# Análisis de una solicitud (con las fuentes que el analista incluyó)
# ---------------------------------------------------------------------------


def analizar_solicitud(bd: Session, sol: SolicitudPrecio, justificacion: str | None = None) -> dict:
    cotizaciones = bd.execute(select(Cotizacion).where(Cotizacion.solicitud_id == sol.id)).scalars().all()
    incluidas = [c for c in cotizaciones if c.incluida]
    ipc = AjusteIPC(bd)
    sin_ajuste = 0
    for c in incluidas:
        valor, ajustado = ipc.ajustar(c.precio, c.fecha)
        c.precio_ajustado = round(valor, 2)
        sin_ajuste += 0 if ajustado else 1
    precios = [c.precio_ajustado for c in incluidas]
    marcas = atipicos_iqr(precios)
    for c, m in zip(incluidas, marcas, strict=True):
        c.atipica = m
    bd.commit()
    sin_atipicos = [p for p, m in zip(precios, marcas, strict=True) if not m]
    est = estadisticos(sin_atipicos)
    est_todos = estadisticos(precios)
    estadistico, razon = recomendar(est_todos, any(marcas))
    por_tipo = Counter(c.tipo for c in incluidas)
    primarias = sum(v for k, v in por_tipo.items() if k in PRIMARIAS)
    pct_primarias = round(primarias / len(incluidas) * 100, 1) if incluidas else 0.0
    precio = est.get(estadistico) if est.get("n") else None
    resultado = {
        "calculado_en": ahora().isoformat(timespec="seconds"),
        "fuentes_incluidas": len(incluidas), "fuentes_por_tipo": dict(por_tipo),
        "porcentaje_primarias": pct_primarias,
        "cumple_mercado_relevante": pct_primarias > 50,
        "minimo_fuentes": len(incluidas) >= 5,
        "estadisticos": est, "estadisticos_con_atipicos": est_todos, "atipicos": sum(marcas),
        "estadistico_recomendado": estadistico, "razon": razon,
        "precio_referencia": precio,
        "monto_estimado": round(precio * sol.cantidad, 2) if precio else None,
        "ipc_periodo": ipc.periodo,
        "sin_ajuste": sin_ajuste,
        "justificacion_mercado": (justificacion or (sol.resultado or {}).get("justificacion_mercado") or "").strip()[:1000],
        "advertencias": [],
    }
    if sin_ajuste:
        resultado["advertencias"].append(f"{sin_ajuste} precio(s) sin índice del IPC para su fecha: quedaron sin ajustar.")
    if not resultado["cumple_mercado_relevante"]:
        resultado["advertencias"].append(
            f"Solo {pct_primarias} % de las fuentes son cotizaciones o catálogos del mercado relevante; "
            "la DPIR recomienda más del 50 %.")
    if not resultado["minimo_fuentes"]:
        resultado["advertencias"].append("Se recomiendan al menos 5 fuentes (la DPIR consulta 5 o más proveedores).")
    sol.resultado = resultado
    bd.commit()
    return resultado


def huella_datos(sol: SolicitudPrecio, cotizaciones: list[Cotizacion]) -> str:
    """Huella de los datos usados (no del PDF): fuentes, ajuste por IPC y método."""
    datos = [{"tipo": c.tipo, "precio": c.precio, "ajustado": c.precio_ajustado, "fecha": c.fecha.isoformat() if c.fecha else None,
              "referencia": c.referencia, "incluida": c.incluida, "atipica": c.atipica} for c in cotizaciones]
    r = sol.resultado or {}
    base = {"solicitud": sol.codigo, "fuentes": datos, "ipc_periodo": r.get("ipc_periodo"),
            "estadistico": r.get("estadistico_recomendado"), "metodo": "tukey-log-1.5;dpir-media-mediana-moda"}
    return hashlib.sha256(json.dumps(base, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------------------
# Informe técnico en PDF
# ---------------------------------------------------------------------------


def informe_pdf(sol: SolicitudPrecio, cotizaciones: list[Cotizacion], autor: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    azul, celeste = colors.HexColor("#004080"), colors.HexColor("#0080FF")
    estilos = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=estilos["Heading1"], textColor=azul, fontSize=16, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=estilos["Heading2"], textColor=azul, fontSize=12, spaceBefore=10)
    normal = ParagraphStyle("n", parent=estilos["Normal"], fontSize=9, leading=12)
    pequeno = ParagraphStyle("p", parent=normal, fontSize=7.5, leading=9, textColor=colors.HexColor("#4D4D4D"))
    r = sol.resultado or {}
    est = r.get("estadisticos", {})
    q = lambda v: f"Q{v:,.2f}" if isinstance(v, (int, float)) else "—"  # noqa: E731

    buffer = io.BytesIO()

    def pie(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 46)
        canvas.setFillColor(colors.Color(0, 0.25, 0.5, alpha=0.07))
        canvas.translate(letter[0] / 2, letter[1] / 2)
        canvas.rotate(35)
        canvas.drawCentredString(0, 0, "PROTOTIPO · NO OFICIAL")
        canvas.restoreState()
        canvas.saveState()
        canvas.setFillColor(azul)
        canvas.rect(0, letter[1] - 0.5 * cm, letter[0], 0.5 * cm, fill=1, stroke=0)
        canvas.setFillColor(celeste)
        canvas.rect(0, letter[1] - 0.62 * cm, letter[0], 0.12 * cm, fill=1, stroke=0)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#4D4D4D"))
        canvas.drawString(2 * cm, 1.2 * cm, f"Nexo · prototipo del Datatón INE 2026 · documento de demostración, no oficial · "
                                            f"página {doc.page}")
        canvas.drawRightString(letter[0] - 2 * cm, 1.2 * cm, f"Huella: {(sol.informe_sha256 or '')[:16]}…")
        canvas.restoreState()

    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm,
                            bottomMargin=2 * cm, title=f"Informe {sol.codigo}", author=autor)
    hist = []
    hist.append(Paragraph(f"Informe técnico de precio de referencia · {sol.codigo}", h1))
    hora_gt = (ahora() - timedelta(hours=6)).strftime("%d/%m/%Y %H:%M")
    hist.append(Paragraph(f"Entidad solicitante: <b>{sol.entidad}</b> · Generado: {hora_gt} (hora de Guatemala) · "
                          f"Analista: {autor}", normal))
    hist.append(Spacer(1, 6))
    datos = [["Producto", sol.producto], ["Especificaciones", Paragraph(sol.especificaciones or "—", normal)],
             ["Cantidad", f"{sol.cantidad:,.0f} {sol.unidad}"], ["Modalidad", sol.modalidad or "—"]]
    t = Table(datos, colWidths=[4 * cm, 13 * cm])
    t.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("TEXTCOLOR", (0, 0), (0, -1), azul),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
    hist.append(t)
    hist.append(Paragraph("Resultado", h2))
    res = Table([["Precio de referencia unitario", q(r.get("precio_referencia"))],
                 ["Estadístico usado", Paragraph(f"<b>{r.get('estadistico_recomendado', '—')}</b>: {r.get('razon', '')}", normal)],
                 ["Monto estimado del proceso", q(r.get("monto_estimado"))],
                 ["Precios expresados en quetzales de", r.get("ipc_periodo", "—")]], colWidths=[6 * cm, 11 * cm])
    res.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 9), ("FONT", (1, 0), (1, 0), "Helvetica-Bold", 13),
                             ("TEXTCOLOR", (1, 0), (1, 0), azul), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF3FF")),
                             ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
    hist.append(res)
    hist.append(Paragraph("Estadísticos (sin atípicos)", h2))
    tabla_est = Table([["n", "Media", "Mediana", "Moda", "Mínimo", "Máximo", "CV"],
                       [est.get("n", 0), q(est.get("media")), q(est.get("mediana")), q(est.get("moda")),
                        q(est.get("minimo")), q(est.get("maximo")), f"{est.get('cv', '—')} %"]])
    tabla_est.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 8.5), ("BACKGROUND", (0, 0), (-1, 0), azul),
                                   ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    hist.append(tabla_est)
    hist.append(Paragraph(f"Fuentes incluidas: {r.get('fuentes_incluidas', 0)} · primarias (cotizaciones y catálogos): "
                          f"{r.get('porcentaje_primarias', 0)} % · atípicos excluidos: {r.get('atipicos', 0)}", normal))
    for adv in r.get("advertencias", []):
        hist.append(Paragraph(f"Advertencia: {adv}", normal))
    if r.get("justificacion_mercado") and not r.get("cumple_mercado_relevante"):
        hist.append(Paragraph(f"<b>Justificación del analista</b> (menos de 50 % de cotizaciones del mercado relevante): "
                              f"{r['justificacion_mercado']}", normal))
    hist.append(Paragraph("Fuentes consultadas", h2))
    filas = [["Tipo", "Fecha", "Origen", "Referencia", "Precio", "Ajustado", ""]]
    for c in [c for c in cotizaciones if c.incluida][:40]:
        filas.append([c.tipo.replace("_", " "), c.fecha.isoformat() if c.fecha else "—", Paragraph(c.origen[:60], pequeno),
                      c.referencia[:14], q(c.precio), q(c.precio_ajustado), "atípico" if c.atipica else ""])
    tf = Table(filas, colWidths=[2.4 * cm, 2 * cm, 5.4 * cm, 2.2 * cm, 2 * cm, 2 * cm, 1.4 * cm], repeatRows=1)
    tf.setStyle(TableStyle([("FONT", (0, 0), (-1, -1), "Helvetica", 7.5), ("BACKGROUND", (0, 0), (-1, 0), celeste),
                            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F6FA")])]))
    hist.append(tf)
    hist.append(Paragraph("Metodología", h2))
    for texto in [
        "Proceso de 6 pasos de la DPIR: solicitud, revisión, investigación de mercado, análisis, informe y entrega.",
        "Fuentes secundarias automáticas: compras de un solo artículo en Guatecompras (OCDS, CC BY 4.0) y precios de "
        "referencia históricos publicados por el INE. Fuentes primarias: cotizaciones y catálogos registrados por el analista.",
        "Ajuste por inflación con el Índice de Precios al Consumidor, República, base 2024=100, publicado por el INE.",
        "Atípicos: regla de Tukey (1.5 veces el rango intercuartílico) sobre el logaritmo del precio.",
        "Elección del estadístico según el criterio de la DPIR: media si los precios son parecidos; mediana si hay "
        "atípicos o alta dispersión (CV > 25 %); la moda se reporta como precio más frecuente.",
    ]:
        hist.append(Paragraph(f"• {texto}", normal))
    hist.append(Spacer(1, 8))
    hist.append(Paragraph("Fuentes de los datos: Instituto Nacional de Estadística (INE), Guatemala (precios de referencia e "
                          "Índice de Precios al Consumidor). Guatecompras, Ministerio de Finanzas Públicas, publicado en "
                          "formato OCDS por Open Contracting Partnership (data.open-contracting.org), licencia CC BY 4.0; "
                          "precio unitario calculado por Nexo. Trazabilidad: la huella SHA-256 del pie identifica los datos "
                          "usados; cualquier cambio en las fuentes produce una huella distinta.", pequeno))
    doc.build(hist, onFirstPage=pie, onLaterPages=pie)
    return buffer.getvalue()


def resumen_por_tipo(cotizaciones: list[Cotizacion]) -> dict:
    d: dict[str, int] = defaultdict(int)
    for c in cotizaciones:
        d[c.tipo] += 1
    return dict(d)
