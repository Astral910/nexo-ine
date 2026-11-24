"""Índices y Estadísticas Continuas: IPC, IPMC, CBA, precios recolectados y alertas de precios."""

from __future__ import annotations

import statistics
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..config import obtener_config
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import AlertaPrecio, PrecioRecolectado, SerieIndice
from ..services import alertas as motor_alertas
from ..services.centro import resumen_general
from ..texto import fichas

router = APIRouter(prefix="/api/indices", tags=["índices"])


@router.get("/resumen")
def resumen(ctx: Contexto = Depends(requiere("indices:ver", "tableros:ver")), bd: Session = Depends(obtener_bd)):
    k = resumen_general(bd)["indicadores"]
    ultimos_ipmc = bd.execute(select(SerieIndice.anio, SerieIndice.mes).where(SerieIndice.indicador == "IPMC")
                              .order_by(SerieIndice.anio.desc(), SerieIndice.mes.desc()).limit(1)).first()
    ipmc = []
    if ultimos_ipmc:
        ipmc = [{"articulo": s.clave, "indice": s.valor} for s in bd.execute(
            select(SerieIndice).where(SerieIndice.indicador == "IPMC", SerieIndice.anio == ultimos_ipmc[0],
                                      SerieIndice.mes == ultimos_ipmc[1]).order_by(SerieIndice.valor.desc())).scalars()]
    return {"ipc": {"indice": k["ipc_indice"], "interanual": k["ipc_interanual"], "mensual": k["ipc_mensual"],
                    "periodo": k["ipc_periodo"]},
            "cba": {"urbana": k["cba_urbana"], "rural": k["cba_rural"], "periodo": k["cba_periodo"]},
            "ipmc": {"periodo": f"{ultimos_ipmc[0]}-{ultimos_ipmc[1]:02d}" if ultimos_ipmc else "", "articulos": ipmc},
            "alertas": {"nuevas": k["alertas_nuevas"], "altas": k["alertas_altas"]}}


@router.get("/alertas")
def listar_alertas(periodo: str | None = None, estado: str | None = None, severidad: str | None = None,
                   departamento: str | None = None, texto: str | None = Query(default=None, max_length=100),
                   pagina: int = Query(default=1, ge=1, le=500), ctx: Contexto = Depends(requiere("indices:ver")),
                   bd: Session = Depends(obtener_bd)):
    q = select(AlertaPrecio)
    if periodo:
        q = q.where(AlertaPrecio.periodo == periodo)
    if estado:
        q = q.where(AlertaPrecio.estado == estado)
    if severidad:
        q = q.where(AlertaPrecio.severidad == severidad)
    if departamento:
        q = q.where(AlertaPrecio.departamento == departamento)
    for f in fichas(texto or "")[:4]:
        q = q.where(func.lower(AlertaPrecio.articulo).like(f"%{f}%"))
    total = bd.execute(select(func.count()).select_from(q.subquery())).scalar()
    orden = {"alta": 0, "media": 1, "baja": 2}
    filas = bd.execute(q.order_by(AlertaPrecio.periodo.desc(), AlertaPrecio.severidad, AlertaPrecio.puntaje.desc())
                       .offset((pagina - 1) * 50).limit(50)).scalars().all()
    ver_codigo = ctx.puede("indices:alertas")
    return {"total": total, "pagina": pagina, "alertas": [{
        "id": a.id, "periodo": a.periodo, "articulo": a.articulo, "cod_articulo": a.cod_articulo,
        "departamento": a.departamento, "municipio": a.municipio,
        "informante": a.cod_fuente if ver_codigo else "•••", "precio_anterior": a.precio_anterior,
        "precio_actual": a.precio_actual, "relativo": a.relativo, "mediana_grupo": a.mediana_grupo,
        "puntaje": a.puntaje, "limites": [a.limite_inferior, a.limite_superior], "n_grupo": a.n_grupo,
        "severidad": a.severidad, "orden": orden.get(a.severidad, 3), "metodo": a.metodo, "estado": a.estado,
        "comentario": a.comentario} for a in filas]}


@router.get("/alertas/resumen")
def resumen_alertas(ctx: Contexto = Depends(requiere("indices:ver")), bd: Session = Depends(obtener_bd)):
    por = lambda col: dict(bd.execute(select(col, func.count()).group_by(col)).all())  # noqa: E731
    return {"por_severidad": por(AlertaPrecio.severidad), "por_estado": por(AlertaPrecio.estado),
            "por_periodo": por(AlertaPrecio.periodo), "periodos_disponibles": motor_alertas.periodos_disponibles(bd)}


class Revision(BaseModel):
    estado: str = Field(pattern="^(en_revision|confirmada|descartada|nueva)$")
    comentario: str = Field(default="", max_length=1000)


