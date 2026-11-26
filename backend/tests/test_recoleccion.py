"""Recolección de precios del IPP, IPMC e ICC: captura, alertas, pendientes y secreto estadístico del informante."""

from __future__ import annotations

from .conftest import cliente, crear_usuario, csrf, iniciar_sesion


def _sesion(email: str, roles: list[str]):
    crear_usuario(email, roles)
    c = cliente()
    assert iniciar_sesion(c, email).status_code == 200
    return c


def test_captura_alertas_y_pendientes():
    c = _sesion("diec.recoleccion@nexo.example.com", ["analista_diec"])
    h = csrf(c)
    prod = c.post("/api/recoleccion/productos", json={"indice": "IPP", "nombre": "Maíz blanco", "unidad": "Quintal",
                                                      "grupo": "Granos básicos"}, headers=h).json()
    inf = [c.post("/api/recoleccion/informantes", json={"indice": "IPP", "nombre": f"Productor confidencial {i}",
                                                        "departamento": "Jutiapa"}, headers=h).json() for i in range(7)]
    assert inf[0]["codigo"].startswith("IPP-I") and inf[0]["nombre"] == "Productor confidencial 0"
    for i, x in enumerate(inf):
        r = c.post("/api/recoleccion/precios", json={"informante_id": x["id"], "producto_id": prod["id"], "periodo": "2026-09",
                                                     "precio": 200 + i}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["variacion"] is None  # primer mes: no hay con qué comparar
    # Octubre: seis suben cerca de 2 % y uno sube 60 %; el último informante no reporta.
    for i, x in enumerate(inf[:6]):
        precio = (200 + i) * (1.6 if i == 0 else 1.02 + i * 0.002)
        r = c.post("/api/recoleccion/precios", json={"informante_id": x["id"], "producto_id": prod["id"], "periodo": "2026-10",
                                                     "precio": round(precio, 2)}, headers=h).json()
        assert r["atipico"] is (i == 0), r
    alertas = c.get("/api/recoleccion/alertas?indice=IPP&periodo=2026-10").json()["alertas"]
    assert [a["informante"] for a in alertas] == [inf[0]["codigo"]]
    assert alertas[0]["metodo"] == "Hidiroglou-Berthelot" and alertas[0]["variacion"] == 60.0
    pendientes = c.get("/api/recoleccion/precios?indice=IPP&periodo=2026-10").json()["pendientes"]
    assert [p["informante"] for p in pendientes] == [inf[6]["codigo"]]
    resumen = {f["indice"]: f for f in c.get("/api/recoleccion/resumen").json()["indices"]}
    assert resumen["IPP"]["periodo"] == "2026-10" and resumen["IPP"]["capturados"] == 6 and resumen["IPP"]["esperados"] == 7
    assert resumen["IPP"]["alertas"] == 1


def test_informante_es_confidencial_fuera_de_la_diec():
    diec = _sesion("diec.confidencial@nexo.example.com", ["analista_diec"])
    diec.post("/api/recoleccion/informantes", json={"indice": "IPMC", "nombre": "Ferretería confidencial"}, headers=csrf(diec))
    for email, roles in (("dpir.recoleccion@nexo.example.com", ["analista_dpir"]),
                         ("direccion.recoleccion@nexo.example.com", ["direccion"])):
        c = _sesion(email, roles)
        filas = c.get("/api/recoleccion/informantes?indice=IPMC").json()
        assert filas and all(f["nombre"] is None for f in filas), (roles, filas)
        r = c.post("/api/recoleccion/informantes", json={"indice": "IPMC", "nombre": "Intento"}, headers=csrf(c))
        assert r.status_code == 403


def test_informante_y_producto_de_indices_distintos_se_rechazan():
    c = _sesion("diec.mezcla@nexo.example.com", ["analista_diec"])
    h = csrf(c)
    inf = c.post("/api/recoleccion/informantes", json={"indice": "ICC", "nombre": "Constructora"}, headers=h).json()
    prod = c.post("/api/recoleccion/productos", json={"indice": "IPMC", "nombre": "Cemento gris"}, headers=h).json()
    r = c.post("/api/recoleccion/precios", json={"informante_id": inf["id"], "producto_id": prod["id"], "periodo": "2026-10",
                                                 "precio": 80}, headers=h)
    assert r.status_code == 422


def test_catalogo_de_campo_no_lleva_precios_ni_informantes():
    c = _sesion("diec.campo@nexo.example.com", ["analista_diec"])
    r = c.get("/api/indices/catalogo-campo")
    assert r.status_code == 200
    datos = r.json()
    assert {"generado_en", "total", "articulos", "fuente"} <= set(datos)
    for a in datos["articulos"]:
        assert not {"precio", "precio_actual", "cod_fuente", "informante"} & set(a)
    assert cliente().get("/api/indices/catalogo-campo").status_code == 401


def test_codificador_ciuo_sugiere_y_respeta_codigos_especiales():
    c = _sesion("dce.codificar@nexo.example.com", ["analista_dce"])
    r = c.post("/api/calidad/codificar", json={"respuestas": ["piloto de bus", "secretaria", "tortillera", "no sabe", "xyz qwerty"]},
               headers=csrf(c))
    assert r.status_code == 200, r.text
    filas = r.json()["filas"]
    assert [f["codigo"] for f in filas] == ["83", "41", "75", "99", None]
    assert filas[3]["ocupacion"].startswith("Sin respuesta") and filas[4]["revisar"] is True
