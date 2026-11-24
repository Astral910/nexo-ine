"""Lista blanca de tareas que las automatizaciones pueden ejecutar.

Agregar una tarea nueva exige escribirla aquí (revisión de código); los usuarios solo eligen
de esta lista y ajustan parámetros validados.
"""

from __future__ import annotations

import statistics
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..avisos import notificar_permiso
from ..db import ahora
from ..models import Automatizacion, AvanceOperativo, CompraItem, Hallazgo, PrecioRecolectado, SolicitudPrecio
from ..texto import fichas
from . import agente_seguridad, agente_ti, alertas, catalogo, retencion


@dataclass
class Campo:
    """Un dato que la persona completa al crear la automatización (se valida en el servidor)."""

    clave: str
    etiqueta: str
    tipo: str = "texto"  # texto | numero | periodo (AAAA-MM)
    ayuda: str = ""
    defecto: Any = None
    minimo: float | None = None
    maximo: float | None = None
    ejemplo: str = ""


@dataclass
class Tarea:
    clave: str
    nombre: str
    descripcion: str
    funcion: Callable[[Session, dict, Automatizacion], dict]
    permiso: str
    para_que: str = ""  # en lenguaje sencillo: qué hace y qué recibe la persona
    categoria: str = "Recordatorios y reportes"
    campos: list[Campo] = field(default_factory=list)
    parametros: dict = field(default_factory=dict)  # clave -> etiqueta (se deriva de los campos)

    def __post_init__(self) -> None:
        if self.campos and not self.parametros:
            self.parametros = {c.clave: c.etiqueta for c in self.campos}


@dataclass
class Plantilla:
    """Automatización lista para usar: la persona solo confirma (o ajusta) y la crea."""

    id: str
    titulo: str
    descripcion: str
    tarea: str
    parametros: dict
    frecuencia: str
    valor_frecuencia: str


