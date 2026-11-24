// Automatizaciones: cada persona crea, programa, pausa, ejecuta y audita las suyas.
import { useState, type FormEvent } from "react";
import { History, Pause, Play, Plus, Trash2 } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, Insignia, Modal, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function Nueva({ onCerrar }: { onCerrar: () => void }) {
  const { datos: tareas } = useDatos<any[]>("/api/automatizaciones/tareas");
  const [tarea, setTarea] = useState("");
  const [nombre, setNombre] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [frecuencia, setFrecuencia] = useState("diaria");
  const [minutos, setMinutos] = useState("60");
  const [hora, setHora] = useState("07:00");
  const [dia, setDia] = useState("0");
  const [error, setError] = useState("");
  const t = tareas?.find((x) => x.clave === tarea);
  const valor = frecuencia === "intervalo" ? minutos : frecuencia === "diaria" ? hora : frecuencia === "semanal" ? `${dia}@${hora}` : "";
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const limpios = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== ""));
      await api("/api/automatizaciones", { cuerpo: { nombre: nombre || t?.nombre, tarea, parametros: limpios, frecuencia, valor_frecuencia: valor } });
      avisar("Automatización creada."); onCerrar();
    } catch (err) { setError((err as ErrorApi).message); }
  };
  return (
    <Modal titulo="Nueva automatización" onCerrar={onCerrar}>
      {!tareas ? <Esqueleto /> : (
        <form className="columna" onSubmit={enviar}>
          {error && <Aviso tono="critico">{error}</Aviso>}
          <Campo etiqueta="¿Qué quieres automatizar?" ayuda={t?.descripcion}>
            <select required value={tarea} onChange={(e) => { setTarea(e.target.value); setParams({}); }}>
              <option value="">Elige una tarea…</option>
              {tareas.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t?.nombre ?? "Mi automatización"} /></Campo>
          {t && Object.entries(t.parametros).map(([k, d]) => (
            <Campo key={k} etiqueta={String(d)}><input value={params[k] ?? ""} onChange={(e) => setParams({ ...params, [k]: e.target.value })} /></Campo>
          ))}
          <Campo etiqueta="¿Cuándo?">
            <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)}>
              <option value="manual">Solo cuando yo la ejecute</option><option value="intervalo">Cada cierto tiempo</option>
              <option value="diaria">Todos los días</option><option value="semanal">Una vez por semana</option>
            </select>
          </Campo>
          <div className="fila">
            {frecuencia === "intervalo" && <Campo etiqueta="Cada (minutos, mínimo 15)"><input type="number" min={15} value={minutos} onChange={(e) => setMinutos(e.target.value)} /></Campo>}
            {frecuencia === "semanal" && <Campo etiqueta="Día"><select value={dia} onChange={(e) => setDia(e.target.value)}>{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Campo>}
            {(frecuencia === "diaria" || frecuencia === "semanal") && <Campo etiqueta="Hora (Guatemala)"><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>}
          </div>
          <button className="boton" disabled={!tarea}><Plus /> Crear automatización</button>
        </form>
      )}
    </Modal>
  );
}

function Historial({ a, onCerrar }: { a: any; onCerrar: () => void }) {
  const { datos } = useDatos<any[]>(`/api/automatizaciones/${a.id}/ejecuciones`);
  return (
    <Modal titulo={`Historial · ${a.nombre}`} onCerrar={onCerrar} ancho>
      {!datos ? <Esqueleto /> : <Tabla filas={datos} vacio="Todavía no se ha ejecutado." columnas={[
        { id: "i", titulo: "Inicio", valor: (e: any) => e.inicio, celda: (e: any) => fmt.fechaHora(e.inicio) },
        { id: "e", titulo: "Estado", valor: (e: any) => e.estado, celda: (e: any) => <Severidad valor={e.estado} /> },
        { id: "d", titulo: "Duración", num: true, valor: (e: any) => e.duracion_s, celda: (e: any) => (e.duracion_s === null ? "—" : `${e.duracion_s} s`) },
        { id: "p", titulo: "Disparada por", valor: (e: any) => e.disparada_por },
        { id: "r", titulo: "Resultado", valor: (e: any) => e.resumen, celda: (e: any) => <span className="pequeno">{e.resumen}</span> },
      ]} />}
    </Modal>
  );
}

