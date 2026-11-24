"""Límite de solicitudes en memoria (ventana deslizante) para rutas sensibles.

Complementa el bloqueo de cuentas guardado en base de datos. En un despliegue con varias
instancias se reemplaza por un almacén compartido (por ejemplo Redis) o por el proxy inverso.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class LimitadorVentana:
    def __init__(self) -> None:
        self._eventos: dict[str, deque[float]] = defaultdict(deque)
        self._candado = threading.Lock()

    def permitir(self, clave: str, maximo: int, ventana_s: int) -> bool:
        ahora = time.monotonic()
        with self._candado:
            cola = self._eventos[clave]
            while cola and ahora - cola[0] > ventana_s:
                cola.popleft()
            if len(cola) >= maximo:
                return False
            cola.append(ahora)
            if len(self._eventos) > 50_000:  # evita crecimiento sin límite
                for k in list(self._eventos)[:10_000]:
                    self._eventos.pop(k, None)
            return True

    def reiniciar(self) -> None:
        with self._candado:
            self._eventos.clear()


limitador = LimitadorVentana()
