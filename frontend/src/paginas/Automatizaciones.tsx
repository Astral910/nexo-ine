// Automatizaciones: tareas que Nexo hace sola (revisiones, recordatorios, alertas), explicadas en lenguaje sencillo.
// «Resumen» cuenta cómo van y permite crear una en un clic desde una plantilla; «Completa» muestra las tablas con todo
// el detalle. Crear una automatización es un asistente de tres pasos: qué hacer, con qué datos y cuándo.
import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Bell, CalendarClock, CircleCheck, History, Pause, Play, Plus, ShieldCheck, Tags, Trash2, Workflow } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, EsqueletoKpis, EsqueletoTabla, Insignia, Modal, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, type AyudaPantalla } from "../componentes/vista";

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const ICONO_CATEGORIA: Record<string, any> = {
  "Vigilancia de precios": Tags, "Recordatorios y reportes": Bell, "Calidad y alertas": CircleCheck, "Seguridad y sistema": ShieldCheck, Privacidad: ShieldCheck,
};

const AYUDA: AyudaPantalla = {
  que: "Las tareas que Nexo hace sola, sin que nadie tenga que acordarse: revisar la seguridad, recordar solicitudes por vencer, vigilar el precio de un producto, detectar precios atípicos o enviar las cifras del día.",
  datos: "Cada ejecución queda registrada con su hora, su duración y su resultado, y también en la bitácora de auditoría. Solo se pueden ejecutar tareas de una lista aprobada en el código: nadie puede programar algo arbitrario.",
  pasos: [
    "Revise en «Resumen» si todo funcionó en las últimas 24 horas.",
    "Si algo falló, abra su historial para ver el motivo.",
    "Para crear una, elija una plantilla y confírmela, o use «Nueva automatización» y siga los tres pasos.",
    "Puede pausar, reanudar o ejecutar al momento las suyas.",
  ],
  resumen: "El estado general en una frase, cada automatización con lo que hace y cómo le fue, y plantillas listas para usar.",
  completa: "Las tablas con todas las automatizaciones (suyas y del sistema), su programación y los botones de gestión.",
  terminos: [
    ["Automatización", "Una tarea de la lista aprobada, con sus ajustes y su horario."],
    ["Ejecución", "Cada vez que la tarea corre. Puede terminar bien («ok») o con error."],
    ["Del sistema", "Automatizaciones que Nexo trae de fábrica (seguridad, TI, privacidad, bitácora). Informática las administra."],
    ["Plantilla", "Una automatización ya armada: solo la confirma o ajusta."],
    ["Hora de Guatemala", "Todos los horarios usan la hora oficial de Guatemala (UTC −6)."],
  ],
};

function describir(frecuencia: string, valor: string) {
  if (frecuencia === "intervalo") { const m = Number(valor || 60); return m >= 60 && m % 60 === 0 ? `cada ${m / 60} h` : `cada ${m} minutos`; }
  if (frecuencia === "diaria") return `todos los días a las ${valor}`;
  if (frecuencia === "semanal") { const [d, h] = (valor || "0@07:00").split("@"); return `cada ${DIAS[Number(d)]} a las ${h}`; }
  return "solo cuando usted la ejecute";
}

// ---------------------------------------------------------------------------------------------- Asistente

interface Borrador { tarea: string; nombre: string; parametros: Record<string, string>; frecuencia: string; minutos: string; hora: string; dia: string }

function borradorDe(p?: any): Borrador {
  const [dia, hora] = p?.frecuencia === "semanal" ? String(p.valor_frecuencia).split("@") : ["0", p?.frecuencia === "diaria" ? p.valor_frecuencia : "07:00"];
  return {
    tarea: p?.tarea ?? "", nombre: p?.titulo ?? "", frecuencia: p?.frecuencia ?? "diaria",
    parametros: Object.fromEntries(Object.entries(p?.parametros ?? {}).map(([k, v]) => [k, String(v)])),
    minutos: p?.frecuencia === "intervalo" ? p.valor_frecuencia : "60", hora: hora || "07:00", dia: dia || "0",
  };
}

