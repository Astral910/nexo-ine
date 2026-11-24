"""Validador de calidad de bases de datos (crítica e inconsistencias, flujo DESA/DCE).

- Procesa el archivo en memoria y nunca lo guarda: solo queda el informe con ejemplos enmascarados.
- Detecta posibles datos personales (CUI/DPI, NIT, teléfonos, correos) para proteger el secreto
  estadístico antes de publicar.
- Aplica las 6 reglas de cuidado de datos que la DCE presentó en el Datatón.
"""

from __future__ import annotations

import csv
import hashlib
import io
import math
import re
import statistics
import zipfile
from collections import Counter

import openpyxl

from ..config import obtener_config

MAX_FILAS = 200_000
MAX_COLUMNAS = 200
CODIGOS_ESPECIALES = {"98", "99", "998", "999", "9998", "9999", "-1", "88", "888"}
ENCABEZADOS_SENSIBLES = re.compile(
    r"(^|_|\s)(nombre|nombres|apellido|apellidos|dpi|cui|nit|telefono|tel|celular|correo|email|e-mail|direccion|"
    r"domicilio|pasaporte|licencia|placa)($|_|\s)", re.I)
RE_CORREO = re.compile(r"^[\w.+-]+@[\w-]+\.[\w.-]+$")
RE_TELEFONO = re.compile(r"^(\+?502[\s-]?)?[2-7]\d{3}[\s-]?\d{4}$")
RE_CUI = re.compile(r"^\d{4}\s?\d{5}\s?\d{4}$")
RE_NIT = re.compile(r"^\d{4,9}-?[\dkK]$")


class ArchivoInvalido(ValueError):
    pass


def nit_valido(texto: str) -> bool:
    t = texto.replace("-", "").upper()
    if not RE_NIT.match(texto) or len(t) < 5:
        return False
    cuerpo, verificador = t[:-1], t[-1]
    suma = sum(int(d) * (i + 2) for i, d in enumerate(reversed(cuerpo)))
    calc = (11 - suma % 11) % 11
    return verificador == ("K" if calc == 10 else str(calc))


def cui_plausible(texto: str) -> bool:
    t = re.sub(r"\s", "", texto)
    if not RE_CUI.match(texto) or len(t) != 13:
        return False
    depto, muni = int(t[9:11]), int(t[11:13])
    return 1 <= depto <= 22 and 1 <= muni <= 40


def enmascarar(v: str) -> str:
    v = str(v)
    if "@" in v:
        usuario, dominio = v.split("@", 1)
        return usuario[:1] + "•••@" + dominio
    if len(v) <= 4:
        return "•" * len(v)
    return v[:2] + "•" * (len(v) - 4) + v[-2:]


