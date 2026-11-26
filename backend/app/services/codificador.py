"""Codificación automática de respuestas abiertas de ocupación a la CIUO-08 (propuesta de la DCE).

La DCE presentó como línea de innovación «clasificar automáticamente respuestas abiertas». Este codificador sugiere
el subgrupo principal de la Clasificación Internacional Uniforme de Ocupaciones (CIUO-08, 2 dígitos) para cada
respuesta, con una confianza, y marca para revisión humana las dudosas. Corre en el servidor del INE, sin modelos
externos ni envío de datos: compara las palabras de la respuesta con un vocabulario de cada subgrupo (incluye
términos usados en Guatemala) y desempata con similitud de trigramas de caracteres.

Respeta las reglas de la DCE: «no sabe» o «no responde» (98, 99) no se codifican como ocupación.
"""

from __future__ import annotations

import math
import re
from collections import Counter

from ..texto import normalizar

# Código CIUO-08 de 2 dígitos → (título oficial, vocabulario de raíces). Las raíces se comparan por prefijo.
CIUO: dict[str, tuple[str, str]] = {
    "01": ("Oficiales de las fuerzas armadas", "oficial ejercito coronel capitan teniente mayor general fuerzas armadas"),
    "03": ("Otros miembros de las fuerzas armadas", "soldado tropa militar marino infante sargento cabo"),
    "11": ("Directores ejecutivos, personal directivo de la administración pública y miembros del poder ejecutivo y legislativo",
           "alcalde diputado ministro viceministro gobernador director general gerente general presidente junta concejal sindico"),
    "12": ("Directores administradores y comerciales",
           "gerente financiero gerente recursos humanos gerente ventas gerente mercadeo jefe administrativo"),
    "13": ("Directores y gerentes de producción y operaciones",
           "gerente produccion gerente planta gerente proyecto jefe obra administrador finca gerente logistica"),
    "14": ("Gerentes de hoteles, restaurantes, comercios y otros servicios",
           "gerente hotel gerente restaurante gerente tienda propietario comercio dueno negocio administrador tienda"),
    "21": ("Profesionales de las ciencias y de la ingeniería",
           "ingeniero civil quimico fisico biologo arquitecto agronomo geologo matematico estadistico"),
    "22": ("Profesionales de la salud",
           "medico doctor cirujano odontologo dentista farmaceutico enfermera profesional pediatra ginecologo "
           "veterinario nutricionista psicologo clinico"),
    "23": ("Profesionales de la enseñanza", "maestro maestra profesor profesora docente catedratico educador pedagogo"),
    "24": ("Especialistas en organización de la administración pública y de empresas",
           "contador publico auditor economista administrador empresas asesor financiero analista"),
    "25": ("Profesionales de tecnología de la información y las comunicaciones",
           "programador desarrollador software ingeniero sistemas analista sistemas informatico administrador red"),
    "26": ("Profesionales en derecho, en ciencias sociales y culturales",
           "abogado notario juez periodista escritor sociologo antropologo trabajador social sacerdote pastor musico artista"),
    "31": ("Profesionales de las ciencias y la ingeniería de nivel medio",
           "tecnico industrial perito agronomo dibujante tecnico laboratorio electronica supervisor obra"),
    "32": ("Profesionales de nivel medio de la salud",
           "auxiliar enfermeria enfermero tecnico salud comadrona paramedico laboratorista promotor salud"),
    "33": ("Profesionales de nivel medio en operaciones financieras y administrativas",
           "perito contador agente seguros corredor tramitador agente aduana representante ventas"),
    "34": ("Profesionales de nivel medio de servicios jurídicos, sociales, culturales y afines",
           "procurador deportista entrenador fotografo disenador decorador chef"),
    "35": ("Técnicos de la tecnología de la información y las comunicaciones",
           "tecnico computacion soporte tecnico tecnico redes operador computadora tecnico telecomunicaciones"),
    "41": ("Oficinistas", "secretaria secretario oficinista digitador asistente administrativo mecanografo"),
    "42": ("Empleados en trato directo con el público", "cajero cajera recepcionista telefonista call center agente atencion cliente cobrador"),
    "43": ("Empleados contables y encargados del registro de materiales",
           "auxiliar contable bodeguero encargado bodega planillero inventario despachador"),
    "44": ("Otro personal de apoyo administrativo", "archivista mensajero cartero"),
    "51": ("Trabajadores de los servicios personales",
           "cocinero cocinera mesero mesera barbero peluquero estilista cosmetologa bartender conserje ama casa"),
    "52": ("Vendedores", "vendedor vendedora vendo vende comerciante dependiente tendero tendera mercado abarroteria tienda"),
    "53": ("Trabajadores de los cuidados personales", "ninera cuidador cuidadora asistente enfermo"),
    "54": ("Personal de los servicios de protección", "guardia seguridad agente policia policia bombero vigilante guardaespaldas custodio"),
    "61": ("Agricultores y trabajadores calificados de explotaciones agropecuarias con destino al mercado",
           "agricultor cultiva siembra milpa maiz frijol cafe cafetalero ganadero hortalizas productor avicultor caficultor"),
    "62": ("Trabajadores forestales calificados, pescadores y cazadores", "pescador leñador lenador forestal cazador acuicultor"),
    "63": ("Trabajadores agropecuarios, pescadores, cazadores y recolectores de subsistencia", "subsistencia autoconsumo siembra para comer"),
    "71": ("Oficiales y operarios de la construcción excluyendo electricistas",
           "albanil albañil maestro obra carpintero fontanero plomero pintor casas armador herrero"),
    "72": ("Oficiales y operarios de la metalurgia, la construcción mecánica y afines",
           "mecanico soldador tornero herrero enderezado pintura automotriz"),
    "73": ("Artesanos y operarios de las artes gráficas", "artesano tejedora tejedor ceramista alfarero joyero impresor serigrafo"),
    "74": ("Trabajadores especializados en electricidad y la electrotecnología",
           "electricista tecnico electrico instalador cable reparador electrodomesticos"),
    "75": ("Operarios y oficiales de procesamiento de alimentos, de la confección, ebanistas, otros artesanos y afines",
           "panadero tortillera carnicero costurera sastre zapatero ebanista modista bordadora"),
    "81": ("Operadores de instalaciones fijas y máquinas", "operario maquila operador maquina operario fabrica costurera industrial"),
    "82": ("Ensambladores", "ensamblador ensambladora"),
    "83": ("Conductores de vehículos y operadores de equipos pesados móviles",
           "piloto chofer conductor taxista mototaxi tuc tuc camionero operador montacargas bus"),
    "91": ("Limpiadores y asistentes", "limpieza conserje domestica trabajadora casa particular lavandera"),
    "92": ("Peones agropecuarios, pesqueros y forestales", "jornalero peon agricola mozo finca cortador cafe cortador cana"),
    "93": ("Peones de la minería, la construcción, la industria manufacturera y el transporte",
           "ayudante albanil peon construccion cargador estibador ayudante camion"),
    "94": ("Ayudantes de preparación de alimentos", "ayudante cocina lavaplatos"),
    "95": ("Vendedores ambulantes de servicios y afines", "vendedor ambulante lustrador limpiabotas vendedor calle"),
    "96": ("Recolectores de desechos y otras ocupaciones elementales", "recolector basura barrendero guajero repartidor"),
}
SIN_RESPUESTA = {"", "98", "99", "ns", "nr", "no sabe", "no responde", "ninguna", "ninguno", "nada", "no aplica", "na"}
_PALABRAS_VACIAS = {"de", "del", "la", "el", "en", "y", "a", "los", "las", "un", "una", "por", "para", "con", "se", "su", "al", "que"}