function Asistente({ plantilla, onCerrar }: { plantilla?: any; onCerrar: (creada: boolean) => void }) {
  const { datos: tareas } = useDatos<any[]>("/api/automatizaciones/tareas");
  const [b, setB] = useState<Borrador>(() => borradorDe(plantilla));
  const [paso, setPaso] = useState(plantilla ? 3 : 1);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const t = tareas?.find((x) => x.clave === b.tarea);
  const valor = b.frecuencia === "intervalo" ? b.minutos : b.frecuencia === "diaria" ? b.hora : b.frecuencia === "semanal" ? `${b.dia}@${b.hora}` : "";
  const grupos = useMemo(() => {
    const m = new Map<string, any[]>();
    (tareas ?? []).forEach((x) => { if (!m.has(x.categoria)) m.set(x.categoria, []); m.get(x.categoria)!.push(x); });
    return [...m.entries()];
  }, [tareas]);
  const cambiar = (k: keyof Borrador, v: any) => setB((x) => ({ ...x, [k]: v }));
  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true); setError("");
    try {
      const parametros = Object.fromEntries(Object.entries(b.parametros).filter(([, v]) => v !== "").map(([k, v]) => {
        const campo = t?.campos?.find((c: any) => c.clave === k);
        return [k, campo?.tipo === "numero" ? Number(v) : v];
      }));
      await api("/api/automatizaciones", { cuerpo: { nombre: b.nombre.trim() || t?.nombre, tarea: b.tarea, parametros, frecuencia: b.frecuencia, valor_frecuencia: valor } });
      avisar("Automatización creada. Nexo la ejecutará " + describir(b.frecuencia, valor) + ".");
      onCerrar(true);
    } catch (err) { setError((err as ErrorApi).message); }
    finally { setEnviando(false); }
  };
  const titulos = ["¿Qué quiere que Nexo haga?", "Ajustes", "¿Cuándo?"];
  return (
    <Modal titulo={plantilla ? "Usar esta plantilla" : "Nueva automatización"} onCerrar={() => onCerrar(false)} ancho>
      {!tareas ? <EsqueletoTabla filas={5} /> : (
        <form className="columna" onSubmit={crear}>
          <ol className="pasos-simples" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} aria-label="Pasos del asistente">
            {titulos.map((x, i) => <li key={x} data-estado={i + 1 < paso ? "hecho" : i + 1 === paso ? "actual" : "pendiente"}><span className="numero">{i + 1}</span><span className="titulo">{x}</span></li>)}
          </ol>
          {error && <Aviso tono="critico">{error}</Aviso>}
          {paso === 1 && (
            <div className="columna" style={{ gap: 14 }}>
              {grupos.map(([categoria, lista]) => {
                const Icono = ICONO_CATEGORIA[categoria] ?? Workflow;
                return (
                  <section key={categoria}>
                    <div className="sobretitulo" style={{ marginBottom: 8 }}>{categoria}</div>
                    <div className="rejilla">
                      {lista.map((x: any) => (
                        <button key={x.clave} type="button" className={`c6 tarjeta modulo interactiva opcion-tarea ${b.tarea === x.clave ? "elegida" : ""}`} aria-pressed={b.tarea === x.clave}
                          onClick={() => { setB((v) => ({ ...v, tarea: x.clave, nombre: "", parametros: Object.fromEntries((x.campos ?? []).filter((c: any) => c.defecto != null).map((c: any) => [c.clave, String(c.defecto)])) })); setPaso(x.campos?.length ? 2 : 3); }}>
                          <span className="icono-modulo"><Icono size={18} /></span>
                          <span style={{ minWidth: 0 }}><b>{x.nombre}</b><span className="pequeno suave" style={{ display: "block", marginTop: 2 }}>{x.para_que}</span></span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {paso === 2 && t && (
            <div className="columna">
              <p className="suave">{t.para_que}</p>
              {(t.campos ?? []).map((c: any) => (
                <Campo key={c.clave} etiqueta={c.etiqueta} ayuda={c.ayuda}>
                  {c.tipo === "numero"
                    ? <input type="number" min={c.minimo ?? undefined} max={c.maximo ?? undefined} step="any" value={b.parametros[c.clave] ?? ""} placeholder={c.ejemplo} onChange={(e) => cambiar("parametros", { ...b.parametros, [c.clave]: e.target.value })} />
                    : c.tipo === "periodo"
                      ? <input type="month" value={b.parametros[c.clave] ?? ""} onChange={(e) => cambiar("parametros", { ...b.parametros, [c.clave]: e.target.value })} />
                      : <input value={b.parametros[c.clave] ?? ""} placeholder={c.ejemplo ? `Por ejemplo: ${c.ejemplo}` : undefined} onChange={(e) => cambiar("parametros", { ...b.parametros, [c.clave]: e.target.value })} />}
                </Campo>
              ))}
            </div>
          )}
          {paso === 3 && t && (
            <div className="columna">
              <Campo etiqueta="¿Cada cuánto?">
                <select value={b.frecuencia} onChange={(e) => cambiar("frecuencia", e.target.value)}>
                  <option value="diaria">Todos los días</option><option value="semanal">Una vez por semana</option>
                  <option value="intervalo">Cada cierto tiempo</option><option value="manual">Solo cuando yo la ejecute</option>
                </select>
              </Campo>
              <div className="fila">
                {b.frecuencia === "intervalo" && <Campo etiqueta="Cada cuántos minutos (mínimo 15)"><input type="number" min={15} max={10080} value={b.minutos} onChange={(e) => cambiar("minutos", e.target.value)} /></Campo>}
                {b.frecuencia === "semanal" && <Campo etiqueta="Día"><select value={b.dia} onChange={(e) => cambiar("dia", e.target.value)}>{DIAS.map((d, i) => <option key={d} value={i}>{d[0].toUpperCase() + d.slice(1)}</option>)}</select></Campo>}
                {(b.frecuencia === "diaria" || b.frecuencia === "semanal") && <Campo etiqueta="Hora (Guatemala)"><input type="time" value={b.hora} onChange={(e) => cambiar("hora", e.target.value)} /></Campo>}
              </div>
              <Campo etiqueta="Nombre (opcional)" ayuda="Así la verá en su lista."><input value={b.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder={t.nombre} /></Campo>
              <Aviso tono="info">
                <b>Así quedará:</b> «{(b.nombre || t.nombre).trim()}» se ejecutará {describir(b.frecuencia, valor)}
                {(t.campos ?? []).some((c: any) => b.parametros[c.clave]) && <>, con {(t.campos ?? []).filter((c: any) => b.parametros[c.clave]).map((c: any) => `${c.etiqueta.toLowerCase()}: ${b.parametros[c.clave]}`).join("; ")}</>}.
                {" "}{t.para_que} Cada ejecución queda en el historial y en la bitácora.
              </Aviso>
            </div>
          )}
          <div className="fila espaciado">
            {paso > 1 ? <button type="button" className="boton secundario" onClick={() => setPaso(paso === 3 && !t?.campos?.length ? 1 : paso - 1)}><ArrowLeft /> Atrás</button> : <span />}
            {paso === 2 && <button type="button" className="boton" onClick={() => setPaso(3)}>Siguiente <ArrowRight /></button>}
            {paso === 3 && <button className="boton" disabled={!b.tarea || enviando}><Plus /> {enviando ? "Creando…" : "Crear automatización"}</button>}
          </div>
        </form>
      )}
    </Modal>
  );
}

function Historial({ a, onCerrar }: { a: any; onCerrar: () => void }) {
  const { datos } = useDatos<any[]>(`/api/automatizaciones/${a.id}/ejecuciones`);
  return (
    <Modal titulo={`Historial · ${a.nombre}`} onCerrar={onCerrar} ancho>
      {a.para_que && <p className="suave" style={{ marginBottom: 12 }}>{a.para_que}</p>}
      {!datos ? <Esqueleto /> : <Tabla filas={datos} vacio="Todavía no se ha ejecutado." columnas={[
        { id: "i", titulo: "Inicio", valor: (e: any) => e.inicio, celda: (e: any) => fmt.fechaHora(e.inicio) },
        { id: "e", titulo: "Estado", valor: (e: any) => e.estado, celda: (e: any) => <Severidad valor={e.estado} /> },
        { id: "d", titulo: "Duración", num: true, valor: (e: any) => e.duracion_s, celda: (e: any) => (e.duracion_s === null ? "—" : `${e.duracion_s} s`) },
        { id: "p", titulo: "Disparada por", valor: (e: any) => e.disparada_por, celda: (e: any) => (String(e.disparada_por).startsWith("usuario") ? "Una persona" : "Programador") },
        { id: "r", titulo: "Resultado", valor: (e: any) => e.resumen, celda: (e: any) => <span className="pequeno">{e.resumen}</span> },
      ]} />}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------- Vistas

/** En el resumen basta la primera parte del resultado; el texto completo está en el historial. */
function recortar(texto?: string | null, maximo = 150) {
  if (!texto) return texto;
  return texto.length > maximo ? texto.slice(0, maximo).replace(/\s+\S*$/, "") + "… (detalle en el historial)" : texto;
}

function estadoDe(a: any): "ok" | "atencion" | "critico" | "info" {
  if (!a.activa) return "info";
  if (a.ultimo_estado === "error" || a.errores_24h > 0) return "critico";
  if (!a.ultimo_estado) return "info";
  return "ok";
}

function Resumen({ lista, resumen, plantillas, acciones }: { lista: any[]; resumen: any; plantillas: any[] | null; acciones: Acciones }) {
  const { puede } = useSesion();
  const grupos = useMemo(() => {
    const m = new Map<string, any[]>();
    lista.forEach((a) => { const c = a.categoria || "Otras"; if (!m.has(c)) m.set(c, []); m.get(c)!.push(a); });
    return [...m.entries()];
  }, [lista]);
  const puedeEjecutar = puede("automatizaciones:gestionar") || puede("automatizaciones:administrar");
  return (
    <>
      <EnPocasPalabras ancla="auto-resumen">
        Nexo tiene <b>{fmt.numero(resumen.activas)}</b> tarea{resumen.activas === 1 ? "" : "s"} que trabaja{resumen.activas === 1 ? "" : "n"} sola{resumen.activas === 1 ? "" : "s"}.
        {" "}En las últimas 24 horas se ejecutaron <b>{fmt.numero(resumen.ejecuciones_24h)}</b> veces
        {resumen.fallas_24h ? <> y <b>{fmt.numero(resumen.fallas_24h)}</b> fallaron: revise «{resumen.ultima_falla?.nombre}».</> : <> y todas terminaron bien.</>}
        {resumen.proxima && <> La próxima es «{resumen.proxima.nombre}», {fmt.relativo(resumen.proxima.en)}.</>}
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c4"><CifraClara icono={<Workflow />} etiqueta="Tareas activas" valor={`${fmt.numero(resumen.activas)} de ${fmt.numero(resumen.total)}`}
          detalle={resumen.pausadas ? `${resumen.pausadas} en pausa` : "Ninguna en pausa"} significa="Las que corren solas según su horario. Las pausadas no se ejecutan hasta reanudarlas." /></div>
        <div className="c4"><CifraClara tono={resumen.fallas_24h ? "naranja" : "verde"} icono={<CircleCheck />} etiqueta="Ejecuciones en 24 horas" numero={resumen.ejecuciones_24h} formato={(v) => fmt.numero(v)}
          detalle={resumen.fallas_24h ? `${resumen.fallas_24h} con error` : "Todas sin error"}
          significa={resumen.ultima_falla ? <>Última falla: {resumen.ultima_falla.resumen}</> : "Cada ejecución queda con su resultado en el historial y en la bitácora."} /></div>
        <div className="c4"><CifraClara tono="morado" icono={<CalendarClock />} etiqueta="Próxima ejecución" valor={resumen.proxima ? fmt.relativo(resumen.proxima.en) : "—"}
          detalle={resumen.proxima?.nombre} significa="Los horarios usan la hora de Guatemala." /></div>
      </div>
      {grupos.map(([categoria, autos]) => (
        <Tarjeta key={categoria} titulo={categoria}>
          <ListaSimple elementos={autos.map((a) => ({
            estado: estadoDe(a),
            titulo: <>{a.nombre} <span className="pequeno suave" style={{ fontWeight: 400 }}>· {a.activa ? a.frecuencia_texto : "en pausa"}</span></>,
            texto: <>{a.para_que}{a.ultima_ejecucion_en && <><br /><span style={{ color: "var(--texto-2)" }}>Última vez {fmt.relativo(a.ultima_ejecucion_en)}: {recortar(a.ultimo_resumen) ?? (a.ultimo_estado === "ok" ? "terminó bien." : a.ultimo_estado)}</span></>}</>,
            accion: (
              <div className="fila" style={{ gap: 4 }}>
                {puedeEjecutar && <button className="boton secundario pequeno" onClick={() => acciones.ejecutar(a)} disabled={acciones.corriendo === a.id}><Play /> {acciones.corriendo === a.id ? "Ejecutando…" : "Ejecutar ahora"}</button>}
                <button className="boton fantasma pequeno" onClick={() => acciones.historial(a)}><History /> Historial</button>
              </div>
            ),
          }))} />
        </Tarjeta>
      ))}
      {plantillas && plantillas.length > 0 && (
        <Tarjeta titulo="Cree una en un clic" ayuda="Automatizaciones ya armadas para su rol. Puede ajustarlas antes de crearlas.">
          <div className="rejilla escalonada">
            {plantillas.map((p) => (
              <div key={p.id} className="c4 tarjeta plantilla" style={{ boxShadow: "none" }}>
                <b>{p.titulo}</b>
                <p className="pequeno suave">{p.descripcion}</p>
                <span className="pequeno"><CalendarClock size={13} style={{ verticalAlign: -2 }} /> {p.frecuencia_texto}</span>
                {p.puede_crear && <button className="boton secundario pequeno" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => acciones.usarPlantilla(p)}>Usar esta plantilla</button>}
              </div>
            ))}
          </div>
        </Tarjeta>
      )}
      <PieResumen fuente="registro de ejecuciones de Nexo y bitácora de auditoría">La vista Completa muestra la programación exacta de cada una y los botones para pausar o eliminar.</PieResumen>
    </>
  );
}

interface Acciones { ejecutar: (a: any) => void; historial: (a: any) => void; usarPlantilla: (p: any) => void; corriendo: number | null }

function Completa({ lista, acciones, recargar }: { lista: any[]; acciones: Acciones; recargar: () => void }) {
  const estado = async (a: any) => { await api(`/api/automatizaciones/${a.id}/estado`, { cuerpo: { activa: !a.activa } }); recargar(); };
  const [borrar, setBorrar] = useState<any>(null);
  const sistema = lista.filter((a) => a.sistema);
  const mias = lista.filter((a) => !a.sistema);
  const columnas = [
    { id: "n", titulo: "Automatización", valor: (a: any) => a.nombre, celda: (a: any) => <span><b>{a.nombre}</b><br /><span className="pequeno suave">{a.tarea_nombre}{a.sistema ? "" : ` · ${a.propietario}`}</span></span> },
    { id: "f", titulo: "Cuándo", valor: (a: any) => a.frecuencia_texto },
    { id: "u", titulo: "Última ejecución", valor: (a: any) => a.ultima_ejecucion_en, celda: (a: any) => <span>{a.ultimo_estado ? <Severidad valor={a.ultimo_estado} /> : <Insignia>sin ejecutar</Insignia>} <span className="pequeno suave">{fmt.relativo(a.ultima_ejecucion_en)}</span>{a.ultimo_resumen && <><br /><span className="pequeno">{a.ultimo_resumen}</span></>}</span> },
    { id: "h", titulo: "24 h", num: true, valor: (a: any) => a.ejecuciones_24h, celda: (a: any) => <span>{fmt.numero(a.ejecuciones_24h)}{a.errores_24h ? <><br /><span className="pequeno" style={{ color: "var(--critico)" }}>{a.errores_24h} con error</span></> : null}</span> },
    { id: "p", titulo: "Próxima", valor: (a: any) => a.proxima_ejecucion_en, celda: (a: any) => (a.activa ? (a.proxima_ejecucion_en ? fmt.relativo(a.proxima_ejecucion_en) : "Manual") : <Insignia tono="alerta">Pausada</Insignia>) },
    { id: "a", titulo: "", celda: (a: any) => (
      <div className="fila" style={{ gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" }}>
        <button className="boton secundario pequeno" onClick={() => acciones.ejecutar(a)} disabled={acciones.corriendo === a.id}><Play /> {acciones.corriendo === a.id ? "Ejecutando…" : "Ejecutar"}</button>
        <button className="boton fantasma pequeno icono" onClick={() => acciones.historial(a)} aria-label="Historial" title="Historial"><History /></button>
        {a.puede_editar && <button className="boton fantasma pequeno icono" onClick={() => estado(a)} aria-label={a.activa ? "Pausar" : "Reanudar"} title={a.activa ? "Pausar" : "Reanudar"}>{a.activa ? <Pause /> : <Play />}</button>}
        {a.puede_editar && !a.sistema && <button className="boton fantasma pequeno icono" onClick={() => setBorrar(a)} aria-label="Eliminar" title="Eliminar"><Trash2 /></button>}
      </div>
    ) },
  ];
  return (
    <>
      <Tarjeta titulo="Mis automatizaciones"><Tabla filas={mias} columnas={columnas} vacio="Aún no tiene automatizaciones. Cree una para que Nexo trabaje por usted." /></Tarjeta>
      <Tarjeta titulo="Automatizaciones del sistema" ayuda="Agentes de seguridad y TI, retención de datos, integridad de la bitácora y sincronización con el INE.">
        <Tabla filas={sistema} columnas={columnas} />
      </Tarjeta>
      {borrar && (
        <Modal titulo="¿Eliminar esta automatización?" onCerrar={() => setBorrar(null)}>
          <div className="columna">
            <p>Se eliminará «{borrar.nombre}» y dejará de ejecutarse. Su historial de ejecuciones se conserva en la bitácora.</p>
            <div className="fila" style={{ justifyContent: "flex-end" }}>
              <button className="boton secundario" onClick={() => setBorrar(null)}>Cancelar</button>
              <button className="boton peligro" onClick={async () => { await api(`/api/automatizaciones/${borrar.id}`, { metodo: "DELETE" }); avisar("Automatización eliminada."); setBorrar(null); recargar(); }}><Trash2 /> Eliminar</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Automatizaciones() {
  const { puede } = useSesion();
  const { datos: lista, recargar: recargarLista } = useDatos<any[]>("/api/automatizaciones");
  const { datos: resumen, recargar: recargarResumen } = useDatos<any>("/api/automatizaciones/resumen");
  const { datos: plantillas } = useDatos<any[]>("/api/automatizaciones/plantillas");
  const [asistente, setAsistente] = useState<{ plantilla?: any } | null>(null);
  const [historial, setHistorial] = useState<any>(null);
  const [corriendo, setCorriendo] = useState<number | null>(null);
  const recargar = () => { recargarLista(); recargarResumen(); };
  const acciones: Acciones = {
    corriendo,
    historial: setHistorial,
    usarPlantilla: (p) => setAsistente({ plantilla: p }),
    ejecutar: async (a) => {
      setCorriendo(a.id);
      try { const r: any = await api(`/api/automatizaciones/${a.id}/ejecutar`, { metodo: "POST" }); avisar(r.resumen, r.estado === "ok" ? "exito" : "critico"); recargar(); }
      catch (e) { avisar((e as Error).message, "critico"); }
      finally { setCorriendo(null); }
    },
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Automatizaciones" subtitulo="Tareas que trabajan por usted: vigilar precios, recordar vencimientos, detectar precios atípicos, sincronizar el catálogo del INE, respaldar y revisar la seguridad. Solo se ejecutan tareas de una lista aprobada y cada ejecución queda en la bitácora."
        acciones={<><BotonAyuda ayuda={AYUDA} />{puede("automatizaciones:gestionar") && <button className="boton" onClick={() => setAsistente({})}><Plus /> Nueva automatización</button>}</>} />
      {!lista || !resumen ? <><EsqueletoKpis n={3} /><Tarjeta><EsqueletoTabla filas={6} /></Tarjeta></> : (
        <SegunVista resumen={<Resumen lista={lista} resumen={resumen} plantillas={plantillas} acciones={acciones} />}
          completa={<Completa lista={lista} acciones={acciones} recargar={recargar} />} />
      )}
      {asistente && <Asistente plantilla={asistente.plantilla} onCerrar={(creada) => { setAsistente(null); if (creada) recargar(); }} />}
      {historial && <Historial a={historial} onCerrar={() => setHistorial(null)} />}
    </div>
  );
}