def neutralizar(v) -> str:
    """Evita inyección de fórmulas al abrir el reporte en una hoja de cálculo."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def _leer_csv(datos: bytes) -> tuple[list[str], list[list[str]]]:
    for codificacion in ("utf-8-sig", "latin-1"):
        try:
            texto = datos.decode(codificacion)
            break
        except UnicodeDecodeError:
            continue
    muestra = texto[:20000]
    try:
        dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t|")
    except csv.Error:
        dialecto = csv.excel
    lector = csv.reader(io.StringIO(texto), dialecto)
    filas = []
    encabezado = next(lector, [])
    for i, fila in enumerate(lector):
        if i >= MAX_FILAS:
            break
        filas.append(fila[:MAX_COLUMNAS])
    return [str(h).strip() for h in encabezado[:MAX_COLUMNAS]], filas


def _leer_xlsx(datos: bytes) -> tuple[list[str], list[list[str]]]:
    try:
        z = zipfile.ZipFile(io.BytesIO(datos))
    except zipfile.BadZipFile as e:
        raise ArchivoInvalido("El archivo no es un XLSX válido.") from e
    total = sum(i.file_size for i in z.infolist())
    if total > 150 * 1024 * 1024 or total > 120 * max(len(datos), 1):
        raise ArchivoInvalido("El archivo comprimido se expande demasiado (posible bomba zip).")
    if any(i.filename.lower().endswith(".bin") and "vba" in i.filename.lower() for i in z.infolist()):
        raise ArchivoInvalido("El archivo contiene macros; usa .xlsx sin macros.")
    wb = openpyxl.load_workbook(io.BytesIO(datos), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    filas_it = ws.iter_rows(values_only=True)
    encabezado = [("" if h is None else str(h).strip()) for h in next(filas_it, ())][:MAX_COLUMNAS]
    filas = []
    for i, fila in enumerate(filas_it):
        if i >= MAX_FILAS:
            break
        filas.append(["" if v is None else str(v) for v in fila[:MAX_COLUMNAS]])
    wb.close()
    return encabezado, filas


def _numero(v: str) -> float | None:
    try:
        x = float(v.replace(",", "")) if v not in ("", None) else None
        return x if x is None or math.isfinite(x) else None
    except ValueError:
        return None


def validar(nombre: str, datos: bytes) -> dict:
    cfg = obtener_config()
    if len(datos) > cfg.subida_max_mb * 1024 * 1024:
        raise ArchivoInvalido(f"El archivo supera {cfg.subida_max_mb} MB.")
    extension = nombre.lower().rsplit(".", 1)[-1] if "." in nombre else ""
    if extension == "csv":
        encabezado, filas = _leer_csv(datos)
    elif extension == "xlsx":
        encabezado, filas = _leer_xlsx(datos)
    else:
        raise ArchivoInvalido("Solo se aceptan archivos .csv o .xlsx.")
    if not encabezado:
        raise ArchivoInvalido("El archivo está vacío o no tiene encabezado.")
    encabezado = [h or f"columna_{i + 1}" for i, h in enumerate(encabezado)]
    n = len(filas)
    hallazgos: list[dict] = []
    columnas: list[dict] = []
    inconsistencias: list[dict] = []
    datos_personales = False

    for j, col in enumerate(encabezado):
        valores = [(f[j].strip() if j < len(f) and f[j] is not None else "") for f in filas]
        no_vacios = [v for v in valores if v != ""]
        nums = [x for x in (_numero(v) for v in no_vacios) if x is not None]
        es_numerica = bool(no_vacios) and len(nums) >= 0.9 * len(no_vacios)
        info = {"nombre": col, "tipo": "numérica" if es_numerica else "texto", "vacios": n - len(no_vacios),
                "pct_vacios": round((n - len(no_vacios)) / n * 100, 1) if n else 0.0,
                "distintos": len(set(no_vacios))}
        pii = Counter()
        ejemplos: list[str] = []
        for v in no_vacios[:20000]:
            tipo = ("correo" if RE_CORREO.match(v) else "cui" if cui_plausible(v) else
                    "telefono" if RE_TELEFONO.match(v) else "nit" if (not es_numerica or "-" in v) and nit_valido(v) else None)
            if tipo:
                pii[tipo] += 1
                if len(ejemplos) < 3:
                    ejemplos.append(enmascarar(v))
        umbral = max(3, 0.05 * len(no_vacios))
        tipos_pii = [t for t, c in pii.items() if c >= umbral]
        if tipos_pii or ENCABEZADOS_SENSIBLES.search(col):
            datos_personales = True
            hallazgos.append({"severidad": "critica", "columna": col, "regla": "Secreto estadístico",
                              "mensaje": "Posibles datos personales" + (f" ({', '.join(tipos_pii)})" if tipos_pii else
                                                                        " por el nombre de la columna") + ".",
                              "ejemplos": ejemplos,
                              "recomendacion": "Eliminar o seudonimizar la columna antes de compartir o publicar."})
        if es_numerica:
            especiales = sum(1 for v in no_vacios if v.split(".")[0] in CODIGOS_ESPECIALES)
            if especiales and especiales < 0.5 * len(no_vacios):
                hallazgos.append({"severidad": "alta", "columna": col, "regla": "Códigos 98/99",
                                  "mensaje": f"{especiales} valores con códigos especiales (98, 99, 999…).",
                                  "recomendacion": "Tratarlos como «no sabe / no responde» y excluirlos de promedios."})
            validos = [x for x in nums if str(int(x)) not in CODIGOS_ESPECIALES] if nums else []
            if len(validos) >= 10:
                q1, _, q3 = statistics.quantiles(validos, n=4, method="inclusive")
                r = q3 - q1
                fuera = [i for i, v in enumerate(valores) if (x := _numero(v)) is not None and r > 0
                         and (x < q1 - 3 * r or x > q3 + 3 * r)]
                if fuera:
                    hallazgos.append({"severidad": "media", "columna": col, "regla": "Valores extremos",
                                      "mensaje": f"{len(fuera)} valor(es) fuera de 3 rangos intercuartílicos.",
                                      "recomendacion": "Verificar con la fuente (crítica de datos)."})
                    for i in fuera[:200]:
                        inconsistencias.append({"fila": i + 2, "columna": col, "problema": "valor extremo",
                                                "valor": "" if datos_personales else valores[i]})
                info.update({"minimo": min(validos), "maximo": max(validos), "mediana": statistics.median(validos)})
        if info["pct_vacios"] > 20:
            hallazgos.append({"severidad": "media" if info["pct_vacios"] < 60 else "alta", "columna": col,
                              "regla": "Completitud", "mensaje": f"{info['pct_vacios']} % de celdas vacías.",
                              "recomendacion": "Confirmar si son omisiones o no aplica."})
        columnas.append(info)

    duplicadas = n - len({tuple(f) for f in filas})
    if duplicadas:
        hallazgos.append({"severidad": "media", "columna": "(todas)", "regla": "Duplicados",
                          "mensaje": f"{duplicadas} fila(s) duplicada(s).", "recomendacion": "Eliminar duplicados."})
    encabezados_norm = [h.lower() for h in encabezado]
    conteo = next((j for j, h in enumerate(encabezados_norm) if h in ("n", "casos", "frecuencia", "conteo", "total")), None)
    pocos = 0
    if conteo is not None:
        k = cfg.k_minimo
        for i, f in enumerate(filas):
            x = _numero(f[conteo]) if conteo < len(f) else None
            if x is not None and 0 < x < k:
                pocos += 1
                inconsistencias.append({"fila": i + 2, "columna": encabezado[conteo],
                                        "problema": f"celda con menos de {k} casos", "valor": ""})
        if pocos:
            hallazgos.append({"severidad": "alta", "columna": encabezado[conteo], "regla": "Pocos casos",
                              "mensaje": f"{pocos} celda(s) con menos de {k} casos.",
                              "recomendacion": "Suprimir o agregar categorías antes de publicar."})
    tiene_factor = any(re.search(r"factor|fexp|expansion|peso", h) for h in encabezados_norm)
    reglas_dce = [
        {"regla": "Usar el factor de expansión", "estado": "revisar" if tiene_factor else "no_aplica",
         "detalle": "Hay una columna de factor de expansión: toda estimación debe ponderarse." if tiene_factor else
         "No se detectó factor de expansión."},
        {"regla": "Respetar el dominio de estudio", "estado": "revisar",
         "detalle": "Verificar que los resultados no se desagreguen más allá del dominio de la encuesta."},
        {"regla": "Cuidado con pocos casos", "estado": "falla" if pocos else "ok",
         "detalle": f"{pocos} celda(s) con pocos casos." if pocos else "Sin celdas con pocos casos detectadas."},
        {"regla": "Códigos 98/99 (no sabe / no responde)",
         "estado": "falla" if any(h["regla"] == "Códigos 98/99" for h in hallazgos) else "ok",
         "detalle": "Se detectaron códigos especiales en columnas numéricas." if any(
             h["regla"] == "Códigos 98/99" for h in hallazgos) else "No se detectaron."},
        {"regla": "Usar definiciones oficiales", "estado": "revisar",
         "detalle": "Revisar el diccionario de datos del INE de esta base."},
        {"regla": "Citar la fuente y la fecha de descarga", "estado": "revisar",
         "detalle": "Incluir «Fuente: INE» y la fecha de descarga en todo producto derivado."},
    ]
    penalizacion = {"critica": 40, "alta": 12, "media": 4, "baja": 1}
    puntaje = max(0, 100 - sum(penalizacion.get(h["severidad"], 0) for h in hallazgos))
    return {
        "archivo": nombre[:200], "sha256": hashlib.sha256(datos).hexdigest(), "filas": n, "columnas": len(encabezado),
        "puntaje": puntaje, "bloqueante": datos_personales, "hallazgos": hallazgos[:200], "detalle_columnas": columnas,
        "reglas_dce": reglas_dce, "inconsistencias": inconsistencias[:1000],
        "truncado": n >= MAX_FILAS,
    }


def reporte_csv(informe: dict) -> str:
    salida = io.StringIO()
    w = csv.writer(salida)
    w.writerow(["fila", "columna", "problema", "valor"])
    for i in informe.get("inconsistencias", []):
        w.writerow([i["fila"], neutralizar(i["columna"]), neutralizar(i["problema"]), neutralizar(i["valor"])])
    return salida.getvalue()
