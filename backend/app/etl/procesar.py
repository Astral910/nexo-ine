"""Transforma los archivos crudos en tablas limpias (data/procesados/*.csv.gz).

Cada procesador documenta qué toma de la fuente y qué descarta. Nunca se procesan datos de
contacto ni nombres de proveedores (minimización y secreto estadístico).
"""

from __future__ import annotations

import csv
import gzip
import json
import logging
import re
import statistics
import tarfile
from collections import defaultdict
from collections.abc import Iterable, Iterator
from datetime import datetime
from pathlib import Path

import openpyxl

from ..config import obtener_config
from ..texto import departamento_canonico, normalizar
from .fuentes import POR_ID

log = logging.getLogger("nexo.etl")
csv.field_size_limit(1 << 30)

MESES = {m: i for i, m in enumerate(
    ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
     "noviembre", "diciembre"], start=1)}
MESES["setiembre"] = 9
REGIONES = {1: "Región I · Metropolitana", 2: "Región II · Norte", 3: "Región III · Nororiente",
            4: "Región IV · Suroriente", 5: "Región V · Central", 6: "Región VI · Suroccidente",
            7: "Región VII · Noroccidente", 8: "Región VIII · Petén"}


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def dir_procesados() -> Path:
    d = obtener_config().directorio_datos / "procesados"
    d.mkdir(parents=True, exist_ok=True)
    return d


def crudo(fuente_id: str) -> Path:
    return obtener_config().directorio_datos / "crudos" / POR_ID[fuente_id].archivo


def escribir(nombre: str, columnas: list[str], filas: Iterable[dict]) -> int:
    ruta = dir_procesados() / f"{nombre}.csv.gz"
    n = 0
    with gzip.open(ruta, "wt", encoding="utf-8", newline="", compresslevel=9) as f:
        w = csv.DictWriter(f, fieldnames=columnas, extrasaction="ignore")
        w.writeheader()
        for fila in filas:
            w.writerow(fila)
            n += 1
    log.info("%s: %s filas", nombre, n)
    return n


