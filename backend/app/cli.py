"""Consola de administración de Nexo.

    python -m app.cli init            # crea tablas y catálogos
    python -m app.cli admin           # crea una cuenta de administración (pide los datos)
    python -m app.cli demo            # cuentas, solicitudes y operativo de demostración
    python -m app.cli admin-pruebas   # cuenta local con todos los roles internos (solo desarrollo)
    python -m app.cli datos           # carga las tablas procesadas y calcula alertas
    python -m app.cli verificar       # verifica la integridad de la bitácora
"""

from __future__ import annotations

import argparse
import getpass
import os
import random
import secrets
import sys
from datetime import date, timedelta

from sqlalchemy import func, select

from . import bitacora
from .catalogos import ROLES
from .config import obtener_config
from .db import SesionLocal, ahora
from .etl.cargar import cargar_todo
from .models import (
    Automatizacion,
    AvanceOperativo,
    Cotizacion,
    EventoSolicitud,
    InformanteRecoleccion,
    LugarPoblado,
    PrecioCapturado,
    PrecioRecolectado,
    ProductoRecoleccion,
    Rol,
    SolicitudPrecio,
    Usuario,
    UsuarioRol,
)
from .security.passwords import evaluar_password, hash_password
from .services import agente_seguridad, agente_ti, alertas, precios_ref
from .siembra import preparar_base

DEMO = [
    # (rol, nombre, unidad)
    ("admin_ti", "Ana Informática (demo)", "Dirección de Informática"),
    ("seguridad", "Sergio Seguridad (demo)", "Seguridad de la Información"),
    ("direccion", "Dora Dirección (demo)", "Gerencia"),
    ("analista_dpir", "Pablo Precios (demo)", "Dirección de Precios e Índices de Referencia"),
    ("analista_diec", "Inés Índices (demo)", "Dirección de Índices y Estadísticas Continuas"),
    ("analista_dce", "Carlos Censos (demo)", "Dirección de Censos y Encuestas"),
    ("coordinador_regional", "Rita Regional (demo)", "Coordinación Regional"),
    ("calidad_desa", "Diana Calidad (demo)", "Departamento de Estadísticas"),
    ("entidad_solicitante", "Eva Compras (demo)", "Ministerio de Educación"),
    ("jurado", "Jurado Datatón (demo)", "Datatón INE 2026"),
]


def _crear_usuario(bd, email: str, nombre: str, unidad: str, roles: list[str], password: str, demo: bool) -> Usuario:
    u = bd.execute(select(Usuario).where(Usuario.email == email)).scalar()
    if u is None:
        u = Usuario(email=email, nombre=nombre, unidad=unidad, password_hash=hash_password(password), estado="activo",
                    email_verificado_en=ahora(), aprobado_en=ahora(), consentimiento_version="2026-11-v1",
                    consentimiento_en=ahora(), es_demo=demo)
        bd.add(u)
        bd.flush()
    else:
        u.password_hash = hash_password(password)
        u.estado, u.bloqueado_hasta, u.intentos_fallidos = "activo", None, 0
    u.roles.clear()
    bd.flush()
    for r in bd.execute(select(Rol).where(Rol.codigo.in_(roles))).scalars():
        u.roles.append(UsuarioRol(usuario_id=u.id, rol_id=r.id))
    bd.commit()
    return u


def cmd_admin(_args) -> None:
    preparar_base()
    email = input("Correo: ").strip().lower()
    nombre = input("Nombre: ").strip()
    while True:
        clave = getpass.getpass("Contraseña (mínimo 12 caracteres): ")
        problemas = evaluar_password(clave, email, nombre)
        if not problemas:
            break
        print("  ✗", " ".join(problemas))
    with SesionLocal() as bd:
        u = _crear_usuario(bd, email, nombre, "Dirección de Informática", ["admin_ti"], clave, False)
    bitacora.registrar("usuarios.admin_creado_por_consola", modulo="usuarios", objeto=f"usuario:{u.id}")
    print(f"Listo. Al iniciar sesión, {nombre} deberá configurar su segundo factor.")