def _fichas(texto: str) -> list[str]:
    t = normalizar(texto).replace("ñ", "n")
    return [p for p in re.split(r"[^a-z0-9]+", t) if len(p) > 1 and p not in _PALABRAS_VACIAS]


def _raiz(p: str) -> str:
    return p[:5] if len(p) > 5 else p


def _trigramas(texto: str) -> Counter:
    t = f"  {normalizar(texto)} "
    return Counter(t[i:i + 3] for i in range(len(t) - 2))


def _coseno(a: Counter, b: Counter) -> float:
    comun = sum(a[k] * b[k] for k in a.keys() & b.keys())
    return comun / (math.sqrt(sum(v * v for v in a.values())) * math.sqrt(sum(v * v for v in b.values())) or 1)


_VOCAB = {c: {_raiz(p) for p in _fichas(voc)} for c, (_, voc) in CIUO.items()}
_TRI = {c: _trigramas(f"{titulo} {voc}") for c, (titulo, voc) in CIUO.items()}
# Peso de cada raíz según en cuántos subgrupos aparece (IDF): «médico» pesa más que «general» o «ayudante».
_DF = Counter(r for vocab in _VOCAB.values() for r in vocab)
_IDF = {r: math.log(len(CIUO) / n) for r, n in _DF.items()}


def _coincide(f: str, v: str) -> bool:
    return f == v or (len(f) >= 4 and len(v) >= 4 and (v.startswith(f) or f.startswith(v)))


def codificar(respuesta: str) -> dict:
    """Sugiere el código CIUO-08 de 2 dígitos con su confianza (0 a 1) y si conviene revisarlo."""
    texto = (respuesta or "").strip()
    if normalizar(texto) in SIN_RESPUESTA:
        return {"respuesta": texto, "codigo": "99", "ocupacion": "Sin respuesta (no sabe o no responde)", "confianza": 1.0,
                "revisar": False, "alternativa": None}
    fichas = [_raiz(p) for p in _fichas(texto)]
    tri = _trigramas(texto)
    puntajes = {}
    for c, vocab in _VOCAB.items():
        peso = sum(max((_IDF[v] for v in vocab if _coincide(f, v)), default=0.0) for f in fichas)
        puntajes[c] = peso + 0.5 * _coseno(tri, _TRI[c])
    orden = sorted(puntajes.items(), key=lambda x: -x[1])
    (c1, p1), (c2, p2) = orden[0], orden[1]
    if p1 < 1.0:
        return {"respuesta": texto, "codigo": None, "ocupacion": "Sin sugerencia: codificar a mano", "confianza": 0.0,
                "revisar": True, "alternativa": None}
    # Confianza: qué tan clara es la ventaja sobre el segundo subgrupo, atenuada si hubo pocas coincidencias.
    confianza = round(min(1.0, p1 / 3) * (p1 - p2) / p1, 2)
    return {"respuesta": texto, "codigo": c1, "ocupacion": CIUO[c1][0], "confianza": confianza, "revisar": confianza < 0.35,
            "alternativa": {"codigo": c2, "ocupacion": CIUO[c2][0]} if p2 > 1.0 else None}


def codificar_lote(respuestas: list[str]) -> dict:
    filas = [codificar(r) for r in respuestas]
    automaticas = sum(1 for f in filas if f["codigo"] and not f["revisar"])
    return {"filas": filas, "total": len(filas), "automaticas": automaticas, "revisar": len(filas) - automaticas,
            "por_grupo": Counter(f["codigo"][0] for f in filas if f["codigo"] and f["codigo"] != "99"),
            "catalogo": "CIUO-08, subgrupos principales (2 dígitos)"}
