"""Capa semántica: catálogo cerrado de fuentes, medidas, dimensiones y filtros.

Toda gráfica de Nexo (tableros por rol, tableros generados desde texto y el centro de mando) pide
datos a través de esta capa. El usuario nunca escribe SQL: solo elige nombres de una lista blanca,
y cada consulta se arma con parámetros. Aquí también se aplica el secreto estadístico (supresión de
celdas con menos de k informantes) y se adjuntan los metadatos que evitan interpretaciones erróneas.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Integer, String, and_, cast, distinct, extract, func, select, true
from sqlalchemy.orm import Session

from ..config import obtener_config
from ..db import ahora, motor
from ..models import (
    AlertaPrecio,
    Bitacora,
    CompraItem,
    Ejecucion,
    HbaProducto,
    LugarPoblado,
    PrecioRecolectado,
    PrecioReferencia,
    ProyeccionPoblacion,
    SerieIndice,
    SolicitudPrecio,
)
from ..texto import departamento_canonico, fichas

LIMITE_FILAS_MEDIANA = 300_000


class ErrorConsulta(ValueError):
    pass


@dataclass
class Medida:
    etiqueta: str
    agregacion: str  # count | sum | avg | median | count_distinct
    columna: str | None = None
    unidad: str = ""
    formato: str = "numero"  # numero | moneda | porcentaje | indice


@dataclass
class Fuente:
    id: str
    titulo: str
    modelo: Any
    cita: str
    permiso: str
    medidas: dict[str, Medida]
    dimensiones: dict[str, str]  # nombre -> etiqueta
    filtros: list[str]
    columna_fecha: str | None = None
    base: dict[str, Any] = field(default_factory=dict)  # filtros fijos
    k_columna: str | None = None  # columna de informante para supresión por secreto estadístico
    k_minimo: int | None = None  # umbral propio (si es más estricto que el general)
    stock: str | None = None  # "anio" o "periodo": la medida no se suma entre periodos
    requiere_producto: bool = False  # los precios solo tienen sentido para un producto concreto
    notas: list[str] = field(default_factory=list)
    sinonimos: list[str] = field(default_factory=list)


def _serie(indicador: str) -> dict:
    return {"indicador": indicador}


FUENTES: dict[str, Fuente] = {
    "ipc": Fuente(
        "ipc", "Índice de Precios al Consumidor (IPC)", SerieIndice,
        "INE, Empalme del IPC base anual 2024=100", "tableros:ver",
        {"indice": Medida("Índice (2024=100)", "avg", "valor", "índice", "indice"),
         "variacion": Medida("Variación (%)", "avg", "valor", "%", "porcentaje")},
        {"periodo": "Mes", "clave": "Serie", "anio": "Año"},
        ["ambito", "clave", "desde_anio", "hasta_anio", "anio", "mes", "texto"], base=_serie("IPC"), stock="periodo",
        notas=["Índice empalmado por el INE a base anual 2024=100."],
        sinonimos=["ipc", "inflacion", "indice de precios al consumidor", "precios al consumidor", "costo de vida"]),
    "ipmc": Fuente(
        "ipmc", "Índice de Precios de Materiales de Construcción (IPMC)", SerieIndice,
        "INE, IPMC mensual por artículo", "tableros:ver",
        {"indice": Medida("Índice", "avg", "valor", "índice", "indice")},
        {"periodo": "Mes", "clave": "Artículo", "anio": "Año"},
        ["clave", "desde_anio", "hasta_anio", "anio", "mes", "texto"], base=_serie("IPMC"), stock="periodo",
        notas=["Índices por artículo tal como los publica el INE; no se calculan agregados sin ponderaciones."],
        sinonimos=["ipmc", "materiales de construccion", "construccion", "cemento", "hierro", "block", "lamina"]),
    "cba": Fuente(
        "cba", "Costo de la Canasta Básica Alimentaria (CBA)", SerieIndice,
        "INE, costo per cápita de la CBA urbana y rural", "tableros:ver",
        {"costo": Medida("Costo mensual per cápita", "avg", "valor", "Q por persona al mes", "moneda")},
        {"periodo": "Mes", "ambito": "Área", "anio": "Año"},
        ["ambito", "desde_anio", "hasta_anio", "anio", "mes"], base=_serie("CBA"), stock="periodo",
        notas=["Costo mensual per cápita en quetzales corrientes."],
        sinonimos=["cba", "canasta basica", "canasta", "costo de la canasta", "alimentaria"]),
    "compras": Fuente(
        "compras", "Compras públicas de un solo artículo (Guatecompras)", CompraItem,
        "Guatecompras OCDS 2025 (CC BY 4.0), cálculo propio de precio unitario", "tableros:ver",
        {"conteo": Medida("Compras", "count", None, "compras"),
         "precio_mediano": Medida("Precio unitario mediano", "median", "precio_unitario", "Q", "moneda"),
         "precio_promedio": Medida("Precio unitario promedio", "avg", "precio_unitario", "Q", "moneda"),
         "monto_total": Medida("Monto adjudicado", "sum", "monto", "Q", "moneda")},
        {"mes": "Mes", "anio": "Año", "departamento": "Departamento de la entidad", "modalidad": "Modalidad",
         "categoria": "Categoría", "entidad": "Entidad compradora", "unspsc": "Código UNSPSC"},
        ["texto", "departamento", "modalidad", "categoria", "anio", "desde_anio", "hasta_anio", "unspsc"],
        columna_fecha="fecha", requiere_producto=True,
        notas=["Precio unitario = monto adjudicado ÷ cantidad, solo en procesos de un artículo y una adjudicación.",
               "Precios nominales: no están ajustados por inflación."],
        sinonimos=["guatecompras", "compras", "compras publicas", "adjudicaciones", "contrataciones", "licitaciones"]),
    "precios_referencia": Fuente(
        "precios_referencia", "Precios de referencia publicados por el INE", PrecioReferencia,
        "INE, Precios de Referencia (junio 2022 y septiembre 2023)", "tableros:ver",
        {"conteo": Medida("Precios de referencia", "count", None, "registros"),
         "precio_mediano": Medida("Precio de referencia mediano", "median", "precio", "Q", "moneda"),
         "precio_promedio": Medida("Precio de referencia promedio", "avg", "precio", "Q", "moneda")},
        {"mes": "Mes de entrega", "anio": "Año", "entidad": "Entidad requirente", "modalidad": "Modalidad",
         "categoria": "Categoría"},
        ["texto", "categoria", "modalidad", "anio", "desde_anio", "hasta_anio"], columna_fecha="fecha",
        requiere_producto=True, notas=["Precios en quetzales a la fecha de entrega de cada precio de referencia."],
        sinonimos=["precios de referencia", "precio de referencia", "dpir", "referencia"]),
    "precios_ipc": Fuente(
        "precios_ipc", "Precios recolectados para el IPC", PrecioRecolectado,
        "INE, Precios recolectados del IPC (julio 2022 y año 2023)", "indices:ver",
        {"conteo": Medida("Observaciones", "count", None, "precios"),
         "informantes": Medida("Informantes distintos", "count_distinct", "cod_fuente", "informantes"),
         "precio_mediano": Medida("Precio mediano", "median", "precio_actual", "Q", "moneda"),
         "relativo_mediano": Medida("Relativo de precio mediano", "median", "relativo", "razón", "indice")},
        {"departamento": "Departamento", "municipio": "Municipio", "articulo": "Artículo", "periodo": "Mes"},
        ["texto", "departamento", "anio", "mes"], k_columna="cod_fuente", k_minimo=5, requiere_producto=True,
        notas=["Celdas con menos de 5 informantes o boletas distintas se suprimen por secreto estadístico (en 2023 "
               "el archivo público no trae código de informante y se usa la boleta, de forma conservadora).",
               "Comparar precios entre artículos distintos no tiene sentido: filtre por un artículo."],
        sinonimos=["precios recolectados", "recoleccion", "informantes", "precios del ipc", "boletas"]),
    "alertas": Fuente(
        "alertas", "Alertas de precios atípicos", AlertaPrecio, "Cálculo propio con el método Hidiroglou-Berthelot",
        "indices:ver",
        {"conteo": Medida("Alertas", "count", None, "alertas")},
        {"departamento": "Departamento", "severidad": "Severidad", "estado": "Estado", "articulo": "Artículo",
         "periodo_texto": "Periodo"},
        ["estado", "severidad", "departamento", "periodo_texto", "texto"],
        sinonimos=["alertas", "atipicos", "outliers", "anomalias", "variaciones atipicas"]),
    "poblacion": Fuente(
        "poblacion", "Población censada por lugar poblado (Censo 2018)", LugarPoblado,
        "INE, XII Censo Nacional de Población 2018 (Cuadro A1.3 y centroides)", "tableros:ver",
        {"poblacion": Medida("Población censada", "sum", "poblacion", "personas"),
         "lugares": Medida("Lugares poblados", "count", None, "lugares poblados"),
         "hombres": Medida("Hombres", "sum", "hombres", "personas"),
         "mujeres": Medida("Mujeres", "sum", "mujeres", "personas")},
        {"departamento": "Departamento", "municipio": "Municipio", "area": "Área"},
        ["departamento", "municipio", "area", "texto"],
        notas=["Población censada en 2018; no incluye ajuste por omisión censal."],
        sinonimos=["poblacion", "censo", "censo 2018", "habitantes", "lugares poblados", "aldeas", "caserios"]),
    "proyecciones": Fuente(
        "proyecciones", "Estimaciones y proyecciones de población 2015-2030", ProyeccionPoblacion,
        "INE, Estimaciones y proyecciones de población por municipio 2015-2030", "tableros:ver",
        {"poblacion": Medida("Población proyectada", "sum", "poblacion", "personas"),
         "hombres": Medida("Hombres", "sum", "hombres", "personas"),
         "mujeres": Medida("Mujeres", "sum", "mujeres", "personas")},
        {"anio": "Año", "departamento": "Departamento", "municipio": "Municipio"},
        ["departamento", "municipio", "desde_anio", "hasta_anio", "anio"], stock="anio",
        notas=["Proyección oficial del INE con base en el Censo 2018."],
        sinonimos=["proyeccion", "proyecciones", "poblacion proyectada", "poblacion futura", "crecimiento poblacional"]),
    "solicitudes": Fuente(
        "solicitudes", "Solicitudes de precios de referencia", SolicitudPrecio, "Nexo (operación)", "dpir:ver",
        {"conteo": Medida("Solicitudes", "count", None, "solicitudes")},
        {"estado": "Etapa", "entidad": "Entidad", "mes_creacion": "Mes"}, ["estado"],
        sinonimos=["solicitudes", "tramites"]),
    "ejecuciones": Fuente(
        "ejecuciones", "Ejecuciones de automatizaciones", Ejecucion, "Nexo (operación)", "automatizaciones:ver",
        {"conteo": Medida("Ejecuciones", "count", None, "ejecuciones")},
        {"estado": "Estado", "dia": "Día"}, ["estado"], sinonimos=["automatizaciones", "ejecuciones"]),
    "bitacora": Fuente(
        "bitacora", "Bitácora de auditoría", Bitacora, "Nexo (auditoría)", "bitacora:ver",
        {"conteo": Medida("Eventos", "count", None, "eventos")},
        {"accion": "Acción", "modulo": "Módulo", "resultado": "Resultado", "dia": "Día"},
        ["resultado", "modulo"], sinonimos=["bitacora", "auditoria", "eventos"]),
    "hba": Fuente(
        "hba", "Hoja de Balance de Alimentos 2024", HbaProducto, "INE, Hoja de Balance de Alimentos 2024",
        "tableros:ver",
        {c: Medida(c, "sum_json", c, "toneladas métricas") for c in (
            "Producción", "Importaciones", "Exportaciones", "Alimentos", "Piensos", "Pérdida",
            "Elaboración de alimentos", "Usos industriales", "Semillas")},
        {"producto": "Producto", "grupo": "Grupo"}, ["grupo", "texto"],
        notas=["Cantidades en toneladas métricas, año 2024."],
        sinonimos=["hba", "balance de alimentos", "hoja de balance", "produccion de alimentos", "importaciones"]),
}


# ---------------------------------------------------------------------------
# Construcción de expresiones
# ---------------------------------------------------------------------------


def _es_sqlite() -> bool:
    return motor.dialect.name == "sqlite"


def _mes_texto(col):
    return func.strftime("%Y-%m", col) if _es_sqlite() else func.to_char(col, "YYYY-MM")


def _dimension(fuente: Fuente, nombre: str):
    m = fuente.modelo
    if nombre == "periodo" and hasattr(m, "anio") and hasattr(m, "mes"):
        return (m.anio * 100 + m.mes).label("x")
    if nombre == "mes" and fuente.columna_fecha:
        return _mes_texto(getattr(m, fuente.columna_fecha)).label("x")
    if nombre == "anio" and fuente.columna_fecha:
        return cast(extract("year", getattr(m, fuente.columna_fecha)), Integer).label("x")
    if nombre == "mes_creacion":
        return _mes_texto(m.creada_en).label("x")
    if nombre == "dia":
        col = m.inicio if m is Ejecucion else m.ts
        return func.date(col).label("x")
    if nombre == "periodo_texto":
        return m.periodo.label("x")
    if nombre in ("ambito", "clave") and m is SerieIndice:
        return getattr(m, nombre).label("x")
    return getattr(m, nombre).label("x")


def _texto_like(columna, texto: str) -> list:
    condiciones = []
    for f in fichas(texto)[:8]:
        f = f.replace("%", "").replace("_", "")
        if f:
            condiciones.append(columna.like(f"%{f}%"))
    return condiciones


def _filtros(fuente: Fuente, filtros: dict[str, Any]) -> list:
    m = fuente.modelo
    conds = [getattr(m, k) == v for k, v in fuente.base.items()]
    for clave, valor in (filtros or {}).items():
        if valor in (None, "", []):
            continue
        if clave not in fuente.filtros:
            raise ErrorConsulta(f"Filtro no permitido para {fuente.id}: {clave}")
        if isinstance(valor, str) and len(valor) > 120:
            raise ErrorConsulta("Filtro demasiado largo.")
        if clave == "texto":
            col = None
            if m in (CompraItem, PrecioReferencia, LugarPoblado):
                col = m.texto_norm
            elif m is PrecioRecolectado:
                col = func.lower(m.articulo)
            elif m is AlertaPrecio:
                col = func.lower(m.articulo)
            elif m is SerieIndice:
                col = func.lower(m.clave)
            elif m is HbaProducto:
                col = func.lower(m.producto)
            if col is not None:
                conds.extend(_texto_like(col, str(valor)))
        elif clave == "departamento":
            depto = departamento_canonico(str(valor)) or str(valor)
            conds.append(m.departamento == depto)
        elif clave in ("desde_anio", "hasta_anio", "anio"):
            anio = int(valor)
            if fuente.columna_fecha:
                col = cast(extract("year", getattr(m, fuente.columna_fecha)), Integer)
            else:
                col = m.anio
            conds.append(col >= anio if clave == "desde_anio" else col <= anio if clave == "hasta_anio" else col == anio)
        elif clave == "mes":
            conds.append(m.mes == int(valor))
        elif clave == "clave" and m is SerieIndice:
            valores = valor if isinstance(valor, list) else [valor]
            conds.append(m.clave.in_([str(v) for v in valores][:12]))
        else:
            col = getattr(m, clave)
            if isinstance(valor, list):
                conds.append(col.in_([str(v) for v in valor][:30]))
            else:
                conds.append(col == (str(valor) if isinstance(col.type, String) else valor))
    return conds


def _formatear_x(fuente: Fuente, dimension: str | None, x):
    if x is None:
        return "Sin dato"
    if dimension == "periodo" and isinstance(x, (int, float)):
        x = int(x)
        return f"{x // 100}-{x % 100:02d}"
    return x


# ---------------------------------------------------------------------------
# Ejecución
# ---------------------------------------------------------------------------


def ejecutar(bd: Session, consulta: dict[str, Any], permisos: set[str] | None = None) -> dict[str, Any]:
    """Ejecuta una consulta de la capa semántica y devuelve filas con metadatos."""
    fid = consulta.get("fuente")
    if fid not in FUENTES:
        raise ErrorConsulta("Fuente desconocida.")
    fuente = FUENTES[fid]
    if permisos is not None and fuente.permiso not in permisos:
        raise ErrorConsulta("No tiene permiso para consultar esta fuente.")
    medida_id = consulta.get("medida") or next(iter(fuente.medidas))
    if medida_id not in fuente.medidas:
        raise ErrorConsulta("Medida no disponible para esta fuente.")
    medida = fuente.medidas[medida_id]
    dimension = consulta.get("dimension") or None
    serie = consulta.get("serie") or None
    for d in (dimension, serie):
        if d and d not in fuente.dimensiones:
            raise ErrorConsulta(f"Dimensión no disponible: {d}")
    por_defecto = 600 if _temporal(dimension) else 22 if dimension == "departamento" else 15  # los 22 departamentos completos
    limite = max(1, min(int(consulta.get("limite") or por_defecto), 600))
    filtros = dict(consulta.get("filtros") or {})
    notas_rigor: list[str] = []
    medidas_precio = medida.agregacion in ("median", "avg") and medida.formato == "moneda"
    if fuente.requiere_producto and medidas_precio and not (filtros.get("texto") or filtros.get("unspsc")):
        raise ErrorConsulta("Para calcular precios indique un producto: promediar bienes distintos no tiene sentido.")
    # Series distintas (regiones, divisiones, artículos, áreas) nunca se promedian entre sí.
    if fuente.modelo is SerieIndice and "clave" not in (dimension, serie) and not (
            isinstance(filtros.get("clave"), str) or (isinstance(filtros.get("clave"), list) and len(filtros["clave"]) == 1)):
        if dimension:
            serie = "clave"
        else:
            dimension = "clave"
        notas_rigor.append("Se separó cada serie para no promediar índices distintos.")
    # Medidas de saldo (población, índices): no se suman entre periodos; sin periodo se usa el último disponible.
    sin_tiempo = dimension not in ("periodo", "anio") and serie not in ("periodo", "anio")
    if fuente.stock and sin_tiempo and ("anio" not in filtros or (fuente.stock == "periodo" and "mes" not in filtros)):
        ultimo = _ultimo_periodo(bd, fuente, filtros)
        if ultimo:
            filtros["anio"] = ultimo[0]
            if fuente.stock == "periodo":
                filtros["mes"] = ultimo[1]
                notas_rigor.append(f"Cifra del último mes publicado: {ultimo[0]}-{ultimo[1]:02d}.")
            else:
                notas_rigor.append(f"Cifra del año {ultimo[0]}.")
    conds = _filtros(fuente, filtros)
    k = max(obtener_config().k_minimo, fuente.k_minimo or 0)

    if medida.agregacion == "sum_json":
        filas = _ejecutar_json(bd, fuente, medida, dimension, conds, limite)
    elif medida.agregacion == "median":
        filas = _ejecutar_mediana(bd, fuente, medida, dimension, serie, conds, limite, k)
    else:
        filas = _ejecutar_sql(bd, fuente, medida, dimension, serie, conds, limite, k, consulta.get("orden"))

    advertencias = notas_rigor + list(fuente.notas)
    suprimidas = sum(1 for f in filas if f.get("suprimido"))
    if suprimidas:
        advertencias.insert(0, f"{suprimidas} celda(s) suprimida(s) por tener menos de {k} informantes.")
    total_n = sum(f.get("n") or 0 for f in filas)  # sin las celdas suprimidas: restar no debe revelarlas
    return {
        "fuente": {"id": fuente.id, "titulo": fuente.titulo, "cita": fuente.cita},
        "medida": {"id": medida_id, "etiqueta": medida.etiqueta, "unidad": medida.unidad, "formato": medida.formato},
        "dimension": {"id": dimension, "etiqueta": fuente.dimensiones.get(dimension, "")} if dimension else None,
        "serie": {"id": serie, "etiqueta": fuente.dimensiones.get(serie, "")} if serie else None,
        "filtros_aplicados": filtros,
        "filas": filas,
        "n_total": total_n,
        "advertencias": advertencias,
        "generado_en": ahora().isoformat(timespec="seconds"),
    }


def _ultimo_periodo(bd: Session, fuente: Fuente, filtros: dict) -> tuple[int, int] | None:
    m = fuente.modelo
    base = {k: v for k, v in filtros.items() if k not in ("mes", "desde_anio", "hasta_anio")}  # con año: su último mes
    conds = _filtros(fuente, base)
    if fuente.stock == "anio":
        from ..db import ahora as _ahora

        anios = [a for (a,) in bd.execute(select(m.anio).where(and_(true(), *conds)).distinct())]
        if not anios:
            return None
        actual = _ahora().year
        return (actual if actual in anios else max(anios), 0)
    fila = bd.execute(select(m.anio, m.mes).where(and_(*conds)).order_by(m.anio.desc(), m.mes.desc()).limit(1)).first()
    return (fila[0], fila[1]) if fila else None


def _temporal(dimension: str | None) -> bool:
    return dimension in ("periodo", "mes", "anio", "dia", "mes_creacion", "periodo_texto")


def _ejecutar_sql(bd, fuente, medida, dimension, serie, conds, limite, k, orden) -> list[dict]:
    m = fuente.modelo
    if medida.agregacion == "count":
        valor = func.count()
    elif medida.agregacion == "count_distinct":
        valor = func.count(distinct(getattr(m, medida.columna)))
    else:
        agg = {"sum": func.sum, "avg": func.avg}[medida.agregacion]
        valor = agg(getattr(m, medida.columna))
    columnas = [valor.label("valor"), func.count().label("n")]
    if fuente.k_columna:
        columnas.append(func.count(distinct(getattr(m, fuente.k_columna))).label("k"))
    grupos = []
    if dimension:
        dx = _dimension(fuente, dimension)
        columnas.insert(0, dx)
        grupos.append(dx)
    if serie:
        sx = _dimension(fuente, serie).element.label("s")
        columnas.insert(1, sx)
        grupos.append(sx)
    q = select(*columnas).where(and_(*conds)) if conds else select(*columnas).select_from(m)
    if grupos:
        q = q.group_by(*grupos)
        if _temporal(dimension):
            q = q.order_by(grupos[0])
        elif orden == "asc":
            q = q.order_by(valor.asc())
        else:
            q = q.order_by(valor.desc())
        if not serie:
            q = q.limit(limite)
    filas = []
    for r in bd.execute(q).mappings():
        n = int(r["n"] or 0)
        suprimido = bool(fuente.k_columna and int(r.get("k") or 0) < k)
        v = r["valor"]
        filas.append({
            "x": _formatear_x(fuente, dimension, r.get("x")) if dimension else "Total",
            "serie": r.get("s") if serie else None,
            "valor": None if suprimido or v is None else round(float(v), 6),
            "n": None if suprimido else n,  # en un conteo, n es la cifra oculta: también se suprime
            "suprimido": suprimido,
        })
    if serie and _temporal(dimension) is False:
        filas = sorted(filas, key=lambda f: -(f["valor"] or 0))[: limite * 8]
    return filas


def _ejecutar_mediana(bd, fuente, medida, dimension, serie, conds, limite, k) -> list[dict]:
    m = fuente.modelo
    col = getattr(m, medida.columna)
    columnas = [col.label("v")]
    if dimension:
        columnas.insert(0, _dimension(fuente, dimension))
    if serie:
        columnas.insert(1, _dimension(fuente, serie).element.label("s"))
    if fuente.k_columna:
        columnas.append(getattr(m, fuente.k_columna).label("kf"))
    q = select(*columnas).where(and_(*conds, col.is_not(None))).limit(LIMITE_FILAS_MEDIANA)
    grupos: dict[tuple, list[float]] = defaultdict(list)
    informantes: dict[tuple, set] = defaultdict(set)
    for r in bd.execute(q).mappings():
        clave = (r.get("x") if dimension else "Total", r.get("s") if serie else None)
        grupos[clave].append(float(r["v"]))
        if fuente.k_columna:
            informantes[clave].add(r["kf"])
    filas = []
    for (x, s), valores in grupos.items():
        suprimido = bool(fuente.k_columna and len(informantes[(x, s)]) < k)
        filas.append({"x": _formatear_x(fuente, dimension, x) if dimension else "Total", "serie": s,
                      "valor": None if suprimido else round(statistics.median(valores), 6),
                      "n": None if suprimido else len(valores), "suprimido": suprimido})
    if _temporal(dimension):
        filas.sort(key=lambda f: str(f["x"]))
    else:
        filas.sort(key=lambda f: -(f["n"] or 0))
        filas = filas[:limite]
    return filas


def _ejecutar_json(bd, fuente, medida, dimension, conds, limite) -> list[dict]:
    m = fuente.modelo
    q = select(m).where(and_(*conds, m.es_grupo.is_(dimension == "grupo"))) if dimension else select(m).where(
        and_(*conds, m.es_grupo.is_(False)))
    acumulado: dict[str, list[float]] = defaultdict(list)
    for p in bd.execute(q).scalars():
        x = p.producto if dimension in (None, "producto", "grupo") else p.grupo
        acumulado[x].append(float((p.valores or {}).get(medida.columna, 0) or 0))
    filas = [{"x": x if dimension else "Total", "serie": None, "valor": round(sum(v), 3), "n": len(v),
              "suprimido": False} for x, v in acumulado.items()]
    if not dimension:
        filas = [{"x": "Total", "serie": None, "valor": round(sum(f["valor"] for f in filas), 3),
                  "n": sum(f["n"] for f in filas), "suprimido": False}]
    filas.sort(key=lambda f: -(f["valor"] or 0))
    return filas[:limite]


def catalogo_publico(permisos: set[str]) -> list[dict]:
    """Lo que la interfaz muestra en el constructor de tableros."""
    return [
        {"id": f.id, "titulo": f.titulo, "cita": f.cita,
         "medidas": [{"id": k, "etiqueta": v.etiqueta, "unidad": v.unidad} for k, v in f.medidas.items()],
         "dimensiones": [{"id": k, "etiqueta": v} for k, v in f.dimensiones.items()],
         "filtros": f.filtros, "notas": f.notas}
        for f in FUENTES.values() if f.permiso in permisos
    ]
