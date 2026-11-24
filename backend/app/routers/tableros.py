"""Tableros por rol, tableros personales, generación desde texto, capa analítica y componentes vivos."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import bitacora
from ..db import ahora, obtener_bd
from ..deps import Contexto, requiere
from ..models import (
    AlertaPrecio,
    Automatizacion,
    AvanceOperativo,
    FuenteDatos,
    Hallazgo,
    Riesgo,
    SolicitudPrecio,
    Tablero,
    Usuario,
    Validacion,
)
from ..security.limites import limitador
from ..services import generador, semantica
from ..services.centro import actividad, resumen_general
from ..services.hallazgos import puntaje
from ..services.programador import describir_frecuencia

router = APIRouter(prefix="/api", tags=["tableros"])
TIPOS = {"kpi", "linea", "barras", "barras_h", "dona", "tabla", "mapa", "sistema", "nota"}
COMPONENTES = {"indicadores_clave", "alertas_recientes", "solicitudes_activas", "mis_solicitudes",
               "automatizaciones_estado", "postura_seguridad", "salud_ti", "actividad_reciente", "frescura_datos",
               "avance_operativo", "mapa_riesgos", "validaciones_recientes", "rubrica_jurado", "mapa_lugares"}


def _validar_spec(spec: dict) -> dict:
    widgets = spec.get("widgets")
    if not isinstance(widgets, list) or not 0 < len(widgets) <= 24:
        raise HTTPException(422, "El tablero debe tener entre 1 y 24 widgets.")
    limpios = []
    for w in widgets:
        if not isinstance(w, dict) or w.get("tipo") not in TIPOS:
            raise HTTPException(422, "Tipo de widget no permitido.")
        nuevo = {"id": str(w.get("id", ""))[:40], "tipo": w["tipo"], "titulo": str(w.get("titulo", ""))[:160],
                 "ancho": max(3, min(int(w.get("ancho", 6)), 12))}
        if w["tipo"] in ("sistema", "mapa") and w.get("componente"):
            if w["componente"] not in COMPONENTES:
                raise HTTPException(422, "Componente no permitido.")
            nuevo["componente"] = w["componente"]
        if w.get("consulta"):
            c = w["consulta"]
            fuente = semantica.FUENTES.get(c.get("fuente"))
            if not fuente or (c.get("medida") and c["medida"] not in fuente.medidas):
                raise HTTPException(422, "Consulta no válida en un widget.")
            for d in (c.get("dimension"), c.get("serie")):
                if d and d not in fuente.dimensiones:
                    raise HTTPException(422, "Dimensión no válida en un widget.")
            filtros = {k: v for k, v in (c.get("filtros") or {}).items() if k in fuente.filtros}
            nuevo["consulta"] = {"fuente": c["fuente"], "medida": c.get("medida"), "dimension": c.get("dimension"),
                                 "serie": c.get("serie"), "filtros": filtros, "limite": c.get("limite")}
        if w["tipo"] == "nota":
            nuevo["texto"] = str(w.get("texto", ""))[:2000]
        limpios.append(nuevo)
    return {"titulo": str(spec.get("titulo", "Mi tablero"))[:160], "descripcion": str(spec.get("descripcion", ""))[:500],
            "widgets": limpios, "interpretacion": spec.get("interpretacion", [])[:12] if isinstance(
                spec.get("interpretacion"), list) else [], "advertencias": [str(a)[:300] for a in spec.get(
                    "advertencias", [])[:8]] if isinstance(spec.get("advertencias"), list) else []}


def _accesible(t: Tablero, ctx: Contexto) -> bool:
    return t.propietario_id == ctx.usuario.id or (t.origen == "sistema" and t.rol_codigo in ctx.roles)


@router.get("/tableros")
def listar(ctx: Contexto = Depends(requiere("tableros:ver", "dpir:solicitar")), bd: Session = Depends(obtener_bd)):
    q = select(Tablero).where(or_(Tablero.propietario_id == ctx.usuario.id,
                                  (Tablero.origen == "sistema") & Tablero.rol_codigo.in_(ctx.roles or ["-"])))
    return [{"id": t.id, "titulo": t.titulo, "origen": t.origen, "rol": t.rol_codigo, "fijado": t.fijado,
             "widgets": len((t.spec or {}).get("widgets", [])), "actualizado_en": t.actualizado_en.isoformat(),
             "consulta_texto": t.consulta_texto}
            for t in bd.execute(q.order_by(Tablero.origen != "sistema", Tablero.actualizado_en.desc())).scalars()]


@router.get("/tableros/{tid}")
def ver(tid: int, ctx: Contexto = Depends(requiere("tableros:ver", "dpir:solicitar")), bd: Session = Depends(obtener_bd)):
    t = bd.get(Tablero, tid)
    if t is None or not _accesible(t, ctx):
        raise HTTPException(404, "Tablero no encontrado.")
    return {"id": t.id, "titulo": t.titulo, "origen": t.origen, "rol": t.rol_codigo, "spec": t.spec,
            "propio": t.propietario_id == ctx.usuario.id, "consulta_texto": t.consulta_texto}


class GuardarTablero(BaseModel):
    titulo: str = Field(min_length=2, max_length=160)
    spec: dict
    consulta_texto: str | None = Field(default=None, max_length=300)
    fijado: bool = False


@router.post("/tableros", status_code=201)
def crear(datos: GuardarTablero, ctx: Contexto = Depends(requiere("tableros:crear")), bd: Session = Depends(obtener_bd)):
    if bd.execute(select(func.count()).select_from(Tablero).where(Tablero.propietario_id == ctx.usuario.id)).scalar() >= 50:
        raise HTTPException(409, "Llegó al máximo de 50 tableros propios.")
    spec = _validar_spec({**datos.spec, "titulo": datos.titulo})
    t = Tablero(titulo=datos.titulo, propietario_id=ctx.usuario.id, origen="generado" if datos.consulta_texto else "usuario",
                consulta_texto=datos.consulta_texto, spec=spec, fijado=datos.fijado)
    bd.add(t)
    bd.commit()
    bitacora.registrar("tableros.guardado", usuario=ctx.usuario, modulo="tableros", objeto=f"tablero:{t.id}", ip=ctx.ip)
    return {"id": t.id}


@router.put("/tableros/{tid}")
def actualizar(tid: int, datos: GuardarTablero, ctx: Contexto = Depends(requiere("tableros:crear")),
               bd: Session = Depends(obtener_bd)):
    t = bd.get(Tablero, tid)
    if t is None or t.propietario_id != ctx.usuario.id:
        raise HTTPException(404, "Tablero no encontrado.")
    t.titulo, t.spec, t.fijado, t.actualizado_en = datos.titulo, _validar_spec({**datos.spec, "titulo": datos.titulo}), datos.fijado, ahora()
    bd.commit()
    return {"ok": True}


@router.delete("/tableros/{tid}")
def borrar(tid: int, ctx: Contexto = Depends(requiere("tableros:crear")), bd: Session = Depends(obtener_bd)):
    t = bd.get(Tablero, tid)
    if t is None or t.propietario_id != ctx.usuario.id:
        raise HTTPException(404, "Tablero no encontrado.")
    bd.delete(t)
    bd.commit()
    return {"ok": True}


@router.post("/tableros/{tid}/duplicar", status_code=201)
def duplicar(tid: int, ctx: Contexto = Depends(requiere("tableros:crear")), bd: Session = Depends(obtener_bd)):
    t = bd.get(Tablero, tid)
    if t is None or not _accesible(t, ctx):
        raise HTTPException(404, "Tablero no encontrado.")
    copia = Tablero(titulo=f"{t.titulo} (mi copia)", propietario_id=ctx.usuario.id, origen="usuario", spec=t.spec)
    bd.add(copia)
    bd.commit()
    return {"id": copia.id}


class Peticion(BaseModel):
    peticion: str = Field(min_length=3, max_length=300)


@router.post("/tableros/generar")
def generar(datos: Peticion, ctx: Contexto = Depends(requiere("tableros:crear")), bd: Session = Depends(obtener_bd)):
    if not limitador.permitir(f"generar:{ctx.usuario.id}", 60, 60):
        raise HTTPException(429, "Demasiadas solicitudes; espere un momento.")
    try:
        spec = generador.generar(datos.peticion, ctx.permisos)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    bitacora.registrar("tableros.generado", usuario=ctx.usuario, modulo="tableros",
                       detalle={"peticion": datos.peticion[:200], "fuente": spec["widgets"][0]["consulta"]["fuente"]},
                       ip=ctx.ip)
    return spec


@router.get("/analitica/catalogo")
def catalogo(ctx: Contexto = Depends(requiere("tableros:ver"))):
    return {"fuentes": semantica.catalogo_publico(ctx.permisos), "ejemplos": generador.EJEMPLOS}


class Consulta(BaseModel):
    consulta: dict


@router.post("/analitica/consulta")
def consultar(datos: Consulta, ctx: Contexto = Depends(requiere("tableros:ver", "dpir:solicitar")),
              bd: Session = Depends(obtener_bd)):
    if not limitador.permitir(f"consulta:{ctx.usuario.id}", 600, 60):
        raise HTTPException(429, "Demasiadas consultas; espere un momento.")
    try:
        return semantica.ejecutar(bd, datos.consulta, ctx.permisos)
    except semantica.ErrorConsulta as e:
        raise HTTPException(422, str(e)) from e
    except (ValueError, TypeError) as e:
        raise HTTPException(422, "Consulta no válida.") from e


# ---------------------------------------------------------------------------
# Componentes vivos de los tableros
# ---------------------------------------------------------------------------


def _exigir(ctx: Contexto, *permisos: str) -> None:
    if not any(ctx.puede(p) for p in permisos):
        raise HTTPException(403, "No tiene permiso para este componente.")


@router.get("/componentes/{nombre}")
def componente(nombre: str, ctx: Contexto = Depends(requiere("tableros:ver", "dpir:solicitar")),
               bd: Session = Depends(obtener_bd)):
    if nombre not in COMPONENTES:
        raise HTTPException(404, "Componente no encontrado.")
    if nombre == "indicadores_clave":
        _exigir(ctx, "centro:ver")
        return resumen_general(bd)["indicadores"]
    if nombre == "actividad_reciente":
        _exigir(ctx, "centro:ver")
        return actividad(bd, 10)
    if nombre == "alertas_recientes":
        _exigir(ctx, "indices:ver")
        filas = bd.execute(select(AlertaPrecio).where(AlertaPrecio.estado == "nueva")
                           .order_by(AlertaPrecio.severidad, AlertaPrecio.puntaje.desc()).limit(8)).scalars()
        return [{"id": a.id, "periodo": a.periodo, "articulo": a.articulo, "departamento": a.departamento,
                 "relativo": a.relativo, "severidad": a.severidad, "metodo": a.metodo} for a in filas]
    if nombre in ("solicitudes_activas", "mis_solicitudes"):
        _exigir(ctx, "dpir:ver", "dpir:solicitar")
        q = select(SolicitudPrecio).where(SolicitudPrecio.rechazada.is_(False)).order_by(SolicitudPrecio.fecha_limite)
        if nombre == "mis_solicitudes" or not ctx.puede("dpir:ver"):
            q = q.where(SolicitudPrecio.solicitante_id == ctx.usuario.id)
        else:
            q = q.where(SolicitudPrecio.estado != "entregada")
        return [{"id": s.id, "codigo": s.codigo, "producto": s.producto, "entidad": s.entidad, "estado": s.estado,
                 "fecha_limite": s.fecha_limite.isoformat() if s.fecha_limite else None,
                 "vencida": bool(s.fecha_limite and s.fecha_limite < date.today() and s.estado != "entregada"),
                 "precio_referencia": (s.resultado or {}).get("precio_referencia")}
                for s in bd.execute(q.limit(12)).scalars()]
    if nombre == "automatizaciones_estado":
        _exigir(ctx, "automatizaciones:ver")
        return [{"id": a.id, "nombre": a.nombre, "frecuencia": describir_frecuencia(a), "activa": a.activa,
                 "ultimo_estado": a.ultimo_estado,
                 "ultima": a.ultima_ejecucion_en.isoformat() if a.ultima_ejecucion_en else None,
                 "proxima": a.proxima_ejecucion_en.isoformat() if a.proxima_ejecucion_en else None}
                for a in bd.execute(select(Automatizacion).order_by(Automatizacion.sistema.desc(),
                                                                    Automatizacion.id).limit(12)).scalars()]
    if nombre in ("postura_seguridad", "salud_ti"):
        agente = "seguridad" if nombre == "postura_seguridad" else "ti"
        _exigir(ctx, f"{agente}:ver")
        abiertos = bd.execute(select(Hallazgo).where(Hallazgo.agente == agente, Hallazgo.estado == "abierto")
                              .order_by(Hallazgo.ultima_vez.desc())).scalars().all()
        orden = {"critica": 0, "alta": 1, "media": 2, "baja": 3, "info": 4}
        return {"puntaje": puntaje(bd, agente), "otro_puntaje": puntaje(bd, "ti" if agente == "seguridad" else "seguridad"),
                "hallazgos": [{"id": h.id, "titulo": h.titulo, "severidad": h.severidad, "detalle": h.detalle}
                              for h in sorted(abiertos, key=lambda h: orden.get(h.severidad, 9))[:6]]}
    if nombre == "frescura_datos":
        _exigir(ctx, "datos:ver")
        return [{"id": f.id, "titulo": f.titulo, "publicador": f.publicador, "periodicidad": f.periodicidad,
                 "descargado_en": f.descargado_en.isoformat() if f.descargado_en else None,
                 "dias": (ahora() - f.descargado_en).days if f.descargado_en else None, "filas": f.filas}
                for f in bd.execute(select(FuenteDatos).order_by(FuenteDatos.id)).scalars()]
    if nombre == "avance_operativo":
        _exigir(ctx, "territorio:ver")
        filas = bd.execute(select(AvanceOperativo.departamento, func.sum(AvanceOperativo.meta),
                                  func.sum(AvanceOperativo.completados), func.max(AvanceOperativo.es_demo))
                           .group_by(AvanceOperativo.departamento).order_by(AvanceOperativo.departamento)).all()
        return [{"departamento": d, "meta": int(m or 0), "completados": int(c or 0), "es_demo": bool(e),
                 "avance_pct": round((c or 0) / m * 100, 1) if m else 0} for d, m, c, e in filas]
    if nombre == "mapa_riesgos":
        _exigir(ctx, "seguridad:ver")
        return [{"codigo": r.codigo, "titulo": r.titulo, "probabilidad": r.probabilidad, "impacto": r.impacto,
                 "estado": r.estado} for r in bd.execute(select(Riesgo)).scalars()]
    if nombre == "validaciones_recientes":
        _exigir(ctx, "calidad:usar")
        return [{"id": v.id, "archivo": v.archivo, "puntaje": v.puntaje, "bloqueante": v.bloqueante,
                 "creada_en": v.creada_en.isoformat()} for v in bd.execute(
                    select(Validacion).where(Validacion.usuario_id == ctx.usuario.id)
                    .order_by(Validacion.creada_en.desc()).limit(6)).scalars()]
    if nombre == "rubrica_jurado":
        _exigir(ctx, "jurado:ver", "centro:ver")
        from .jurado import evidencia  # importación diferida

        return evidencia(bd)
    if nombre == "mapa_lugares":
        _exigir(ctx, "territorio:ver", "tableros:ver")
        return {"ruta": "/api/territorio/mapa"}
    return {}


@router.get("/equipo")
def equipo(ctx: Contexto = Depends(requiere("dpir:gestionar")), bd: Session = Depends(obtener_bd)):
    """Analistas a quienes se puede asignar una solicitud."""
    return [{"id": u.id, "nombre": u.nombre} for u in bd.execute(
        select(Usuario).where(Usuario.estado == "activo").order_by(Usuario.nombre).limit(200)).scalars()
        if any(ur.rol.codigo == "analista_dpir" for ur in u.roles)]
