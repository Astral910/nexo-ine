"""Tableros base por rol, definidos como especificaciones declarativas.

Cada tablero es un JSON con widgets. Los widgets de datos piden información a la capa semántica;
los de sistema muestran componentes vivos (alertas, solicitudes, automatizaciones, seguridad).
Cada persona puede duplicar su tablero base y personalizarlo sin afectar a los demás.
"""

from __future__ import annotations


def w(id_, tipo, titulo, ancho=6, **extra) -> dict:
    return {"id": id_, "tipo": tipo, "titulo": titulo, "ancho": ancho, **extra}


def q(fuente, medida, dimension=None, serie=None, limite=None, **filtros) -> dict:
    c = {"fuente": fuente, "medida": medida, "filtros": filtros}
    if limite:  # «limite» es un parámetro de la consulta, no un filtro de la fuente
        c["limite"] = limite
    if dimension:
        c["dimension"] = dimension
    if serie:
        c["serie"] = serie
    return c


IPC_INTERANUAL = w("ipc-inter", "linea", "IPC: variación interanual (%)", 6,
                   consulta=q("ipc", "variacion", "periodo", ambito="republica_var", clave="Variación interanual",
                              desde_anio=2022))
IPC_REGIONES = w("ipc-reg", "linea", "IPC por región (2024=100)", 6,
                 consulta=q("ipc", "indice", "periodo", "clave", ambito="region", desde_anio=2024))
CBA = w("cba", "linea", "Costo mensual per cápita de la CBA (Q)", 6,
        consulta=q("cba", "costo", "periodo", "ambito"))
ACTIVIDAD = w("actividad", "sistema", "Actividad reciente en la plataforma", 6, componente="actividad_reciente")