def cmd_demo(_args) -> None:
    preparar_base()
    cfg = obtener_config()
    if cfg.es_produccion:
        sys.exit("Las cuentas de demostración no se crean en producción.")
    credenciales = []
    with SesionLocal() as bd:
        for rol, nombre, unidad in DEMO:
            email = f"{rol.replace('_', '.')}@nexo.example.com"
            clave = "-".join(secrets.token_urlsafe(4) for _ in range(3))  # aleatoria; nunca se guarda en el código
            _crear_usuario(bd, email, nombre, unidad, [rol], clave, True)
            credenciales.append((rol, email, clave))
        _sembrar_solicitudes(bd)
        _sembrar_entregada(bd)
        _sembrar_recoleccion(bd)
        _sembrar_operativo(bd)
        sistema = [a.id for a in bd.execute(select(Automatizacion).where(Automatizacion.sistema.is_(True))).scalars()
                   if a.tarea != "catalogo.sincronizar"]
    from .services.programador import ejecutar_automatizacion

    for aid in sistema:  # primera ejecución de cada automatización del sistema (historial inicial)
        ejecutar_automatizacion(aid, disparada_por="instalacion")
    ruta = cfg.directorio_var / "credenciales-demo.txt"
    ruta.write_text("Cuentas de demostración de Nexo (no subir a ningún repositorio)\n\n" +
                    "\n".join(f"{r:<22} {e:<40} {c}" for r, e, c in credenciales) + "\n")
    os.chmod(ruta, 0o600)
    print("\nCuentas de demostración (también guardadas en", ruta, "con permisos 600):\n")
    for r, e, c in credenciales:
        print(f"  {r:<22} {e:<40} {c}")
    print("\nLas cuentas admin_ti y seguridad pedirán configurar el segundo factor al entrar.")


def cmd_admin_pruebas(_args) -> None:
    """Cuenta local con todos los roles internos para probar la plataforma completa (solo desarrollo).

    Combina roles que en producción son incompatibles (administración y seguridad), por eso no se puede
    crear con NEXO_ENTORNO=produccion. La contraseña es aleatoria y solo se guarda en var/ (permisos 600).
    """
    preparar_base()
    cfg = obtener_config()
    if cfg.es_produccion:
        sys.exit("La cuenta de pruebas total no se crea en producción (rompería la segregación de funciones).")
    roles = [r["codigo"] for r in ROLES if r["codigo"] != "entidad_solicitante"]
    email = "admin.local@nexo.example.com"
    clave = "-".join(secrets.token_urlsafe(5) for _ in range(4))
    with SesionLocal() as bd:
        u = _crear_usuario(bd, email, "Administración local (pruebas)", "Equipo Nexo", roles, clave, True)
        u.mfa_activo, u.mfa_secreto_cifrado, u.mfa_pendiente_cifrado = False, None, None
        u.codigos_recuperacion, u.mfa_ultimo_paso = None, None
        bd.commit()
    ruta = cfg.directorio_var / "credenciales-admin-local.txt"
    ruta.write_text("Cuenta local de pruebas con todos los roles internos (no subir a ningún repositorio)\n\n"
                    f"URL:        {cfg.url_publica}\nCorreo:     {email}\nContraseña: {clave}\n\n"
                    "Al primer inicio de sesión se configura el segundo factor (código QR).\n")
    os.chmod(ruta, 0o600)
    bitacora.registrar("usuarios.admin_pruebas_creado", modulo="usuarios", objeto=f"usuario:{u.id}",
                       detalle={"roles": roles})
    print(f"Cuenta {email} lista con {len(roles)} roles. Credenciales en {ruta} (permisos 600).")


def _sembrar_solicitudes(bd) -> None:
    if bd.execute(select(func.count()).select_from(SolicitudPrecio)).scalar():
        return
    entidad = bd.execute(select(Usuario).where(Usuario.email == "entidad.solicitante@nexo.example.com")).scalar()
    ejemplos = [
        ("Computadora portátil para escuelas", "8 GB RAM, 256 GB SSD, pantalla 14 pulgadas (caso presentado por la DPIR)",
         500, "Unidad", "computadora portatil", "Ministerio de Educación", "recibida"),
        ("Cemento gris 42.5 kg", "Cemento de uso general, saco de 42.5 kg", 2000, "Saco", "cemento gris",
         "Municipalidad de Mixco", "revision"),
        ("Resma de papel bond carta 75 g", "Papel bond tamaño carta, 75 gramos, resma de 500 hojas", 300, "Resma",
         "papel bond carta", "Ministerio de Finanzas Públicas", "investigacion"),
        ("Tóner para impresora láser", "Cartucho de tóner negro compatible con impresora láser", 40, "Unidad",
         "toner", "Instituto Guatemalteco de Seguridad Social", "recibida"),
    ]
    anio = ahora().year
    analista = bd.execute(select(Usuario).where(Usuario.email == "analista.dpir@nexo.example.com")).scalar()
    orden = ["recibida", "revision", "investigacion"]
    for i, (prod, espec, cant, unidad, terminos, ent, estado) in enumerate(ejemplos, start=1):
        sol = SolicitudPrecio(codigo=f"PR-{anio}-{i:04d}", entidad=ent, solicitante_id=entidad.id if entidad else None,
                              producto=prod, especificaciones=espec, cantidad=cant, unidad=unidad,
                              terminos_busqueda=terminos, estado=estado, modalidad="Cotización", es_demo=True,
                              asignada_a=analista.id if analista and estado != "recibida" else None,
                              fecha_limite=date.today() + timedelta(days=[8, 3, -1, 10][i - 1]))
        bd.add(sol)
        bd.flush()
        previo = None
        for etapa in orden[: orden.index(estado) + 1]:
            quien = entidad if etapa == "recibida" else analista
            bd.add(EventoSolicitud(solicitud_id=sol.id, usuario_id=quien.id if quien else None,
                                   usuario_nombre=quien.nombre if quien else "", de_estado=previo, a_estado=etapa,
                                   comentario="Solicitud registrada" if etapa == "recibida" else "Avanza (demostración)"))
            previo = etapa
    bd.commit()


