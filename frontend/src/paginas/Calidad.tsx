// Validador de calidad: crítica de bases, inconsistencias, reglas de la DCE y protección de datos personales.
// Vista Resumen: el veredicto en una frase, el puntaje explicado y lo más importante por corregir.
// Vista Completa: el informe con todos los hallazgos, las 6 reglas de la DCE y el perfil de cada columna.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, FileCheck2, FileStack, ListChecks, Tags, Upload } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { Aviso, Encabezado, EsqueletoTabla, GuiaRapida, Insignia, Medidor, SelectorArchivo, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, type AyudaPantalla, type ElementoLista } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "Revisa un archivo de datos (CSV o Excel) antes de usarlo o publicarlo. Le dice en un puntaje de 0 a 100 qué tan listo está, qué corregir y si contiene datos personales.",
  datos: "El archivo que usted sube. Se revisa en la memoria del servidor y no se guarda: solo queda el informe, con ejemplos enmascarados. Las reglas siguen el flujo de crítica de la DESA y los 6 cuidados que pidió la Dirección de Censos y Encuestas (DCE).",
  pasos: [
    "Arrastre su archivo a la zona punteada o púlsela para buscarlo (CSV o XLSX, hasta 10 MB).",
    "Pulse «Validar archivo» y espere unos segundos.",
    "Lea el veredicto. Si dice que no la publique, quite o seudonimice las columnas con datos personales.",
    "Descargue el reporte de inconsistencias y envíelo a la institución que le dio los datos.",
  ],
  resumen: "El veredicto en una frase, el puntaje explicado, los tres puntos más importantes por corregir y los 6 cuidados de la DCE.",
  completa: "El informe completo: todos los hallazgos con su recomendación, el perfil de cada columna y el historial de validaciones.",
  terminos: [
    ["Puntaje de calidad", "Empieza en 100 y baja con cada problema. Un posible dato personal resta 40 puntos; un problema importante, 12; uno menor, 4."],
    ["Secreto estadístico", "Obligación legal del INE de no revelar datos que permitan identificar a personas, hogares o empresas."],
    ["Códigos 98/99", "Valores que las encuestas usan para «no sabe» o «no responde». Si se suman como números, distorsionan promedios y totales."],
    ["Celdas con pocos casos", "Cruces con muy pocas personas o empresas. Publicarlos podría permitir identificarlas."],
    ["Factor de expansión", "Peso de cada caso de una encuesta para representar a la población. Sin usarlo, los totales no son válidos."],
    ["Dominio de estudio", "El nivel para el que una encuesta es representativa, por ejemplo nacional o urbano. No se debe desagregar más allá."],
    ["Valores extremos", "Datos muy alejados del resto. Pueden ser reales o errores de captura, por eso se revisan."],
    ["SHA-256", "Huella digital del archivo. Si cambia un solo dato, la huella cambia, así se sabe qué versión se revisó."],
  ],
};

const ORDEN: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
const ESTADO_HALLAZGO: Record<string, ElementoLista["estado"]> = { critica: "critico", alta: "atencion", media: "atencion", baja: "info" };
const REGLA_DCE: Record<string, { estado: ElementoLista["estado"]; texto: string }> = {
  ok: { estado: "ok", texto: "Cumple" },
  falla: { estado: "critico", texto: "No cumple" },
  revisar: { estado: "atencion", texto: "Requiere su criterio" },
  no_aplica: { estado: "info", texto: "No aplica a este archivo" },
};

const enColumna = (h: any) => (h.columna && h.columna !== "(todas)" ? ` en la columna «${h.columna}»` : "");
const ordenarHallazgos = (hallazgos: any[]) => [...hallazgos].sort((a, b) => (ORDEN[a.severidad] ?? 9) - (ORDEN[b.severidad] ?? 9));