# Datos que una tarea guarda para sí misma entre ejecuciones (no los escribe la persona).
ESTADO_INTERNO = {"ultima_mediana"}


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
          _verificar_bitacora, "seguridad:ver",
          para_que="Comprueba que nadie haya cambiado ni borrado el registro de acciones de Nexo. Si encuentra un "
                   "cambio, avisa de inmediato a Seguridad.",
          categoria="Seguridad y sistema"),
    Tarea("seguridad.revisar", "Agente de ciberseguridad", "Ejecuta los chequeos de postura de seguridad.",
          _seguridad, "seguridad:ver",
          para_que="Revisa la seguridad de la plataforma (segundo factor, intentos fallidos, sesiones, permisos) y "
                   "anota lo que hay que corregir, con su recomendación.",
          categoria="Seguridad y sistema"),
    Tarea("ti.revisar", "Agente de TI", "Revisa salud, frescura de datos y automatizaciones.", _ti, "ti:ver",
          para_que="Comprueba que Nexo esté sano: que la base de datos responda, que haya espacio, respaldos y datos "
                   "al día, y que las demás automatizaciones no fallen.",
          categoria="Seguridad y sistema"),
    Tarea("ti.respaldar", "Respaldar base de datos", "Copia de seguridad en caliente (SQLite) o guía de pg_dump.",
          _respaldar, "automatizaciones:administrar",
          para_que="Guarda una copia de seguridad de la base de datos y conserva solo las más recientes.",
          categoria="Seguridad y sistema",
          campos=[Campo("conservar", "Respaldos a conservar", "numero", "Los más antiguos se borran solos.", 7, 1, 60,
                        "7")]),
    Tarea("retencion.aplicar", "Aplicar políticas de retención", "Elimina o anonimiza datos vencidos.",
          _retencion, "privacidad:administrar",
          para_que="Borra o anonimiza los datos personales que ya cumplieron su plazo de conservación, según las "
                   "políticas de privacidad. La bitácora se conserva.",
          categoria="Privacidad"),
    Tarea("catalogo.sincronizar", "Sincronizar catálogo del INE", "Consulta el portal CKAN del INE.",
          _catalogo, "datos:sincronizar",
          para_que="Consulta el portal de datos abiertos del INE para saber qué conjuntos de datos son nuevos o se "
                   "actualizaron.",
          categoria="Calidad y alertas"),
    Tarea("indices.detectar_atipicos", "Detectar precios atípicos", "Hidiroglou-Berthelot o desvío de nivel.",
          _atipicos, "indices:alertas",
          para_que="Revisa los precios recolectados de un mes y marca los que cambiaron de forma poco común, para que "
                   "una persona confirme si son reales o errores de captura.",
          categoria="Calidad y alertas",
          campos=[Campo("periodo", "Mes a revisar", "periodo",
                        "Escríbalo como AAAA-MM. Déjelo vacío para revisar el último mes con datos.", None,
                        ejemplo="2023-10"),
                  Campo("c", "Tolerancia", "numero",
                        "Entre 2 y 10. Un número más alto marca menos precios: solo los cambios más extremos.", 4, 2,
                        10, "4")]),
    Tarea("dpir.vigilar_producto", "Vigilar el precio de un producto", "Mediana en Guatecompras y aviso de cambios.",
          _vigilar_producto, "dpir:ver",
          para_que="Sigue el precio de un producto en las compras públicas y le avisa si sube o baja más de lo que "
                   "usted indique.",
          categoria="Vigilancia de precios",
          campos=[Campo("terminos", "Producto a vigilar", "texto",
                        "Escríbalo como aparece en las compras públicas, sin marcas.", None, ejemplo="computadora portatil"),
                  Campo("umbral_pct", "Cambio que dispara el aviso (%)", "numero",
                        "Le avisamos si el precio mediano sube o baja más que este porcentaje.", 10, 1, 100, "10")]),
    Tarea("dpir.recordar_vencimientos", "Recordar solicitudes por vencer", "Avisa vencimientos próximos.",
          _vencimientos, "dpir:gestionar",
          para_que="Le avisa qué solicitudes de precio de referencia están por vencer, para atenderlas a tiempo.",
          categoria="Recordatorios y reportes",
          campos=[Campo("dias", "Días de anticipación", "numero",
                        "Le avisamos de las solicitudes que vencen en este número de días o menos.", 3, 1, 30, "3")]),
    Tarea("reportes.resumen", "Resumen de indicadores", "Cifras clave del centro de mando.", _resumen, "tableros:ver",
          para_que="Le envía una notificación con las cifras clave: inflación, canasta básica, alertas de precios y "
                   "solicitudes abiertas.",
          categoria="Recordatorios y reportes"),
    Tarea("territorio.resumen_avance", "Resumen de avance de operativo", "Avance por departamento.", _avance,
          "territorio:ver",
          para_que="Calcula cuánto lleva el operativo de campo en cada departamento y le dice cuáles van más atrasados.",
          categoria="Recordatorios y reportes"),
]}

PLANTILLAS: list[Plantilla] = [
    Plantilla("precio-laptops", "Avisarme si cambia el precio de las computadoras portátiles",
              "Cada lunes revisa las compras públicas de computadoras portátiles y le avisa si el precio mediano "
              "cambia más de 10 %.", "dpir.vigilar_producto", {"terminos": "computadora portatil", "umbral_pct": 10},
              "semanal", "0@07:00"),
    Plantilla("vencimientos", "Recordarme cada mañana las solicitudes por vencer",
              "Cada día a las 7:30 le dice qué solicitudes vencen en 3 días o menos.", "dpir.recordar_vencimientos",
              {"dias": 3}, "diaria", "07:30"),
    Plantilla("resumen-diario", "Recibir cada mañana las cifras clave",
              "Cada día a las 7:00 recibe la inflación, la canasta básica, las alertas y las solicitudes abiertas.",
              "reportes.resumen", {}, "diaria", "07:00"),
    Plantilla("atipicos-semanal", "Revisar cada lunes los precios atípicos",
              "Cada lunes a las 8:00 revisa el último mes de precios recolectados y marca los cambios poco comunes.",
              "indices.detectar_atipicos", {}, "semanal", "0@08:00"),
    Plantilla("avance-viernes", "Resumen del avance de campo cada viernes",
              "Cada viernes a las 16:00 recibe el avance del operativo por departamento y los más atrasados.",
              "territorio.resumen_avance", {}, "semanal", "4@16:00"),
]
