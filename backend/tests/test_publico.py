"""Nexo Abierto: rutas públicas sin cuenta, solo con fuentes publicadas y con límite por conexión."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import delete

from app.db import SesionLocal
from app.models import CompraItem, LugarPoblado, ProyeccionPoblacion
from app.routers import publico
from app.services import generador

from .conftest import cliente


@pytest.fixture(autouse=True)
def _sin_cache():
    publico.vaciar_caches()


def test_rutas_publicas_responden_sin_cuenta():
    c = cliente()
    for ruta in ("/api/publico/inicio", "/api/publico/precios?q=computadora", "/api/publico/municipios",
                 "/api/publico/departamentos", "/api/publico/mapa", "/api/publico/catalogo", "/api/publico/fuentes"):
        r = c.get(ruta)
        assert r.status_code == 200, (ruta, r.text)
    inicio = c.get("/api/publico/inicio").json()
    assert {"ipc", "cba", "poblacion", "compras", "referencias_ine", "actualizado_en"} <= set(inicio)
    precios = c.get("/api/publico/precios", params={"q": "computadora"}).json()
    assert {"resumen", "histograma", "por_mes", "compras", "referencias_ine", "fuentes", "suficiente"} <= set(precios)
    assert precios["fuentes"][0]["licencia"] == "CC BY 4.0"
    assert c.get("/api/publico/catalogo").json()["ejemplos"] == publico.EJEMPLOS_PUBLICOS


def test_rutas_internas_siguen_protegidas():
    c = cliente()
    assert c.get("/api/territorio/departamentos").status_code == 401
    assert c.get("/api/territorio/mapa").status_code == 401
    assert c.get("/api/indices/alertas").status_code == 401
    assert c.get("/api/precios/investigar", params={"terminos": "laptop"}).status_code == 401
    assert c.post("/api/analitica/consulta", json={"consulta": {"fuente": "poblacion"}}).status_code == 401


def test_consulta_publica_rechaza_fuentes_internas():
    c = cliente()
    for fuente in ("precios_ipc", "bitacora", "alertas", "solicitudes", "ejecuciones", ["poblacion"], None):
        r = c.post("/api/publico/consulta", json={"consulta": {"fuente": fuente, "medida": "conteo"}})
        assert r.status_code == 422, (fuente, r.text)
    r = c.post("/api/publico/consulta", json={"consulta": {"fuente": "poblacion", "medida": "poblacion",
                                                            "dimension": "departamento"}})
    assert r.status_code == 200 and "filas" in r.json()


def test_generar_publico_solo_usa_fuentes_publicas():
    c = cliente()
    for peticion in ("precios recolectados por informante", "alertas de precios por severidad",
                     "eventos de la bitácora de auditoría", "solicitudes de precios de referencia por etapa",
                     *publico.EJEMPLOS_PUBLICOS[:3]):
        r = c.post("/api/publico/generar", json={"peticion": peticion})
        assert r.status_code in (200, 422), (peticion, r.text)
        if r.status_code == 200:
            assert all(w["consulta"]["fuente"] in publico.FUENTES_PUBLICAS for w in r.json()["widgets"]), peticion


def test_ejemplos_publicos_generan_con_fuentes_publicas():
    assert {"precios_ipc", "alertas", "solicitudes", "ejecuciones", "bitacora"}.isdisjoint(publico.FUENTES_PUBLICAS)
    for ejemplo in publico.EJEMPLOS_PUBLICOS:
        spec = generador.generar(ejemplo, set(publico.PERMISOS_PUBLICOS))
        assert spec["widgets"], ejemplo
        assert all(w["consulta"]["fuente"] in publico.FUENTES_PUBLICAS for w in spec["widgets"]), ejemplo


def test_limite_por_conexion_en_generar():
    c = cliente()
    codigos = [c.post("/api/publico/generar", json={"peticion": "Inflación interanual desde 2022"}).status_code
               for _ in range(21)]
    assert codigos[:20] == [200] * 20 and codigos[20] == 429


def test_municipio_inexistente_o_codigo_invalido():
    c = cliente()
    for codigo in ("abc", "12345", "9998", "01"):
        assert c.get(f"/api/publico/municipios/{codigo}").status_code == 404, codigo
    assert c.get("/api/publico/municipios", params={"departamento": "No existe"}).json() == []


def test_ficha_municipal_compara_proyecciones_con_proyecciones():
    anio = publico.consultas.anio_proyeccion()
    with SesionLocal() as bd:
        bd.add_all([
            LugarPoblado(codigo="99010001", nombre="Centro Uno", cod_departamento="07", departamento="Sololá",
                         cod_municipio="9901", municipio="Pueblo Uno", poblacion=5000, hombres=2400, mujeres=2600,
                         area="Urbana", lat=14.7, lon=-91.2, texto_norm="centro uno"),
            LugarPoblado(codigo="99020001", nombre="Centro Dos", cod_departamento="07", departamento="Sololá",
                         cod_municipio="9902", municipio="Pueblo Dos", poblacion=8000, hombres=3900, mujeres=4100,
                         area="Rural", lat=14.8, lon=-91.1, texto_norm="centro dos"),
            ProyeccionPoblacion(cod_municipio="9901", municipio="Pueblo Uno", departamento="Sololá", anio=2018,
                                poblacion=5200),
            ProyeccionPoblacion(cod_municipio="9901", municipio="Pueblo Uno", departamento="Sololá", anio=anio,
                                poblacion=5600),
        ])
        bd.commit()
    try:
        f = cliente().get("/api/publico/municipios/9901").json()
        assert f["poblacion_2018"] == 5000 and f["poblacion_anio_actual"] == 5600
        assert f["crecimiento_desde_2018_pct"] == round((5600 / 5200 - 1) * 100, 1)
        assert f["rango_departamento"] == 2 and f["municipios_departamento"] >= 2
        assert len(f["principales"]) <= 10
        lista = cliente().get("/api/publico/municipios", params={"texto": "pueblo uno"}).json()
        assert [m["codigo"] for m in lista] == ["9901"]
    finally:
        with SesionLocal() as bd:
            bd.execute(delete(LugarPoblado).where(LugarPoblado.cod_municipio.in_(["9901", "9902"])))
            bd.execute(delete(ProyeccionPoblacion).where(ProyeccionPoblacion.cod_municipio == "9901"))
            bd.commit()


def test_rango_de_precios_con_percentiles():
    hoy = date.today()
    precios = [6000 + 300 * i for i in range(20)] + [95000]  # el último es atípico
    with SesionLocal() as bd:
        bd.add_all([CompraItem(ocid=f"prueba-publico-{i}", nog=str(990000 + i), fecha=hoy - timedelta(days=9 * i),
                               entidad=f"Entidad {i % 5}", departamento="Guatemala", modalidad="Compra directa",
                               categoria="goods", descripcion="Computadora portátil 8 GB RAM", unspsc="43211503",
                               unidad="Unidad", cantidad=1, monto=p, precio_unitario=p,
                               texto_norm="computadora portatil 8 gb ram") for i, p in enumerate(precios)])
        bd.commit()
    try:
        r = cliente().get("/api/publico/precios", params={"q": "computadora portatil"}).json()
        s = r["resumen"]
        assert s["n"] == 20 and s["atipicos"] == 1 and s["entidades"] == 5 and r["suficiente"]
        assert s["p10"] <= s["p25"] <= s["mediana"] <= s["p75"] <= s["p90"]
        assert s["p90"] < 95000 and s["precio_orientativo"] == s[s["estadistico_recomendado"]]
        assert len(r["histograma"]) == 12 and sum(b["n"] for b in r["histograma"]) == 20
        assert all(m["n"] >= 3 for m in r["por_mes"])
        assert len(r["compras"]) == 21 and r["compras"][0]["enlace"].startswith("https://www.guatecompras.gt/")
    finally:
        with SesionLocal() as bd:
            bd.execute(delete(CompraItem).where(CompraItem.ocid.like("prueba-publico-%")))
            bd.commit()