def _sembrar_entregada(bd) -> None:
    """Una solicitud recorrida de punta a punta (pasos 1 a 6) para que la demostración muestre un informe entregado.

    Usa compras reales de Guatecompras y cotizaciones de demostración, marcadas como tales en su nota.
    """
    if bd.execute(select(func.count()).select_from(SolicitudPrecio).where(
            SolicitudPrecio.es_demo.is_(True), SolicitudPrecio.estado == "entregada")).scalar():
        return
    entidad = bd.execute(select(Usuario).where(Usuario.email == "entidad.solicitante@nexo.example.com")).scalar()
    analista = bd.execute(select(Usuario).where(Usuario.email == "analista.dpir@nexo.example.com")).scalar()
    try:
        res = precios_ref.investigar(bd, "llanta")
    except ValueError:
        return
    compras = sorted((c for c in res["compras"] if not c["atipico"] and c["precio_ajustado"]),
                     key=lambda c: c["precio_ajustado"])
    if len(compras) < 4:
        return
    centro = compras[len(compras) // 2]["precio_ajustado"]
    elegidas = compras[len(compras) // 2 - 2: len(compras) // 2 + 2]
    anio = ahora().year
    n = (bd.execute(select(func.count()).select_from(SolicitudPrecio)
                    .where(SolicitudPrecio.codigo.like(f"PR-{anio}-%"))).scalar() or 0) + 1
    creada = ahora() - timedelta(days=9)
    sol = SolicitudPrecio(codigo=f"PR-{anio}-{n:04d}", entidad="Municipalidad de Quetzaltenango",
                          solicitante_id=entidad.id if entidad else None, producto="Llanta para vehículo liviano",
                          especificaciones="Llanta radial para pick-up municipal, rin 15 a 16 pulgadas",
                          cantidad=24, unidad="Unidad", terminos_busqueda="llanta", estado="entregada",
                          modalidad="Cotización", es_demo=True, asignada_a=analista.id if analista else None,
                          fecha_limite=(creada + timedelta(days=12)).date(), creada_en=creada)
    bd.add(sol)
    bd.flush()
    for c in elegidas:
        bd.add(Cotizacion(solicitud_id=sol.id, tipo="guatecompras", descripcion=c["descripcion"],
                          origen=c["origen"] or "", referencia=str(c.get("referencia") or ""), precio=c["precio"],
                          fecha=date.fromisoformat(c["fecha"]) if c.get("fecha") else None, incluida=True,
                          creada_por=analista.id if analista else None))
    rnd = random.Random(2026)
    for letra in "ABCDEF":
        bd.add(Cotizacion(solicitud_id=sol.id, tipo="cotizacion", descripcion="Llanta radial 15-16 pulgadas",
                          origen=f"Proveedor {letra} (demostración)", fecha=creada.date() + timedelta(days=2),
                          precio=round(centro * rnd.uniform(0.9, 1.12), 2), incluida=True,
                          nota="Cotización de demostración, no es un precio real de un proveedor",
                          creada_por=analista.id if analista else None))
    bd.flush()
    precios_ref.analizar_solicitud(bd, sol)
    cot = bd.execute(select(Cotizacion).where(Cotizacion.solicitud_id == sol.id)).scalars().all()
    sol.informe_sha256 = precios_ref.huella_datos(sol, cot)
    sol.entregada_en = creada + timedelta(days=6, hours=3)
    sol.actualizada_en = sol.entregada_en
    previo = None
    for i, etapa in enumerate(["recibida", "revision", "investigacion", "analisis", "informe", "entregada"]):
        quien = entidad if etapa == "recibida" else analista
        bd.add(EventoSolicitud(solicitud_id=sol.id, ts=creada + timedelta(days=i * 1.2), usuario_id=quien.id if quien else None,
                               usuario_nombre=quien.nombre if quien else "", de_estado=previo, a_estado=etapa,
                               comentario="Solicitud registrada" if etapa == "recibida" else "Avanza (demostración)"))
        previo = etapa
    bd.commit()


# Recolección de demostración para el IPP agrícola, el IPMC y el ICC. Precios inventados cerca de valores de mercado,
# marcados con es_demo; los informantes se llaman «de demostración» para no parecer reales.
_REC_DEMO = {
    "IPP": {
        "productos": [("Café oro", "Quintal", "Café", 2350), ("Maíz blanco", "Quintal", "Granos básicos", 210),
                      ("Frijol negro", "Quintal", "Granos básicos", 560), ("Cardamomo en cereza", "Quintal", "Especias", 260),
                      ("Banano de exportación", "Caja de 40 lb", "Frutas", 72), ("Tomate", "Caja de 45 lb", "Hortalizas", 185),
                      ("Papa", "Quintal", "Hortalizas", 240)],
        "informantes": [("Finca cafetalera", "Huehuetenango"), ("Finca cafetalera", "Santa Rosa"),
                        ("Productor de granos básicos", "Jutiapa"), ("Productor de granos básicos", "Chiquimula"),
                        ("Productor de granos básicos", "Petén"), ("Cooperativa agrícola", "Alta Verapaz"),
                        ("Cooperativa agrícola", "Quiché"), ("Productor de hortalizas", "Chimaltenango"),
                        ("Productor de hortalizas", "Sololá"), ("Productor de hortalizas", "Quetzaltenango"),
                        ("Finca bananera", "Izabal"), ("Finca bananera", "Escuintla")],
    },
    "IPMC": {
        "productos": [("Cemento gris 42.5 kg", "Saco", "Aglomerantes", 79), ("Hierro corrugado 3/8 pulgada", "Varilla", "Metales", 52),
                      ("Block de concreto 15 x 20 x 40 cm", "Unidad", "Mampostería", 6.4), ("Arena de río", "Metro cúbico", "Agregados", 255),
                      ("Lámina galvanizada calibre 26", "Unidad", "Techos", 96)],
        "informantes": [("Ferretería", "Guatemala"), ("Ferretería", "Guatemala"), ("Depósito de materiales", "Guatemala"),
                        ("Ferretería", "Guatemala"), ("Depósito de materiales", "Guatemala"), ("Ferretería", "Guatemala"),
                        ("Distribuidora", "Guatemala")],
    },
    "ICC": {
        "productos": [("Jornal de albañil", "Día", "Mano de obra", 175), ("Jornal de ayudante", "Día", "Mano de obra", 110),
                      ("Concreto premezclado 3,000 psi", "Metro cúbico", "Materiales", 1150),
                      ("Alquiler de mezcladora", "Día", "Equipo", 240)],
        "informantes": [("Empresa constructora", "Guatemala"), ("Empresa constructora", "Guatemala"),
                        ("Contratista", "Guatemala"), ("Contratista", "Guatemala"), ("Empresa constructora", "Guatemala")],
    },
}
_MUNICIPIOS_IPMC = ["Guatemala", "Mixco", "Villa Nueva", "San Miguel Petapa", "Santa Catarina Pinula", "Villa Canales"]


def _sembrar_recoleccion(bd) -> None:
    if bd.execute(select(func.count()).select_from(InformanteRecoleccion)).scalar():
        return
    rnd = random.Random(2026)
    hoy = ahora()
    # Seis meses que terminan en el mes anterior al actual; el último queda con captura incompleta.
    meses = []
    a, m = hoy.year, hoy.month
    for _ in range(6):
        a, m = (a - 1, 12) if m == 1 else (a, m - 1)
        meses.append((a, m))
    meses.reverse()
    for indice, cfg in _REC_DEMO.items():
        productos = []
        for j, (nombre, unidad, grupo, _base) in enumerate(cfg["productos"], start=1):
            p = ProductoRecoleccion(codigo=f"{indice}-P{j:03d}", indice=indice, nombre=nombre, unidad=unidad, grupo=grupo,
                                    especificacion="Producto de demostración", es_demo=True)
            bd.add(p)
            productos.append((p, _base))
        informantes = []
        for k, (actividad, depto) in enumerate(cfg["informantes"], start=1):
            muni = _MUNICIPIOS_IPMC[k % len(_MUNICIPIOS_IPMC)] if depto == "Guatemala" else ""
            i = InformanteRecoleccion(codigo=f"{indice}-I{k:04d}", indice=indice, nombre=f"{actividad} de demostración {k:02d}",
                                      actividad=actividad, departamento=depto, municipio=muni, es_demo=True)
            bd.add(i)
            informantes.append(i)
        bd.flush()
        # Cada informante reporta los productos de su actividad (o 3 o 4 al azar si vende de todo).
        pares = []
        for i in informantes:
            if indice == "IPP":
                propios = [p for p in productos if (
                    ("cafetalera" in i.actividad and p[0].grupo == "Café") or ("granos" in i.actividad and p[0].grupo == "Granos básicos")
                    or ("hortalizas" in i.actividad and p[0].grupo == "Hortalizas") or ("bananera" in i.actividad and p[0].grupo == "Frutas")
                    or ("Cooperativa" in i.actividad and p[0].grupo in ("Café", "Especias", "Granos básicos")))]
            else:
                propios = productos
            pares += [(i, p, base * rnd.uniform(0.93, 1.07)) for p, base in propios]
        tendencia = {p.id: rnd.gauss(0.004, 0.006) for p, _ in productos}
        for t, (anio, mes) in enumerate(meses):
            ultimo = t == len(meses) - 1
            for n, (i, p, precio) in enumerate(pares):
                if ultimo and rnd.random() < 0.12:
                    continue  # pendiente de captura
                factor = 1 + tendencia[p.id] * t + rnd.gauss(0, 0.012)
                if ultimo and n in (2, len(pares) // 2):
                    factor *= 1.55 if n == 2 else 0.62  # dos variaciones atípicas para revisar
                bd.add(PrecioCapturado(indice=indice, informante_id=i.id, producto_id=p.id, anio=anio, mes=mes,
                                       precio=round(precio * factor, 2), es_demo=True,
                                       capturado_en=hoy - timedelta(days=(len(meses) - t) * 30)))
    bd.commit()


def _sembrar_operativo(bd) -> None:
    nombre = "Operativo de demostración 2026"
    if bd.execute(select(func.count()).select_from(AvanceOperativo).where(AvanceOperativo.operativo == nombre)).scalar():
        return
    rnd = random.Random(2026)
    filas = bd.execute(select(LugarPoblado.cod_municipio, LugarPoblado.municipio, LugarPoblado.departamento, func.count())
                       .group_by(LugarPoblado.cod_municipio, LugarPoblado.municipio, LugarPoblado.departamento)).all()
    for cod, muni, depto, n in filas:
        bd.add(AvanceOperativo(operativo=nombre, cod_municipio=cod, municipio=muni, departamento=depto,
                               delegacion=f"Delegación {depto}", meta=n, completados=int(n * rnd.uniform(0.2, 1.0)),
                               es_demo=True))
    bd.commit()


def cmd_datos(_args) -> None:
    preparar_base()
    print("Cargando tablas procesadas…")
    r = cargar_todo()
    for k, v in r.items():
        print(f"  {k:<24} {v:>9,} filas")
    with SesionLocal() as bd:
        periodos = bd.execute(select(PrecioRecolectado.anio, PrecioRecolectado.mes).distinct()).all()
        for anio, mes in sorted(periodos)[-3:] + [p for p in periodos if p == (2022, 7)]:
            res = alertas.detectar(bd, anio, mes)
            print(f"  alertas {res['periodo']}: {res['alertas']} ({res['metodo']})")
        agente_ti.revisar(bd)
        agente_seguridad.revisar(bd)
    bitacora.registrar("datos.carga_inicial", modulo="datos", detalle={k: int(v) for k, v in r.items()})
    print("Listo.")


def cmd_verificar(_args) -> None:
    with SesionLocal() as bd:
        r = bitacora.verificar_cadena(bd)
    print("Íntegra" if r["integra"] else f"ROTA en el registro {r['roto_en']}", f"({r['registros']} registros)")
    sys.exit(0 if r["integra"] else 1)


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m app.cli", description="Administración de Nexo")
    sub = p.add_subparsers(dest="comando", required=True)
    sub.add_parser("init").set_defaults(f=lambda a: (preparar_base(), print("Base preparada.")))
    sub.add_parser("admin").set_defaults(f=cmd_admin)
    sub.add_parser("demo").set_defaults(f=cmd_demo)
    sub.add_parser("admin-pruebas", help="Cuenta local con todos los roles (solo desarrollo)").set_defaults(f=cmd_admin_pruebas)
    sub.add_parser("datos").set_defaults(f=cmd_datos)
    sub.add_parser("verificar").set_defaults(f=cmd_verificar)
    args = p.parse_args()
    args.f(args)


if __name__ == "__main__":
    main()