/** Veredicto en lenguaje sencillo a partir del informe del validador. */
function veredicto(r: any): { tono: "critico" | "alerta" | "exito"; titulo: string; texto: string } {
  const n = (r.hallazgos ?? []).length;
  if (r.bloqueante) {
    return { tono: "critico", titulo: "No la publique: contiene posibles datos personales",
      texto: "Quite o seudonimice las columnas marcadas antes de compartir o publicar el archivo." };
  }
  if (n === 0) {
    return { tono: "exito", titulo: "Puede usar esta base",
      texto: "Pasó todas las revisiones automáticas. Revise igual los cuidados que dependen de su criterio." };
  }
  const principal = ordenarHallazgos(r.hallazgos)[0];
  return { tono: "alerta", titulo: `Revise ${n} punto${n === 1 ? "" : "s"} antes de usarla`,
    texto: `El más importante: ${String(principal.mensaje).replace(/\.$/, "")}${enColumna(principal)}.` };
}

function Informe({ r }: { r: any }) {
  const tono = (e: string) => (e === "ok" ? "exito" : e === "falla" ? "critico" : e === "revisar" ? "alerta" : "");
  return (
    <div className="columna" style={{ gap: 16 }}>
      {r.bloqueante && <Aviso tono="critico"><b>No publique ni comparta este archivo.</b> Contiene posibles datos personales: proteja el secreto estadístico eliminando o seudonimizando esas columnas.</Aviso>}
      <div className="rejilla">
        <div className="c3 tarjeta" style={{ display: "grid", placeItems: "center" }}><Medidor valor={Math.round(r.puntaje)} etiqueta="Calidad" /></div>
        <div className="c9">
          <Tarjeta titulo={r.archivo} ayuda={`${fmt.numero(r.filas)} filas · ${r.columnas} columnas · SHA-256 ${r.sha256.slice(0, 16)}… · el archivo no se guardó`}
            acciones={r.id && <a className="boton secundario pequeno" href={`/api/calidad/validaciones/${r.id}/inconsistencias.csv`}><Download /> Reporte para la fuente</a>}>
            <h3 style={{ margin: "4px 0 8px" }}>Las 6 reglas de cuidado de datos de la DCE</h3>
            <div className="rejilla">
              {r.reglas_dce.map((g: any) => (
                <div key={g.regla} className="c6 fila" style={{ alignItems: "flex-start", gap: 8 }}>
                  <Insignia tono={tono(g.estado)}>{g.estado.replace("_", " ")}</Insignia>
                  <div className="pequeno"><b>{g.regla}</b><br /><span className="suave">{g.detalle}</span></div>
                </div>
              ))}
            </div>
          </Tarjeta>
        </div>
      </div>
      <Tarjeta titulo={`Hallazgos (${r.hallazgos.length})`}>
        <Tabla filas={r.hallazgos} vacio="Sin hallazgos: la base pasó todas las reglas." columnas={[
          { id: "s", titulo: "Severidad", valor: (h: any) => h.severidad, celda: (h: any) => <Severidad valor={h.severidad} /> },
          { id: "c", titulo: "Columna", valor: (h: any) => h.columna },
          { id: "r", titulo: "Regla", valor: (h: any) => h.regla },
          { id: "m", titulo: "Hallazgo", valor: (h: any) => h.mensaje, celda: (h: any) => <span>{h.mensaje}{h.ejemplos?.length ? <><br /><span className="mono suave">{h.ejemplos.join(" · ")}</span></> : null}</span> },
          { id: "a", titulo: "Qué hacer", valor: (h: any) => h.recomendacion, celda: (h: any) => <span className="pequeno">{h.recomendacion}</span> },
        ]} />
      </Tarjeta>
      <Tarjeta titulo="Perfil de columnas">
        <Tabla filas={r.detalle_columnas} columnas={[
          { id: "n", titulo: "Columna", valor: (c: any) => c.nombre },
          { id: "t", titulo: "Tipo", valor: (c: any) => c.tipo },
          { id: "v", titulo: "Vacíos", num: true, valor: (c: any) => c.pct_vacios, celda: (c: any) => fmt.pct(c.pct_vacios) },
          { id: "d", titulo: "Distintos", num: true, valor: (c: any) => c.distintos, celda: (c: any) => fmt.numero(c.distintos) },
          { id: "r", titulo: "Rango", celda: (c: any) => (c.minimo !== undefined ? `${fmt.numero(c.minimo, 2)} a ${fmt.numero(c.maximo, 2)}` : "—") },
        ]} />
      </Tarjeta>
    </div>
  );
}

