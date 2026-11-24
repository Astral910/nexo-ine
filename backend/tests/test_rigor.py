"""Rigor estadístico y secreto estadístico (regresiones HB-1, SEM-1, SEM-2, SEM-4, SEM-5, SEM-6, TXT-1)."""

from __future__ import annotations

import io
import zipfile

import pytest
from sqlalchemy import delete

from app.db import SesionLocal, ahora
from app.models import CompraItem, ProyeccionPoblacion, SerieIndice
from app.services import generador, semantica
from app.services.alertas import hidiroglou_berthelot
from app.services.validador import ArchivoInvalido, reporte_csv, validar
from app.texto import departamento_canonico

TODOS = {"tableros:ver", "indices:ver", "dpir:ver"}


def test_hb_no_marca_precios_sin_cambio():
    relativos = [1.0] * 20 + [1.10, 1.11, 1.12, 1.12, 1.13, 1.14, 3.0]
    tamanos = [10.0] * len(relativos)
    res = hidiroglou_berthelot(relativos, tamanos)
    marcados = [r for r, x in zip(relativos, res, strict=True) if x.atipico]
    assert marcados == [3.0]


@pytest.fixture
def datos_sinteticos():
    anio = ahora().year
    with SesionLocal() as bd:
        for a in (anio - 1, anio, anio + 1):
            bd.add(ProyeccionPoblacion(cod_municipio="9901", municipio="Prueba", departamento="Petén", anio=a,
                                       poblacion=100_000))
        for mes, (u, r) in ((9, (990, 790)), (10, (1000, 800))):
            bd.add(SerieIndice(indicador="CBA", ambito="urbana", clave="CBA urbana: costo", anio=anio, mes=mes, valor=u))
            bd.add(SerieIndice(indicador="CBA", ambito="rural", clave="CBA rural: costo", anio=anio, mes=mes, valor=r))
        bd.add(CompraItem(ocid="x-1", fecha=ahora().date(), descripcion="lapiz", cantidad=1, monto=2, precio_unitario=2,
                          texto_norm="lapiz"))
        bd.commit()
        yield bd
        bd.execute(delete(ProyeccionPoblacion).where(ProyeccionPoblacion.cod_municipio == "9901"))
        bd.execute(delete(SerieIndice).where(SerieIndice.indicador == "CBA"))
        bd.execute(delete(CompraItem).where(CompraItem.ocid == "x-1"))
        bd.commit()


def test_poblacion_proyectada_no_suma_anios(datos_sinteticos):
    r = semantica.ejecutar(datos_sinteticos, {"fuente": "proyecciones", "medida": "poblacion"}, TODOS)
    assert r["filas"][0]["valor"] == 100_000
    assert any(str(ahora().year) in a for a in r["advertencias"])


def test_cba_no_promedia_urbana_y_rural(datos_sinteticos):
    r = semantica.ejecutar(datos_sinteticos, {"fuente": "cba", "medida": "costo"}, TODOS)
    valores = sorted(f["valor"] for f in r["filas"])
    assert valores == [800, 1000]  # último mes, una cifra por área; nunca 900


def test_precio_sin_producto_se_rechaza(datos_sinteticos):
    with pytest.raises(semantica.ErrorConsulta):
        semantica.ejecutar(datos_sinteticos, {"fuente": "compras", "medida": "precio_mediano"}, TODOS)
    r = semantica.ejecutar(datos_sinteticos, {"fuente": "compras", "medida": "precio_mediano",
                                              "filtros": {"texto": "lapiz"}}, TODOS)
    assert r["filas"][0]["valor"] == 2


def test_ipc_de_un_departamento_usa_su_region():
    spec = generador.generar("IPC de Quetzaltenango", TODOS)
    filtros = spec["widgets"][0]["consulta"]["filtros"]
    assert filtros["ambito"] == "region" and "VI" in filtros["clave"]
    assert any("no publica el IPC por departamento" in a for a in spec["advertencias"])


def test_pregunta_sin_datos_no_inventa_respuesta():
    with pytest.raises(ValueError):
        generador.generar("¿Cuántos hospitales hay en Petén?", TODOS)


def test_departamento_canonico_por_palabra_completa():
    assert departamento_canonico("Municipalidad de San Pedro Sacatepéquez, San Marcos") == "San Marcos"
    assert departamento_canonico("Área de Salud de Quetzaltenango, Guatemala") == "Quetzaltenango"
    assert departamento_canonico("PETEN") == "Petén"


def test_validador_detecta_datos_personales_y_neutraliza_formulas():
    csv_texto = ("nombre,dpi,telefono,monto\n"
                 "Ana Pérez,2456 78901 0101,55123456,=CMD()\n"
                 "Luis Gómez,1234 56780 0901,22334455,10\n"
                 "Eva Ruiz,3456 78901 1301,44556677,12\n")
    informe = validar("prueba.csv", csv_texto.encode())
    assert informe["bloqueante"] is True
    assert all("•" in e for h in informe["hallazgos"] for e in h.get("ejemplos", []))  # ejemplos enmascarados
    informe["inconsistencias"] = [{"fila": 2, "columna": "monto", "problema": "x", "valor": "=CMD()"}]
    assert "'=CMD()" in reporte_csv(informe)


def test_validador_rechaza_bombas_zip():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("xl/worksheets/sheet1.xml", b"0" * 20_000_000)
    with pytest.raises(ArchivoInvalido):
        validar("bomba.xlsx", buffer.getvalue())


def test_tableros_base_usan_consultas_validas():
    """Regresión TAB-1: cada widget de datos de los tableros base debe ser aceptado por la capa semántica.
    Antes, «limite» viajaba como filtro y el tablero de Censos y Encuestas mostraba un error."""
    from app.catalogos import PERMISOS
    from app.services.tableros_base import TABLEROS_POR_ROL

    todos = {p[0] for p in PERMISOS}
    with SesionLocal() as bd:
        for rol, spec in TABLEROS_POR_ROL.items():
            for w in spec["widgets"]:
                if w.get("consulta"):
                    try:
                        semantica.ejecutar(bd, w["consulta"], todos)
                    except semantica.ErrorConsulta as e:
                        pytest.fail(f"Tablero base de {rol}, widget «{w['titulo']}»: {e}")
