"""Consola de administración de Nexo.

    python -m app.cli init            # crea tablas y catálogos
    python -m app.cli admin           # crea una cuenta de administración (pide los datos)
    python -m app.cli demo            # cuentas, solicitudes y operativo de demostración
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
from .config import obtener_config
from .db import SesionLocal, ahora
from .etl.cargar import cargar_todo
from .models import AvanceOperativo, LugarPoblado, PrecioRecolectado, Rol, SolicitudPrecio, Usuario, UsuarioRol
from .security.passwords import evaluar_password, hash_password
from .services import agente_seguridad, agente_ti, alertas
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
        _sembrar_operativo(bd)
    ruta = cfg.directorio_var / "credenciales-demo.txt"
    ruta.write_text("Cuentas de demostración de Nexo (no subir a ningún repositorio)\n\n" +
                    "\n".join(f"{r:<22} {e:<40} {c}" for r, e, c in credenciales) + "\n")
    os.chmod(ruta, 0o600)
    print("\nCuentas de demostración (también guardadas en", ruta, "con permisos 600):\n")
    for r, e, c in credenciales:
        print(f"  {r:<22} {e:<40} {c}")
    print("\nLas cuentas admin_ti y seguridad pedirán configurar el segundo factor al entrar.")


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
    for i, (prod, espec, cant, unidad, terminos, ent, estado) in enumerate(ejemplos, start=1):
        bd.add(SolicitudPrecio(codigo=f"PR-{anio}-{i:04d}", entidad=ent, solicitante_id=entidad.id if entidad else None,
                               producto=prod, especificaciones=espec, cantidad=cant, unidad=unidad,
                               terminos_busqueda=terminos, estado=estado, modalidad="Cotización", es_demo=True,
                               fecha_limite=date.today() + timedelta(days=[8, 3, -1, 10][i - 1])))
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
    sub.add_parser("datos").set_defaults(f=cmd_datos)
    sub.add_parser("verificar").set_defaults(f=cmd_verificar)
    args = p.parse_args()
    args.f(args)


if __name__ == "__main__":
    main()
