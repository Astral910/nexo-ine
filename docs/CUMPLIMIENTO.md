# Cumplimiento de los lineamientos — Categoría 2

Resumen propio de la nota conceptual del Datatón INE 2026 y de cómo Nexo cumple cada punto.
Se actualiza durante el evento.

| Lineamiento | Cómo lo cumplimos | Estado |
|---|---|---|
| Fuente principal: al menos una base pública del portal del INE | Precios de referencia, precios recolectados del IPC, Hoja de Balance de Alimentos y lugares poblados, descargados del portal de datos abiertos del INE | En curso |
| Otras fuentes abiertas citadas | Guatecompras en formato OCDS (CC BY 4.0), solo como complemento | En curso |
| Fecha de descarga documentada | El pipeline guarda URL, fecha y huella SHA-256 de cada archivo | En curso |
| Tecnologías libres o sin licencia de pago | Todo el stack es de código abierto; sin servicios de pago | En curso |
| Desarrollo durante el evento | Repositorio creado el 23 de noviembre; el historial de commits es la evidencia | Cumplido |
| Repositorio Git desde el día 1 con acceso al jurado | Este repositorio | Cumplido (dar acceso al jurado) |
| Prototipo funcional, local o en línea | Ejecución local con un comando | En curso |
| Reproducibilidad: instalación, ejecución, dependencias | README + dependencias fijadas | En curso |
| README mínimo (problema, arquitectura, instalación, datos, limitaciones) | README | En curso |
| Secreto estadístico; no identificar personas, hogares ni empresas | Supresión automática de celdas pequeñas; detector de datos personales; los informantes solo aparecen como códigos | En curso |
| Sin credenciales en el código | `.env` fuera del repositorio; contraseñas de demostración generadas al instalar; escaneo de secretos en CI | En curso |
| Uso de IA declarado | Sección en el README | En curso |
| Resultados fieles a definiciones y metadatos del INE | Cada gráfica muestra fuente, periodo, unidad y número de observaciones | En curso |
| Componentes de terceros listados con su licencia | Archivo de terceros generado desde las dependencias | En curso |
| Citar al INE como fuente | En la interfaz, los informes y la documentación | En curso |

## Rúbrica (escala 1–5 × ponderación)

| Criterio | Peso | Qué mostramos |
|---|---|---|
| Funcionalidad | 25 % | Flujos completos de punta a punta con datos reales |
| Aplicabilidad institucional | 20 % (desempate) | Responde a los retos que las Direcciones presentaron el 23 de noviembre |
| Calidad técnica | 20 % | Arquitectura modular, pruebas automáticas, CI, documentación |
| Innovación | 15 % | Tableros generados a partir de texto, agentes automáticos de seguridad y de TI |
| Rigor en el uso de los datos | 10 % | Métodos estadísticos documentados y metadatos visibles |
| Presentación y usabilidad | 10 % | Interfaz con la identidad visual del INE y recorridos por rol |
