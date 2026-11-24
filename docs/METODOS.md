# Métodos estadísticos y reglas de rigor

Todas las cifras de Nexo vienen de datos oficiales y de los métodos que se describen aquí. Cada gráfica cita su fuente y muestra el número de observaciones.

## 1. Precios de Referencia (DPIR)

### 1.1 Fuentes
- **Primarias:** cotizaciones directas y catálogos en línea que registra el analista. La DPIR recomienda que sean **más del 50 %** de las fuentes (diapositiva 16). Si no se cumple, Nexo exige una justificación escrita antes de emitir el informe, y esa justificación aparece en el PDF.
- **Secundarias automáticas:**
  - **Guatecompras (OCDS 2025):** solo procesos con **un artículo** y **una adjudicación activa** en quetzales. El precio unitario es el monto adjudicado entre la cantidad, lo que da 214,562 compras. Se descartan proveedores, contactos, ofertas y documentos.
  - **Precios de referencia históricos del INE:** junio 2022 y septiembre 2023, sin duplicados (NOG, producto, precio y fecha). La entidad requirente de 2023 se completa con Guatecompras mediante el NOG.

### 1.2 Comparabilidad
La búsqueda es por palabras en la descripción normalizada. Nexo agrupa los resultados por código **UNSPSC** y unidad para que el analista compare lo mismo, por ejemplo 43211508 «computadoras portátiles».

### 1.3 Ajuste por inflación
```
precio ajustado = precio × IPC(último mes publicado) ÷ IPC(mes del precio)
```
- Se usa el IPC República, base anual 2024 = 100, empalmado por el INE.
- Un precio posterior al último IPC publicado ya está en quetzales corrientes (factor 1).
- Si falta el índice de un mes, el precio queda **marcado como sin ajustar** y se advierte.

### 1.4 Atípicos
Se aplica la regla de Tukey sobre el **logaritmo** del precio, porque los precios son asimétricos: es atípico todo valor fuera de [Q1 − 1.5·RIC, Q3 + 1.5·RIC]. Los estadísticos finales se calculan sin atípicos.

### 1.5 Estadístico recomendado (criterio de la DPIR, diapositiva 13)
- **Media:** cuando los precios son parecidos (coeficiente de variación ≤ 25 % y sin atípicos).
- **Mediana:** cuando hay atípicos o alta dispersión.
- **Moda:** se informa como «precio más frecuente», con redondeo a 3 cifras significativas. Si ningún precio se repite, no hay moda.

## 2. Alertas de precios atípicos (DIEC)

### 2.1 Hidiroglou-Berthelot (precios recolectados, julio 2022)
Para cada artículo se trabaja con los relativos de precio del mismo informante, ajustados por cantidad: rᵢ = (pᵢ,t / qᵢ,t) ÷ (pᵢ,t−1 / qᵢ,t−1).

1. Sea r_M la mediana de los relativos.
2. Transformación simétrica: sᵢ = 1 − r_M / rᵢ si rᵢ < r_M; sᵢ = rᵢ / r_M − 1 en otro caso.
3. Efecto tamaño: Eᵢ = sᵢ · max(pᵢ,t, pᵢ,t−1)^U, con U = 0.5.
4. Límites: [E_M − C·d₁, E_M + C·d₃], con d₁ = max(E_M − E_Q1, |A·E_M|) y d₃ = max(E_Q3 − E_M, |A·E_M|). Parámetros A = 0.05 y C = 4 (C se puede ajustar).
5. **Corrección importante:** cuando la mayoría de los precios no cambia, los cuartiles se estiman con los precios que sí cambiaron, y **un precio igual a la mediana nunca es atípico**. Sin esta corrección, el 62 % de las alertas eran precios sin cambio; con ella, el 3.2 % de las observaciones queda marcado.
6. **Grupos:** por artículo y región cuando hay al menos 30 observaciones; si no, se compara con la distribución nacional del artículo.
7. **Severidad:** según cuántas veces el puntaje excede el ancho de tolerancia (alta si lo duplica).

### 2.2 Desvío de nivel (precios recolectados, 2023)
El archivo público de 2023 no trae código de informante y la boleta cambia cada mes, así que no se puede seguir al mismo informante. Por eso, para cada artículo, cantidad y mes:
- se calcula z = 0.6745·(ln p − mediana) ÷ MAD;
- es atípico si |z| > 3.5 (Iglewicz y Hoaglin);
- si el MAD es 0, se marcan los precios que se alejan más de 50 % de la mediana.

### 2.3 Revisión
Cada alerta se confirma, se descarta o queda en revisión, con un comentario obligatorio que queda en la bitácora. Las alertas revisadas no reaparecen al recargar los datos, porque se identifican por una clave natural.

## 3. Capa semántica: reglas que evitan cifras engañosas

| Regla | Ejemplo que evita |
|---|---|
| **Medidas de saldo** (población proyectada, índices, costo de la CBA): sin dimensión de tiempo se usa **el último periodo publicado** y se avisa | Sumar 16 años de proyecciones |
| **No mezclar series**: regiones, divisiones, áreas de la CBA o artículos del IPMC nunca se promedian; se separan automáticamente | «CBA = Q900», promedio de urbana y rural |
| **Precios solo con producto**: la mediana o el promedio de precios exige un producto (texto o UNSPSC) | Promediar lápices con ambulancias |
| **IPC por departamento**: el INE lo publica por región, así que se muestra la región oficial y se avisa | «IPC de Quetzaltenango» que en silencio mostraba el de la República |
| **Umbral de confianza** del generador: si no reconoce una fuente, responde que no hay datos | Responder otra pregunta |
| **Secreto estadístico**: en los microdatos con informantes (precios recolectados del IPC) se suprime toda celda con menos de 5 informantes o boletas distintas, y tampoco se entrega su conteo. Las demás fuentes son cifras agregadas que el INE ya publica o contrataciones públicas. El validador marca las celdas con menos de 3 casos en las bases que se suben | Identificar a un comercio informante |

## 4. Territorio
- **Población 2018:** Cuadro A1.3 del Censo, unido a los centroides por código de lugar poblado (20,036 lugares; suma nacional 14,901,286, igual a la cifra oficial).
- **Proyecciones 2015–2030:** se usa SEXO 0 como total, 1 hombres y 2 mujeres. **Recodificación:** los municipios 0102 a 0117 aparecen como 0123 a 0138 en el archivo. Se verificó contra el Censo 2018: la razón proyección/censo de cada par está entre 1.02 y 1.30, igual que en el resto del país.
- **Área urbana o rural** de un lugar poblado: la que concentra la mayoría de su población censada.

## 5. Hoja de Balance de Alimentos 2024
- Suministro interno = producción + importaciones − exportaciones − cambio de existencias.
- Disponibilidad per cápita = alimentos (t) × 1,000 ÷ población proyectada 2024, en kg por persona al año.
- Relación primario → derivado = producción del derivado ÷ cantidad procesada del primario, según las Cuentas de Utilización y Suministro. Es una relación aparente, no un coeficiente técnico, y no se debe sumar entre derivados.

## 6. Validador de calidad (reglas de la DCE)
Revisa completitud, valores extremos (3·RIC), duplicados, códigos especiales (98, 99, 999…), pocos casos (menos de k) y datos personales:
- CUI de 13 dígitos con departamento y municipio plausibles;
- NIT con dígito verificador módulo 11;
- teléfonos de Guatemala;
- correos;
- nombres de columnas sensibles.

Aplica las 6 reglas de cuidado de datos de la DCE (factor de expansión, dominio de estudio, pocos casos, 98/99, definiciones oficiales y citar la fuente con su fecha).
