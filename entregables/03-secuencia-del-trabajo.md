# Secuencia del trabajo, día por día

Nexo · Datatón INE 2026, Categoría 2. Equipo: Josue David Sajche Boror, Jeferson Andre Cano López, Angel David Siliezar López y Ricardo Javier González Corado.

El repositorio se creó el 23 de noviembre de 2026 a las 22:09 (día 1) y tiene 50 commits. Cada fila de las tablas es un commit del historial de Git (hora de Guatemala): es la evidencia del trabajo realizado durante el evento. Este documento se genera con `python scripts/secuencia.py`.

## Orden de los entregables

1. [Repositorio](https://github.com/Astral910/nexo-ine), con el README (problema, arquitectura, instalación, datos, limitaciones, uso de IA).
2. [Presentación en PDF](01-presentacion-Nexo.pdf) para la exposición de 7 minutos.
3. [Video demostrativo](02-video-demostrativo.mp4), respaldo en caso de fallas durante la demostración en vivo.
4. Esta secuencia del trabajo.
5. [Matriz de cumplimiento de los lineamientos y la rúbrica](../docs/CUMPLIMIENTO.md).

## Lunes 23 de noviembre: apertura y base de la plataforma

Por la mañana, en las oficinas del INE, las Direcciones presentaron sus retos (DCE, DIEC con DESA y DCR, y DPIR) y el equipo eligió el tema: unir esos procesos en una sola plataforma. Por la noche se creó el repositorio (día 1) y se construyó la base: modelo de datos, seguridad, descarga reproducible de 26 fuentes con su huella SHA-256, capa semántica con secreto estadístico, alertas Hidiroglou-Berthelot, los routers de todos los módulos, el frontend con la identidad del INE y la documentación.

| Hora | Autor | Qué se hizo |
|---|---|---|
| 22:09 | Astral910 | Inicio del proyecto: README base y matriz de cumplimiento de lineamientos |
| 22:22 | Astral910 | Backend: modelo de datos, seguridad (Argon2id, sesiones, CSRF, MFA, límites), RBAC, bitácora con cadena de hashes y flujo de acceso |
| 23:11 | Astral910 | Datos: registro de 26 fuentes (INE y Guatecompras), descarga con manifiesto SHA-256 y procesamiento reproducible |
| 23:11 | Astral910 | Servicios: capa semántica con supresión por secreto estadístico, generador de tableros desde texto, alertas Hidiroglou-Berthelot, motor de automatizaciones y agentes de seguridad y TI |
| 23:11 | Astral910 | API: routers de todos los módulos, siembra idempotente, consola de administración y arranque de la aplicación |
| 23:14 | Astral910 | Seguridad: corrige hallazgos P0 y P1 de las revisiones de IT y ciberseguridad |
| 23:15 | Astral910 | Bitácora: HMAC con llave del servidor, anclas externas contra borrado del final, eslabones únicos y detalle sin pérdidas |
| 23:17 | Astral910 | Rigor: las cifras ya no inducen a error |
| 23:20 | Astral910 | Datos e informe técnico: fecha de descarga verificable, licencias del portal del INE, marca de agua y regla del 50 % |
| 23:35 | Astral910 | Frontend: React + TypeScript con la identidad visual del INE |
| 23:39 | Astral910 | Interfaz: gráficas sin animación, mapa por departamento, centro de mando sin widgets duplicados |
| 23:40 | Astral910 | Precios de referencia: precios posteriores al último IPC no se marcan como sin ajuste; informe sin justificación innecesaria; historial y primera ejecución de automatizaciones en la demostración |
| 23:42 | Astral910 | PostgreSQL: consultas sin DISTINCT sobre entidades con JSON; pruebas configurables contra PostgreSQL |
| 23:47 | Astral910 | Documentación completa y despliegue |
| 23:49 | Astral910 | Territorio: el avance del operativo se registra en un formulario propio; insignia de CI en el README |

## Martes 24 de noviembre: rigor, secreto estadístico y Nexo Abierto

Correcciones de las revisiones de seguridad y de rigor (supresión de celdas y conteos, TI sin códigos de informante, Hidiroglou-Berthelot sin sesgo), rediseño formal con lenguaje institucional, despliegue con Docker y PostgreSQL. Por la tarde: Nexo Abierto sin cuenta, vistas Resumen y Completa en cada pantalla, «Cómo leer esta pantalla» y recorridos guiados.

| Hora | Autor | Qué se hizo |
|---|---|---|
| 00:08 | Astral910 | Consola: cuenta local de pruebas con todos los roles internos (solo desarrollo, contraseña aleatoria en var/) |
| 00:11 | Astral910 | MFA: el código QR se entrega como data URI con espacio de nombres SVG para que el navegador lo dibuje (regresión en pruebas) |
| 00:20 | Astral910 | ETL: columnas JSON se cargan como objeto (corrige la Hoja de Balance que fallaba); generador prefiere precios de compra sobre el índice IPMC; cifras de saldo con año usan su último mes |
| 00:44 | Astral910 | Rediseño formal de la interfaz y lenguaje institucional (usted) |
| 01:15 | Astral910 | Secreto estadístico: una celda suprimida tampoco entrega su conteo; «interanual» ya no se agrupa por año; comentarios y documentación precisos |
| 01:17 | Astral910 | Interfaz: sin franja de color en indicadores de tableros; preferencia «Reducir animaciones» en Mi perfil; color de gráfica con contraste suficiente; textos precisos |
| 01:20 | Astral910 | Secreto estadístico: el rol de TI ya no ve códigos de informante; documentación alineada con el código (fuentes, pruebas y supresión) |
| 01:23 | Astral910 | Secreto estadístico en el detalle de artículo; prueba que valida las dos correcciones de Hidiroglou-Berthelot; cifras de METODOS verificadas |
| 01:27 | Astral910 | Despliegue: Compose pasa el .env al contenedor, cookies seguras automáticas en producción, sin cuentas demo en producción, .dockerignore y guía docs/OPERACION.md; prueba de bitácora más estricta |
| 01:27 | Astral910 | Privacidad: comentario preciso sobre lo que conserva la bitácora al eliminar una cuenta |
| 01:39 | Astral910 | Vidrio real en Chrome (el minificador dejaba solo el prefijo -webkit-), franja que tapa el contenido sobre la barra flotante, búsqueda global en memoria sin tildes y estado «Buscando…» |
| 01:41 | Astral910 | Búsqueda global: lugares poblados también en memoria (milisegundos por consulta) |
| 17:54 | Astral910 | Nexo Abierto: API pública de solo lectura (precios, municipios y preguntas a los datos) con lista blanca de fuentes, límites por IP y pruebas; automatizaciones explicadas en lenguaje sencillo, con plantillas y resumen |
| 17:54 | Astral910 | Vistas Resumen y Completa en cada pantalla, «Cómo leer esta pantalla» con glosario, recorridos guiados de 3 y 1 minutos, Nexo Abierto sin cuenta y asistente de automatizaciones en 3 pasos |
| 17:54 | Astral910 | Documentación: Nexo Abierto, vistas, recorridos, por qué importa al país y nuevo guion de la demostración |

## Miércoles 25 de noviembre: propuestas pendientes de las Direcciones y entregables

Instalación en Windows verificada desde cero, solicitud de precio de referencia recorrida de punta a punta, Recolección de precios del IPP, IPMC e ICC con alertas al capturar (DIEC), catálogo de campo instalable en el teléfono que funciona sin internet (DIEC), codificador CIUO-08 de respuestas abiertas (DCE), mapa municipal, presentación en PDF, video demostrativo y esta carpeta de entregables.

| Hora | Autor | Qué se hizo |
|---|---|---|
| 20:23 | Rakataxxd | Instalación en Windows: dependencias compiladas para todas las plataformas (tzdata con hash) e iniciar.ps1 se detiene si falla un paso y acepta -Puerto |
| 20:31 | Rakataxxd | Demostración: una solicitud de precio de referencia recorrida de punta a punta (pasos 1 a 6) con compras reales de Guatecompras, cotizaciones marcadas como demostración e informe con huella |
| 20:39 | Rakataxxd | Recolección de precios del IPP, IPMC e ICC: informantes, productos, captura mensual con validación inmediata, cobertura, pendientes y alertas Hidiroglou-Berthelot; el nombre del informante solo lo ve la DIEC |
| 20:58 | Rakataxxd | Catálogo de campo instalable en el teléfono (funciona sin conexión), pantalla de Recolección de precios y barra superior que cabe en el celular |
| 21:00 | Rakataxxd | Documentación: recolección de precios, catálogo de campo, solicitud entregada de demostración y preguntas probables de la DIEC |
| 21:10 | Rakataxxd | Presentación para el jurado (11 láminas, PDF) con su fuente HTML y el script que la exporta |
| 21:33 | Rakataxxd | Video demostrativo de 2 min 24 s con narración y subtítulos, scripts para regenerarlo y documentación de entregables |
| 21:34 | Rakataxxd | Reparto de módulos por integrante, repositorio público y guion con la recolección de precios |
| 22:02 | Rakataxxd | Mapa de la ficha municipal centrado en el municipio con su departamento de fondo, catálogo de campo sin cuenta con enlaces desde el acceso y Nexo Abierto, recorrido y Modo Jurado con la recolección, y codificador CIUO-08 de respuestas abiertas para la DCE |
| 22:08 | Rakataxxd | Carpeta de entregables ordenada (presentación, video y secuencia del trabajo día por día generada del historial) y documentación del codificador CIUO-08 |
| 22:43 | Rakataxxd | Windows: los archivos se leen y escriben en UTF-8 (el Modo Jurado fallaba con error 500 al leer pruebas con tildes; también bitácora, ETL, TI y credenciales) |
| 22:43 | Rakataxxd | Video demostrativo de 2 min 36 s con narración de ElevenLabs, recorrido de todos los módulos (incluye codificador CIUO-08, ficha municipal y Modo Jurado) y secuencia actualizada |
| 22:43 | Rakataxxd | Secuencia del trabajo actualizada con los últimos commits |
| 23:16 | Rakataxxd | Documentación: demostración en línea con túnel gratuito de Cloudflare, declarado como servicio en la nube |
| 23:51 | xsiliezxr | add: Quitar comentario |

## Jueves 26 de noviembre: entrega

Entrega de los proyectos a las 09:00, por el medio que indicó el INE.

| Hora | Autor | Qué se hizo |
|---|---|---|
| 00:10 | Rakataxxd | Celular: el recorrido sube el cuadro resaltado para que la tarjeta no lo tape, buscador fijo en el catálogo de campo y barras fijas que vuelven a funcionar; enlace de verificación nuevo desde el inicio de sesión |
| 00:10 | Rakataxxd | Secuencia del trabajo actualizada |
| 00:20 | xsiliezxr | Merge branch 'main' of https://github.com/Astral910/nexo-ine |
| 04:17 | Rakataxxd | Demostración: la cuenta queda activa al registrarse, sin verificar el correo ni esperar aprobación (en producción se mantiene el flujo completo; NEXO_ALTA_INMEDIATA lo controla) |
| 04:17 | Rakataxxd | Secuencia del trabajo actualizada |