export default function Automatizaciones() {
  const { puede } = useSesion();
  const { datos, recargar } = useDatos<any[]>("/api/automatizaciones");
  const [nueva, setNueva] = useState(false);
  const [historial, setHistorial] = useState<any>(null);
  const [corriendo, setCorriendo] = useState<number | null>(null);
  const ejecutar = async (a: any) => {
    setCorriendo(a.id);
    try { const r: any = await api(`/api/automatizaciones/${a.id}/ejecutar`, { metodo: "POST" }); avisar(r.resumen, r.estado === "ok" ? "exito" : "critico"); recargar(); }
    catch (e) { avisar((e as Error).message, "critico"); }
    finally { setCorriendo(null); }
  };
  const estado = async (a: any) => { await api(`/api/automatizaciones/${a.id}/estado`, { cuerpo: { activa: !a.activa } }); recargar(); };
  const borrar = async (a: any) => { await api(`/api/automatizaciones/${a.id}`, { metodo: "DELETE" }); avisar("Automatización eliminada."); recargar(); };
  const sistema = (datos ?? []).filter((a) => a.sistema);
  const mias = (datos ?? []).filter((a) => !a.sistema);
  const columnas = [
    { id: "n", titulo: "Automatización", valor: (a: any) => a.nombre, celda: (a: any) => <span><b>{a.nombre}</b><br /><span className="pequeno suave">{a.tarea_nombre}{a.sistema ? "" : ` · ${a.propietario}`}</span></span> },
    { id: "f", titulo: "Cuándo", valor: (a: any) => a.frecuencia_texto },
    { id: "u", titulo: "Última ejecución", valor: (a: any) => a.ultima_ejecucion_en, celda: (a: any) => <span>{a.ultimo_estado ? <Severidad valor={a.ultimo_estado} /> : <Insignia>sin ejecutar</Insignia>} <span className="pequeno suave">{fmt.relativo(a.ultima_ejecucion_en)}</span></span> },
    { id: "p", titulo: "Próxima", valor: (a: any) => a.proxima_ejecucion_en, celda: (a: any) => (a.activa ? (a.proxima_ejecucion_en ? fmt.relativo(a.proxima_ejecucion_en) : "Manual") : <Insignia tono="alerta">Pausada</Insignia>) },
    { id: "a", titulo: "", celda: (a: any) => (
      <div className="fila" style={{ gap: 4, justifyContent: "flex-end" }}>
        <button className="boton secundario pequeno" onClick={() => ejecutar(a)} disabled={corriendo === a.id}><Play /> {corriendo === a.id ? "Ejecutando…" : "Ejecutar"}</button>
        <button className="boton fantasma pequeno" onClick={() => setHistorial(a)} aria-label="Historial"><History /></button>
        {a.puede_editar && <button className="boton fantasma pequeno" onClick={() => estado(a)} aria-label={a.activa ? "Pausar" : "Reanudar"}>{a.activa ? <Pause /> : <Play />}</button>}
        {a.puede_editar && !a.sistema && <button className="boton fantasma pequeno" onClick={() => borrar(a)} aria-label="Eliminar"><Trash2 /></button>}
      </div>
    ) },
  ];
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Automatizaciones" subtitulo="Tareas programadas o manuales que trabajan por ti: vigilar precios, recordar vencimientos, recalcular alertas, sincronizar el catálogo del INE, respaldar y revisar la seguridad. Solo se ejecutan tareas de una lista aprobada y cada ejecución queda en la bitácora."
        acciones={puede("automatizaciones:gestionar") && <button className="boton" onClick={() => setNueva(true)}><Plus /> Nueva automatización</button>} />
      {!datos ? <Esqueleto alto={300} /> : (
        <>
          <Tarjeta titulo="Mis automatizaciones">{<Tabla filas={mias} columnas={columnas} vacio="Aún no tienes automatizaciones. Crea una para que Nexo trabaje por ti." />}</Tarjeta>
          <Tarjeta titulo="Automatizaciones del sistema" ayuda="Agentes de seguridad y TI, retención de datos, integridad de la bitácora y sincronización con el INE.">
            <Tabla filas={sistema} columnas={columnas} />
          </Tarjeta>
        </>
      )}
      {nueva && <Nueva onCerrar={() => { setNueva(false); recargar(); }} />}
      {historial && <Historial a={historial} onCerrar={() => setHistorial(null)} />}
    </div>
  );
}
