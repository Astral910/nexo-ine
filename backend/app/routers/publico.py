"""Nexo Abierto: cifras públicas del INE para cualquier persona, sin cuenta y de solo lectura.

- Solo expone fuentes que el INE ya publica y las compras públicas de Guatecompras (FUENTES_PUBLICAS). Nunca los
  precios recolectados con código de informante, las alertas, las solicitudes, la operación ni datos de usuarios.
- Cada ruta tiene un límite de consultas por IP y las respuestas pesadas se guardan unos minutos en memoria.
- Las rutas POST (generar y consultar) no piden token CSRF: no hay sesión ni cookie que un sitio ajeno pueda
  aprovechar, y ninguna modifica datos.
"""

from __future__ import annotations

import re
import statistics
import threading
import time
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import ahora, obtener_bd
from ..models import CompraItem, FuenteDatos, LugarPoblado, PrecioReferencia
from ..security.limites import limitador
from ..security.sesiones import ip_cliente
from ..services import centro, generador, precios_ref, semantica
from ..services import territorio as consultas
from ..texto import departamento_canonico, fichas, normalizar

router = APIRouter(prefix="/api/publico", tags=["publico"])

PERMISOS_PUBLICOS = frozenset({"tableros:ver"})
FUENTES_PUBLICAS = {f.id for f in semantica.FUENTES.values() if f.permiso == "tableros:ver"}
MENSAJE_LIMITE = "Demasiadas consultas desde su conexión; espere un minuto."
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
         "noviembre", "diciembre"]
EJEMPLOS_PUBLICOS = [
    "Inflación interanual desde 2022",
    "Costo de la canasta básica urbana y rural",
    "Población proyectada de Quetzaltenango hasta 2030",
    "Población por departamento",
    "Precio de computadoras portátiles por mes en 2025",
    "Precio de cemento gris en Guatecompras por mes",
    "IPC por región",
    "IPMC del cemento gris",
]
GUATECOMPRAS = {"titulo": "Guatecompras OCDS (Ministerio de Finanzas Públicas, vía Open Contracting Partnership)",
                "pagina": "https://data.open-contracting.org/en/publication/142", "licencia": "CC BY 4.0"}
PORTAL_INE = "https://datos.ine.gob.gt"


class _Memoria:
    """Caché pequeña en memoria con vencimiento; protege la base de datos de consultas repetidas."""

    def __init__(self, segundos: float, maximo: int = 200) -> None:
        self.segundos, self.maximo = segundos, maximo
        self._datos: dict[str, tuple[float, Any]] = {}
        self._candado = threading.Lock()

    def obtener(self, clave: str) -> Any:
        with self._candado:
            guardado = self._datos.get(clave)
            if guardado and time.monotonic() - guardado[0] < self.segundos:
                return guardado[1]
            self._datos.pop(clave, None)
            return None

    def guardar(self, clave: str, valor: Any) -> Any:
        with self._candado:
            if clave not in self._datos and len(self._datos) >= self.maximo:
                self._datos.pop(min(self._datos, key=lambda k: self._datos[k][0]), None)
            self._datos[clave] = (time.monotonic(), valor)
        return valor

    def vaciar(self) -> None:
        with self._candado:
            self._datos.clear()


_corta = _Memoria(600, 400)  # 10 minutos: inicio, precios, municipios, fuentes
_mapas = _Memoria(3600, 30)  # 1 hora: puntos del mapa por departamento


def vaciar_caches() -> None:
    """Para pruebas y recargas de datos."""
    _corta.vaciar()
    _mapas.vaciar()


def _limite(extra: str | None = None, maximo: int = 0):
    """Dependencia: límite general por IP y, si se indica, uno más estricto para la ruta."""

    def _dep(request: Request) -> str:
        ip = ip_cliente(request) or "sin-ip"
        if not limitador.permitir(f"publico:{ip}", 240, 60) or (
                extra and not limitador.permitir(f"{extra}:{ip}", maximo, 60)):
            raise HTTPException(429, MENSAJE_LIMITE, headers={"Retry-After": "60"})
        return ip

    return _dep


def _iso(valor: date | datetime | None) -> str | None:
    if valor is None:
        return None
    return valor.isoformat(timespec="seconds") if isinstance(valor, datetime) else valor.isoformat()


def _periodo(fila) -> tuple[str, str]:
    if fila is None:
        return "", ""
    return f"{fila.anio}-{fila.mes:02d}", f"{MESES[fila.mes - 1]} de {fila.anio}"


def _valor(fila) -> float | None:
    return round(fila.valor, 2) if fila is not None else None


