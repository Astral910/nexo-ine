"""Recolección de precios del IPP, el IPMC y el ICC (retos de la DIEC).

La DIEC pidió para el IPP «un sistema que permita registrar los datos de los informantes, productos y sus precios»
y «herramientas para generar alertas sobre las variaciones de precios», y para el IPMC y el ICC un sistema que
estandarice sus procedimientos. Este módulo cubre los tres con el mismo flujo: informantes, productos, captura
mensual con validación inmediata, cobertura del periodo y alertas con el método Hidiroglou-Berthelot.

Secreto estadístico: el nombre del informante solo lo ve quien recolecta y revisa (permiso indices:alertas).
Los demás roles ven únicamente su código.
"""

from __future__ import annotations

import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import InformanteRecoleccion, PrecioCapturado, ProductoRecoleccion
from ..services.alertas import MIN_GRUPO_HB, hidiroglou_berthelot

router = APIRouter(prefix="/api/recoleccion", tags=["recolección de precios"])

INDICES = {
    "IPP": "Índice de Precios del Productor (sector agrícola)",
    "IPMC": "Índice de Precios de Materiales de Construcción",
    "ICC": "Índice de Costos de Construcción",
}
UMBRAL_SIMPLE = 0.20  # variación que se marca cuando el grupo es muy pequeño para Hidiroglou-Berthelot
# Con precios muy parecidos entre sí, HB marcaría diferencias de 1 %; una alerta exige además apartarse 5 % de la mediana.
DESVIO_MINIMO = 0.05
PATRON_INDICE = "^(IPP|IPMC|ICC)$"


def _periodo(texto: str | None) -> tuple[int, int] | None:
    if not texto:
        return None
    try:
        anio, mes = (int(x) for x in texto.split("-"))
    except ValueError as e:
        raise HTTPException(422, "El periodo debe tener la forma AAAA-MM.") from e
    if not (2000 <= anio <= 2100 and 1 <= mes <= 12):
        raise HTTPException(422, "Periodo fuera de rango.")
    return anio, mes


def _anterior(anio: int, mes: int) -> tuple[int, int]:
    return (anio - 1, 12) if mes == 1 else (anio, mes - 1)


