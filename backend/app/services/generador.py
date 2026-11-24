"""Generador de tableros a partir de una petición en español.

Es determinista y transparente: identifica fuente, medida, dimensión y filtros con un vocabulario
controlado sobre la capa semántica, y devuelve también la interpretación para que la persona la
pueda corregir. No inventa cifras: cada widget es una consulta reproducible a datos oficiales.
"""

from __future__ import annotations

import re

from ..texto import DEPARTAMENTOS, departamento_canonico, fichas, normalizar
from .semantica import FUENTES

# Regionalización oficial (Decreto 70-86), usada también por el IPC regional del INE.
REGION_DE = {
    "Guatemala": "Región I · Metropolitana", "Alta Verapaz": "Región II · Norte", "Baja Verapaz": "Región II · Norte",
    "El Progreso": "Región III · Nororiente", "Izabal": "Región III · Nororiente", "Zacapa": "Región III · Nororiente",
    "Chiquimula": "Región III · Nororiente", "Santa Rosa": "Región IV · Suroriente", "Jalapa": "Región IV · Suroriente",
    "Jutiapa": "Región IV · Suroriente", "Sacatepéquez": "Región V · Central", "Chimaltenango": "Región V · Central",
    "Escuintla": "Región V · Central", "Sololá": "Región VI · Suroccidente", "Totonicapán": "Región VI · Suroccidente",
    "Quetzaltenango": "Región VI · Suroccidente", "Suchitepéquez": "Región VI · Suroccidente",
    "Retalhuleu": "Región VI · Suroccidente", "San Marcos": "Región VI · Suroccidente",
    "Huehuetenango": "Región VII · Noroccidente", "Quiché": "Región VII · Noroccidente", "Petén": "Región VIII · Petén",
}
PALABRAS_PRECIO = r"\b(precio|precios|cuesta|cuestan|vale|valen|costo|compra|compras|comprar|pagan|pago)\b"

PALABRAS_CLAVE = {
    "precio", "precios", "costo", "costos", "cuesta", "cuestan", "vale", "valen", "compra", "compras", "comprar",
    "mediana", "mediano", "promedio", "media", "total", "monto", "gasto", "cantidad", "numero", "cuantas", "cuantos",
    "departamento", "departamentos", "municipio", "municipios", "mes", "meses", "mensual", "ano", "anos", "anual",
    "tiempo", "evolucion", "tendencia", "historico", "historia", "entidad", "entidades", "institucion", "ministerio",
    "modalidad", "categoria", "categorias", "region", "regiones", "division", "divisiones", "articulo", "articulos",
    "producto", "productos", "area", "urbana", "rural", "urbano", "severidad", "estado", "por", "desde", "hasta",
    "grafica", "grafico", "tablero", "comparar", "compara", "comparacion", "variacion", "variaciones", "inflacion",
    "interanual", "indice", "indices", "ipc", "ipmc", "cba", "canasta", "basica", "alimentaria", "poblacion",
    "habitantes", "censo", "proyeccion", "proyecciones", "proyectada", "lugares", "poblados", "aldeas", "caserios",
    "mujeres", "hombres", "alertas", "atipicos", "guatecompras", "publicas", "publica", "referencia", "ine",
    "construccion", "materiales", "recolectados", "informantes", "adjudicaciones", "contrataciones", "unitario",
    "ultimos", "ultimo", "durante", "cada", "segun", "nivel", "nacional", "guatemala", "pais", "rubro", "rubros",
}

UNSPSC_RUIDO = {"de", "para", "con", "y", "tipo", "marca"}


def _anios(texto: str) -> dict:
    """«desde 2022» → desde; «hasta 2030» → hasta; «en 2025» o un año suelto → ese año; dos años → rango."""
    filtros: dict = {}
    anios = [int(a) for a in re.findall(r"\b(20[0-3]\d|19[89]\d)\b", texto)]
    desde = re.search(r"\bdesde (?:el )?(?:ano )?(\d{4})", texto)
    hasta = re.search(r"\b(?:hasta|al|a) (?:el )?(?:ano )?(\d{4})", texto)
    if desde:
        filtros["desde_anio"] = int(desde.group(1))
    if hasta:
        filtros["hasta_anio"] = int(hasta.group(1))
    if not desde and not hasta:
        if len(anios) == 1:
            filtros["anio"] = anios[0]
        elif len(anios) >= 2:
            filtros["desde_anio"], filtros["hasta_anio"] = min(anios), max(anios)
    return filtros


