# Guion de la demostración (7 minutos + 3 de preguntas)

**Hilo conductor:** *«El Ministerio de Educación necesita 500 laptops para escuelas»*. Es el ejemplo de la propia DPIR (diapositiva 14). Desde ahí se pasa a la DIEC (IPC y alertas), a la DCR (territorio) y a la confianza (linaje y bitácora).

Reparto: **una persona habla y otra opera**. Si algo falla más de 15 segundos, se pasa al video de respaldo.

| Tiempo | En pantalla | Frase clave |
|---|---|---|
| 0:00–0:35 | Lámina: el proceso de 6 pasos de la DPIR es manual; las Direcciones lo dijeron el lunes | «Nexo es una sola plataforma para los retos que ustedes nos presentaron, con sus datos y su metodología.» |
| 0:35–1:10 | Centro de mando como Dirección: indicadores del IPC, canasta básica, alertas, solicitudes, seguridad y 754 mil registros oficiales | «Cada persona ve lo suyo; un usuario puede tener varios roles.» |
| 1:10–1:40 | La entidad (Mineduc) crea la solicitud de 500 laptops; la DPIR recibe la notificación | «La entidad da seguimiento sin correos de ida y vuelta.» |
| 1:40–2:50 | **Paso 3:** «Investigar» devuelve compras comparables de Guatecompras con NOG y precios históricos del INE; se afina por código UNSPSC; se agregan 3 cotizaciones y el indicador de fuentes primarias pasa del 50 % | «Respetamos su regla: más del 50 % de las fuentes son cotizaciones del mercado relevante. Si no se cumple, el informe exige una justificación.» |
| 2:50–3:30 | **Paso 4:** media, mediana y moda; el sistema recomienda el estadístico con el criterio de su diapositiva 13; ajuste con el IPC base 2024 | «La mediana no se mueve con los atípicos, como en su diapositiva 11.» |
| 3:30–4:10 | **Pasos 5 y 6:** PDF con marca «prototipo · no oficial», fuentes, metodología, citas INE y CC BY, y huella SHA-256; entrega y notificación a la entidad | «Cada informe es trazable: si cambian los datos, cambia la huella.» |
| 4:10–4:50 | **Índices:** alertas Hidiroglou-Berthelot de julio 2022 (una inscripción que pasa de Q0.01 a Q500); se descarta con comentario y queda en la bitácora | «La alerta es para revisar, no un error. El informante nunca sale de la DIEC.» |
| 4:50–5:30 | **Tablero desde texto:** «costo de la canasta básica urbana y rural» y luego «IPC de Quetzaltenango», que responde con la Región VI y avisa | «No inventa: si el INE no lo publica a ese nivel, lo dice.» |
| 5:30–6:15 | **Confianza:** mapa de 20 mil lugares poblados, ficha municipal, catálogo y linaje (fecha y SHA-256), bitácora verificada y centro de ciberseguridad | «Cada número tiene origen, fecha y huella.» |
| 6:15–7:00 | Lámina de adopción: software libre, Q0 en licencias, una máquina virtual con Docker y PostgreSQL, modular; hoja de ruta (IPP, catálogo móvil, SSO) | «El INE puede empezar mañana solo con Precios de Referencia.» |

**Preparación:**
- Laptop con «No molestar» activado y las sesiones abiertas por rol.
- Zoom del navegador al 125 %.
- `iniciar.sh` probado sin internet.
- Video de respaldo descargado en la laptop.
- Segunda laptop, adaptador de video y cargador.

## Preguntas probables

1. **¿Qué escribió la IA y qué ustedes?** Usamos Claude Code durante el evento y está declarado en el README. Dos agentes revisaron cumplimiento y seguridad, y corregimos lo que encontraron. Cada módulo tiene un responsable que lo explica (docs/ARQUITECTURA.md).
2. **¿Por qué datos.ine.gob.gt?** Es el portal oficial de datos abiertos del INE, tiene API para automatizar y reproducir, y cada archivo queda con su URL, fecha y SHA-256 (docs/DATOS.md).
3. **¿Cómo garantizan el secreto estadístico?** En los precios recolectados suprimimos toda celda con menos de 5 informantes, y también su conteo. El informante solo aparece como código y solo lo ve quien revisa alertas de precios (DIEC); ni Informática lo ve. El validador detecta datos personales y no guarda archivos. No cargamos proveedores de Guatecompras.
4. **¿El precio es oficial?** No: es un borrador que acelera los pasos 3 a 5. Decide el analista, y el informe dice «prototipo · no oficial».
5. **¿Qué pasa cuando publiquemos el mes siguiente?** La automatización sincroniza el catálogo y el pipeline descarga, verifica la huella y recarga. El agente de TI avisa si una fuente está desactualizada.
6. **¿Sin internet?** Funciona sin conexión con los datos procesados incluidos y su manifiesto.
7. **¿Cuánto cuesta?** Q0 en licencias: una máquina virtual con Docker y PostgreSQL, y adopción por módulos.
8. **¿Cómo saben que los cálculos están bien?** Hay pruebas automáticas, incluidas regresiones de rigor como la población que no se suma entre años y la CBA que no se promedia. Las cifras coinciden con las publicadas: censo de 14,901,286 personas e inflación interanual de 4.38 % en octubre de 2026.
9. **¿Qué tan seguro es?** Argon2id, MFA, sesiones del lado del servidor, CSRF, CSP, bitácora con HMAC y auditoría de dependencias en CI. Es un prototipo y no tiene prueba de penetración; los riesgos y controles están en la plataforma.
10. **¿Por qué no un chatbot?** Fue una decisión deliberada: resultados deterministas, sin alucinaciones, sin costos y sin que los datos salgan del INE.
11. **¿El avance de las delegaciones es real?** No: es de demostración y está marcado. El universo de lugares poblados sí es real.
12. **¿Por qué no Power BI?** La DESA pidió licencia libre. Los datos también se pueden exportar.

**No decir:**
- «La IA lo hizo».
- «Es inalterable»: es a prueba de manipulación y lo detecta.
- «Es el precio oficial».
- «Datos en tiempo real».
- «Escala infinito».
