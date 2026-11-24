"""Lista blanca de tareas que las automatizaciones pueden ejecutar.

Agregar una tarea nueva exige escribirla aquí (revisión de código); los usuarios solo eligen
de esta lista y ajustan parámetros validados.
"""

from __future__ import annotations

import statistics
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..avisos import notificar_permiso
from ..db import ahora
from ..models import Automatizacion, AvanceOperativo, CompraItem, Hallazgo, PrecioRecolectado, SolicitudPrecio
from ..texto import fichas
from . import agente_seguridad, agente_ti, alertas, catalogo, retencion


@dataclass
class Tarea:
    clave: str
    nombre: str
    descripcion: str
    funcion: Callable[[Session, dict, Automatizacion], dict]
    permiso: str
    parametros: dict = field(default_factory=dict)  # nombre -> descripción


def _verificar_bitacora(bd: Session, _p: dict, _a: Automatizacion) -> dict:
    res = bitacora.verificar_cadena(bd)
    if not res["integra"]:
        notificar_permiso(bd, "seguridad:gestionar", "La bitácora fue alterada",
                          f"La cadena de hashes se rompe en el registro {res['roto_en']}.", "critico", "/bitacora")
        return {"resumen": f"ALERTA: la cadena se rompe en el registro {res['roto_en']}.", "metricas": res,
                "nivel": "critico", "notificar": True}
    return {"resumen": f"Bitácora íntegra: {res['registros']} registros verificados.", "metricas": res}


def _seguridad(bd: Session, _p: dict, _a: Automatizacion) -> dict:
    r = agente_seguridad.revisar(bd)
    criticos = bd.execute(select(func.count()).select_from(Hallazgo).where(
        Hallazgo.agente == "seguridad", Hallazgo.estado == "abierto", Hallazgo.severidad.in_(["critica", "alta"]))).scalar()
    if r["nuevos"] and criticos:
        notificar_permiso(bd, "seguridad:gestionar", "Nuevos hallazgos de seguridad",
                          f"{r['nuevos']} hallazgo(s) nuevo(s); {criticos} de severidad alta o crítica.", "alerta",
                          "/seguridad")
    return {"resumen": f"Postura de seguridad: {r['puntaje']}/100 · {r['fallidos']} de {r['chequeos']} chequeos con "
                       f"observaciones ({r['nuevos']} nuevos, {r['resueltos']} resueltos).", "metricas": r}


def _ti(bd: Session, _p: dict, _a: Automatizacion) -> dict:
    r = agente_ti.revisar(bd)
    return {"resumen": f"Salud de TI: {r['puntaje']}/100 · {r['fallidos']} de {r['chequeos']} chequeos con "
                       f"observaciones.", "metricas": r}


def _respaldar(_bd: Session, p: dict, _a: Automatizacion) -> dict:
    return agente_ti.respaldar(conservar=max(1, min(int(p.get("conservar", 7)), 60)))


def _retencion(bd: Session, _p: dict, _a: Automatizacion) -> dict:
    r = retencion.aplicar_todas(bd)
    return {"resumen": "Políticas aplicadas: " + "; ".join(f"{k}: {v}" for k, v in r.items()), "metricas": r}


def _catalogo(bd: Session, _p: dict, _a: Automatizacion) -> dict:
    return catalogo.sincronizar(bd)


def _atipicos(bd: Session, p: dict, _a: Automatizacion) -> dict:
    periodo = str(p.get("periodo") or "")
    if not periodo:
        ultimo = bd.execute(select(PrecioRecolectado.anio, PrecioRecolectado.mes)
                            .order_by(PrecioRecolectado.anio.desc(), PrecioRecolectado.mes.desc()).limit(1)).first()
        if not ultimo:
            return {"resumen": "No hay precios recolectados cargados."}
        anio, mes = ultimo
    else:
        anio, mes = (int(x) for x in periodo.split("-"))
    c = max(2.0, min(float(p.get("c", 4.0)), 10.0))
    r = alertas.detectar(bd, anio, mes, c=c)
    if r["alertas"]:
        notificar_permiso(bd, "indices:alertas", f"{r['alertas']} alertas de precios en {r['periodo']}",
                          f"Método: {r['metodo']}. Revise las de severidad alta primero.", "alerta", "/indices/alertas")
    return {"resumen": f"{r['alertas']} alertas en {r['periodo']} ({r['proporcion'] * 100:.1f} % de "
                       f"{r['evaluadas']} observaciones evaluadas) · método {r['metodo']}.", "metricas": r}


def _vigilar_producto(bd: Session, p: dict, a: Automatizacion) -> dict:
    terminos = str(p.get("terminos", ""))[:100]
    umbral = max(1.0, min(float(p.get("umbral_pct", 10)), 100.0))
    conds = [CompraItem.texto_norm.like(f"%{t}%") for t in fichas(terminos)[:6]]
    if not conds:
        raise ValueError("Indique los términos del producto a vigilar.")
    desde = (ahora() - timedelta(days=365)).date()
    ultima = bd.execute(select(func.max(CompraItem.fecha))).scalar() or date.today()
    desde = min(desde, ultima - timedelta(days=365))
    precios = [x for (x,) in bd.execute(select(CompraItem.precio_unitario).where(and_(*conds, CompraItem.fecha >= desde)))]
    if len(precios) < 3:
        return {"resumen": f"Menos de 3 compras para «{terminos}» en los últimos 12 meses con datos."}
    mediana = statistics.median(precios)
    anterior = p.get("ultima_mediana")
    params = {**p, "ultima_mediana": round(mediana, 2)}
    cambio = (mediana / anterior - 1) * 100 if anterior else 0.0
    notificar = bool(anterior) and abs(cambio) >= umbral
    texto = f"Mediana de «{terminos}»: Q{mediana:,.2f} con {len(precios)} compras"
    if anterior:
        texto += f" (antes Q{anterior:,.2f}; cambio {cambio:+.1f} %)"
    return {"resumen": texto + ".", "metricas": {"mediana": mediana, "n": len(precios), "cambio_pct": round(cambio, 2)},
            "parametros": params, "notificar": notificar or not anterior, "nivel": "alerta" if notificar else "info"}