@router.get("/inicio")
def inicio(_ip: str = Depends(_limite()), bd: Session = Depends(obtener_bd)):
    """Cifras de portada: inflación, canasta básica, población y el tamaño de los datos disponibles."""
    guardado = _corta.obtener("inicio")
    if guardado is not None:
        return guardado
    anio = consultas.anio_proyeccion()
    c = centro.cifras_oficiales(bd, anio)
    periodo_ipc, texto_ipc = _periodo(c["ipc"])
    periodo_cba, texto_cba = _periodo(c["cba_urbana"])
    n_compras, entidades, desde, hasta = bd.execute(select(
        func.count(), func.count(func.distinct(CompraItem.entidad)), func.min(CompraItem.fecha),
        func.max(CompraItem.fecha))).one()
    lugares, censo, municipios, departamentos = bd.execute(select(
        func.count(), func.sum(LugarPoblado.poblacion), func.count(func.distinct(LugarPoblado.cod_municipio)),
        func.count(func.distinct(LugarPoblado.departamento)))).one()
    return _corta.guardar("inicio", {
        "ipc": {"indice": _valor(c["ipc"]), "interanual": _valor(c["interanual"]), "mensual": _valor(c["mensual"]),
                "periodo": periodo_ipc, "periodo_texto": texto_ipc},
        "cba": {"urbana": _valor(c["cba_urbana"]), "rural": _valor(c["cba_rural"]), "periodo": periodo_cba,
                "periodo_texto": texto_cba},
        "poblacion": {"anio": anio, "proyectada": c["poblacion"], "censo_2018": int(censo or 0),
                      "municipios": municipios, "lugares_poblados": lugares, "departamentos": departamentos},
        "compras": {"n": n_compras, "entidades": entidades, "desde": _iso(desde), "hasta": _iso(hasta)},
        "referencias_ine": {"n": bd.execute(select(func.count()).select_from(PrecioReferencia)).scalar() or 0},
        "datos_descargados_en": _iso(bd.execute(select(func.max(FuenteDatos.descargado_en))).scalar()),
        "actualizado_en": ahora().isoformat(timespec="seconds"),
    })


# ---------------------------------------------------------------------------
# ¿Cuánto debería costar? (compras públicas y precios de referencia del INE)
# ---------------------------------------------------------------------------


def _percentiles(valores: list[float]) -> dict:
    if not valores:
        return {"p10": None, "p25": None, "p75": None, "p90": None}
    orden = sorted(valores)
    if len(orden) < 4:
        return {"p10": round(orden[0], 2), "p25": round(orden[0], 2), "p75": round(orden[-1], 2),
                "p90": round(orden[-1], 2)}
    deciles = statistics.quantiles(orden, n=10, method="inclusive")
    cuartiles = statistics.quantiles(orden, n=4, method="inclusive")
    return {"p10": round(deciles[0], 2), "p25": round(cuartiles[0], 2), "p75": round(cuartiles[2], 2),
            "p90": round(deciles[8], 2)}


def _histograma(valores: list[float], cubetas: int = 12) -> list[dict]:
    if not valores:
        return []
    bajo, alto = min(valores), max(valores)
    if alto == bajo:
        return [{"desde": round(bajo, 2), "hasta": round(alto, 2), "n": len(valores)}]
    ancho = (alto - bajo) / cubetas
    conteos = [0] * cubetas
    for v in valores:
        conteos[min(cubetas - 1, int((v - bajo) / ancho))] += 1
    return [{"desde": round(bajo + i * ancho, 2), "hasta": round(bajo + (i + 1) * ancho, 2), "n": n}
            for i, n in enumerate(conteos)]


def _fuentes_precios(bd: Session) -> list[dict]:
    def buscar(*condiciones):
        return bd.execute(select(FuenteDatos).where(*condiciones).order_by(FuenteDatos.id.desc()).limit(1)).scalar()

    def pagina(fila, defecto: str) -> str:
        return (fila.pagina if fila else "") or defecto

    def licencia(fila, defecto: str) -> str:
        return (fila.licencia if fila else "") or defecto

    pr = buscar(FuenteDatos.usado_en == "Precios de Referencia") or buscar(FuenteDatos.id.startswith("pr_", autoescape=True))
    ipc = buscar(FuenteDatos.id == "ipc_republica")
    gc = buscar(FuenteDatos.id.startswith("guatecompras", autoescape=True))
    return [
        {"titulo": GUATECOMPRAS["titulo"], "pagina": pagina(gc, GUATECOMPRAS["pagina"]),
         "licencia": licencia(gc, GUATECOMPRAS["licencia"])},
        {"titulo": "Precios de Referencia (INE)", "pagina": pagina(pr, PORTAL_INE),
         "licencia": licencia(pr, "Citar al INE como fuente")},
        {"titulo": "Índice de Precios al Consumidor, República (INE), para llevar los precios a quetzales de hoy",
         "pagina": pagina(ipc, PORTAL_INE), "licencia": licencia(ipc, "Citar al INE como fuente")},
    ]