def _puntuar_fuentes(t: str) -> dict[str, int]:
    puntos = {f: 0 for f in FUENTES}
    for fid, f in FUENTES.items():
        for s in f.sinonimos:
            if s in t:
                puntos[fid] += 3 if " " in s else 2
    if re.search(r"precio de referencia|precios de referencia", t):
        puntos["precios_referencia"] += 5
    if re.search(r"\b(precio|precios|cuesta|cuestan|vale|costo)\b", t) and not puntos["ipc"] and not puntos["cba"]:
        puntos["compras"] += 2
        if not re.search(r"\b(indice|indices|ipmc)\b", t):  # «precio de cemento» es un precio, no el índice IPMC
            puntos["compras"] += 2
            puntos["ipmc"] = max(0, puntos["ipmc"] - 2)
    if re.search(r"\b(proyecci|2030|futur)", t):
        puntos["proyecciones"] += 3
    if re.search(r"\b(inflacion|ipc|interanual)\b", t):
        puntos["ipc"] += 3
    puntos["solicitudes"] = puntos["ejecuciones"] = puntos["bitacora"] = 0  # fuentes operativas: no por texto libre
    return puntos


def _dimension(t: str, fuente: str) -> str | None:
    temporal = {"ipc": "periodo", "ipmc": "periodo", "cba": "periodo", "precios_ipc": "periodo",
                "proyecciones": "anio", "compras": "mes", "precios_referencia": "mes", "alertas": "periodo_texto"}
    reglas = [
        (r"por departamento|por departamentos|cada departamento|segun departamento", "departamento"),
        (r"por municipio|por municipios|cada municipio", "municipio"),
        (r"por entidad|por entidades|por institucion|por ministerio|que entidades", "entidad"),
        (r"por modalidad", "modalidad"),
        (r"por categoria", "categoria"),
        (r"por articulo|por producto|por articulos|por productos", "articulo"),
        (r"por area|urbana y rural|urbano y rural", "area"),
        (r"por severidad", "severidad"),
        (r"por estado", "estado"),
        (r"por ano|por anos|anual", "anio"),
        (r"por mes|mensual|en el tiempo|evolucion|tendencia|historic|ultimos meses|a lo largo", "__tiempo"),
    ]
    for patron, dim in reglas:
        if re.search(patron, t):
            if dim == "__tiempo":
                return temporal.get(fuente)
            if dim == "articulo" and fuente == "hba":
                return "producto"
            if dim in FUENTES[fuente].dimensiones:
                return dim
    defecto = {"ipc": "periodo", "ipmc": "periodo", "cba": "periodo", "poblacion": "departamento",
               "proyecciones": "anio", "alertas": "departamento", "hba": "producto", "precios_ipc": "departamento"}
    return defecto.get(fuente)


def _medida(t: str, fuente: str, hay_texto: bool) -> str:
    cuenta = re.search(r"\b(cuantas|cuantos|numero de|cantidad de|conteo)\b", t)
    if fuente in ("compras", "precios_referencia"):
        if cuenta:
            return "conteo"
        if re.search(r"\b(monto|gasto|total)\b", t) and fuente == "compras":
            return "monto_total"
        if re.search(r"\b(promedio|media)\b", t):
            return "precio_promedio"
        return "precio_mediano" if hay_texto or re.search(r"\b(precio|cuesta|vale|costo)\b", t) else "conteo"
    if fuente == "ipc":
        return "variacion" if re.search(r"variacion|inflacion|interanual|mensual", t) else "indice"
    if fuente in ("poblacion", "proyecciones"):
        if "mujeres" in t:
            return "mujeres"
        if "hombres" in t:
            return "hombres"
        if fuente == "poblacion" and re.search(r"lugares|aldeas|caserios|cuantos lugares", t):
            return "lugares"
        return "poblacion"
    if fuente == "precios_ipc":
        if "informantes" in t:
            return "informantes"
        return "precio_mediano" if hay_texto else "conteo"
    if fuente == "hba":
        for m in FUENTES["hba"].medidas:
            if normalizar(m) in t:
                return m
        return "Alimentos"
    return next(iter(FUENTES[fuente].medidas))


