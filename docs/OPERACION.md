# Operación de Nexo

Esta guía es para el equipo de Informática que instala y mantiene Nexo. Explica cómo desplegarlo, respaldarlo, actualizarlo y vigilarlo. Los comandos de esta guía se ejecutan desde la raíz del repositorio.

## 1. Despliegue con Docker Compose (PostgreSQL)

1. Copie `.env.example` como `.env` y complete los valores:
   - `NEXO_BD_CLAVE`: la contraseña de PostgreSQL.
   - `NEXO_ENTORNO=produccion`.
   - `NEXO_CLAVE_SECRETA`: 48 caracteres aleatorios. Puede generarlos con `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
   - `NEXO_URL_PUBLICA`: la dirección con HTTPS.
   - Los datos de SMTP.
   - `NEXO_DOMINIOS_CORREO_PERMITIDOS`.

   Compose pasa todo el archivo `.env` al contenedor (`env_file`).
2. Arranque los servicios con `docker compose up -d --build`. El contenedor `app` hace lo siguiente:
   - prepara la base;
   - carga los datos procesados la primera vez;
   - arranca la API con el programador de automatizaciones.
   En producción no crea cuentas de demostración, aunque `NEXO_CREAR_DEMO` quede en `true`.
3. Cree la primera cuenta de administración con `docker compose exec app python -m app.cli admin`. La contraseña se genera al azar y queda en el volumen `var`, con permisos 600.
4. Coloque Nexo detrás de un proxy inverso con TLS (Nginx, Caddy o el balanceador institucional) y declare su IP en `NEXO_PROXIES_CONFIABLES`.
   - En producción las cookies salen con `Secure` y prefijo `__Host-`, así que Nexo debe servirse por HTTPS.

## 2. Respaldos

- **PostgreSQL.** Respalde con:

  ```sh
  docker compose exec db pg_dump -U nexo -Fc nexo > respaldo-$(date +%Y%m%d).dump
  ```

  Programe el comando en el cron del servidor (por ejemplo, cada noche) y guarde los archivos fuera del servidor.
- **Restauración.** Para restaurar:

  ```sh
  docker compose exec -T db pg_restore -U nexo -d nexo --clean < respaldo.dump
  ```

- **SQLite (modo de un solo comando).** La automatización «Respaldo de la base» (`ti.respaldar`) copia la base en caliente a `var/respaldos/` y conserva las 7 copias más recientes.
- **Qué más respaldar.** El volumen `var` guarda la clave de desarrollo y las credenciales generadas. Respáldelo con el mismo cuidado que una contraseña.

## 3. Actualización

1. Traiga la nueva versión con `git pull`.
2. Reconstruya y reinicie con `docker compose up -d --build`. El arranque es idempotente:
   - crea las tablas nuevas;
   - sincroniza roles, permisos, automatizaciones del sistema y tableros base;
   - no toca los datos de las personas.
3. Verifique la bitácora con `docker compose exec app python -m app.cli verificar`. Si la cadena está íntegra, termina con código 0.

## 4. Datos del INE

- **Recarga desde los archivos procesados:** `docker compose exec app python -m app.cli datos`.
- **Actualización desde las fuentes:** ejecute `python -m app.etl todo` en el directorio `backend`. Descarga los archivos, verifica su SHA-256 contra `data/manifiesto.json`, los procesa y los carga.
  - Para volver a descargar un archivo que el INE renovó, agregue `--forzar`.
  - Si cambió el formato de un archivo, el procesador correspondiente está en `backend/app/etl/procesar.py`.

## 5. Monitoreo

- **Salud del servicio:** `GET /api/salud` (el `HEALTHCHECK` de la imagen lo consulta cada 30 s). Solo confirma que la API responde; la base y el programador se revisan en la pantalla **Salud de TI**.
- **Agente de TI:** revisa periódicamente la latencia de la base, el programador, las automatizaciones con fallas o atrasadas, la carga y frescura de los datos, la sincronización del catálogo, el disco, el motor de base en producción y los respaldos. Registra sus hallazgos.
- **Agente de seguridad:** revisa el segundo factor de las cuentas privilegiadas, el exceso de administradores, las cuentas inactivas o bloqueadas, los intentos de fuerza bruta, la integridad de la bitácora, la configuración de producción, las cuentas de demostración, la retención, las sesiones concurrentes, los riesgos e incidentes abiertos, los datos personales detectados, las dependencias fijadas y los permisos del archivo `.env`.
- **Registros de la aplicación:** se consultan con `docker compose logs -f app`. Cada error no controlado lleva una referencia corta que también ve la persona usuaria.

## 6. Incidentes y claves

- **Sospecha de cuenta comprometida:** en **Usuarios y roles**, desactive la cuenta; sus sesiones se revocan al instante. Pida restablecer la contraseña y revise la bitácora.
- **Rotación de `NEXO_CLAVE_SECRETA`:** no es trivial. De esta clave se derivan (con HKDF) las llaves que:
  - cifran los secretos del segundo factor;
  - calculan el HMAC de la bitácora;
  - calculan el HMAC de los códigos de recuperación y de los identificadores.

  Las sesiones no dependen de ella (se guarda el SHA-256 del token), así que no se cierran solas. Antes de rotarla:
  1. exporte y verifique la bitácora;
  2. avise que cada persona deberá volver a configurar su segundo factor;
  3. después de rotarla, revoque las sesiones abiertas.
- **Integridad de la bitácora:** si `python -m app.cli verificar` informa una cadena rota, trate el caso como un incidente de seguridad y regístrelo en **Ciberseguridad**.

## 7. Limitaciones conocidas del prototipo

- Un solo proceso: el programador de automatizaciones vive dentro de la API. Para escalar horizontalmente hay que separarlo en un servicio propio.
- No se ha hecho una prueba de penetración externa ni una auditoría completa de accesibilidad.
- El esquema se crea con `create_all`. Para cambios de columnas en producción conviene adoptar migraciones (por ejemplo, Alembic).
