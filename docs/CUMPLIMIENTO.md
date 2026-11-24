# Cumplimiento de los lineamientos (Categoría 2)

Matriz entre cada lineamiento de la nota conceptual del Datatón INE 2026 y su evidencia en el repositorio. Dentro de la plataforma se consulta lo mismo en *Modo Jurado*.

| Lineamiento | Evidencia | Estado |
|---|---|---|
| Usar como fuente principal al menos una base pública del portal del INE | 25 archivos de 8 conjuntos de datos.ine.gob.gt (portal de datos abiertos del INE): [docs/DATOS.md](DATOS.md) | Cumplido |
| Citar correctamente otras fuentes abiertas | Guatecompras OCDS con atribución CC BY 4.0 en la interfaz, el PDF y la documentación | Cumplido |
| Indicar las bases utilizadas y su fecha de descarga | `data/manifiesto.json` y [docs/DATOS.md](DATOS.md): URL, fecha y hora (Guatemala), licencia y SHA-256 | Cumplido |
| Tecnologías libres o sin licencia, y declarar servicios de pago o nube | Todo el software es libre; ningún servicio de pago ni en la nube (README §9) | Cumplido |
| Desarrollar durante el evento | Repositorio creado el 23-nov-2026 a las 22:09; el historial de commits muestra la evolución | Cumplido |
| Repositorio Git desde el día 1 con acceso para el jurado | Este repositorio. **Pendiente del equipo:** invitar a las cuentas del jurado o hacerlo público al entregar | Por hacer al entregar |
| Prototipo funcional, local o en línea | `./iniciar.sh`, `.\iniciar.ps1` o `docker compose up`; probado en SQLite y en PostgreSQL 16 | Cumplido |
| Instrucciones de instalación y ejecución, y lista de dependencias | README §4, `backend/requirements.txt` con hashes y `frontend/package-lock.json` | Cumplido |
| README con problema y usuarios, arquitectura, instalación y uso, datos, limitaciones y mejoras | README §1, §3, §4, §5 y §7 | Cumplido |
| Respetar el secreto estadístico y no identificar personas, hogares ni empresas | Supresión de celdas, informante solo como código y solo para la DIEC, sin proveedores, validador de datos personales ([docs/SEGURIDAD.md](SEGURIDAD.md)) | Cumplido |
| Sin credenciales, contraseñas ni llaves en el código | Variables `NEXO_*`, `.env.example` vacío, contraseñas de demostración aleatorias y gitleaks en CI | Cumplido |
| Declarar el uso de IA | README §8 | Cumplido |
| El equipo debe poder explicar y defender el código | [docs/ARQUITECTURA.md](ARQUITECTURA.md) (responsables por módulo) y [docs/GUION-DEMO.md](GUION-DEMO.md). **Pendiente del equipo:** asignar responsables y estudiar sus módulos | Por hacer |
| Resultados fieles a las definiciones del INE, sin inducir a error | Reglas de rigor de la capa semántica y notas metodológicas en cada gráfica ([docs/METODOS.md](METODOS.md)) | Cumplido |
| Listar los componentes de terceros con su licencia | [docs/TERCEROS.md](TERCEROS.md) y *Salud de TI* | Cumplido |
| Citar al INE como fuente | Pie de cada gráfica, menú lateral, PDF, README y documentos | Cumplido |
| Entregables: enlace al repositorio, PDF de la presentación y video de 2 a 3 minutos | Repositorio listo. **Pendiente del equipo:** PDF de la presentación y video de respaldo | Por hacer |
| Nota de consentimiento firmada, enviada por correo (lineamientos generales) | **Pendiente del equipo** | Por hacer |

## Rúbrica

| Criterio | Peso | Evidencia principal |
|---|---|---|
| Funcionalidad | 25 % | Flujo DPIR completo de punta a punta, automatizaciones con historial, tableros por rol y generados desde texto, 23 pruebas automáticas |
| Aplicabilidad institucional (desempate) | 20 % | Responde a lo que presentaron la DPIR, la DIEC, la DCE y la DCR; usa su metodología (regla del 50 %, media, mediana y moda, 6 reglas de la DCE); adopción con software libre |
| Calidad técnica | 20 % | Arquitectura modular, capa semántica única, CI con pruebas en SQLite y PostgreSQL, documentación completa |
| Innovación | 15 % | Tableros generativos deterministas, agentes de seguridad y TI, bitácora HMAC con anclas, precio unitario de 214 mil compras ajustado con el IPC |
| Rigor en el uso de los datos | 10 % | Hidiroglou-Berthelot, Tukey sobre logaritmos, medidas de saldo, supresión por secreto estadístico y recodificación verificada |
| Presentación y usabilidad | 10 % | Identidad visual del INE, búsqueda global, recorridos por rol y modo jurado |