def _tipo_grafica(dimension: str | None, fuente: str) -> str:
    if dimension is None:
        return "kpi"
    if dimension in ("periodo", "mes", "anio", "dia", "periodo_texto", "mes_creacion"):
        return "linea"
    if dimension in ("area", "severidad", "estado", "categoria") or (fuente == "compras" and dimension == "modalidad"):
        return "dona"
    if dimension in ("departamento",):
        return "barras"
    return "barras_h"


def generar(peticion: str, permisos: set[str]) -> dict:
    t = normalizar(peticion)
    if len(t) < 3:
        raise ValueError("Describe qué quieres ver, por ejemplo: «precio de laptops por mes en 2025».")
    puntos = _puntuar_fuentes(t)
    candidatas = [f for f, p in sorted(puntos.items(), key=lambda x: -x[1]) if FUENTES[f].permiso in permisos]
    if not candidatas:
        raise ValueError("No tienes acceso a fuentes de datos para generar tableros.")
    if puntos[candidatas[0]] > 0:
        fuente_id = candidatas[0]
    elif re.search(PALABRAS_PRECIO, t) and "compras" in candidatas:
        fuente_id = "compras"
    else:  # umbral de confianza: mejor decir que no se sabe que responder otra pregunta
        raise ValueError("No encontré datos oficiales para responder esa pregunta. Prueba con temas como precios de "
                         "compras públicas, IPC, canasta básica, población, materiales de construcción o alertas de precios.")
    fuente = FUENTES[fuente_id]

    filtros: dict = _anios(t)
    deptos = [d for d in DEPARTAMENTOS if re.search(rf"\b{re.escape(normalizar(d))}\b", t)]
    interpretacion = [{"tipo": "Fuente", "valor": fuente.titulo}]
    avisos_previos: list[str] = []
    if deptos and "departamento" in fuente.filtros and not re.search(r"por departamento", t):
        filtros["departamento"] = departamento_canonico(deptos[0])
    elif deptos and fuente_id == "ipc":
        region = REGION_DE.get(departamento_canonico(deptos[0]) or "", "")
        avisos_previos.append(f"El INE no publica el IPC por departamento. Se muestra el IPC de la {region}, a la que "
                              f"pertenece {departamento_canonico(deptos[0])}.")
    elif deptos and "departamento" not in fuente.filtros:
        avisos_previos.append(f"Esta fuente no se publica por departamento: se muestra el total nacional "
                              f"(se ignoró «{deptos[0]}»).")
    if fuente_id in ("poblacion",) and re.search(r"\burbana\b|\burbano\b", t) and "por area" not in t:
        filtros["area"] = "Urbana"
    elif fuente_id in ("poblacion",) and re.search(r"\brural\b", t) and "por area" not in t:
        filtros["area"] = "Rural"
    if fuente_id == "cba" and re.search(r"\brural\b", t) and not re.search(r"\burban", t):
        filtros["ambito"] = "rural"
    elif fuente_id == "cba" and re.search(r"\burban", t) and not re.search(r"\brural\b", t):
        filtros["ambito"] = "urbana"

    usados = {normalizar(d) for d in deptos} | {str(v) for v in filtros.values()}
    resto = [p for p in fichas(t) if p not in PALABRAS_CLAVE and p not in usados and not p.isdigit()
             and not any(p in normalizar(d).split() for d in deptos)]
    hay_texto = bool(resto) and "texto" in fuente.filtros and fuente_id not in ("ipc", "cba", "proyecciones")
    if hay_texto:
        filtros["texto"] = " ".join(resto[:6])
        interpretacion.append({"tipo": "Busca", "valor": filtros["texto"]})

    medida = _medida(t, fuente_id, hay_texto)
    dimension = _dimension(t, fuente_id)
    serie = None
    if fuente_id == "ipc":
        region_depto = REGION_DE.get(departamento_canonico(deptos[0]) or "") if deptos else None
        if region_depto:
            filtros["ambito"], filtros["clave"], medida = "region", region_depto, "indice"
            interpretacion.append({"tipo": "Región", "valor": region_depto})
        elif re.search(r"region", t):
            filtros["ambito"], serie, medida = "region", "clave", "indice"
        elif re.search(r"division|rubro|gasto", t):
            filtros["ambito"], serie, medida = "division", "clave", "indice"
        elif medida == "variacion":
            filtros["ambito"] = "republica_var"
            filtros["clave"] = "Variación mensual" if re.search(r"\bmensual\b", t) else "Variación interanual"
        else:
            filtros["ambito"] = "republica"
        filtros.setdefault("desde_anio", 2020)
    if fuente_id == "cba" and "ambito" not in filtros and dimension:
        serie = "ambito"
    if fuente_id == "ipmc" and dimension == "periodo":
        serie = "clave"
        if "texto" not in filtros:
            filtros["texto"] = "cemento gris"
            interpretacion.append({"tipo": "Busca", "valor": "cemento gris (ejemplo; escribe el material)"})

    m = fuente.medidas[medida]
    interpretacion.append({"tipo": "Medida", "valor": m.etiqueta})
    if dimension:
        interpretacion.append({"tipo": "Agrupa por", "valor": fuente.dimensiones[dimension]})
    for k, v in filtros.items():
        if k not in ("texto", "ambito", "clave"):
            etiqueta = {"desde_anio": "Desde", "hasta_anio": "Hasta", "anio": "Año"}.get(k, k.capitalize())
            interpretacion.append({"tipo": etiqueta, "valor": str(v)})

    consulta = {"fuente": fuente_id, "medida": medida, "filtros": filtros}
    titulo_base = m.etiqueta + (f" de «{filtros['texto']}»" if hay_texto else "")
    widgets = [{"id": "kpi", "tipo": "kpi", "titulo": titulo_base, "ancho": 4,
                "consulta": {**consulta, "dimension": None}}]
    if dimension:
        widgets.append({"id": "principal", "tipo": _tipo_grafica(dimension, fuente_id),
                        "titulo": f"{titulo_base} por {fuente.dimensiones[dimension].lower()}", "ancho": 8,
                        "consulta": {**consulta, "dimension": dimension, **({"serie": serie} if serie else {})}})
    if fuente_id == "compras" and dimension != "departamento" and hay_texto:
        widgets.append({"id": "depto", "tipo": "barras", "titulo": f"{titulo_base} por departamento de la entidad",
                        "ancho": 6, "consulta": {**consulta, "dimension": "departamento"}})
        widgets.append({"id": "entidades", "tipo": "barras_h", "titulo": "Entidades que más compran", "ancho": 6,
                        "consulta": {**consulta, "medida": "conteo", "dimension": "entidad", "limite": 10}})
    widgets.append({"id": "tabla", "tipo": "tabla", "titulo": "Datos del gráfico", "ancho": 12,
                    "consulta": widgets[-1]["consulta"]})
    advertencias = avisos_previos + list(fuente.notas)
    if fuente_id == "compras":
        advertencias.append("El departamento es la sede de la entidad compradora (cerca del 79 % está en Guatemala), "
                            "no el lugar de entrega.")
    if hay_texto and fuente_id in ("compras", "precios_referencia"):
        advertencias.append("La búsqueda es por palabras en la descripción: revisa que los artículos sean comparables "
                            "(misma unidad y especificaciones) antes de usar la cifra.")
    return {"titulo": titulo_base[:1].upper() + titulo_base[1:], "peticion": peticion[:300], "widgets": widgets,
            "interpretacion": interpretacion, "advertencias": advertencias}


EJEMPLOS = [
    "Precio de computadoras portátiles por mes en 2025",
    "Inflación interanual desde 2022",
    "IPC por región",
    "Costo de la canasta básica urbana y rural",
    "Población por departamento",
    "Población proyectada de Quetzaltenango hasta 2030",
    "Precio de cemento gris en Guatecompras por mes",
    "IPC de Quetzaltenango",
    "Alertas de precios por severidad",
    "IPMC de hierro corrugado",
]
