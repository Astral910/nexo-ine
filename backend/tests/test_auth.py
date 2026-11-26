"""Pruebas del flujo de acceso y de los controles de seguridad (incluye regresiones de la revisión de IT)."""

from __future__ import annotations

import re

import pyotp

import pytest

from app.config import obtener_config

from .conftest import CLAVE, cliente, crear_usuario, csrf, iniciar_sesion


def _activar_mfa(c) -> tuple[str, list[str]]:
    r = c.post("/api/auth/mfa/iniciar", headers=csrf(c))
    assert r.status_code == 200, r.text
    qr = r.json()["qr_data_uri"]
    assert qr.startswith("data:image/svg+xml") and "xmlns" in qr  # el QR se puede dibujar como imagen
    secreto = r.json()["secreto"]
    r = c.post("/api/auth/mfa/activar", json={"codigo": pyotp.TOTP(secreto).now()}, headers=csrf(c))
    assert r.status_code == 200, r.text  # con TZ=America/Guatemala (regresión AUTH-1)
    return secreto, r.json()["codigos_recuperacion"]


@pytest.fixture
def con_verificacion():
    """Flujo institucional: verificar el correo y esperar aprobación (en demostración el alta es inmediata)."""
    cfg = obtener_config()
    antes, cfg.alta_inmediata = cfg.alta_inmediata, False
    yield
    cfg.alta_inmediata = antes


def test_alta_inmediata_en_demostracion():
    c = cliente()
    r = c.post("/api/auth/registro", json={
        "nombre": "Persona Directa", "email": "directa@ejemplo.gob.gt", "unidad": "DIEC",
        "rol_solicitado": "analista_dpir", "password": CLAVE, "acepta_privacidad": True})
    assert r.status_code == 202 and r.json()["activa"] is True
    r = iniciar_sesion(c, "directa@ejemplo.gob.gt")
    assert r.status_code == 200 and "dpir:ver" in r.json()["permisos"]


def test_reenviar_verificacion_exige_la_contrasena(con_verificacion):
    c = cliente()
    assert c.post("/api/auth/registro", json={
        "nombre": "Persona Sin Verificar", "email": "sin.verificar@ejemplo.gob.gt", "unidad": "DIEC",
        "rol_solicitado": "analista_dpir", "password": CLAVE, "acepta_privacidad": True}).status_code == 202
    login = c.post("/api/auth/login", json={"email": "sin.verificar@ejemplo.gob.gt", "password": CLAVE})
    assert login.status_code == 403 and "verifique su correo" in login.text
    # Con otra contraseña no se entrega el enlace (misma respuesta, sin clave del buzón)
    r = c.post("/api/auth/reenviar-verificacion", json={"email": "sin.verificar@ejemplo.gob.gt", "password": "otra-clave-cualquiera"})
    assert r.status_code == 202 and "clave_buzon" not in r.json()
    r = c.post("/api/auth/reenviar-verificacion", json={"email": "sin.verificar@ejemplo.gob.gt", "password": CLAVE})
    correo = c.get("/api/auth/buzon", params={"clave": r.json()["clave_buzon"]}).json()
    token = re.search(r"token=([\w-]+)", correo["enlace"]).group(1)
    assert c.post("/api/auth/verificar-correo", json={"token": token}).json()["estado"] == "pendiente_aprobacion"


def test_registro_verificacion_aprobacion_y_login(con_verificacion):
    admin = cliente()
    crear_usuario("admin.pruebas@ejemplo.gob.gt", ["admin_ti"])
    assert iniciar_sesion(admin, "admin.pruebas@ejemplo.gob.gt").status_code == 200
    # Sin MFA, el administrador no puede operar todavía
    assert admin.get("/api/admin/usuarios").status_code == 403
    _activar_mfa(admin)

    nuevo = cliente()
    r = nuevo.post("/api/auth/registro", json={
        "nombre": "Analista Nueva", "email": "analista.nueva@ejemplo.gob.gt", "unidad": "DPIR",
        "rol_solicitado": "analista_dpir", "password": CLAVE, "acepta_privacidad": True})
    assert r.status_code == 202
    clave = r.json()["clave_buzon"]
    correo = nuevo.get("/api/auth/buzon", params={"clave": clave}).json()
    token = re.search(r"token=([\w-]+)", correo["enlace"]).group(1)
    assert nuevo.post("/api/auth/verificar-correo", json={"token": token}).json()["estado"] == "pendiente_aprobacion"
    assert iniciar_sesion(nuevo, "analista.nueva@ejemplo.gob.gt").status_code == 403  # falta aprobación

    usuarios = admin.get("/api/admin/usuarios").json()["usuarios"]
    uid = next(u["id"] for u in usuarios if u["email"] == "analista.nueva@ejemplo.gob.gt")
    r = admin.post(f"/api/admin/usuarios/{uid}/aprobar", json={"roles": ["analista_dpir"]}, headers=csrf(admin))
    assert r.status_code == 200 and r.json()["estado"] == "activo"
    r = iniciar_sesion(nuevo, "analista.nueva@ejemplo.gob.gt")
    assert r.status_code == 200 and "dpir:gestionar" in r.json()["permisos"]


