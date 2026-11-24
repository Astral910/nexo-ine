"""Utilidades de texto en español: normalización para búsqueda y comparación."""

from __future__ import annotations

import re
import unicodedata

_PALABRAS_VACIAS = {
    "a", "al", "algo", "con", "contra", "de", "del", "desde", "el", "en", "entre", "es", "esta",
    "este", "hasta", "la", "las", "lo", "los", "me", "mi", "mis", "muestra", "muestrame", "para",
    "por", "que", "quiero", "se", "segun", "sin", "sobre", "su", "sus", "un", "una", "unos", "unas",
    "y", "o", "u", "ver", "dame", "cual", "cuales", "como", "cuanto", "cuantos", "the", "tipo", "hay", "son",
    "fue", "estan", "tiene", "tienen", "dime", "quisiera", "necesito", "puedes", "favor",
}

DEPARTAMENTOS = [
    "Guatemala", "El Progreso", "Sacatepéquez", "Chimaltenango", "Escuintla", "Santa Rosa",
    "Sololá", "Totonicapán", "Quetzaltenango", "Suchitepéquez", "Retalhuleu", "San Marcos",
    "Huehuetenango", "Quiché", "Baja Verapaz", "Alta Verapaz", "Petén", "Izabal", "Zacapa",
    "Chiquimula", "Jalapa", "Jutiapa",
]


def normalizar(texto: str | None) -> str:
    """Minúsculas, sin tildes y con espacios simples."""
    if not texto:
        return ""
    t = str(texto).replace("ñ", "\x00").replace("Ñ", "\x00")  # se conserva la ñ (año ≠ ano)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c)).replace("\x00", "ñ")
    t = re.sub(r"[^a-z0-9ñ\s\.\-/]", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def fichas(texto: str | None) -> list[str]:
    """Palabras significativas (sin palabras vacías) para búsqueda."""
    return [p for p in re.split(r"[\s/\-\.]+", normalizar(texto)) if len(p) > 1 and p not in _PALABRAS_VACIAS]


_DEPTO_NORM = {normalizar(d): d for d in DEPARTAMENTOS}
_DEPTO_NORM.update({"peten": "Petén", "quiche": "Quiché", "el quiche": "Quiché"})


def departamento_canonico(nombre: str | None) -> str | None:
    """Devuelve el nombre oficial del departamento o None si no se reconoce."""
    n = normalizar(nombre)
    if not n:
        return None
    if n in _DEPTO_NORM:
        return _DEPTO_NORM[n]
    # Coincidencia por palabra completa. Si hay varias, se descarta "Guatemala" (también es el país) y se toma
    # la última: "San Pedro Sacatepéquez, San Marcos" → San Marcos; "Quetzaltenango, Guatemala" → Quetzaltenango.
    hallados: list[tuple[int, str]] = []
    for clave, oficial in _DEPTO_NORM.items():
        for m in re.finditer(rf"\b{re.escape(clave)}\b", n):
            hallados.append((m.start(), oficial))
    if not hallados:
        return None
    distintos = {o for _, o in hallados}
    if len(distintos) > 1:
        hallados = [h for h in hallados if h[1] != "Guatemala"] or hallados
    return max(hallados)[1]