@router.get("/precios")
def precios(q: str = Query(min_length=2, max_length=120),
            unspsc: str | None = Query(default=None, max_length=12, pattern=r"^\d{2,12}$"),
            _ip: str = Depends(_limite("publico-precios", 30)), bd: Session = Depends(obtener_bd)):
    """Cuánto pagó el Estado por un bien (Guatecompras) y los precios de referencia del INE para compararlo."""
    clave = f"precios|{normalizar(q)}|{unspsc or ''}"
    guardado = _corta.obtener(clave)
    if guardado is not None:
        return guardado
    try:
        r = precios_ref.investigar(bd, q, unspsc or None, meses=24)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    validas = [c for c in r["compras"] if not c["atipico"]]
    valores = [c["precio_ajustado"] for c in validas]
    est = r["estadisticos"]
    por_mes: dict[str, list[float]] = defaultdict(list)
    for c in validas:
        if c["fecha"]:
            por_mes[c["fecha"][:7]].append(c["precio_ajustado"])
    notas = list(r["notas"]) + [
        "En la serie mensual solo se muestran los meses con 3 compras o más.",
        "Esta página es orientativa: el precio de referencia oficial lo emite la Dirección de Precios e Índices de "
        "Referencia (DPIR) del INE a solicitud de cada entidad pública.",
    ]
    if len(r["compras"]) >= 400:
        notas.append("Se analizaron las 400 compras más recientes que coinciden con la búsqueda.")
    return _corta.guardar(clave, {
        "consulta": q.strip(), "periodo": r["periodo"],
        "ajuste": {"a_precios_de": r["ajuste_ipc"]["a_precios_de"], "base": r["ajuste_ipc"]["base"]},
        "grupos": r["grupos"], "suficiente": len(valores) >= 5,
        "resumen": {"n": len(valores), "entidades": len({c["origen"] for c in validas if c["origen"]}),
                    **_percentiles(valores), "mediana": est.get("mediana"), "media": est.get("media"),
                    "moda": est.get("moda"), "minimo": est.get("minimo"), "maximo": est.get("maximo"),
                    "cv": est.get("cv"), "atipicos": r["atipicos"], "estadistico_recomendado": r["estadistico_recomendado"],
                    "razon": r["razon"], "precio_orientativo": r["precio_sugerido"]},
        "histograma": _histograma(valores),
        "por_mes": [{"mes": m, "mediana": round(statistics.median(v), 2), "n": len(v)}
                    for m, v in sorted(por_mes.items()) if len(v) >= 3],
        "compras": [{"fecha": c["fecha"], "descripcion": c["descripcion"], "entidad": c["origen"],
                     "cantidad": c["cantidad"], "unidad": c["unidad"], "precio": c["precio"],
                     "precio_ajustado": c["precio_ajustado"], "atipico": c["atipico"], "nog": c["referencia"],
                     "enlace": c["enlace"]} for c in r["compras"][:50]],
        "referencias_ine": [{"fecha": p["fecha"], "producto": p["producto"], "caracteristicas": p["caracteristicas"][:200],
                             "presentacion": p["unidad"], "precio": p["precio"], "precio_ajustado": p["precio_ajustado"]}
                            for p in r["referencias_ine"][:20]],
        "notas": notas,
        "fuentes": _fuentes_precios(bd),
    })


# ---------------------------------------------------------------------------
# Mi municipio en datos (Censo 2018 y proyecciones)
# ---------------------------------------------------------------------------


def _municipios(bd: Session, departamento: str | None) -> list[dict]:
    canonico = departamento_canonico(departamento)
    if departamento and not canonico:
        return []  # departamento desconocido: no se consulta ni se guarda en la caché
    clave = f"municipios|{canonico or ''}"
    guardado = _corta.obtener(clave)
    return guardado if guardado is not None else _corta.guardar(clave, consultas.municipios(bd, canonico))


@router.get("/departamentos")
def departamentos(_ip: str = Depends(_limite()), bd: Session = Depends(obtener_bd)):
    guardado = _corta.obtener("departamentos")
    return guardado if guardado is not None else _corta.guardar("departamentos", consultas.departamentos(bd))


@router.get("/municipios")
def municipios(texto: str | None = Query(default=None, max_length=80),
               departamento: str | None = Query(default=None, max_length=40),
               _ip: str = Depends(_limite()), bd: Session = Depends(obtener_bd)):
    lista = _municipios(bd, departamento)
    buscadas = fichas(texto)
    if buscadas:
        lista = [m for m in lista if all(f in normalizar(f"{m['municipio']} {m['departamento']}") for f in buscadas)]
    return lista