def test_buzon_no_permite_tomar_cuentas():
    crear_usuario("victima@ejemplo.gob.gt", ["analista_dce"])
    atacante = cliente()
    assert atacante.post("/api/auth/password/olvide", json={"email": "victima@ejemplo.gob.gt"}).status_code == 202
    # El buzón ya no acepta correos: solo una clave de lectura que recibe quien hizo el registro
    assert atacante.get("/api/auth/buzon", params={"para": "victima@ejemplo.gob.gt"}).status_code in (404, 422)
    assert atacante.get("/api/auth/buzon", params={"clave": "inventada"}).status_code == 404


def test_bloqueo_sin_enumeracion_de_cuentas():
    crear_usuario("existe@ejemplo.gob.gt", ["consulta"])
    for email in ("existe@ejemplo.gob.gt", "no-existe@ejemplo.gob.gt"):
        c = cliente()
        codigos = [iniciar_sesion(c, email, "contraseña equivocada larga").status_code for _ in range(6)]
        assert codigos == [401] * 5 + [429], (email, codigos)
    # Otra IP (otro equipo) sigue pudiendo entrar con la clave correcta: no hay bloqueo global por 5 fallos
    otro = cliente()
    otro.headers["X-Forwarded-For"] = "10.0.0.9"
    assert iniciar_sesion(otro, "existe@ejemplo.gob.gt").status_code in (200, 429)


def test_politica_de_contrasenas():
    c = cliente()
    for mala in ("corta", "!!!!!!!!!!!!!!!!!!", "123456789012345678"):
        r = c.post("/api/auth/password/evaluar", json={"password": mala})
        assert r.json()["problemas"], mala
    assert c.post("/api/auth/password/evaluar", json={"password": CLAVE}).json()["problemas"] == []


def test_csrf_y_permisos():
    crear_usuario("consulta@ejemplo.gob.gt", ["consulta"])
    c = cliente()
    assert iniciar_sesion(c, "consulta@ejemplo.gob.gt").status_code == 200
    assert c.post("/api/auth/logout").status_code == 403  # sin cabecera CSRF
    assert c.get("/api/admin/usuarios").status_code == 403  # sin permiso
    assert c.get("/api/bitacora").status_code == 403
    assert c.post("/api/auth/logout", headers=csrf(c)).status_code == 200


def test_codigo_de_recuperacion_sirve_una_sola_vez():
    crear_usuario("seg@ejemplo.gob.gt", ["seguridad"])
    c = cliente()
    iniciar_sesion(c, "seg@ejemplo.gob.gt")
    _secreto, codigos = _activar_mfa(c)
    assert len(codigos[0].replace("-", "")) == 20  # 80 bits
    for esperado in (200, 401):
        c2 = cliente()
        assert iniciar_sesion(c2, "seg@ejemplo.gob.gt").json()["mfa_por_verificar"] is True
        r = c2.post("/api/auth/mfa/verificar", json={"codigo": codigos[0]}, headers=csrf(c2))
        assert r.status_code == esperado


def test_roles_incompatibles():
    crear_usuario("admin2@ejemplo.gob.gt", ["admin_ti"])
    crear_usuario("doble@ejemplo.gob.gt", ["consulta"])
    c = cliente()
    iniciar_sesion(c, "admin2@ejemplo.gob.gt")
    _activar_mfa(c)
    uid = next(u["id"] for u in c.get("/api/admin/usuarios").json()["usuarios"] if u["email"] == "doble@ejemplo.gob.gt")
    r = c.put(f"/api/admin/usuarios/{uid}/roles", json={"roles": ["analista_dpir", "entidad_solicitante"]}, headers=csrf(c))
    assert r.status_code == 422


def test_entrar_a_la_demostracion():
    crear_usuario("jurado@nexo.example.com", ["jurado"])
    from app.db import SesionLocal
    from app.models import Usuario
    with SesionLocal() as bd:
        u = bd.query(Usuario).filter_by(email="jurado@nexo.example.com").one()
        u.es_demo = True
        bd.commit()
    c = cliente()
    r = c.post("/api/auth/demo", json={})
    assert r.status_code == 200 and "jurado:ver" in r.json()["permisos"]
