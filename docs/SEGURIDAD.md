# Seguridad, privacidad y secreto estadístico

## 1. Controles implementados

En la plataforma, *Ciberseguridad → Controles implementados* lista cada control con el archivo donde está su evidencia:

| Ámbito | Control |
|---|---|
| Identidad | Registro con verificación de correo y aprobación de Informática. Contraseñas de al menos 15 caracteres, con lista de bloqueo, almacenadas con Argon2id. MFA TOTP obligatorio para `admin_ti` y `seguridad`, con protección contra reutilización y tope de intentos por cuenta. Códigos de recuperación de 80 bits almacenados con HMAC. El secreto del MFA se cifra con AES-256-GCM |
| Sesiones | Se guardan en el servidor, que solo almacena el hash del token. El identificador rota al iniciar sesión y al completar el MFA. Expiran por inactividad y por duración máxima, y se pueden cerrar a distancia. Cookies HttpOnly y SameSite=Strict, más Secure y `__Host-` en producción |
| Solicitudes | CSRF de doble envío. Límite de tasa por IP y por cuenta. Bloqueo por cuenta e IP, más un bloqueo global ante un ataque distribuido, siempre con la misma respuesta exista o no la cuenta. Validación con Pydantic. Las respuestas de error no muestran trazas |
| Autorización | 11 roles con mínimo privilegio. Segregación de funciones: `admin_ti` no gestiona seguridad, privacidad ni bitácora; hay roles incompatibles; nadie atiende su propia solicitud |
| Datos | Las consultas pasan solo por la capa semántica con lista blanca. Las celdas con menos de k informantes se suprimen. El código de informante solo lo ve el rol de la DIEC. De Guatecompras no se cargan proveedores ni contactos |
| Archivos | Solo CSV y XLSX de hasta 10 MB. Protección contra bombas zip y macros. El archivo no se guarda. Las fórmulas se neutralizan en las exportaciones |
| Auditoría | Bitácora con HMAC-SHA256 y llave del servidor, eslabones únicos, anclas externas que detectan el borrado del final y verificación programada. Los secretos se omiten aunque vengan anidados |
| Navegador | CSP estricta sin scripts en línea, HSTS en producción, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy y Permissions-Policy. Fuentes y gráficas autoalojadas |
| Operación | Agente de ciberseguridad cada 30 minutos con 16 chequeos que abren y cierran hallazgos. Registro de riesgos 5×5 e incidentes. Políticas de retención con purga diaria |
| Cadena de suministro | Dependencias fijadas con hash (`--require-hashes`) y `package-lock.json`. En CI: ruff con reglas de seguridad, pip-audit, npm audit y gitleaks |
| Secretos | No hay credenciales en el código: todo se configura con variables `NEXO_*` y `.env` está fuera del repositorio. Las contraseñas de demostración son aleatorias. Un entorno inválido detiene el arranque |

## 2. Marco legal de Guatemala aplicable

Fuentes verificadas por el agente de ciberseguridad del equipo el 23-nov-2026. Este resumen no es un dictamen jurídico.