/** Resumen del informe: cifras explicadas, lo más importante por corregir y los 6 cuidados de la DCE. */
function ResumenInforme({ r }: { r: any }) {
  const ordenados = ordenarHallazgos(r.hallazgos);
  const importantes = r.hallazgos.filter((h: any) => h.severidad === "critica" || h.severidad === "alta").length;
  return (
    <>
      <div className="rejilla escalonada">
        <div className="c3"><CifraClara etiqueta="Puntaje de calidad" icono={<FileCheck2 />} valor={`${Math.round(r.puntaje)} de 100`}
          significa="Empieza en 100 y baja con cada problema: un posible dato personal resta 40 puntos; uno importante, 12; uno menor, 4." /></div>
        <div className="c3"><CifraClara tono="naranja" etiqueta="Puntos por revisar" icono={<ListChecks />} numero={r.hallazgos.length} formato={(v) => fmt.numero(v)}
          detalle={`${fmt.numero(importantes)} importantes · ${fmt.numero(r.hallazgos.length - importantes)} menores`}
          significa="Cada punto dice en qué columna está, qué se encontró y qué hacer." /></div>
        <div className="c3"><CifraClara tono={r.bloqueante ? "naranja" : "verde"} etiqueta="Datos personales" valor={r.bloqueante ? "Posibles" : "No detectados"}
          significa={r.bloqueante
            ? "Hay columnas que parecen tener nombres, documentos, teléfonos o correos. Por secreto estadístico, no comparta el archivo así."
            : "No se encontraron correos, teléfonos, CUI/DPI ni NIT, ni columnas llamadas «nombre», «dirección» u otras parecidas."} /></div>
        <div className="c3"><CifraClara tono="morado" etiqueta="Tamaño revisado" icono={<FileStack />} valor={`${fmt.numero(r.filas)} filas`}
          detalle={`${fmt.numero(r.columnas)} columnas${r.truncado ? ` · se revisaron las primeras ${fmt.numero(r.filas)}` : ""}`}
          significa="El archivo se revisó en memoria y no se guardó: solo queda este informe." /></div>
      </div>
      <div className="rejilla">
        <div className="c6">
          <Tarjeta titulo="Lo más importante por corregir" ayuda="Los tres puntos más graves, en orden de importancia.">
            <ListaSimple vacio="Nada que corregir: la base pasó todas las revisiones automáticas." elementos={ordenados.slice(0, 3).map((h: any) => ({
              estado: ESTADO_HALLAZGO[h.severidad] ?? "info",
              titulo: `${h.regla}${enColumna(h)}`,
              texto: <>{h.mensaje} <b>Qué hacer:</b> {h.recomendacion}</>,
            }))} />
            {ordenados.length > 3 && <p className="pequeno suave" style={{ marginTop: 8 }}>Hay {fmt.numero(ordenados.length - 3)} punto{ordenados.length - 3 === 1 ? "" : "s"} más en la vista Completa.</p>}
          </Tarjeta>
        </div>
        <div className="c6">
          <Tarjeta titulo="Los 6 cuidados de la DCE" ayuda="Lo que pidió la Dirección de Censos y Encuestas para usar bien sus datos.">
            <ListaSimple elementos={(r.reglas_dce ?? []).map((g: any) => ({
              estado: REGLA_DCE[g.estado]?.estado ?? "info",
              titulo: g.regla,
              texto: `${REGLA_DCE[g.estado]?.texto ?? g.estado}. ${g.detalle}`,
            }))} />
          </Tarjeta>
        </div>
      </div>
      {r.id && (
        <div className="fila">
          <a className="boton secundario" href={`/api/calidad/validaciones/${r.id}/inconsistencias.csv`}><Download /> Descargar el reporte para la fuente</a>
          <span className="pequeno suave">Un archivo CSV con cada inconsistencia, para que la institución que envió los datos los corrija.</span>
        </div>
      )}
    </>
  );
}