@router.get("/municipios/{codigo}")
def ficha_municipio(codigo: str, _ip: str = Depends(_limite()), bd: Session = Depends(obtener_bd)):
    if not re.fullmatch(r"\d{4}", codigo):
        raise HTTPException(404, "Municipio no encontrado.")
    clave = f"ficha|{codigo}"
    guardado = _corta.obtener(clave)
    if guardado is not None:
        return guardado
    ficha = consultas.ficha_municipio(bd, codigo, principales=10)
    if ficha is None:
        raise HTTPException(404, "Municipio no encontrado.")
    anio = consultas.anio_proyeccion()
    proyeccion = {p["anio"]: p["poblacion"] for p in ficha["proyeccion"]}
    actual, base = proyeccion.get(anio), proyeccion.get(2018)
    hermanos = sorted(_municipios(bd, ficha["departamento"]), key=lambda m: -m["poblacion_2018"])
    rango = next((i + 1 for i, m in enumerate(hermanos) if m["codigo"] == codigo), None)
    return _corta.guardar(clave, {
        **ficha, "anio_actual": anio, "poblacion_anio_actual": actual,
        # Solo proyecciones contra proyecciones: el censo y la proyección no se comparan entre sí.
        "crecimiento_desde_2018_pct": round((actual / base - 1) * 100, 1) if actual and base else None,
        "rango_departamento": rango, "municipios_departamento": len(hermanos),
    })


@router.get("/catalogo-campo")
def catalogo_campo(_ip: str = Depends(_limite()), bd: Session = Depends(obtener_bd)):
    """Catálogo de artículos del IPC para el teléfono de campo: nombres, presentaciones y cobertura, sin precios ni
    informantes (se deriva de los archivos públicos de precios recolectados)."""
    from .indices import datos_catalogo_campo

    return datos_catalogo_campo(bd)


@router.get("/mapa")
def mapa(departamento: str | None = Query(default=None, max_length=40), _ip: str = Depends(_limite()),
         bd: Session = Depends(obtener_bd)):
    canonico = departamento_canonico(departamento)
    if departamento and not canonico:
        return {"puntos": [], "fuente": "INE, centroides de lugares poblados, Censo 2018"}
    clave = canonico or "pais"
    guardado = _mapas.obtener(clave)
    return guardado if guardado is not None else _mapas.guardar(clave, consultas.mapa(bd, canonico))


# ---------------------------------------------------------------------------
# Pregunte a los datos del INE (tableros a partir de texto, solo fuentes públicas)
# ---------------------------------------------------------------------------


@router.get("/catalogo")
def catalogo(_ip: str = Depends(_limite())):
    return {"fuentes": semantica.catalogo_publico(set(PERMISOS_PUBLICOS)), "ejemplos": EJEMPLOS_PUBLICOS}


class Peticion(BaseModel):
    peticion: str = Field(min_length=3, max_length=300)


@router.post("/generar")
def generar(datos: Peticion, _ip: str = Depends(_limite("publico-generar", 20))):
    try:
        spec = generador.generar(datos.peticion, set(PERMISOS_PUBLICOS))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    spec["widgets"] = [w for w in spec["widgets"] if (w.get("consulta") or {}).get("fuente") in FUENTES_PUBLICAS]
    if not spec["widgets"]:
        raise HTTPException(422, "No encontré datos públicos para responder esa pregunta.")
    return spec


class Consulta(BaseModel):
    consulta: dict


@router.post("/consulta")
def consultar(datos: Consulta, _ip: str = Depends(_limite()), bd: Session = Depends(obtener_bd)):
    fuente = datos.consulta.get("fuente")
    if not isinstance(fuente, str) or fuente not in FUENTES_PUBLICAS:
        raise HTTPException(422, "Esta fuente no está disponible sin cuenta.")
    try:
        return semantica.ejecutar(bd, datos.consulta, set(PERMISOS_PUBLICOS))
    except semantica.ErrorConsulta as e:
        raise HTTPException(422, str(e)) from e
    except (ValueError, TypeError) as e:
        raise HTTPException(422, "Consulta no válida.") from e


@router.get("/fuentes")
def fuentes(_ip: str = Depends(_limite()), bd: Session = Depends(obtener_bd)):
    """Conjuntos de datos que usa Nexo, con su página de origen, licencia y fecha de descarga."""
    guardado = _corta.obtener("fuentes")
    if guardado is not None:
        return guardado
    return _corta.guardar("fuentes", [
        {"titulo": f.titulo, "publicador": f.publicador, "pagina": f.pagina, "url": f.url, "licencia": f.licencia,
         "descargado_en": _iso(f.descargado_en), "usado_en": f.usado_en, "filas": f.filas, "sha256": f.sha256}
        for f in bd.execute(select(FuenteDatos).order_by(FuenteDatos.publicador, FuenteDatos.id)).scalars()])