TABLEROS_POR_ROL: dict[str, dict] = {
    "direccion": {"titulo": "Vista de Dirección", "descripcion": "Resumen ejecutivo de todos los procesos.",
                  "widgets": [
                      IPC_INTERANUAL, CBA,
                      w("sol-estado", "dona", "Solicitudes de precios por etapa", 4, consulta=q("solicitudes", "conteo", "estado")),
                      w("alertas-depto", "barras", "Alertas de precios por departamento", 8,
                        consulta=q("alertas", "conteo", "departamento")),
                      w("postura", "sistema", "Seguridad y salud del sistema", 12, componente="postura_seguridad")]},
    "analista_dpir": {"titulo": "Precios de Referencia", "descripcion": "Solicitudes, mercado y precios públicos.",
                      "widgets": [
                          w("sol", "sistema", "Solicitudes en curso", 12, componente="solicitudes_activas"),
                          w("compras-mes", "linea", "Compras de un artículo por mes (Guatecompras)", 6,
                            consulta=q("compras", "conteo", "mes", desde_anio=2024)),
                          w("compras-mod", "dona", "Compras por modalidad", 6, consulta=q("compras", "conteo", "modalidad")),
                          w("pr-cat", "barras_h", "Precios de referencia del INE por categoría", 6,
                            consulta=q("precios_referencia", "conteo", "categoria")),
                          IPC_INTERANUAL]},
    "analista_diec": {"titulo": "Índices y Estadísticas Continuas", "descripcion": "Alertas, IPC, IPMC y CBA.",
                      "widgets": [
                          w("alertas", "sistema", "Alertas de precios por revisar", 12, componente="alertas_recientes"),
                          w("alertas-sev", "dona", "Alertas por severidad", 4, consulta=q("alertas", "conteo", "severidad")),
                          w("alertas-depto", "barras", "Alertas por departamento", 8,
                            consulta=q("alertas", "conteo", "departamento")),
                          IPC_REGIONES, CBA,
                          w("ipmc", "linea", "IPMC: cemento y hierro", 12,
                            consulta=q("ipmc", "indice", "periodo", "clave", texto="cemento gris"))]},
    "analista_dce": {"titulo": "Censos y Encuestas", "descripcion": "Población, territorio y calidad de bases.",
                     "widgets": [
                         w("pob-depto", "barras_h", "Población censada por departamento (2018)", 6,
                           consulta=q("poblacion", "poblacion", "departamento", limite=22)),
                         w("lp-area", "dona", "Lugares poblados por área", 6, consulta=q("poblacion", "lugares", "area")),
                         w("mapa", "mapa", "Lugares poblados del Censo 2018", 12, componente="mapa_lugares"),
                         w("proy", "linea", "Población proyectada 2015-2030", 12,
                           consulta=q("proyecciones", "poblacion", "anio"))]},
    "coordinador_regional": {"titulo": "Coordinación Regional", "descripcion": "Avance de operativos de campo.",
                             "widgets": [
                                 w("avance", "sistema", "Avance del operativo por departamento", 12,
                                   componente="avance_operativo"),
                                 w("mapa", "mapa", "Lugares poblados por visitar", 12, componente="mapa_lugares"),
                                 w("pob-depto", "barras_h", "Población por departamento (2018)", 12,
                                   consulta=q("poblacion", "poblacion", "departamento", limite=22))]},
    "calidad_desa": {"titulo": "Calidad y validación", "descripcion": "Frescura de fuentes y validaciones.",
                     "widgets": [
                         w("frescura", "sistema", "Frescura de las fuentes de datos", 12, componente="frescura_datos"),
                         w("validaciones", "sistema", "Mis validaciones recientes", 6, componente="validaciones_recientes"),
                         w("alertas-sev", "dona", "Alertas de precios por severidad", 6,
                           consulta=q("alertas", "conteo", "severidad"))]},
    "admin_ti": {"titulo": "Informática", "descripcion": "Salud del sistema, automatizaciones y accesos.",
                 "widgets": [
                     w("salud", "sistema", "Salud del sistema (agente de TI)", 12, componente="salud_ti"),
                     w("auto", "sistema", "Automatizaciones", 12, componente="automatizaciones_estado"),
                     w("ejec", "dona", "Ejecuciones por estado", 4, consulta=q("ejecuciones", "conteo", "estado")),
                     w("ejec-dia", "linea", "Ejecuciones de automatizaciones por día", 8,
                       consulta=q("ejecuciones", "conteo", "dia"))]},
    "seguridad": {"titulo": "Ciberseguridad", "descripcion": "Postura, riesgos y eventos.",
                  "widgets": [
                      w("postura", "sistema", "Postura de seguridad (agente)", 12, componente="postura_seguridad"),
                      w("riesgos", "sistema", "Mapa de calor de riesgos", 6, componente="mapa_riesgos"),
                      w("bit-res", "dona", "Eventos por resultado", 6, consulta=q("bitacora", "conteo", "resultado")),
                      w("bit-dia", "linea", "Eventos de auditoría por día", 12, consulta=q("bitacora", "conteo", "dia"))]},
    "entidad_solicitante": {"titulo": "Mis solicitudes", "descripcion": "Seguimiento de precios de referencia.",
                            "widgets": [w("mis", "sistema", "Mis solicitudes de precio de referencia", 12,
                                          componente="mis_solicitudes")]},
    "jurado": {"titulo": "Modo Jurado", "descripcion": "Cómo Nexo cumple cada criterio de evaluación.",
               "widgets": [
                   w("rubrica", "sistema", "Rúbrica del Datatón y evidencia", 12, componente="rubrica_jurado"),
                   IPC_INTERANUAL, CBA]},
    "consulta": {"titulo": "Consulta", "descripcion": "Indicadores públicos del INE.",
                 "widgets": [IPC_INTERANUAL, CBA, IPC_REGIONES,
                             w("pob-depto", "barras_h", "Población por departamento (2018)", 6,
                               consulta=q("poblacion", "poblacion", "departamento", limite=22))]},
}