function RecientesSimple({ historial, error, abrir }: { historial: any[] | null; error: string | null; abrir: (id: number) => void }) {
  return (
    <Tarjeta titulo="Validaciones recientes" ayuda="Pulse «Ver» para abrir el informe de un archivo.">
      {error ? <Aviso tono="info">{error}</Aviso> : !historial ? <EsqueletoTabla filas={3} /> : (
        <ListaSimple vacio="Aún no hay validaciones. Suba un archivo arriba para empezar." elementos={historial.slice(0, 5).map((v: any) => ({
          estado: v.bloqueante ? "critico" : v.puntaje >= 85 ? "ok" : "atencion",
          titulo: v.archivo,
          texto: `${v.bloqueante ? "Con posibles datos personales" : `Puntaje ${fmt.numero(v.puntaje)} de 100`} · ${fmt.numero(v.filas)} filas · ${fmt.fechaHora(v.creada_en)}`,
          accion: <button type="button" className="boton secundario pequeno" onClick={() => abrir(v.id)}>Ver</button>,
        }))} />
      )}
    </Tarjeta>
  );
}

const EJEMPLO_OCUPACIONES = ["piloto de bus extraurbano", "maestra de primaria", "jornalero en finca de café", "tortillera", "guardia de seguridad",
  "secretaria", "agricultor de maíz y frijol", "ayudante de albañil", "no sabe"].join(String.fromCharCode(10));

/** Codificación automática de respuestas abiertas de ocupación a la CIUO-08 (propuesta de la DCE). */
function Codificador() {
  const [texto, setTexto] = useState(EJEMPLO_OCUPACIONES);
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState("");
  const codificar = async () => {
    setError("");
    const respuestas = texto.split(String.fromCharCode(10)).map((t) => t.trim()).filter(Boolean).slice(0, 5000);
    try { setR(await api("/api/calidad/codificar", { cuerpo: { respuestas } })); } catch (e) { setError((e as ErrorApi).message); }
  };
  return (
    <Tarjeta titulo={<><Tags size={18} style={{ verticalAlign: -3 }} /> Codificar respuestas abiertas de ocupación (CIUO-08)</>}
      ayuda="Propuesta de la DCE: clasificar automáticamente respuestas abiertas. Nexo sugiere el subgrupo de la CIUO-08 (2 dígitos) con su confianza y deja para revisión humana las dudosas. Corre en el servidor, sin enviar datos fuera y sin guardar las respuestas.">
      <div className="columna">
        <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Respuestas, una por línea"
          style={{ width: "100%", fontFamily: "inherit", padding: 10, borderRadius: 10, border: "1px solid var(--borde-fuerte)" }} />
        <div className="fila"><button className="boton" onClick={codificar} disabled={!texto.trim()}><Tags /> Codificar</button>
          <span className="pequeno suave">Una respuesta por línea (hasta 5,000). «No sabe» o «no responde» quedan como 99, según las reglas de la DCE.</span></div>
        {error && <Aviso tono="alerta">{error}</Aviso>}
        {r && (
          <>
            <p className="aparecer"><b>{fmt.numero(r.automaticas)}</b> de {fmt.numero(r.total)} respuestas quedaron codificadas con confianza; <b>{fmt.numero(r.revisar)}</b> conviene revisarlas a mano.</p>
            <Tabla filas={r.filas} columnas={[
              { id: "resp", titulo: "Respuesta", valor: (f: any) => f.respuesta },
              { id: "cod", titulo: "Código", valor: (f: any) => f.codigo, celda: (f: any) => f.codigo ?? "—" },
              { id: "ocu", titulo: "Ocupación (CIUO-08)", valor: (f: any) => f.ocupacion, celda: (f: any) => <>{f.ocupacion}{f.alternativa && f.revisar && <span className="pequeno suave"><br />¿O {f.alternativa.codigo}: {f.alternativa.ocupacion}?</span>}</> },
              { id: "conf", titulo: "Confianza", num: true, valor: (f: any) => f.confianza, celda: (f: any) => fmt.pct(f.confianza * 100, 0) },
              { id: "rev", titulo: "", valor: (f: any) => (f.revisar ? 0 : 1), celda: (f: any) => f.revisar ? <Insignia tono="alerta">revisar</Insignia> : <Insignia tono="exito">lista</Insignia> },
            ]} />
          </>
        )}
      </div>
    </Tarjeta>
  );
}

