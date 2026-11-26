# Guion de la demostración (7 minutos + 3 de preguntas)

**Hilo conductor:** *«El Estado paga precios muy distintos por lo mismo»*. Se aterriza con el ejemplo de la propia DPIR, el Ministerio de Educación que necesita 500 laptops (diapositiva 14). Desde ahí se pasa a la DIEC (IPC y alertas), a la ciudadanía (Nexo Abierto) y a la confianza (linaje y bitácora).

Reparto: **una persona habla y otra opera**. Si algo falla más de 15 segundos, se pasa al video de respaldo.

| Tiempo | En pantalla | Frase clave |
|---|---|---|
| 0:00–0:30 | Lámina con datos de Nexo. En 2024 y 2025, 56 instituciones compraron computadoras portátiles: la mediana fue Q8,948, y el 10 % más caro pagó al menos Q13,393, el doble que el 10 % más barato (Q6,729 o menos). Quetzales de octubre de 2026, sin atípicos | «Para evitar eso existen los precios de referencia del INE. Hoy la DPIR los investiga a mano; Nexo lo hace en segundos, con sus datos y su metodología.» |
| 0:30–1:00 | Centro de mando en vista **Resumen** («Hoy en Nexo»); se cambia a **Completa** | «Cada pantalla tiene dos niveles: Resumen para decidir, Completa para analizar. Y cada una explica cómo leerla.» |
| 1:00–1:30 | La entidad (Mineduc) crea la solicitud de 500 laptops; la DPIR recibe la notificación | «La entidad da seguimiento sin correos de ida y vuelta.» |
| 1:30–2:40 | **Paso 3:** «Investigar» devuelve compras comparables de Guatecompras con NOG y precios históricos del INE; se afina por código UNSPSC; se agregan 3 cotizaciones y el indicador de fuentes primarias pasa del 50 % | «Respetamos su regla: más del 50 % de las fuentes son cotizaciones del mercado relevante. Si no se cumple, el informe exige una justificación.» |
| 2:40–3:15 | **Paso 4:** media, mediana y moda; el sistema recomienda el estadístico con el criterio de su diapositiva 13; ajuste con el IPC base 2024 | «La mediana no se mueve con los atípicos, como en su diapositiva 11.» |
| 3:15–3:45 | **Pasos 5 y 6:** PDF con marca «prototipo · no oficial», fuentes, metodología, citas INE y CC BY, y huella SHA-256 | «Cada informe es trazable: si cambian los datos, cambia la huella.» |
| 3:45–4:25 | **Alertas (Resumen):** «de cada 100 precios, entre 3 y 4 se marcan»; luego **Recolección de precios**: se captura un precio del IPP y Nexo lo marca al momento | «Lo que pidió la DIEC para el IPP, el IPMC y el ICC: al guardar, Nexo dice si conviene confirmarlo. El informante nunca sale de la DIEC.» |
| 4:25–4:55 | **Tablero desde texto:** «IPC de Quetzaltenango», que responde con la Región VI y avisa | «No inventa: si el INE no lo publica a ese nivel, lo dice.» |
| 4:55–5:40 | **Nexo Abierto, sin cuenta:** «¿Cuánto debería costar?» con computadora portátil (barra del 10 % más barato al 10 % más caro y la mediana) y la ficha de Quetzaltenango con su cita lista para copiar | «La misma información, sin cuenta, para la ciudadanía, la prensa y las municipalidades. Cada cifra enlaza al archivo del INE.» |
| 5:40–6:15 | **Confianza:** catálogo y linaje (fecha y SHA-256), bitácora verificada y centro de ciberseguridad | «Cada número tiene origen, fecha y huella.» |
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
13. **¿Por qué una parte pública?** El objetivo general del Datatón es acercar la información a la población. Nexo Abierto usa la misma capa semántica, pero solo con fuentes públicas, sin cuenta, de solo lectura y con límite de consultas por conexión.
14. **¿Nexo Abierto expone datos internos?** No. Solo responde con las fuentes públicas de la lista blanca. Los precios recolectados con su informante, las alertas, las solicitudes y la bitácora devuelven error, y hay pruebas automáticas que lo verifican.
15. **¿Para quién es la vista Resumen?** Para quien decide o no es experto: pocas cifras, cada una con su significado. La vista Completa conserva todas las tablas y notas para el analista.
16. **¿Y lo que pidió la DIEC para el IPP, el IPMC y el ICC?** Está en «Recolección de precios»: informantes, productos, captura mensual que avisa al momento si un precio varió de forma inusual, cobertura, pendientes y alertas Hidiroglou-Berthelot. Los datos son de demostración porque el INE no publica esos precios individuales; el flujo y los cálculos son los reales.
17. **¿Y el Manual de Características en el teléfono?** «Catálogo de campo» (`/campo`) se instala como aplicación y funciona sin internet. Hoy usa los 441 artículos y presentaciones de los precios recolectados publicados; el texto del Manual se carga al adoptarlo.

**No decir:**
- «La IA lo hizo».
- «Es inalterable»: es a prueba de manipulación y lo detecta.
- «Es el precio oficial», ni dentro de Nexo ni en Nexo Abierto: allí es un precio orientativo.
- «Datos en tiempo real».
- «Escala infinito».
