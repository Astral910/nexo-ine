// Detalle de una solicitud de precio de referencia: los 6 pasos de la DPIR con investigación automática.
// Vista «Resumen»: en qué paso va, el precio si ya existe, qué falta y un solo botón para el siguiente paso.
// Vista «Completa»: investigación de mercado, fuentes, análisis, informe, historial, devolver y rechazar.
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Ban, Download, ExternalLink, FileText, Plus, Search, Undo2 } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionBarras } from "../componentes/Grafica";
import { Aviso, avisar, Campo, Encabezado, EsqueletoKpis, EsqueletoTabla, FuenteCita, Insignia, Kpi, Modal, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import {
  BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PasosSimples, PieResumen, SegunVista, useVista, type AyudaPantalla, type ElementoLista,
} from "../componentes/vista";
import { histograma } from "./Precios";

type Paso = Parameters<typeof PasosSimples>[0]["pasos"][number];
const PRIMARIAS = ["cotizacion", "catalogo"];

const AYUDA: AyudaPantalla = {
  titulo: "Cómo leer una solicitud",
  que: "Una solicitud de precio de referencia: en qué etapa va, qué fuentes de precio tiene, el análisis estadístico y el informe técnico.",
  datos: "Lo que registraron la entidad y la DPIR en Nexo. Las fuentes secundarias vienen de Guatecompras OCDS y de la base de Precios de Referencia del INE; las primarias son cotizaciones y catálogos que agrega la DPIR. Todos los precios se llevan a quetzales del último mes con el IPC del INE.",
  pasos: [
    "Revise la descripción, la cantidad y las especificaciones, y avance a «Investigación de mercado».",
    "Pulse «Investigar» para traer compras comparables y agregue cotizaciones de proveedores.",
    "Calcule los estadísticos, justifique si hay menos de 50 % de cotizaciones y genere el informe en PDF.",
  ],
  resumen: "En qué paso va, el precio si ya existe, qué falta para avanzar y el botón del siguiente paso.",
  completa: "La investigación de mercado, la tabla de fuentes para incluir o excluir, el análisis con media, mediana y moda, el historial y las acciones de devolver o rechazar.",
  terminos: [
    ["Fuente primaria", "Cotización directa de un proveedor o precio de un catálogo: el mercado relevante."],
    ["Fuente secundaria", "Precio de una compra pública en Guatecompras o un precio de referencia histórico del INE."],
    ["Media", "El promedio de los precios. Se afecta si hay precios muy altos o muy bajos."],
    ["Mediana", "El precio del medio: la mitad cuesta menos y la otra mitad más. No se deja afectar por precios extremos."],
    ["Moda", "El precio que más se repite."],
    ["CV (coeficiente de variación)", "Qué tan dispersos están los precios. Con más de 25 %, o si hay atípicos, se usa la mediana."],
    ["Atípica", "Fuente con un precio muy alejado de los demás; se excluye del cálculo."],
    ["Huella de datos (SHA-256)", "Código único calculado con los datos del informe: si alguien cambia un dato, la huella cambia."],
  ],
};

const PASOS = ["recibida", "revision", "investigacion", "analisis", "informe", "entregada"];
const NOMBRES = ["Solicitud", "Revisión", "Investigación de mercado", "Análisis", "Informe", "Entrega"];

function Pasos({ estado }: { estado: string }) {
  const i = PASOS.indexOf(estado);
  return (
    <div className="pasos" aria-label="Etapas del proceso">
      {NOMBRES.map((n, j) => (
        <div key={n} className={`paso ${j < i || estado === "entregada" ? "hecho" : ""} ${j === i ? "actual" : ""}`}>
          <div className="barra" /><span>{j + 1}. {n}</span>
        </div>
      ))}
    </div>
  );
}

function Investigacion({ sol, alTerminar }: { sol: any; alTerminar: () => void }) {
  const [terminos, setTerminos] = useState(sol.terminos_busqueda || sol.producto);
  const [unspsc, setUnspsc] = useState<string | null>(null);
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const investigar = async (u: string | null = unspsc) => {
    setCargando(true); setError("");
    try {
      const res: any = await api(`/api/precios/solicitudes/${sol.id}/investigar`, { cuerpo: { terminos, unspsc: u, meses: 24, maximo: 30 } });
      setR(res); setUnspsc(u); avisar(`${res.importadas} fuentes secundarias importadas.`); alTerminar();
    } catch (e) { setError((e as ErrorApi).message); }
    finally { setCargando(false); }
  };
  const hist = useMemo(() => histograma((r?.compras ?? []).filter((c: any) => !c.atipico).map((c: any) => c.precio_ajustado)), [r]);
  return (
    <Tarjeta titulo="3. Investigación de mercado automática" ayuda="Busque compras comparables en Guatecompras (fuente secundaria) y precios de referencia históricos del INE. Después agregue cotizaciones del mercado relevante (fuente primaria).">
      <form className="fila" onSubmit={(e) => { e.preventDefault(); investigar(null); }}>
        <input className="entrada" style={{ flex: 1, minWidth: 220 }} value={terminos} onChange={(e) => setTerminos(e.target.value)} aria-label="Términos de búsqueda" />
        <button className="boton" disabled={cargando}><Search /> {cargando ? "Investigando…" : "Investigar"}</button>
      </form>
      {error && <div style={{ marginTop: 10 }}><Aviso tono="alerta">{error}</Aviso></div>}
      {r && (
        <div className="columna" style={{ marginTop: 12 }}>
          {r.grupos.length > 1 && (
            <div className="fila">
              <span className="pequeno suave">Afine por clasificación UNSPSC para comparar lo mismo:</span>
              {r.grupos.map((g: any) => <button key={g.unspsc + g.unidad} className={`chip ${unspsc === g.unspsc ? "fijo" : ""}`} title={g.ejemplo} onClick={() => investigar(g.unspsc)}>{g.unspsc} · {g.unidad || "s/u"} <b>{g.n}</b></button>)}
            </div>
          )}
          <div className="rejilla">
            <div className="c4"><Kpi etiqueta="Compras comparables" valor={fmt.numero(r.estadisticos.n)} detalle={`${r.atipicos} atípicos fuera`} /></div>
            <div className="c4"><Kpi tono="verde" etiqueta="Mediana ajustada" valor={fmt.moneda(r.estadisticos.mediana)} detalle={`a precios de ${r.ajuste_ipc.a_precios_de}`} /></div>
            <div className="c4"><Kpi tono="morado" etiqueta="CV" valor={fmt.pct(r.estadisticos.cv)} detalle={r.razon} /></div>
          </div>
          <Grafica opcion={opcionBarras(hist.etiquetas, hist.conteos)} clase="grafica baja" />
          <FuenteCita>Guatecompras OCDS (CC BY 4.0) y precios de referencia del INE; ajuste con el IPC República del INE.</FuenteCita>
        </div>
      )}
    </Tarjeta>
  );
}

function NuevaFuente({ sol, onCerrar }: { sol: any; onCerrar: () => void }) {
  const [f, setF] = useState({ tipo: "cotizacion", descripcion: sol.producto, origen: "", referencia: "", fecha: new Date().toISOString().slice(0, 10), precio: 0, nota: "" });
  const [error, setError] = useState("");
  const c = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal titulo="Agregar fuente primaria" onCerrar={onCerrar}>
      <form className="columna" onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        try { await api(`/api/precios/solicitudes/${sol.id}/fuentes`, { cuerpo: f }); avisar("Fuente agregada."); onCerrar(); }
        catch (err) { setError((err as Error).message); }
      }}>
        {error && <Aviso tono="critico">{error}</Aviso>}
        <Campo etiqueta="Tipo"><select value={f.tipo} onChange={(e) => c("tipo", e.target.value)}><option value="cotizacion">Cotización directa de proveedor</option><option value="catalogo">Catálogo en línea</option></select></Campo>
        <Campo etiqueta="Proveedor o sitio"><input required value={f.origen} onChange={(e) => c("origen", e.target.value)} placeholder="Distribuidora o tienda en línea" /></Campo>
        <Campo etiqueta="Descripción del bien cotizado"><input required value={f.descripcion} onChange={(e) => c("descripcion", e.target.value)} /></Campo>
        <div className="fila">
          <div style={{ flex: 1 }}><Campo etiqueta="Precio unitario (Q)"><input type="number" step="0.01" min={0.01} required value={f.precio || ""} onChange={(e) => c("precio", Number(e.target.value))} /></Campo></div>
          <div style={{ flex: 1 }}><Campo etiqueta="Fecha"><input type="date" value={f.fecha} onChange={(e) => c("fecha", e.target.value)} /></Campo></div>
        </div>
        <Campo etiqueta="Referencia (número de cotización o enlace)"><input value={f.referencia} onChange={(e) => c("referencia", e.target.value)} /></Campo>
        <button className="boton"><Plus /> Agregar</button>
      </form>
    </Modal>
  );
}