| Norma | Qué exige | Cómo responde Nexo |
|---|---|---|
| **Decreto-Ley 3-85, Ley Orgánica del INE, art. 25** y **Reglamento, art. 24** | Los datos de los informantes «son confidenciales» y solo se divulgan «en forma innominada» ([texto oficial](https://www.ine.gob.gt/ine/wp-content/uploads/2022/01/Ley_Reglamento_INE_dic21.pdf)) | Supresión de celdas pequeñas, informante solo como código y solo para la DIEC, y bitácora de accesos |
| **Decreto 57-2008, LAIP**: arts. 9, 22, 30 (num. 5), 32, 33, 64, 65 y 67 ([texto](https://idpp.gob.gt/images/Biblioteca-virtual/Leyes_y_Reglamentos/LEY%20DE%20ACCESO%20A%20LA%20INFORMACION%20PUBLICA%20DECRETO%2057-2008.pdf)) | Seguridad de los datos personales. Las estadísticas deben ser «no identificables». Acceso a los propios datos en 10 días hábiles. El art. 67 castiga con prisión revelar información confidencial | Toda la línea base de seguridad, «Mis datos» con exportación y solicitudes, y retención |
| **Constitución, arts. 30 y 31** | Los datos entregados bajo garantía de confidencia quedan fuera de la publicidad. Toda persona puede conocer y corregir sus datos en registros estatales | «Mis datos», aviso de finalidad y registro de tratamientos |
| **Decreto 26-2026, Ley Marco de Ciberseguridad**: publicado el 17-nov-2026, vigente hacia el 17-dic-2026 ([AGN](https://agn.gt/presidente-sanciona-la-ley-marco-de-ciberseguridad)) | Crea el CRIC-GT. El art. 31 fija plazos de alerta de 30 min, 6 h y 72 h (según la AGN, para los centros sectoriales) | Registro de incidentes con cronología. Pendiente: relojes de reporte y clasificación de infraestructura crítica |
| **Código Penal, arts. 274 «A» a «G»** | Delitos informáticos | Bitácora como evidencia. Las pruebas de seguridad se hacen solo en el entorno propio |
| **Normas de control interno de la Contraloría (A-039-2023)** | Segregación de funciones, controles de TI, respaldo y continuidad | Roles incompatibles, respaldos y bitácora |
| **Decreto 47-2008**, arts. 9, 10 y 13 | Un documento electrónico vale como original si hay garantía de integridad | Huella SHA-256 del informe y de sus datos, y bitácora con HMAC |
| Protección de datos personales | **No hay una ley específica vigente** (hay iniciativas en el Congreso) | Se aplican la LAIP y buenas prácticas: minimización, finalidad, retención y aviso |

## 3. Estándares de referencia

- ISO/IEC 27001:2022, Anexo A.
- NIST Cybersecurity Framework 2.0.
- OWASP ASVS 5.0.0 y OWASP Top 10:2025.
- CIS Controls v8.1.
- NIST SP 800-63B-4 (contraseñas y MFA).
- Principios Fundamentales de las Estadísticas Oficiales de la ONU, principio 6 (confidencialidad).

## 4. Amenazas principales y mitigación

| Amenaza (STRIDE) | Mitigación en Nexo |
|---|---|
| Robo o relleno de credenciales (S) | Argon2id, 15 caracteres, MFA en roles privilegiados, bloqueo por cuenta e IP sin enumeración |
| Abuso interno y reidentificación de informantes (I, E) | Mínimo privilegio, código de informante solo para la DIEC, supresión de celdas y bitácora |
| Datos de precios manipulados (T) | Alertas Hidiroglou-Berthelot, validador y linaje con SHA-256 |
| Alteración de la bitácora (R, T) | HMAC con llave del servidor, eslabones únicos y anclas externas |
| Inyección y XSS en tableros generados (T) | Capa semántica con lista blanca, ORM con parámetros, React escapa el contenido y CSP |
| Archivos maliciosos (T, D) | Tipos y tamaño limitados, protección contra bombas zip, archivos sin persistencia y fórmulas neutralizadas |
| Cadena de suministro (T) | Hashes, auditoría en CI e inventario de licencias |
| Denegación de servicio (D) | Límites de tasa, de filas y de widgets, y paginación |
| Configuración insegura (E) | Valores seguros en producción; el agente revisa la configuración |

El registro completo de 20 riesgos, con probabilidad, impacto, controles y referencias ISO y NIST, está en la plataforma: *Ciberseguridad → Registro de riesgos*.

## 5. Revisión durante el evento

Dos agentes de IA revisaron el código de forma crítica, uno de ciberseguridad y otro de IT y cumplimiento. Cada hallazgo P0 y P1 se corrigió en un commit propio, con prueba de regresión:

| Hallazgo | Corrección |
|---|---|
| El buzón de demostración permitía tomar cuentas | Solo muestra la verificación del propio registro, con clave de lectura; nunca restablecimientos |
| El MFA fallaba con la hora de Guatemala | El contador TOTP usa UTC con zona |
| La bitácora se podía recalcular o truncar | HMAC más anclas externas |
| Respuestas distintas permitían enumerar cuentas y bloquear las de otros | Bloqueo por cuenta e IP con respuesta genérica |
| Códigos de recuperación de 40 bits | 80 bits con HMAC |
| Contraseñas de 12 caracteres | 15 caracteres (NIST SP 800-63B-4) |
| Sin segregación de funciones | Roles incompatibles y separación entre administración y auditoría |
| `DISTINCT` sobre JSON fallaba en PostgreSQL | Subconsultas por identificador |

## 6. Despliegue seguro (lista de verificación)

- [ ] `NEXO_ENTORNO=produccion` con HTTPS en el proxy inverso; cookies `Secure` y `__Host-`.
- [ ] `NEXO_CLAVE_SECRETA` aleatoria de 48 caracteres, guardada en un gestor de secretos; `.env` con permisos 600.
- [ ] PostgreSQL con un usuario propio y sin exponerlo a internet; respaldos con `pg_dump` fuera del servidor y restauración probada.
- [ ] `NEXO_DOMINIOS_CORREO_PERMITIDOS=ine.gob.gt` y SMTP institucional con TLS.
- [ ] Primera cuenta con `python -m app.cli admin`; cuentas de demostración desactivadas.
- [ ] `uvicorn --proxy-headers --forwarded-allow-ips=<proxy>` y un solo proceso con el programador activo.
- [ ] `var/anclas-bitacora.log` enviado a almacenamiento de solo anexado.
- [ ] Revisión trimestral de accesos y de hallazgos aceptados.

## 7. Pendientes conocidos

- Relojes de reporte de incidentes (30 min, 6 h y 72 h) para cuando entre en vigor el Decreto 26-2026.
- Aprobación de dos personas para asignar roles privilegiados.
- Seudonimizar el código de informante con HMAC rotado por periodo.
- Inicio de sesión institucional (OIDC con Microsoft Entra ID).
- Límites de tasa en un almacén compartido para varias instancias.
- Prueba de penetración externa.

## 8. Reporte de vulnerabilidades

Si encuentras una falla, escríbele al equipo por un canal privado. No abras un *issue* público y no pruebes contra sistemas del INE ni de terceros.
