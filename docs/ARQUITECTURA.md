# Arquitectura de Nexo

## Vista general

Nexo es **un solo servicio**: la API FastAPI sirve también el frontend compilado. Esto da tres ventajas:
- un solo origen, sin CORS;
- cookies `SameSite=Strict`;
- una sola imagen de Docker.

La base de datos es PostgreSQL 16 en producción y SQLite en desarrollo; el código es el mismo y ambas se prueban en CI.

```
nexo-ine/
├── backend/app/
│   ├── main.py             arranque, middleware, routers y frontend
│   ├── config.py           configuración por variables NEXO_* (sin secretos en el código)
│   ├── models.py           modelo de datos (35 tablas)
│   ├── security/           contraseñas, cifrado, sesiones, límites, cabeceras
│   ├── deps.py             usuario actual, permisos (RBAC) y CSRF
│   ├── bitacora.py         bitácora HMAC con anclas
│   ├── routers/            un archivo por módulo de la API
│   ├── services/           lógica: capa semántica, generador, alertas, precios, validador, agentes, programador
│   ├── etl/                fuentes, descarga con manifiesto, procesamiento y carga
│   ├── siembra.py          catálogos idempotentes (roles, permisos, políticas, riesgos, tableros)
│   └── cli.py              consola: init, admin, demo, datos, verificar
├── backend/tests/          pruebas (acceso, bitácora, rigor estadístico)
├── frontend/src/           React + TypeScript: componentes, páginas, estilos con la identidad del INE
├── data/manifiesto.json    URL, fecha de descarga, licencia y SHA-256 de cada fuente
├── data/procesados/        tablas limpias listas para cargar (sin internet)
└── docs/                   arquitectura, métodos, seguridad, datos, terceros, cumplimiento, guion
```

## Flujo de una petición

```mermaid
sequenceDiagram
  participant N as Navegador
  participant A as API (FastAPI)
  participant S as Capa semántica
  participant B as Base de datos
  participant L as Bitácora
  N->>A: POST /api/analitica/consulta (cookie de sesión + X-CSRF-Token)
  A->>A: valida la sesión (hash del token), la expiración y el MFA
  A->>A: verifica el permiso de la fuente (RBAC) y el límite de solicitudes
  A->>S: consulta con nombres de la lista blanca
  S->>S: reglas de rigor: no mezclar series, último periodo y precio con producto
  S->>B: SQL parametrizado (SQLAlchemy)
  B-->>S: filas agregadas
  S->>S: supresión de celdas con menos de k informantes y notas metodológicas
  S-->>A: filas, unidades, fuente, n y advertencias
  A-->>N: JSON (la interfaz cita la fuente en cada gráfica)
  Note over A,L: Las acciones que cambian datos se registran en la bitácora (HMAC encadenado)
```

## Módulos y responsables

Cada integrante del equipo debe poder explicar los módulos que tiene a cargo. **Completar antes de la entrega.**

| Módulo | Archivos principales | Responsable |
|---|---|---|
| Acceso, sesiones y MFA | `routers/auth.py`, `security/*`, `deps.py` | _(nombre)_ |
| Bitácora y auditoría | `bitacora.py`, `routers/bitacora_api.py` | _(nombre)_ |
| Precios de Referencia | `routers/precios.py`, `services/precios_ref.py`, `paginas/Precios.tsx`, `Solicitud.tsx` | _(nombre)_ |
| Índices, alertas y HBA | `routers/indices.py`, `services/alertas.py`, `routers/hba.py` | _(nombre)_ |
| Capa semántica y tableros | `services/semantica.py`, `services/generador.py`, `routers/tableros.py`, `componentes/Widget.tsx` | _(nombre)_ |
| Territorio | `routers/territorio.py`, `componentes/MapaGT.tsx` | _(nombre)_ |
| Datos (ETL) | `etl/*` | _(nombre)_ |
| Automatizaciones y agentes | `services/programador.py`, `tareas.py`, `agente_*.py` | _(nombre)_ |
| Frontend e identidad visual | `frontend/src/estilos`, `componentes/*` | _(nombre)_ |
| Nexo Abierto (sin cuenta) | `routers/publico.py`, `services/territorio.py`, `paginas/Abierto.tsx` | _(nombre)_ |
| Vistas, ayuda y recorrido guiado | `componentes/vista.tsx`, `componentes/Recorrido.tsx` | _(nombre)_ |

## Decisiones de diseño