function Analisis({ sol, recargar }: { sol: any; recargar: () => void }) {
  const r = sol.resultado;
  const [justificacion, setJustificacion] = useState(r?.justificacion_mercado ?? "");
  const calcular = async () => { await api(`/api/precios/solicitudes/${sol.id}/analizar`, { cuerpo: { justificacion: justificacion || null } }); avisar("Análisis actualizado."); recargar(); };
  if (!r) return <Tarjeta titulo="4. Análisis estadístico"><button className="boton" onClick={calcular}>Calcular estadísticos</button></Tarjeta>;
  const e = r.estadisticos;
  return (
    <Tarjeta titulo="4. Análisis estadístico" ayuda="Media, mediana y moda con el criterio de la DPIR para elegir el estadístico." acciones={<button className="boton secundario pequeno" onClick={calcular}>Recalcular</button>}>
      <div className="rejilla">
        <div className="c4"><Kpi etiqueta="Precio de referencia" valor={fmt.moneda(r.precio_referencia)} detalle={`${r.estadistico_recomendado} · a precios de ${r.ipc_periodo}`} /></div>
        <div className="c4"><Kpi tono="verde" etiqueta="Media · Mediana · Moda" valor={<span style={{ fontSize: "1.1rem" }}>{fmt.moneda(e.media, 0)} · {fmt.moneda(e.mediana, 0)} · {fmt.moneda(e.moda, 0)}</span>} detalle={`n = ${e.n} · CV ${fmt.pct(e.cv)}`} /></div>
        <div className="c4"><Kpi tono={r.cumple_mercado_relevante ? "verde" : "naranja"} etiqueta="Fuentes del mercado relevante" valor={fmt.pct(r.porcentaje_primarias)} detalle={`La DPIR recomienda más de 50 % · ${r.fuentes_incluidas} fuentes`} /></div>
      </div>
      <p className="pequeno" style={{ marginTop: 10 }}><b>¿Por qué {r.estadistico_recomendado}?</b> {r.razon}</p>
      {r.advertencias.map((a: string) => <div key={a} style={{ marginTop: 8 }}><Aviso tono="alerta">{a}</Aviso></div>)}
      {!r.cumple_mercado_relevante && (
        <div style={{ marginTop: 10 }}>
          <Campo etiqueta="Justificación (obligatoria para emitir el informe con menos de 50 % de cotizaciones)">
            <textarea value={justificacion} onChange={(ev) => setJustificacion(ev.target.value)} placeholder="Por ejemplo: bien de proveedor único; se solicitaron 5 cotizaciones y respondieron 2." />
          </Campo>
          <button className="boton secundario pequeno" style={{ marginTop: 6 }} onClick={calcular}>Guardar justificación</button>
        </div>
      )}
    </Tarjeta>
  );
}