export default function Calidad() {
  const [params] = useSearchParams();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [informe, setInforme] = useState<any>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { datos: historial, error: errorHistorial, recargar } = useDatos<any[]>("/api/calidad/validaciones");
  const abrir = (id: number) => api(`/api/calidad/validaciones/${id}`).then(setInforme).catch(() => undefined);
  useEffect(() => { const v = params.get("v"); if (v) abrir(Number(v)); }, [params]);
  const validar = async () => {
    if (!archivo) return;
    setCargando(true); setError("");
    const fd = new FormData(); fd.append("archivo", archivo);
    try { setInforme(await api("/api/calidad/validar", { formulario: fd })); recargar(); }
    catch (e) { setError((e as ErrorApi).message); }
    finally { setCargando(false); }
  };
  const subida = (
    <Tarjeta titulo="Validar un archivo" ayuda="CSV o XLSX hasta 10 MB. Se procesa en memoria y no se guarda: solo queda el informe con ejemplos enmascarados.">
      <div className="fila" style={{ alignItems: "stretch" }}>
        <SelectorArchivo archivo={archivo} onCambio={setArchivo} aceptar=".csv,.xlsx" ayuda="Formatos aceptados: CSV y XLSX, hasta 10 MB." />
        <button className="boton" style={{ height: "auto", minHeight: 44, padding: "0 20px" }} onClick={validar} disabled={!archivo || cargando}><Upload /> {cargando ? "Validando…" : "Validar archivo"}</button>
      </div>
      {error && <div style={{ marginTop: 10 }}><Aviso tono="critico">{error}</Aviso></div>}
    </Tarjeta>
  );
  const v = informe ? veredicto(informe) : null;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Validador de calidad de datos" subtitulo="Crítica automática de bases antes de procesarlas o publicarlas: completitud, valores extremos, duplicados, códigos 98/99, pocos casos y datos personales. Flujo de crítica e inconsistencias de la DESA, con herramientas libres."
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista
        resumen={<>
          <EnPocasPalabras titulo={informe ? `Veredicto sobre «${informe.archivo}»` : "En pocas palabras"}>
            {v ? <><b>{v.titulo}.</b> {v.texto}</> : "Suba un archivo y Nexo le dirá en segundos si puede usarlo, qué corregir y si contiene datos personales."}
          </EnPocasPalabras>
          {subida}
          {informe ? <ResumenInforme r={informe} /> : <RecientesSimple historial={historial} error={errorHistorial} abrir={abrir} />}
          <PieResumen fuente="el archivo que usted subió, revisado con el flujo de crítica de la DESA, los 6 cuidados de la DCE y el secreto estadístico" />
        </>}
        completa={<>
          <GuiaRapida id="calidad" titulo="Cómo validar una base de datos" pasos={[
            { titulo: "Elija el archivo", texto: "Arrástrelo a la zona punteada o pulse para buscarlo. Acepta CSV y XLSX." },
            { titulo: "Pulse «Validar archivo»", texto: "Nexo revisa completitud, duplicados, valores extremos, códigos 98/99 y datos personales." },
            { titulo: "Revise el informe", texto: "Corrija lo marcado y descargue el reporte de inconsistencias para la fuente." },
          ]} />
          {subida}
          {informe ? <Informe r={informe} /> : null}
          <Tarjeta titulo="Validaciones recientes">
            {errorHistorial ? <Aviso tono="info">{errorHistorial}</Aviso> : !historial ? <EsqueletoTabla filas={4} /> : <Tabla filas={historial} onFila={(x: any) => abrir(x.id)} vacio="Aún no hay validaciones." columnas={[
              { id: "a", titulo: "Archivo", valor: (x: any) => x.archivo },
              { id: "f", titulo: "Filas", num: true, valor: (x: any) => x.filas, celda: (x: any) => fmt.numero(x.filas) },
              { id: "p", titulo: "Puntaje", num: true, valor: (x: any) => x.puntaje },
              { id: "b", titulo: "Datos personales", valor: (x: any) => x.bloqueante, celda: (x: any) => (x.bloqueante ? <Insignia tono="critico">Sí</Insignia> : <Insignia tono="exito">No</Insignia>) },
              { id: "c", titulo: "Fecha", valor: (x: any) => x.creada_en, celda: (x: any) => fmt.fechaHora(x.creada_en) },
            ]} />}
          </Tarjeta>
        </>}
      />
      <Codificador />
    </div>
  );
}