def _vencimientos(bd: Session, p: dict, a: Automatizacion) -> dict:
    dias = max(1, min(int(p.get("dias", 3)), 30))
    limite = date.today() + timedelta(days=dias)
    q = select(SolicitudPrecio).where(SolicitudPrecio.estado != "entregada", SolicitudPrecio.rechazada.is_(False),
                                      SolicitudPrecio.fecha_limite <= limite)
    proximas = bd.execute(q).scalars().all()
    lista = ", ".join(f"{s.codigo} ({s.fecha_limite:%d/%m})" for s in proximas[:8])
    return {"resumen": f"{len(proximas)} solicitud(es) vencen en {dias} días o menos" + (f": {lista}." if lista else "."),
            "metricas": {"por_vencer": len(proximas)}, "notificar": bool(proximas), "nivel": "alerta"}


def _resumen(bd: Session, _p: dict, a: Automatizacion) -> dict:
    from .centro import resumen_general  # importación diferida

    r = resumen_general(bd)
    k = r["indicadores"]
    texto = (f"IPC interanual {k['ipc_interanual']:+.2f} % ({k['ipc_periodo']}); CBA urbana Q{k['cba_urbana']:,.2f}; "
             f"{k['alertas_nuevas']} alertas nuevas; {k['solicitudes_abiertas']} solicitudes abiertas; "
             f"seguridad {k['puntaje_seguridad']}/100.")
    return {"resumen": texto, "metricas": k, "notificar": True}


def _avance(bd: Session, _p: dict, _a: Automatizacion) -> dict:
    filas = bd.execute(select(AvanceOperativo.departamento, func.sum(AvanceOperativo.meta),
                              func.sum(AvanceOperativo.completados)).group_by(AvanceOperativo.departamento)).all()
    if not filas:
        return {"resumen": "No hay operativos registrados."}
    rezagados = sorted(((d, c / m * 100) for d, m, c in filas if m), key=lambda x: x[1])[:3]
    total_m = sum(m for _, m, _ in filas)
    total_c = sum(c for _, _, c in filas)
    return {"resumen": f"Avance nacional {total_c / total_m * 100:.1f} %. Más rezagados: "
                       + ", ".join(f"{d} ({p:.0f} %)" for d, p in rezagados) + ".",
            "metricas": {"avance_pct": round(total_c / total_m * 100, 2)}, "notificar": True}


TAREAS: dict[str, Tarea] = {t.clave: t for t in [
    Tarea("bitacora.verificar", "Verificar integridad de la bitácora", "Recalcula la cadena de hashes.",
          _verificar_bitacora, "seguridad:ver"),
    Tarea("seguridad.revisar", "Agente de ciberseguridad", "Ejecuta los chequeos de postura de seguridad.",
          _seguridad, "seguridad:ver"),
    Tarea("ti.revisar", "Agente de TI", "Revisa salud, frescura de datos y automatizaciones.", _ti, "ti:ver"),
    Tarea("ti.respaldar", "Respaldar base de datos", "Copia de seguridad en caliente (SQLite) o guía de pg_dump.",
          _respaldar, "automatizaciones:administrar", {"conservar": "Cantidad de respaldos a conservar"}),
    Tarea("retencion.aplicar", "Aplicar políticas de retención", "Elimina o anonimiza datos vencidos.",
          _retencion, "privacidad:administrar"),
    Tarea("catalogo.sincronizar", "Sincronizar catálogo del INE", "Consulta el portal CKAN del INE.",
          _catalogo, "datos:sincronizar"),
    Tarea("indices.detectar_atipicos", "Detectar precios atípicos", "Hidiroglou-Berthelot o desvío de nivel.",
          _atipicos, "indices:alertas", {"periodo": "AAAA-MM (vacío = último)", "c": "Amplitud de tolerancia (2-10)"}),
    Tarea("dpir.vigilar_producto", "Vigilar el precio de un producto", "Mediana en Guatecompras y aviso de cambios.",
          _vigilar_producto, "dpir:ver", {"terminos": "Producto a vigilar", "umbral_pct": "Cambio que dispara aviso (%)"}),
    Tarea("dpir.recordar_vencimientos", "Recordar solicitudes por vencer", "Avisa vencimientos próximos.",
          _vencimientos, "dpir:gestionar", {"dias": "Días de anticipación"}),
    Tarea("reportes.resumen", "Resumen de indicadores", "Cifras clave del centro de mando.", _resumen, "tableros:ver"),
    Tarea("territorio.resumen_avance", "Resumen de avance de operativo", "Avance por departamento.", _avance,
          "territorio:ver"),
]}