@router.patch("/alertas/{alerta_id}")
def revisar_alerta(alerta_id: int, datos: Revision, ctx: Contexto = Depends(requiere("indices:alertas")),
                   bd: Session = Depends(obtener_bd)):
    a = bd.get(AlertaPrecio, alerta_id)
    if a is None:
        raise HTTPException(404, "Alerta no encontrada.")
    if datos.estado in ("confirmada", "descartada") and not datos.comentario.strip():
        raise HTTPException(422, "Explique brevemente la decisión (queda en la bitácora).")
    a.estado, a.comentario = datos.estado, datos.comentario
    a.revisada_por, a.revisada_en = ctx.usuario.id, ahora()
    bd.commit()
    bitacora.registrar("indices.alerta_revisada", usuario=ctx.usuario, modulo="indices", objeto=f"alerta:{a.id}",
                       detalle={"estado": a.estado}, ip=ctx.ip)
    return {"ok": True}


class Deteccion(BaseModel):
    periodo: str = Field(pattern=r"^\d{4}-\d{2}$")
    c: float = Field(default=4.0, ge=2, le=10)


@router.post("/alertas/detectar")
def detectar(datos: Deteccion, ctx: Contexto = Depends(requiere("indices:alertas")), bd: Session = Depends(obtener_bd)):
    anio, mes = (int(x) for x in datos.periodo.split("-"))
    r = motor_alertas.detectar(bd, anio, mes, c=datos.c)
    bitacora.registrar("indices.deteccion", usuario=ctx.usuario, modulo="indices", detalle=r, ip=ctx.ip)
    return r


@router.get("/articulos")
def catalogo_articulos(texto: str | None = Query(default=None, max_length=100),
                       ctx: Contexto = Depends(requiere("indices:ver")), bd: Session = Depends(obtener_bd)):
    """Catálogo digital de artículos del IPC con su cobertura (base del Manual de Características)."""
    q = select(PrecioRecolectado.cod_articulo, func.max(PrecioRecolectado.articulo), func.count(),
               func.count(distinct(PrecioRecolectado.departamento)), func.max(PrecioRecolectado.anio * 100 + PrecioRecolectado.mes))
    for f in fichas(texto or "")[:4]:
        q = q.where(func.lower(PrecioRecolectado.articulo).like(f"%{f}%"))
    filas = bd.execute(q.group_by(PrecioRecolectado.cod_articulo).order_by(func.count().desc()).limit(300)).all()
    return [{"codigo": c, "articulo": a, "observaciones": n, "departamentos": d,
             "ultimo_periodo": f"{p // 100}-{p % 100:02d}"} for c, a, n, d, p in filas]


@router.get("/articulos/{codigo}")
def detalle_articulo(codigo: str, ctx: Contexto = Depends(requiere("indices:ver")), bd: Session = Depends(obtener_bd)):
    filas = bd.execute(select(PrecioRecolectado).where(PrecioRecolectado.cod_articulo == codigo[:20])).scalars().all()
    if not filas:
        raise HTTPException(404, "Artículo no encontrado.")
    k = max(obtener_config().k_minimo, 5)
    por_mes: dict[str, list] = defaultdict(list)
    por_depto: dict[str, list] = defaultdict(list)
    fuentes_mes: dict[str, set] = defaultdict(set)
    fuentes_depto: dict[str, set] = defaultdict(set)
    for f in filas:
        if f.precio_actual and f.cant_actual:
            p = f"{f.anio}-{f.mes:02d}"
            unitario = f.precio_actual / f.cant_actual
            por_mes[p].append(unitario)
            fuentes_mes[p].add(f.cod_fuente)
            por_depto[f.departamento].append(unitario)
            fuentes_depto[f.departamento].add(f.cod_fuente)

    def serie(grupos, fuentes):
        return [{"x": x, "mediana": round(statistics.median(v), 2) if len(fuentes[x]) >= k else None,
                 "n": None if len(fuentes[x]) < k else len(v), "suprimido": len(fuentes[x]) < k} for x, v in sorted(grupos.items())]

    return {"codigo": codigo, "articulo": filas[0].articulo, "por_mes": serie(por_mes, fuentes_mes),
            "por_departamento": sorted(serie(por_depto, fuentes_depto), key=lambda d: -(d["n"] or 0)),
            "nota": f"Precio unitario mediano (precio ÷ cantidad). Se suprimen celdas con menos de {k} informantes o "
                    "boletas por secreto estadístico."}


@router.get("/series")
def series(indicador: str = Query(pattern="^(IPC|IPMC|CBA)$"), ambito: str | None = None,
           texto: str | None = Query(default=None, max_length=100), desde_anio: int = 2015,
           ctx: Contexto = Depends(requiere("indices:ver", "tableros:ver")), bd: Session = Depends(obtener_bd)):
    q = select(SerieIndice).where(SerieIndice.indicador == indicador, SerieIndice.anio >= desde_anio)
    if ambito:
        q = q.where(SerieIndice.ambito == ambito)
    for f in fichas(texto or "")[:4]:
        q = q.where(func.lower(SerieIndice.clave).like(f"%{f}%"))
    claves: dict[str, list] = defaultdict(list)
    for s in bd.execute(q.order_by(SerieIndice.anio, SerieIndice.mes).limit(20000)).scalars():
        claves[s.clave].append({"x": f"{s.anio}-{s.mes:02d}", "valor": s.valor})
    return {"indicador": indicador, "series": [{"clave": k, "puntos": v} for k, v in list(claves.items())[:40]]}
