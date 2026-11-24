"""Automatizaciones en lenguaje sencillo: plantillas por rol, resumen del estado y validación de los datos."""

from __future__ import annotations

from .conftest import cliente, crear_usuario, csrf, iniciar_sesion


def _sesion(email: str, roles: list[str]):
    crear_usuario(email, roles)
    c = cliente()
    assert iniciar_sesion(c, email).status_code == 200
    return c


def test_plantillas_segun_el_rol():
    dpir = _sesion("auto.dpir@ejemplo.gob.gt", ["analista_dpir"])
    regional = _sesion("auto.regional@ejemplo.gob.gt", ["coordinador_regional"])
    ids_dpir = {p["id"] for p in dpir.get("/api/automatizaciones/plantillas").json()}
    ids_regional = {p["id"] for p in regional.get("/api/automatizaciones/plantillas").json()}
    assert ids_dpir == {"precio-laptops", "vencimientos", "resumen-diario"}
    assert ids_regional == {"resumen-diario", "avance-viernes"}
    p = next(x for x in dpir.get("/api/automatizaciones/plantillas").json() if x["id"] == "precio-laptops")
    assert p["frecuencia_texto"] == "Cada lunes a las 07:00" and p["para_que"] and p["puede_crear"]


def test_crear_desde_plantilla_ejecutar_y_resumen():
    c = _sesion("auto.crear@ejemplo.gob.gt", ["analista_dpir"])
    creadas = []
    for p in c.get("/api/automatizaciones/plantillas").json():
        r = c.post("/api/automatizaciones", json={"nombre": p["titulo"], "tarea": p["tarea"], "parametros": p["parametros"],
                                                  "frecuencia": p["frecuencia"], "valor_frecuencia": p["valor_frecuencia"]},
                   headers=csrf(c))
        assert r.status_code == 201, r.text
        assert r.json()["para_que"] and r.json()["categoria"]
        creadas.append(r.json())
    resumen_diario = next(a for a in creadas if a["tarea"] == "reportes.resumen")
    r = c.post(f"/api/automatizaciones/{resumen_diario['id']}/ejecutar", headers=csrf(c))
    assert r.status_code == 200 and r.json()["estado"] == "ok", r.text

    lista = c.get("/api/automatizaciones").json()
    for a in lista:
        assert {"para_que", "categoria", "ultimo_resumen", "ejecuciones_24h", "errores_24h"} <= set(a)
    ejecutada = next(a for a in lista if a["id"] == resumen_diario["id"])
    assert ejecutada["ultimo_resumen"] and ejecutada["ejecuciones_24h"] == 1 and ejecutada["errores_24h"] == 0

    estado = c.get("/api/automatizaciones/resumen").json()
    assert set(estado) == {"total", "activas", "pausadas", "ejecuciones_24h", "fallas_24h", "proxima", "ultima_falla"}
    assert estado["total"] == len(lista) and estado["activas"] + estado["pausadas"] == estado["total"]
    assert estado["ejecuciones_24h"] >= 1 and estado["proxima"]["nombre"]


def test_tareas_describen_sus_campos():
    c = _sesion("auto.campos@ejemplo.gob.gt", ["analista_dpir"])
    tareas = {t["clave"]: t for t in c.get("/api/automatizaciones/tareas").json()}
    vigilar = tareas["dpir.vigilar_producto"]
    umbral = next(x for x in vigilar["campos"] if x["clave"] == "umbral_pct")
    assert vigilar["para_que"] and vigilar["categoria"] == "Vigilancia de precios"
    assert umbral["tipo"] == "numero" and umbral["minimo"] == 1 and umbral["maximo"] == 100
    assert "indices.detectar_atipicos" not in tareas  # su rol no revisa alertas


def test_valores_fuera_de_rango_o_mal_escritos():
    c = _sesion("auto.rango@ejemplo.gob.gt", ["analista_dpir"])
    base = {"nombre": "Vigilar papel", "tarea": "dpir.vigilar_producto", "frecuencia": "manual", "valor_frecuencia": ""}
    r = c.post("/api/automatizaciones", json={**base, "parametros": {"terminos": "papel bond", "umbral_pct": 500}},
               headers=csrf(c))
    assert r.status_code == 422 and "Cambio que dispara el aviso" in r.json()["detalle"]
    r = c.post("/api/automatizaciones", json={**base, "parametros": {"terminos": "papel bond", "umbral_pct": "mucho"}},
               headers=csrf(c))
    assert r.status_code == 422 and "número" in r.json()["detalle"]
    r = c.post("/api/automatizaciones", json={**base, "parametros": {"terminos": "papel bond", "umbral_pct": "15"}},
               headers=csrf(c))
    assert r.status_code == 201 and r.json()["parametros"]["umbral_pct"] == 15
    aid = r.json()["id"]
    # El estado interno que guarda la tarea (última mediana) no impide editarla después
    r = c.put(f"/api/automatizaciones/{aid}", json={**base, "parametros": {"terminos": "papel bond", "umbral_pct": 20,
                                                                           "ultima_mediana": 25.5}}, headers=csrf(c))
    assert r.status_code == 200 and r.json()["parametros"] == {"terminos": "papel bond", "umbral_pct": 20}

    diec = _sesion("auto.diec@ejemplo.gob.gt", ["analista_diec"])
    r = diec.post("/api/automatizaciones", json={"nombre": "Atípicos", "tarea": "indices.detectar_atipicos",
                                                 "parametros": {"periodo": "2023-13"}, "frecuencia": "manual",
                                                 "valor_frecuencia": ""}, headers=csrf(diec))
    assert r.status_code == 422 and "AAAA-MM" in r.json()["detalle"]