def numero(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).strip().replace("Q", "").replace(",", "")
    if not t or t.lower() in {"sin dato", "nan", "-", "n/d"}:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def fecha_iso(v) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    t = str(v).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y-%m-%dT%H:%M:%S", "%d/%m/%y"):
        try:
            return datetime.strptime(t[:19] if "T" in t else t[:10], fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def mes_num(v) -> int | None:
    if isinstance(v, (int, float)):
        return int(v)
    return MESES.get(normalizar(v))


def filas_xlsx(ruta: Path, hoja: int | str = 0, desde: int = 1) -> Iterator[tuple]:
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    ws = wb[hoja] if isinstance(hoja, str) else wb.worksheets[hoja]
    yield from ws.iter_rows(min_row=desde, values_only=True)
    wb.close()


def limpio(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


# ---------------------------------------------------------------------------
# Catálogo de códigos territoriales (desde los centroides del Censo 2018)
# ---------------------------------------------------------------------------


def codigos_territoriales() -> tuple[dict[str, str], dict[str, tuple[str, str]]]:
    deptos: dict[str, str] = {}
    munis: dict[str, tuple[str, str]] = {}
    for f in filas_xlsx(crudo("lugares_poblados"), desde=7):
        if not f or f[0] is None or f[2] is None:
            continue
        cd = f"{int(f[0]):02d}"
        cm = f"{int(f[2]):04d}"
        deptos[cd] = departamento_canonico(limpio(f[1])) or limpio(f[1])
        munis[cm] = (limpio(f[3]), deptos[cd])
    return deptos, munis


# ---------------------------------------------------------------------------
# Procesadores
# ---------------------------------------------------------------------------

COLS_PR = ["fuente_id", "nog", "evento", "categoria", "entidad", "modalidad", "producto", "caracteristicas",
           "presentacion", "precio", "fecha", "texto_norm"]


def proc_precios_referencia(entidades_por_nog: dict[str, str] | None = None) -> int:
    """Precios de referencia del INE (junio 2022 y septiembre 2023), sin duplicados."""
    vistos: set[tuple] = set()
    entidades_por_nog = entidades_por_nog or {}

    def gen():
        with crudo("pr_2022").open(encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                yield _fila_pr("pr_2022", r.get("NOG"), r.get("Evento"), r.get("Categoria"),
                               r.get("Entidad Requirente"), r.get("Modalidad"), r.get("Producto"),
                               r.get("Características"), r.get("Presentación"),
                               r.get("Precio de Referencia (Q)"), r.get("Fecha de Entrega"))
        it = filas_xlsx(crudo("pr_2023"))
        enc = [limpio(x) for x in next(it)]
        ix = {k: i for i, k in enumerate(enc)}
        for r in it:
            if not r or r[ix["Producto"]] is None:
                continue
            nog = limpio(r[ix["Nog"]])
            yield _fila_pr("pr_2023", nog, r[ix["Evento"]], r[ix["Categoría"]], entidades_por_nog.get(nog, ""),
                           r[ix["Modalidad"]], r[ix["Producto"]], r[ix["Características"]], r[ix["Presentación"]],
                           r[ix["Precio de Referencia (Q)"]], r[ix["Fecha de Entrega"]])

    def unicos():
        for fila in gen():
            if fila["precio"] in ("", None):
                continue
            clave = (fila["nog"], normalizar(fila["producto"]), fila["precio"], fila["fecha"])
            if clave in vistos:
                continue
            vistos.add(clave)
            yield fila

    return escribir("pr_referencia", COLS_PR, unicos())


def _fila_pr(fuente, nog, evento, categoria, entidad, modalidad, producto, caract, present, precio, fecha) -> dict:
    p = numero(precio)
    prod = limpio(producto)
    car = limpio(caract)
    return {"fuente_id": fuente, "nog": limpio(nog).split(".")[0], "evento": limpio(evento)[:120],
            "categoria": limpio(categoria)[:200], "entidad": limpio(entidad)[:250],
            "modalidad": limpio(modalidad)[:200], "producto": prod[:500], "caracteristicas": car[:2000],
            "presentacion": limpio(present)[:250], "precio": "" if p is None or p <= 0 else round(p, 4),
            "fecha": fecha_iso(fecha), "texto_norm": normalizar(f"{prod} {car[:300]}")}


COLS_PRECIOS = ["anio", "mes", "region", "departamento", "municipio", "cod_articulo", "articulo", "cod_fuente",
                "precio_anterior", "precio_actual", "cant_anterior", "cant_actual", "relativo"]


def proc_precios_recolectados() -> int:
    """Precios recolectados para el IPC.

    - Julio 2022: el archivo trae precio anterior y actual por informante codificado (COD_FUENTE).
    - 2023: el archivo trae un precio por boleta; el relativo se calcula entre meses consecutivos
      para la misma boleta, artículo y cantidad. La boleta es un código: nunca se identifica al informante.
    """
    deptos, munis = codigos_territoriales()

    def julio_2022():
        with crudo("precios_recolectados_2022_07").open(encoding="latin-1", newline="") as f:
            for r in csv.DictReader(f):
                pa, pc = numero(r.get("PRECIO_ANTERIOR")), numero(r.get("PRECIO_ACTUAL"))
                qa, qc = numero(r.get("CANT_ANTERIOR")), numero(r.get("CANT_ACTUAL"))
                rel = (pc / qc) / (pa / qa) if pa and pc and qa and qc and pa > 0 and qa > 0 and qc > 0 else None
                d = limpio(r.get("DEPARTAMENTO"))
                depto = deptos.get(f"{int(d):02d}", d) if d.isdigit() else (departamento_canonico(d) or d.title())
                m = limpio(r.get("MUNICIPIO"))
                muni = munis.get(f"{int(m):04d}", (m, ""))[0] if m.isdigit() else m.title()
                yield {"anio": int(numero(r.get("AÑO")) or 2022), "mes": int(numero(r.get("MES")) or 7),
                       "region": limpio(r.get("REGION")), "departamento": depto, "municipio": muni,
                       "cod_articulo": limpio(r.get("COD_ARTICULO")), "articulo": limpio(r.get("ARTICULO")).capitalize(),
                       "cod_fuente": limpio(r.get("COD_FUENTE")), "precio_anterior": pa, "precio_actual": pc,
                       "cant_anterior": qa, "cant_actual": qc, "relativo": round(rel, 6) if rel else ""}

    def anio_2023():
        it = filas_xlsx(crudo("precios_recolectados_2023"))
        enc = [normalizar(x).replace(" ", "_") for x in next(it)]
        ix = {k: i for i, k in enumerate(enc)}
        series: dict[tuple, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
        info: dict[tuple, tuple] = {}
        for r in it:
            if not r or r[ix["precio"]] is None:
                continue
            precio, cant = numero(r[ix["precio"]]), numero(r[ix["cantidad"]]) or 1.0
            if not precio or precio <= 0 or cant <= 0:
                continue
            boleta = limpio(r[ix["numero_boleta"]])
            art = limpio(r[ix["cod_articulo"]])
            clave = (boleta, art, cant)
            series[clave][int(r[ix["mes"]])].append(precio)
            if clave not in info:
                info[clave] = (limpio(r[ix["region"]]), departamento_canonico(limpio(r[ix["nombre_depto."]]))
                               or limpio(r[ix["nombre_depto."]]).title(), limpio(r[ix["nombre_mupio"]]).title(),
                               limpio(r[ix["nombre_articulo"]]).capitalize())
        for clave, meses in series.items():
            region, depto, muni, articulo = info[clave]
            boleta, art, cant = clave
            for mes in sorted(meses):
                actual = statistics.median(meses[mes])
                anterior = statistics.median(meses[mes - 1]) if (mes - 1) in meses else None
                yield {"anio": 2023, "mes": mes, "region": region, "departamento": depto, "municipio": muni,
                       "cod_articulo": art, "articulo": articulo, "cod_fuente": f"B{boleta}",
                       "precio_anterior": anterior, "precio_actual": round(actual, 4), "cant_anterior": cant if anterior else "",
                       "cant_actual": cant, "relativo": round(actual / anterior, 6) if anterior else ""}

    def todo():
        yield from julio_2022()
        yield from anio_2023()

    return escribir("precios_recolectados", COLS_PRECIOS, todo())


COLS_SERIE = ["indicador", "ambito", "clave", "anio", "mes", "valor", "unidad", "base", "fuente_id"]


def proc_series() -> int:
    """IPC (República, región, división), IPMC por artículo y costo de la CBA urbana y rural."""

    def ipc_republica():
        it = filas_xlsx(crudo("ipc_republica"))
        enc = [limpio(x) for x in next(it)]
        i_base = next(i for i, h in enumerate(enc) if "2024" in h)
        i_inter = next(i for i, h in enumerate(enc) if "Interanual" in h)
        i_mens = next(i for i, h in enumerate(enc) if "Mensual" in h)
        for r in it:
            if not r or r[0] is None or mes_num(r[1]) is None:
                continue
            anio, mes = int(r[0]), mes_num(r[1])
            base = {"indicador": "IPC", "ambito": "republica", "anio": anio, "mes": mes, "fuente_id": "ipc_republica"}
            if numero(r[i_base]) is not None:
                yield {**base, "clave": "República", "valor": round(numero(r[i_base]), 6), "unidad": "índice",
                       "base": "2024=100"}
            if numero(r[i_inter]) is not None:
                yield {**base, "ambito": "republica_var", "clave": "Variación interanual", "unidad": "%",
                       "valor": round(numero(r[i_inter]), 6), "base": ""}
            if numero(r[i_mens]) is not None:
                yield {**base, "ambito": "republica_var", "clave": "Variación mensual", "unidad": "%",
                       "valor": round(numero(r[i_mens]), 6), "base": ""}

    def ipc_ancho(fuente_id: str, ambito: str, patron: str, nombres: dict[int, str]):
        it = filas_xlsx(crudo(fuente_id))
        enc = [limpio(x) for x in next(it)]
        columnas = []
        for i, h in enumerate(enc):
            hn = normalizar(h)
            if "base 2024" in hn and "indice" in hn and "factor" not in hn:
                m = re.search(patron, h, re.I)
                if m:
                    columnas.append((i, int(m.group(1))))
        for r in it:
            if not r or r[0] is None or mes_num(r[1]) is None:
                continue
            for i, num in columnas:
                v = numero(r[i]) if i < len(r) else None
                if v is not None:
                    yield {"indicador": "IPC", "ambito": ambito, "clave": nombres.get(num, f"{ambito.title()} {num:02d}"),
                           "anio": int(r[0]), "mes": mes_num(r[1]), "valor": round(v, 6), "unidad": "índice",
                           "base": "2024=100", "fuente_id": fuente_id}

    def ipmc():
        for fid in [f for f in POR_ID if f.startswith("ipmc_")]:
            it = filas_xlsx(crudo(fid))
            enc = [normalizar(x) for x in next(it)]
            ix = {k: i for i, k in enumerate(enc)}
            for r in it:
                if not r or r[0] is None or r[ix["indice"]] is None:
                    continue
                nombre = limpio(r[ix["nombre articulo"]])
                unidad = limpio(r[ix["unidad de medida"]])
                yield {"indicador": "IPMC", "ambito": "articulo", "clave": f"{nombre} ({unidad})" if unidad else nombre,
                       "anio": int(r[0]), "mes": mes_num(r[1]), "valor": round(numero(r[ix["indice"]]), 4),
                       "unidad": "índice", "base": "", "fuente_id": fid}

    def cba():
        for fid, ambito in (("cba_urbana", "urbana"), ("cba_rural", "rural")):
            for r in filas_xlsx(crudo(fid), desde=2):
                if not r or r[0] is None or mes_num(r[1]) is None or numero(r[3]) is None:
                    continue
                yield {"indicador": "CBA", "ambito": ambito, "clave": f"CBA {ambito}: costo mensual per cápita",
                       "anio": int(r[0]), "mes": mes_num(r[1]), "valor": round(numero(r[3]), 4),
                       "unidad": "Q por persona al mes", "base": "", "fuente_id": fid}

    def todo():
        yield from ipc_republica()
        yield from ipc_ancho("ipc_region", "region", r"Regi[oó]n\s*(\d+)", REGIONES)
        yield from ipc_ancho("ipc_division", "division", r"Divisi[oó]n\s*(\d+)", nombres_divisiones())
        yield from ipmc()
        yield from cba()

    return escribir("series_indices", COLS_SERIE, todo())


def nombres_divisiones() -> dict[int, str]:
    """Nombres de las 13 divisiones de gasto del IPC base 2024, en el orden del archivo del INE.

    Se corrigen solo erratas evidentes del encabezado publicado (p. ej. "electricida", "finacieros").
    """
    correcciones = {"electricida,": "electricidad,", "finacieros": "financieros", "educativas": "educativos"}
    ruta = crudo("ipc_division_nombres")
    if not ruta.exists():
        return {}
    encabezado = next(filas_xlsx(ruta))
    nombres: dict[int, str] = {}
    for i, v in enumerate(encabezado[2:15], start=1):
        if v:
            texto = limpio(v)
            for mal, bien in correcciones.items():
                texto = texto.replace(mal, bien)
            nombres[i] = f"{i:02d} {texto}"
    return nombres


def proc_hba() -> tuple[int, int]:
    """Hoja de Balance de Alimentos 2024 y relaciones primario → derivado de las CUS."""
    ruta = crudo("hba_2024")
    wb = openpyxl.load_workbook(ruta, read_only=False, data_only=True)
    ws = wb.worksheets[0]
    columnas = [limpio(c.value) for c in ws[1]]
    productos = []
    grupo = ""
    for orden, fila in enumerate(ws.iter_rows(min_row=2), start=1):
        nombre = limpio(fila[0].value)
        if not nombre:
            continue
        valores = {columnas[i]: numero(c.value) or 0.0 for i, c in enumerate(fila[1:], start=1) if columnas[i]}
        es_grupo = bool(fila[0].font and fila[0].font.b)
        if es_grupo:
            grupo = nombre
        productos.append({"grupo": grupo, "producto": nombre, "es_grupo": int(es_grupo),
                          "valores": json.dumps(valores, ensure_ascii=False), "orden": orden})
    n1 = escribir("hba_productos", ["grupo", "producto", "es_grupo", "valores", "orden"], productos)

    conversiones = []
    it = filas_xlsx(crudo("hba_cus_2024"))
    enc = [normalizar(x) for x in next(it)]
    i_proc = next(i for i, h in enumerate(enc) if h.startswith("procesado"))
    i_prod = next(i for i, h in enumerate(enc) if h.startswith("produccion"))
    cabeceras = {normalizar(p["producto"]) for p in productos}
    primario = None
    for r in it:
        if not r or not r[0]:
            continue
        nombre = limpio(r[0])
        procesado, produccion = numero(r[i_proc]) or 0, numero(r[i_prod]) or 0
        if normalizar(nombre) in cabeceras:  # inicia un bloque (grupo o producto de la HBA)
            primario = (nombre, procesado) if procesado > 0 else None
            continue
        if primario is None and procesado > 0:
            primario = (nombre, procesado)
            continue
        if primario and produccion > 0:
            conversiones.append({"primario": primario[0], "derivado": nombre, "cantidad_primaria": round(primario[1], 3),
                                 "cantidad_derivada": round(produccion, 3),
                                 "tasa_extraccion": round(produccion / primario[1], 6)})
    n2 = escribir("hba_conversiones", ["primario", "derivado", "cantidad_primaria", "cantidad_derivada",
                                       "tasa_extraccion"], conversiones)
    return n1, n2


def recodificar_municipio(codigo: str) -> str:
    """En el archivo de proyecciones 2015-2030, los municipios 02 a 17 del departamento de Guatemala
    aparecen con los códigos 0123 a 0138. Se recodifican a 0102-0117 para unirlos con el Censo 2018.
    Verificado: la razón proyección 2018 / censo 2018 de cada par está entre 1.02 y 1.30, igual que en
    el resto de municipios (las proyecciones corrigen la omisión censal)."""
    if "0123" <= codigo <= "0138":
        return f"{int(codigo) - 21:04d}"
    return codigo


COLS_LP = ["codigo", "nombre", "cod_departamento", "departamento", "cod_municipio", "municipio", "lat", "lon",
           "poblacion", "hombres", "mujeres", "area", "texto_norm"]


def proc_territorio() -> tuple[int, int]:
    """Lugares poblados (centroides) con población del Censo 2018 y proyecciones municipales."""
    poblacion: dict[str, tuple] = {}
    for r in filas_xlsx(crudo("censo_a1"), hoja="A1_3", desde=7):
        if not r or r[4] is None:
            continue
        urb, rur = numero(r[30]) or 0, numero(r[31]) or 0
        poblacion[str(int(r[4]))] = (int(numero(r[6]) or 0), int(numero(r[7]) or 0), int(numero(r[8]) or 0),
                                     "Urbana" if urb >= rur else "Rural")
    deptos, munis = codigos_territoriales()

    def lugares():
        for r in filas_xlsx(crudo("lugares_poblados"), desde=7):
            if not r or r[4] is None:
                continue
            cod = str(int(r[4]))
            cd, cm = f"{int(r[0]):02d}", f"{int(r[2]):04d}"
            pob, h, m, area = poblacion.get(cod, ("", "", "", ""))
            nombre = limpio(r[5])
            yield {"codigo": cod, "nombre": nombre, "cod_departamento": cd, "departamento": deptos.get(cd, ""),
                   "cod_municipio": cm, "municipio": limpio(r[3]), "lon": numero(r[6]), "lat": numero(r[7]),
                   "poblacion": pob, "hombres": h, "mujeres": m, "area": area,
                   "texto_norm": normalizar(f"{nombre} {limpio(r[3])} {deptos.get(cd, '')}")}

    n1 = escribir("lugares_poblados", COLS_LP, lugares())

    # SEXO: 0 = total, 1 = hombres, 2 = mujeres (se verificó contra el Censo 2018).
    totales: dict[tuple[str, int], list[int]] = defaultdict(lambda: [0, 0, 0])
    it = filas_xlsx(crudo("proyecciones"))
    enc = [limpio(x) for x in next(it)]
    anios = [(i, int(h)) for i, h in enumerate(enc) if h.isdigit()]
    for r in it:
        if not r or r[1] is None or r[3] is None or r[2] not in (0, 1, 2):
            continue
        cm = recodificar_municipio(f"{int(r[1]):04d}")
        for i, anio in anios:
            totales[(cm, anio)][int(r[2])] += int(numero(r[i]) or 0)
    filas = [{"cod_municipio": cm, "municipio": munis.get(cm, ("", ""))[0], "departamento": munis.get(cm, ("", ""))[1],
              "anio": anio, "poblacion": v[0], "hombres": v[1], "mujeres": v[2]}
             for (cm, anio), v in sorted(totales.items())]
    n2 = escribir("proyecciones_poblacion", ["cod_municipio", "municipio", "departamento", "anio", "poblacion",
                                             "hombres", "mujeres"], filas)
    return n1, n2


COLS_COMPRAS = ["ocid", "nog", "fecha", "entidad", "departamento", "modalidad", "categoria", "descripcion", "unspsc",
                "unidad", "cantidad", "monto", "precio_unitario", "texto_norm"]


def proc_guatecompras() -> tuple[int, dict[str, str]]:
    """Compras de un solo artículo con una sola adjudicación activa: precio unitario = monto / cantidad.

    Se descartan proveedores, contactos, ofertas y documentos. Del comprador solo se conserva
    el nombre de la entidad pública y su departamento.
    """
    adjudicaciones: dict[str, list] = {}
    principal: dict[str, tuple] = {}
    region: dict[str, str] = {}
    articulos: dict[str, list] = {}
    with tarfile.open(crudo("guatecompras_2025"), "r|gz") as tar:
        for miembro in tar:
            nombre = miembro.name.rsplit("/", 1)[-1]
            if nombre not in {"awards.csv", "main.csv", "parties.csv", "tender_items.csv"}:
                continue
            # En modo flujo el archivo no admite seek: se decodifica línea por línea.
            f = (linea.decode("utf-8") for linea in tar.extractfile(miembro))
            lector = csv.DictReader(f)
            if nombre == "awards.csv":
                for r in lector:
                    if r["status"] != "active" or not r["value_amount"]:
                        continue
                    a = adjudicaciones.setdefault(r["main_ocid"], [0, 0.0, "", ""])
                    a[0] += 1
                    a[1] = float(r["value_amount"])
                    a[2] = max(a[2], r["date"][:10])
                    a[3] = r["value_currency"]
            elif nombre == "main.csv":
                for r in lector:
                    principal[r["ocid"]] = (r["buyer_name"], r["tender_procurementMethodDetails"],
                                            r["tender_mainProcurementCategory"])
            elif nombre == "parties.csv":
                for r in lector:
                    if "buyer" in (r.get("roles") or "") and r.get("address_region"):
                        region.setdefault(r["main_ocid"], r["address_region"])
            else:
                for r in lector:
                    a = articulos.get(r["main_ocid"])
                    if a is None:
                        articulos[r["main_ocid"]] = [1, r["description"], r["quantity"], r["unit_name"],
                                                     r["classification_id"]]
                    else:
                        a[0] += 1
            log.info("Leído %s", nombre)

    entidades_por_nog = {ocid.rsplit("-", 1)[-1]: datos[0] for ocid, datos in principal.items()}

    def filas():
        for ocid, (n_items, desc, cant, unidad, unspsc) in articulos.items():
            adj = adjudicaciones.get(ocid)
            if n_items != 1 or not adj or adj[0] != 1 or adj[3] != "GTQ":
                continue
            q = numero(cant)
            if not q or q <= 0 or adj[1] <= 0:
                continue
            comprador, modalidad, categoria = principal.get(ocid, ("", "", ""))
            descripcion = limpio(desc)[:600]
            yield {"ocid": ocid, "nog": ocid.rsplit("-", 1)[-1], "fecha": adj[2], "entidad": limpio(comprador)[:250],
                   "departamento": departamento_canonico(region.get(ocid)) or "", "modalidad": limpio(modalidad)[:150],
                   "categoria": categoria, "descripcion": descripcion, "unspsc": limpio(unspsc),
                   "unidad": limpio(unidad)[:120], "cantidad": q, "monto": round(adj[1], 2),
                   "precio_unitario": round(adj[1] / q, 4), "texto_norm": normalizar(descripcion)}

    return escribir("compras_items", COLS_COMPRAS, filas()), entidades_por_nog


def _ruta_entidades() -> Path:
    d = obtener_config().directorio_datos / "tmp"
    d.mkdir(parents=True, exist_ok=True)
    return d / "entidades_por_nog.json"


def procesar_todo(solo: list[str] | None = None) -> dict:
    resumen: dict = {}

    def quiere(x: str) -> bool:
        return not solo or x in solo

    entidades: dict[str, str] = {}
    if quiere("compras"):
        resumen["compras_items"], entidades = proc_guatecompras()
        _ruta_entidades().write_text(json.dumps(entidades, ensure_ascii=False), encoding="utf-8")
    elif _ruta_entidades().exists():
        entidades = json.loads(_ruta_entidades().read_text(encoding="utf-8"))
    if quiere("precios_referencia"):
        resumen["pr_referencia"] = proc_precios_referencia(entidades)
    if quiere("series"):
        resumen["series_indices"] = proc_series()
    if quiere("precios_recolectados"):
        resumen["precios_recolectados"] = proc_precios_recolectados()
    if quiere("hba"):
        resumen["hba"] = proc_hba()
    if quiere("territorio"):
        resumen["territorio"] = proc_territorio()
    return resumen