def _ultimo_periodo(bd: Session, indice: str) -> tuple[int, int] | None:
    v = bd.execute(select(func.max(PrecioCapturado.anio * 100 + PrecioCapturado.mes))
                   .where(PrecioCapturado.indice == indice)).scalar()
    return (v // 100, v % 100) if v else None


def _precios_mes(bd: Session, indice: str, anio: int, mes: int) -> dict[tuple[int, int], PrecioCapturado]:
    filas = bd.execute(select(PrecioCapturado).where(PrecioCapturado.indice == indice, PrecioCapturado.anio == anio,
                                                     PrecioCapturado.mes == mes)).scalars()
    return {(p.informante_id, p.producto_id): p for p in filas}


def _evaluar(bd: Session, indice: str, anio: int, mes: int) -> dict:
    """Relativos del periodo contra el mes anterior y alertas por producto (HB o regla simple si hay pocos casos)."""
    actuales = _precios_mes(bd, indice, *(anio, mes))
    previos = _precios_mes(bd, indice, *_anterior(anio, mes))
    por_producto: dict[int, list] = defaultdict(list)
    for clave, p in actuales.items():
        ant = previos.get(clave)
        if ant and ant.precio > 0 and p.precio > 0:
            por_producto[p.producto_id].append((p, ant.precio, p.precio / ant.precio))
    evaluados: dict[int, dict] = {}
    for filas in por_producto.values():
        relativos = [r for _, _, r in filas]
        mediana = statistics.median(relativos)
        if len(filas) >= MIN_GRUPO_HB:
            res = hidiroglou_berthelot(relativos, [max(a, p.precio) for p, a, _ in filas])
            for (p, a, r), h in zip(filas, res, strict=True):
                evaluados[p.id] = {"anterior": a, "relativo": r, "mediana_producto": mediana, "metodo": "Hidiroglou-Berthelot",
                                   "atipico": h.atipico and abs(r - mediana) >= DESVIO_MINIMO, "exceso": h.exceso}
        else:
            # Con uno o dos precios la mediana es el propio precio: se compara contra «sin cambio».
            referencia = mediana if len(filas) >= 3 else 1.0
            for p, a, r in filas:
                atipico = abs(r - referencia) > UMBRAL_SIMPLE
                evaluados[p.id] = {"anterior": a, "relativo": r, "mediana_producto": mediana,
                                   "metodo": f"Variación mayor a {int(UMBRAL_SIMPLE * 100)} % respecto a la mediana (grupo pequeño)",
                                   "atipico": atipico, "exceso": max(abs(r - referencia) - UMBRAL_SIMPLE, 0) / UMBRAL_SIMPLE}
    esperados = set(previos) | set(actuales)
    return {"actuales": actuales, "previos": previos, "evaluados": evaluados, "esperados": esperados}


def _severidad(exceso: float) -> str:
    return "alta" if exceso >= 1.0 else "media" if exceso >= 0.4 else "baja"


def _informante_json(i: InformanteRecoleccion, ver_nombre: bool) -> dict:
    return {"id": i.id, "codigo": i.codigo, "indice": i.indice, "nombre": i.nombre if ver_nombre else None,
            "actividad": i.actividad, "departamento": i.departamento, "municipio": i.municipio, "activo": i.activo,
            "es_demo": i.es_demo}


def _producto_json(p: ProductoRecoleccion) -> dict:
    return {"id": p.id, "codigo": p.codigo, "indice": p.indice, "nombre": p.nombre, "especificacion": p.especificacion,
            "unidad": p.unidad, "grupo": p.grupo, "es_demo": p.es_demo}


@router.get("/resumen")
def resumen(ctx: Contexto = Depends(requiere("indices:ver")), bd: Session = Depends(obtener_bd)):
    salida = []
    for indice, nombre in INDICES.items():
        ultimo = _ultimo_periodo(bd, indice)
        fila = {"indice": indice, "nombre": nombre,
                "informantes": bd.execute(select(func.count()).select_from(InformanteRecoleccion).where(
                    InformanteRecoleccion.indice == indice, InformanteRecoleccion.activo.is_(True))).scalar(),
                "productos": bd.execute(select(func.count()).select_from(ProductoRecoleccion).where(
                    ProductoRecoleccion.indice == indice)).scalar(),
                "periodo": None, "capturados": 0, "esperados": 0, "cobertura": None, "alertas": 0, "es_demo": False}
        if ultimo:
            ev = _evaluar(bd, indice, *ultimo)
            fila.update(periodo=f"{ultimo[0]}-{ultimo[1]:02d}", capturados=len(ev["actuales"]), esperados=len(ev["esperados"]),
                        cobertura=round(len(ev["actuales"]) / len(ev["esperados"]) * 100, 1) if ev["esperados"] else None,
                        alertas=sum(1 for e in ev["evaluados"].values() if e["atipico"]),
                        es_demo=any(p.es_demo for p in ev["actuales"].values()))
        salida.append(fila)
    return {"indices": salida, "ve_informantes": ctx.puede("indices:alertas")}


@router.get("/periodos")
def periodos(indice: str = Query(pattern=PATRON_INDICE), ctx: Contexto = Depends(requiere("indices:ver")),
             bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(PrecioCapturado.anio, PrecioCapturado.mes).where(PrecioCapturado.indice == indice)
                       .distinct().order_by(PrecioCapturado.anio.desc(), PrecioCapturado.mes.desc())).all()
    return [f"{a}-{m:02d}" for a, m in filas]


@router.get("/informantes")
def informantes(indice: str = Query(pattern=PATRON_INDICE), ctx: Contexto = Depends(requiere("indices:ver")),
                bd: Session = Depends(obtener_bd)):
    ver = ctx.puede("indices:alertas")
    filas = bd.execute(select(InformanteRecoleccion).where(InformanteRecoleccion.indice == indice)
                       .order_by(InformanteRecoleccion.codigo)).scalars()
    return [_informante_json(i, ver) for i in filas]


class NuevoInformante(BaseModel):
    indice: str = Field(pattern=PATRON_INDICE)
    nombre: str = Field(min_length=2, max_length=200)
    actividad: str = Field(default="", max_length=120)
    departamento: str = Field(default="", max_length=40)
    municipio: str = Field(default="", max_length=80)


@router.post("/informantes", status_code=201)
def crear_informante(datos: NuevoInformante, ctx: Contexto = Depends(requiere("indices:alertas")),
                     bd: Session = Depends(obtener_bd)):
    n = (bd.execute(select(func.count()).select_from(InformanteRecoleccion)
                    .where(InformanteRecoleccion.indice == datos.indice)).scalar() or 0) + 1
    i = InformanteRecoleccion(codigo=f"{datos.indice}-I{n:04d}", indice=datos.indice, nombre=datos.nombre.strip(),
                              actividad=datos.actividad.strip(), departamento=datos.departamento.strip(),
                              municipio=datos.municipio.strip())
    bd.add(i)
    bd.commit()
    # La bitácora guarda solo el código: el nombre del informante no sale del módulo.
    bitacora.registrar("recoleccion.informante_creado", usuario=ctx.usuario, modulo="recoleccion", objeto=i.codigo, ip=ctx.ip)
    return _informante_json(i, True)


@router.get("/productos")
def productos(indice: str = Query(pattern=PATRON_INDICE), ctx: Contexto = Depends(requiere("indices:ver")),
              bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(ProductoRecoleccion).where(ProductoRecoleccion.indice == indice)
                       .order_by(ProductoRecoleccion.grupo, ProductoRecoleccion.nombre)).scalars()
    return [_producto_json(p) for p in filas]


class NuevoProducto(BaseModel):
    indice: str = Field(pattern=PATRON_INDICE)
    nombre: str = Field(min_length=2, max_length=200)
    especificacion: str = Field(default="", max_length=1000)
    unidad: str = Field(default="Unidad", min_length=1, max_length=60)
    grupo: str = Field(default="", max_length=80)


@router.post("/productos", status_code=201)
def crear_producto(datos: NuevoProducto, ctx: Contexto = Depends(requiere("indices:alertas")),
                   bd: Session = Depends(obtener_bd)):
    n = (bd.execute(select(func.count()).select_from(ProductoRecoleccion)
                    .where(ProductoRecoleccion.indice == datos.indice)).scalar() or 0) + 1
    p = ProductoRecoleccion(codigo=f"{datos.indice}-P{n:03d}", indice=datos.indice, nombre=datos.nombre.strip(),
                            especificacion=datos.especificacion.strip(), unidad=datos.unidad.strip(), grupo=datos.grupo.strip())
    bd.add(p)
    bd.commit()
    bitacora.registrar("recoleccion.producto_creado", usuario=ctx.usuario, modulo="recoleccion", objeto=p.codigo, ip=ctx.ip)
    return _producto_json(p)


@router.get("/precios")
def precios(indice: str = Query(pattern=PATRON_INDICE), periodo: str | None = None,
            ctx: Contexto = Depends(requiere("indices:ver")), bd: Session = Depends(obtener_bd)):
    """Precios del periodo con su variación, y los pares informante-producto que faltan por capturar."""
    p = _periodo(periodo) or _ultimo_periodo(bd, indice)
    if not p:
        return {"periodo": None, "precios": [], "pendientes": []}
    ev = _evaluar(bd, indice, *p)
    inf = {i.id: i for i in bd.execute(select(InformanteRecoleccion).where(InformanteRecoleccion.indice == indice)).scalars()}
    prod = {x.id: x for x in bd.execute(select(ProductoRecoleccion).where(ProductoRecoleccion.indice == indice)).scalars()}
    ver = ctx.puede("indices:alertas")
    filas = []
    for (i_id, p_id), pc in ev["actuales"].items():
        e = ev["evaluados"].get(pc.id)
        filas.append({"id": pc.id, "informante": inf[i_id].codigo, "nombre_informante": inf[i_id].nombre if ver else None,
                      "departamento": inf[i_id].departamento, "producto": prod[p_id].nombre, "unidad": prod[p_id].unidad,
                      "grupo": prod[p_id].grupo, "precio": pc.precio, "anterior": e["anterior"] if e else None,
                      "variacion": round((e["relativo"] - 1) * 100, 1) if e else None, "atipico": bool(e and e["atipico"]),
                      "severidad": _severidad(e["exceso"]) if e and e["atipico"] else None,
                      "metodo": e["metodo"] if e else "Sin precio del mes anterior", "observacion": pc.observacion,
                      "es_demo": pc.es_demo})
    filas.sort(key=lambda f: (not f["atipico"], f["producto"], f["informante"]))
    pendientes = [{"informante": inf[i].codigo, "nombre_informante": inf[i].nombre if ver else None,
                   "departamento": inf[i].departamento, "producto": prod[pr].nombre,
                   "precio_anterior": ev["previos"][(i, pr)].precio}
                  for i, pr in sorted(ev["esperados"] - set(ev["actuales"])) if (i, pr) in ev["previos"] and inf[i].activo]
    return {"periodo": f"{p[0]}-{p[1]:02d}", "precios": filas, "pendientes": pendientes}


class Captura(BaseModel):
    informante_id: int
    producto_id: int
    periodo: str = Field(pattern=r"^\d{4}-\d{2}$")
    precio: float = Field(gt=0, le=1e9)
    observacion: str = Field(default="", max_length=500)


@router.post("/precios")
def capturar(datos: Captura, ctx: Contexto = Depends(requiere("indices:alertas")), bd: Session = Depends(obtener_bd)):
    """Guarda (o corrige) un precio y devuelve de inmediato su variación y si queda para revisar."""
    inf = bd.get(InformanteRecoleccion, datos.informante_id)
    prod = bd.get(ProductoRecoleccion, datos.producto_id)
    if not inf or not prod or inf.indice != prod.indice:
        raise HTTPException(422, "El informante y el producto deben existir y pertenecer al mismo índice.")
    if not inf.activo:
        raise HTTPException(409, "El informante está inactivo.")
    anio, mes = _periodo(datos.periodo)
    pc = bd.execute(select(PrecioCapturado).where(PrecioCapturado.informante_id == inf.id, PrecioCapturado.producto_id == prod.id,
                                                  PrecioCapturado.anio == anio, PrecioCapturado.mes == mes)).scalar()
    corregido = pc is not None
    if pc is None:
        pc = PrecioCapturado(indice=inf.indice, informante_id=inf.id, producto_id=prod.id, anio=anio, mes=mes, precio=datos.precio)
        bd.add(pc)
    pc.precio, pc.observacion = datos.precio, datos.observacion.strip()
    pc.capturado_por, pc.capturado_en, pc.es_demo = ctx.usuario.id, ahora(), False
    bd.commit()
    ev = _evaluar(bd, inf.indice, anio, mes)
    e = ev["evaluados"].get(pc.id)
    bitacora.registrar("recoleccion.precio_corregido" if corregido else "recoleccion.precio_capturado", usuario=ctx.usuario,
                       modulo="recoleccion", objeto=f"{inf.codigo}/{prod.codigo}/{datos.periodo}", ip=ctx.ip)
    if not e:
        mensaje = "Guardado. Es el primer precio de este producto con este informante: servirá de base el próximo mes."
    elif e["atipico"]:
        mensaje = (f"Guardado y marcado para revisar: varió {round((e['relativo'] - 1) * 100, 1)} % frente al mes anterior, "
                   f"mientras la mediana del producto varió {round((e['mediana_producto'] - 1) * 100, 1)} %. "
                   "Confirme el precio con el informante o anote el motivo.")
    else:
        mensaje = f"Guardado. Variación de {round((e['relativo'] - 1) * 100, 1)} % frente al mes anterior, dentro de lo esperado."
    return {"id": pc.id, "corregido": corregido, "atipico": bool(e and e["atipico"]), "mensaje": mensaje,
            "variacion": round((e["relativo"] - 1) * 100, 1) if e else None}


@router.get("/alertas")
def alertas(indice: str = Query(pattern=PATRON_INDICE), periodo: str | None = None,
            ctx: Contexto = Depends(requiere("indices:ver")), bd: Session = Depends(obtener_bd)):
    datos = precios(indice, periodo, ctx, bd)
    return {"periodo": datos["periodo"], "alertas": [f for f in datos["precios"] if f["atipico"]]}