function ResumenSolicitud({ sol, gestiona, avanzar, recargar }: { sol: any; gestiona: boolean; avanzar: () => void; recargar: () => void }) {
  const { cambiar } = useVista();
  const i = PASOS.indexOf(sol.estado);
  const r = sol.resultado;
  const entregada = sol.estado === "entregada";
  const fuentes = ((sol.fuentes ?? []) as any[]).filter((f) => f.incluida);
  const primarias = fuentes.filter((f) => PRIMARIAS.includes(f.tipo)).length;
  const secundarias = fuentes.length - primarias;
  const pctPrimarias = r ? r.porcentaje_primarias : fuentes.length ? (primarias / fuentes.length) * 100 : 0;
  const pdf = `/api/precios/solicitudes/${sol.id}/informe.pdf`;
  const pasos: Paso[] = NOMBRES.map((n, j) => ({ titulo: n, estado: entregada || j < i ? "hecho" : j === i ? "actual" : "pendiente" }));
  const verCompleta = () => { cambiar("completa"); window.scrollTo({ top: 0 }); };
  const calcular = async () => {
    try { await api(`/api/precios/solicitudes/${sol.id}/analizar`, { cuerpo: { justificacion: null } }); avisar("Análisis calculado."); recargar(); }
    catch (e) { avisar((e as Error).message, "critico"); }
  };

  const dias = sol.dias_restantes as number | null;
  const plazo = sol.vencida ? <>Venció el {fmt.fecha(sol.fecha_limite)}: atiéndala cuanto antes.</>
    : sol.fecha_limite ? <>Vence el {fmt.fecha(sol.fecha_limite)}{dias !== null ? ` (${dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`})` : ""}.</> : null;
  let frase: ReactNode;
  if (sol.rechazada) frase = <>Esta solicitud fue rechazada. El motivo quedó en el historial (vista Completa).</>;
  else if (entregada) frase = <>Entregada el {fmt.fecha(sol.entregada_en)}. Precio de referencia: <b>{fmt.moneda(sol.precio_referencia)}</b> por {String(sol.unidad).toLowerCase()}.</>;
  else frase = (
    <>
      <p>Va en el paso <b>{i + 1} de 6</b>: «{NOMBRES[i]}». {plazo}</p>
      {!gestiona && <p>La DPIR está trabajando en su solicitud. Le avisaremos por notificación y correo cuando el informe esté listo.</p>}
    </>
  );

  // Qué falta para avanzar (solo para la DPIR).
  const faltas: ElementoLista[] = [];
  if (gestiona && !sol.rechazada && !entregada) {
    if (i <= 1) {
      faltas.push({ estado: "atencion", titulo: "Revisar que la descripción, la cantidad y las especificaciones estén completas",
        texto: sol.especificaciones ? `Especificaciones: ${String(sol.especificaciones).slice(0, 160)}` : "La solicitud no trae especificaciones técnicas: pídalas a la entidad." });
    }
    if (i >= 2) {
      faltas.push(secundarias > 0
        ? { estado: "ok", titulo: `${fmt.numero(secundarias)} precios de Guatecompras o del INE incluidos` }
        : { estado: "atencion", titulo: "Hacer la investigación de mercado automática", texto: "Trae compras comparables de Guatecompras y precios históricos del INE." });
      if (pctPrimarias > 50) faltas.push({ estado: "ok", titulo: `Las cotizaciones y catálogos son ${fmt.pct(pctPrimarias)} de las fuentes (más de la mitad)` });
      else if (r?.justificacion_mercado) faltas.push({ estado: "ok", titulo: "Justificación registrada por tener menos de 50 % de cotizaciones", texto: r.justificacion_mercado });
      else faltas.push({ estado: "atencion", titulo: primarias === 0 ? "Agregar cotizaciones de proveedores" : `Las cotizaciones son ${fmt.pct(pctPrimarias)} de las fuentes: agregue más o justifique`,
        texto: "La DPIR recomienda que más de la mitad de las fuentes sean cotizaciones o catálogos del mercado relevante." });
      if (fuentes.length < 5) faltas.push({ estado: "atencion", titulo: `Hay ${fmt.numero(fuentes.length)} ${fuentes.length === 1 ? "fuente" : "fuentes"}: se recomiendan al menos 5`, texto: "La DPIR consulta 5 o más proveedores." });
    }
    if (i >= 3) {
      faltas.push(r ? { estado: "ok", titulo: "Estadísticos calculados", texto: `Media ${fmt.moneda(r.estadisticos.media)} · mediana ${fmt.moneda(r.estadisticos.mediana)} · moda ${fmt.moneda(r.estadisticos.moda)}` }
        : { estado: "atencion", titulo: "Calcular media, mediana y moda" });
    }
    if (sol.estado === "informe") faltas.push(sol.informe_sha256 ? { estado: "ok", titulo: "Informe técnico generado" } : { estado: "atencion", titulo: "Generar el informe técnico en PDF" });
    (r?.advertencias ?? []).filter((a: string) => !a.startsWith("Solo ") && !a.startsWith("Se recomiendan al menos 5"))
      .forEach((a: string) => faltas.push({ estado: "info", titulo: a }));
  }

  // Un solo botón para lo que sigue.
  let accion: ReactNode = null;
  if (!sol.rechazada) {
    if (entregada) accion = <a className="boton" href={pdf} target="_blank" rel="noopener"><FileText /> Descargar el informe técnico (PDF)</a>;
    else if (gestiona && sol.estado === "informe" && !sol.informe_sha256) accion = <a className="boton" href={pdf} target="_blank" rel="noopener" onClick={() => setTimeout(recargar, 1500)}><Download /> Generar y abrir el informe (PDF)</a>;
    else if (gestiona && sol.estado === "investigacion" && secundarias === 0) accion = <button className="boton" onClick={verCompleta}><Search /> Hacer la investigación de mercado</button>;
    else if (gestiona && sol.estado === "analisis" && !r) accion = <button className="boton" onClick={calcular}>Calcular media, mediana y moda</button>;
    else if (gestiona && i < PASOS.length - 1) accion = <button className="boton" onClick={avanzar}>Avanzar a «{NOMBRES[i + 1]}» <ArrowRight /></button>;
  }

  return (
    <>
      <EnPocasPalabras>{frase}</EnPocasPalabras>
      <Tarjeta><PasosSimples pasos={pasos} /></Tarjeta>
      <div className="rejilla escalonada">
        <div className="c4">
          {r?.precio_referencia != null
            ? <CifraClara etiqueta="Precio de referencia" valor={fmt.moneda(r.precio_referencia)} detalle={`${r.estadistico_recomendado} · a precios de ${r.ipc_periodo}`}
                significa={<>Calculado con {fmt.numero(r.fuentes_incluidas)} fuentes. {r.razon}</>} />
            : <CifraClara etiqueta="Precio de referencia" valor="Aún no" significa="Se calcula en la etapa 4, «Análisis», con las fuentes que la DPIR incluya." />}
        </div>
        {gestiona ? (
          <>
            <div className="c4">
              <CifraClara tono="morado" etiqueta="Fuentes incluidas" numero={fuentes.length} formato={(v) => fmt.numero(v)}
                detalle={`${fmt.numero(primarias)} cotizaciones o catálogos · ${fmt.numero(secundarias)} de Guatecompras o del INE`}
                significa="La DPIR consulta 5 o más proveedores; se recomiendan al menos 5 fuentes." />
            </div>
            <div className="c4">
              <CifraClara tono={pctPrimarias > 50 ? "verde" : "naranja"} etiqueta="Del mercado relevante" valor={fuentes.length || r ? fmt.pct(pctPrimarias) : "—"}
                significa={pctPrimarias > 50 ? "Más de la mitad de las fuentes son cotizaciones o catálogos, como recomienda la DPIR."
                  : "La DPIR recomienda que más de la mitad sean cotizaciones o catálogos. Agregue cotizaciones o escriba la justificación."} />
            </div>
          </>
        ) : r?.monto_estimado != null ? (
          <div className="c4">
            <CifraClara tono="verde" etiqueta="Monto estimado de la compra" valor={fmt.moneda(r.monto_estimado)}
              significa={`${fmt.numero(sol.cantidad)} ${sol.unidad} por el precio de referencia.`} />
          </div>
        ) : null}
      </div>
      {faltas.length > 0 && <Tarjeta titulo="Qué falta para avanzar"><ListaSimple elementos={faltas} /></Tarjeta>}
      {(accion || gestiona) && (
        <div className="fila">
          {accion}
          {gestiona && !entregada && !sol.rechazada && <span className="pequeno suave">Agregar cotizaciones, incluir o excluir fuentes, devolver o rechazar: en la vista Completa.</span>}
        </div>
      )}
      <PieResumen fuente="registro de la solicitud en Nexo; precios de Guatecompras OCDS y del INE, ajustados con el IPC" />
    </>
  );
}

export default function Solicitud() {
  const { id } = useParams();
  const { puede } = useSesion();
  const { datos: sol, error, recargar } = useDatos<any>(`/api/precios/solicitudes/${id}`);
  const [comentario, setComentario] = useState("");
  const [fuenteNueva, setFuenteNueva] = useState(false);
  const [rechazo, setRechazo] = useState(false);
  const gestiona = puede("dpir:gestionar");
  if (error) return <Aviso tono="critico">{error}</Aviso>;
  if (!sol) return <div className="columna" style={{ gap: 16 }}><div className="esqueleto" style={{ height: 56, width: "55%" }} /><div className="tarjeta"><div className="esqueleto" style={{ height: 64 }} /></div><EsqueletoKpis n={3} /><div className="tarjeta"><EsqueletoTabla filas={4} /></div></div>;
  const i = PASOS.indexOf(sol.estado);
  const accion = async (ruta: string, cuerpo: any = { comentario }) => {
    try { await api(`/api/precios/solicitudes/${sol.id}/${ruta}`, { cuerpo }); setComentario(""); recargar(); avisar("Solicitud actualizada."); }
    catch (e) { avisar((e as Error).message, "critico"); }
  };
  const alternar = async (f: any) => { await api(`/api/precios/solicitudes/${sol.id}/fuentes/${f.id}`, { metodo: "PATCH", cuerpo: { incluida: !f.incluida } }); recargar(); };
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado migas={<><Link to={gestiona ? "/precios" : "/mis-solicitudes"}>Precios de Referencia</Link> ›</>}
        titulo={<>{sol.codigo} · {sol.producto}</>}
        subtitulo={<>{sol.entidad} · {fmt.numero(sol.cantidad)} {sol.unidad} · vence {fmt.fecha(sol.fecha_limite)} {sol.vencida && <Insignia tono="critico">vencida</Insignia>} {sol.rechazada && <Insignia tono="critico">rechazada</Insignia>}</>}
        acciones={<>
          <BotonAyuda ayuda={AYUDA} />
          {sol.resultado && (gestiona || sol.estado === "entregada") && sol.estado !== "recibida" && (
            <a className="boton secundario" href={`/api/precios/solicitudes/${sol.id}/informe.pdf`} target="_blank" rel="noopener"><FileText /> Informe técnico (PDF)</a>
          )}
        </>} />
      <SegunVista resumen={<ResumenSolicitud sol={sol} gestiona={gestiona} avanzar={() => accion("avanzar", { comentario: "" })} recargar={recargar} />} completa={<>
      <Tarjeta><Pasos estado={sol.estado} /></Tarjeta>
      <div className="rejilla">
        <div className="c8 columna" style={{ gap: 16 }}>
          {gestiona && sol.estado === "investigacion" && <Investigacion sol={sol} alTerminar={recargar} />}
          {gestiona && ["investigacion", "analisis", "informe", "entregada"].includes(sol.estado) && (
            <Tarjeta titulo="Fuentes de precio" ayuda="Active o desactive cada fuente. Las primarias (cotizaciones y catálogos) deben ser más de la mitad."
              acciones={sol.estado !== "entregada" && <button className="boton secundario pequeno" onClick={() => setFuenteNueva(true)}><Plus /> Cotización</button>}>
              <Tabla maximo={80} filas={sol.fuentes} vacio="Aún no hay fuentes. Use la investigación automática y agregue cotizaciones." columnas={[
                { id: "i", titulo: "Usar", celda: (f: any) => <input type="checkbox" checked={f.incluida} disabled={sol.estado === "entregada"} onChange={() => alternar(f)} aria-label="Incluir fuente" /> },
                { id: "t", titulo: "Tipo", valor: (f: any) => f.tipo, celda: (f: any) => <Insignia tono={["cotizacion", "catalogo"].includes(f.tipo) ? "exito" : "info"}>{f.tipo.replace("_", " ")}</Insignia> },
                { id: "o", titulo: "Origen", valor: (f: any) => f.origen, celda: (f: any) => <span className="pequeno">{f.origen}<br /><span className="suave">{f.descripcion.slice(0, 90)}</span></span> },
                { id: "f", titulo: "Fecha", valor: (f: any) => f.fecha, celda: (f: any) => fmt.fecha(f.fecha) },
                { id: "p", titulo: "Precio", num: true, valor: (f: any) => f.precio, celda: (f: any) => fmt.moneda(f.precio) },
                { id: "a", titulo: "Ajustado", num: true, valor: (f: any) => f.precio_ajustado, celda: (f: any) => <>{fmt.moneda(f.precio_ajustado)} {f.atipica && <Insignia tono="alerta">atípica</Insignia>}</> },
                { id: "r", titulo: "Ref.", celda: (f: any) => (f.tipo === "guatecompras" ? <a href={`https://www.guatecompras.gt/concursos/consultaConcurso.aspx?nog=${f.referencia}`} target="_blank" rel="noreferrer noopener">{f.referencia} <ExternalLink size={11} /></a> : f.referencia) },
              ]} />
            </Tarjeta>
          )}
          {gestiona && ["analisis", "informe", "entregada"].includes(sol.estado) && <Analisis sol={sol} recargar={recargar} />}
          {sol.estado === "informe" && gestiona && (
            <Tarjeta titulo="5. Informe técnico">
              <p className="pequeno">El informe incluye el precio, la metodología, las fuentes con su referencia, la marca «prototipo · no oficial» y una huella SHA-256 de los datos usados.</p>
              <a className="boton" style={{ marginTop: 10 }} href={`/api/precios/solicitudes/${sol.id}/informe.pdf`} target="_blank" rel="noopener" onClick={() => setTimeout(recargar, 1500)}><Download /> Generar y abrir PDF</a>
              {sol.informe_sha256 && <p className="mono" style={{ marginTop: 8 }}>Huella de datos: {sol.informe_sha256}</p>}
            </Tarjeta>
          )}
          {sol.estado === "entregada" && (
            <Aviso tono="exito">Entregada el {fmt.fecha(sol.entregada_en)}. Precio de referencia: <b>{fmt.moneda(sol.precio_referencia)}</b> por {sol.unidad.toLowerCase()}.</Aviso>
          )}
          {!gestiona && sol.estado !== "entregada" && <Aviso tono="info">La DPIR está trabajando en su solicitud. Le avisaremos por notificación y correo cuando el informe esté listo.</Aviso>}
          {gestiona && !sol.rechazada && sol.estado !== "entregada" && (
            <Tarjeta titulo="Siguiente paso">
              <Campo etiqueta="Comentario (queda en el historial)"><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} /></Campo>
              <div className="fila" style={{ marginTop: 10 }}>
                <button className="boton" onClick={() => accion("avanzar")}>Avanzar a «{NOMBRES[i + 1]}» <ArrowRight /></button>
                {i > 0 && <button className="boton secundario" onClick={() => accion("devolver")}><Undo2 /> Devolver</button>}
                <button className="boton fantasma" onClick={() => setRechazo(true)}><Ban /> Rechazar</button>
              </div>
            </Tarjeta>
          )}
        </div>
        <div className="c4 columna" style={{ gap: 16 }}>
          <Tarjeta titulo="Datos de la solicitud">
            <dl className="pequeno" style={{ margin: 0, display: "grid", gap: 6 }}>
              <dt className="suave">Especificaciones</dt><dd style={{ margin: 0 }}>{sol.especificaciones || "—"}</dd>
              <dt className="suave">Modalidad</dt><dd style={{ margin: 0 }}>{sol.modalidad || "—"}</dd>
              <dt className="suave">Asignada a</dt><dd style={{ margin: 0 }}>{sol.asignada_a ?? "Sin asignar"}</dd>
              <dt className="suave">Registrada</dt><dd style={{ margin: 0 }}>{fmt.fechaHora(sol.creada_en)}</dd>
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Historial">
            <ul className="actividad">
              {sol.eventos.map((e: any, n: number) => (
                <li key={n}><span className="punto" /><div><div><b>{e.etiqueta}</b> · {e.usuario}</div>{e.comentario && <div className="pequeno">{e.comentario}</div>}<div className="pequeno suave">{fmt.fechaHora(e.ts)}</div></div></li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      </div>
      </>} />
      {fuenteNueva && <NuevaFuente sol={sol} onCerrar={() => { setFuenteNueva(false); recargar(); }} />}
      {rechazo && (
        <Modal titulo="Rechazar solicitud" onCerrar={() => setRechazo(false)}>
          <Campo etiqueta="Motivo (se notifica a la entidad)"><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} /></Campo>
          <button className="boton peligro" style={{ marginTop: 10 }} onClick={() => { accion("rechazar"); setRechazo(false); }}><Ban /> Rechazar</button>
        </Modal>
      )}
    </div>
  );
}