- **Capa semántica en lugar de SQL libre.**
  - Todas las gráficas piden datos por nombre (fuente, medida, dimensión, filtros) a una lista blanca.
  - Eso impide la inyección.
  - Concentra el secreto estadístico en un solo lugar.
  - Permite aplicar reglas de rigor, por ejemplo no sumar poblaciones entre años.
- **Generador determinista.** Interpreta el español con vocabulario controlado y muestra su interpretación. Sin modelo de lenguaje no hay alucinaciones, costos ni salida de datos.
- **Agentes con reglas.**
  - Los agentes de seguridad y TI son chequeos verificables que abren y cierran hallazgos.
  - Se ejecutan como automatizaciones del sistema y quedan en el historial.
- **Datos reproducibles.**
  - El pipeline descarga, verifica la firma del archivo y registra la huella.
  - Las tablas procesadas viajan con el repositorio para que el jurado no dependa de internet.
- **Un solo proceso programador.**
  - Las automatizaciones corren en un hilo del proceso web, lo que basta para una instancia.
  - Con varias réplicas, el programador debe quedar en un solo proceso: `NEXO_PROGRAMADOR_ACTIVO=false` en las demás.
  - El límite de solicitudes debe pasar a un almacén compartido o al proxy.

## Nexo Abierto: la API pública

- **Rutas:** `/api/publico/*` (`routers/publico.py`) no usa sesión ni escribe en la base. Atiende la portada con las cifras de hoy, precios, departamentos, municipios y su ficha, el mapa, el catálogo, la generación de tableros, las consultas y las fuentes.
- **Lista blanca de fuentes.** Solo se consultan las fuentes con permiso `tableros:ver` en la capa semántica: IPC, IPMC, CBA, compras públicas, precios de referencia, población, proyecciones y HBA. Cualquier otra fuente, como los precios recolectados con su informante, las alertas, las solicitudes o la bitácora, responde 422. Las pruebas `tests/test_publico.py` lo verifican.
- **Límites por IP:** 240 consultas por minuto en general, 30 de precios y 20 de tableros, con `Retry-After`. La portada y los precios tienen 10 minutos de caché en memoria, y el mapa, 1 hora.
- **Código compartido.** Las fichas de territorio salen de `services/territorio.py`, que también usa la API interna, así que las cifras son las mismas.
- **Sin CSRF.** Los `POST` públicos (generar y consultar) no tienen sesión que proteger y solo leen.

## Vistas, ayuda y recorrido (frontend)

- **`componentes/vista.tsx`: las dos vistas.**
  - `ProveedorVista` guarda la vista elegida (Resumen o Completa) en el navegador, y `SelectorVista` la cambia desde la barra superior.
  - Cada página usa `SegunVista` con sus dos contenidos y `BotonAyuda` («Cómo leer esta pantalla»).
  - Piezas comunes: `EnPocasPalabras`, `CifraClara` (cifra y qué significa), `ListaSimple`, `PasosSimples`, `AccionesRapidas`, `PieResumen` y `RangoPrecios`.
- **`componentes/Recorrido.tsx`: el recorrido guiado.**
  - Los pasos se definen como datos: ruta, vista, ancla `data-recorrido`, texto y permisos.
  - El motor navega, espera a que cargue el contenido, resalta el elemento y coloca la tarjeta sin salirse de la ventana. Si la pantalla reemplaza el elemento, lo vuelve a buscar.
  - Funciona con el teclado y respeta el movimiento reducido.
- **Ventanas y animaciones.** Las ventanas (`Modal`) se dibujan en `<body>` con un portal. Las entradas animadas usan `animation-fill-mode: backwards`, para que ninguna transformación atrape a una ventana fija detrás del contenido.

## Despliegue recomendado en el INE

1. Una máquina virtual Linux con Docker, detrás del proxy inverso institucional con HTTPS.
2. Variables:
   - `NEXO_ENTORNO=produccion`
   - `NEXO_CLAVE_SECRETA` (48 caracteres aleatorios, en un gestor de secretos)
   - `NEXO_BASE_DATOS_URL` (PostgreSQL)
   - `NEXO_URL_PUBLICA`
   - `NEXO_DOMINIOS_CORREO_PERMITIDOS=ine.gob.gt`
   - SMTP institucional
3. `uvicorn --proxy-headers --forwarded-allow-ips=<IP del proxy>` para registrar la IP real.
4. Respaldos diarios de PostgreSQL con `pg_dump` fuera del servidor, más prueba de restauración trimestral.
5. Copiar `var/anclas-bitacora.log` a un almacenamiento de solo anexado (syslog o WORM).
6. Crear la primera cuenta de administración con `python -m app.cli admin` y desactivar las cuentas de demostración.
