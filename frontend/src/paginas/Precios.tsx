// Precios de Referencia (DPIR): bandeja de solicitudes, nueva solicitud y explorador de mercado.
import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ExternalLink, Plus, Search } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionBarras } from "../componentes/Grafica";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, FuenteCita, Insignia, Kpi, Modal, Pestanas, Tabla, Tarjeta, useDatos } from "../componentes/ui";

export function NuevaSolicitud({ onCerrar }: { onCerrar: () => void }) {
  const { puede, usuario } = useSesion();
  const navegar = useNavigate();
  const [f, setF] = useState({ entidad: "", producto: "", especificaciones: "", unidad: "Unidad", cantidad: 1, modalidad: "", justificacion: "" });
  const [error, setError] = useState("");
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try { const s: any = await api("/api/precios/solicitudes", { cuerpo: f }); avisar(`Solicitud ${s.codigo} registrada.`); navegar(`/precios/${s.id}`); }
    catch (err) { setError((err as ErrorApi).message); }
  };
  const c = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal titulo="Nueva solicitud de precio de referencia" onCerrar={onCerrar}>
      <form className="columna" onSubmit={enviar}>
        {error && <Aviso tono="critico">{error}</Aviso>}
        {puede("dpir:gestionar") ? <Campo etiqueta="Entidad solicitante"><input value={f.entidad} onChange={(e) => c("entidad", e.target.value)} placeholder="Ministerio de Educación" required /></Campo>
          : <Aviso tono="info">Se registrará a nombre de <b>{usuario?.unidad}</b>.</Aviso>}
        <Campo etiqueta="Bien o servicio"><input required minLength={3} value={f.producto} onChange={(e) => c("producto", e.target.value)} placeholder="Computadora portátil" /></Campo>
        <Campo etiqueta="Especificaciones técnicas" ayuda="Cuanto más precisas, más comparables serán las fuentes."><textarea value={f.especificaciones} onChange={(e) => c("especificaciones", e.target.value)} placeholder="8 GB RAM, 256 GB SSD, pantalla de 14 pulgadas" /></Campo>
        <div className="fila">
          <div style={{ flex: 1 }}><Campo etiqueta="Cantidad"><input type="number" min={1} required value={f.cantidad} onChange={(e) => c("cantidad", Number(e.target.value))} /></Campo></div>
          <div style={{ flex: 1 }}><Campo etiqueta="Unidad de medida"><input value={f.unidad} onChange={(e) => c("unidad", e.target.value)} /></Campo></div>
          <div style={{ flex: 1 }}><Campo etiqueta="Modalidad de compra"><input value={f.modalidad} onChange={(e) => c("modalidad", e.target.value)} placeholder="Cotización" /></Campo></div>
        </div>
        <Campo etiqueta="Justificación (opcional)"><textarea value={f.justificacion} onChange={(e) => c("justificacion", e.target.value)} /></Campo>
        <button className="boton"><Plus /> Registrar solicitud</button>
      </form>
    </Modal>
  );
}

function Bandeja() {
  const { puede } = useSesion();
  const { datos } = useDatos<any>("/api/precios/solicitudes");
  const [filtro, setFiltro] = useState<string>("todas");
  const navegar = useNavigate();
  if (!datos) return <Esqueleto alto={300} />;
  const conteo = (e: string) => datos.solicitudes.filter((s: any) => s.estado === e).length;
  const filas = datos.solicitudes.filter((s: any) => filtro === "todas" || s.estado === filtro);
  return (
    <div className="columna">
      <div className="fila">
        <button className={`chip ${filtro === "todas" ? "fijo" : ""}`} onClick={() => setFiltro("todas")}>Todas <b>{datos.solicitudes.length}</b></button>
        {datos.etapas.map((e: any) => <button key={e.id} className={`chip ${filtro === e.id ? "fijo" : ""}`} onClick={() => setFiltro(e.id)}>{e.etiqueta} <b>{conteo(e.id)}</b></button>)}
      </div>
      <Tabla filas={filas} onFila={(s: any) => navegar(`/precios/${s.id}`)} vacio="No hay solicitudes en esta etapa." columnas={[
        { id: "c", titulo: "Código", valor: (s: any) => s.codigo, celda: (s: any) => <b>{s.codigo}</b> },
        { id: "p", titulo: "Bien o servicio", valor: (s: any) => s.producto },
        { id: "e", titulo: "Entidad", valor: (s: any) => s.entidad },
        { id: "q", titulo: "Cantidad", num: true, valor: (s: any) => s.cantidad, celda: (s: any) => `${fmt.numero(s.cantidad)} ${s.unidad}` },
        { id: "t", titulo: "Etapa", valor: (s: any) => s.paso, celda: (s: any) => (s.rechazada ? <Insignia tono="critico">Rechazada</Insignia> : <Insignia tono={s.estado === "entregada" ? "exito" : "info"}>{s.etapa}</Insignia>) },
        { id: "v", titulo: "Vence", valor: (s: any) => s.fecha_limite, celda: (s: any) => <span style={{ color: s.vencida ? "#b42318" : undefined, fontWeight: s.vencida ? 700 : 400 }}>{fmt.fecha(s.fecha_limite)}{s.vencida ? " · vencida" : ""}</span> },
        { id: "r", titulo: "Precio de referencia", num: true, valor: (s: any) => s.precio_referencia, celda: (s: any) => fmt.moneda(s.precio_referencia) },
        ...(puede("dpir:ver") ? [{ id: "a", titulo: "Asignada a", valor: (s: any) => s.asignada_a ?? "—" }] : []),
      ]} />
    </div>
  );
}

export function histograma(valores: number[], cubetas = 14) {
  if (!valores.length) return { etiquetas: [], conteos: [] };
  const min = Math.min(...valores), max = Math.max(...valores);
  const ancho = (max - min) / cubetas || 1;
  const conteos = Array(cubetas).fill(0);
  valores.forEach((v) => { conteos[Math.min(cubetas - 1, Math.floor((v - min) / ancho))]++; });
  return { etiquetas: conteos.map((_, i) => fmt.moneda(min + i * ancho, 0)), conteos };
}

function Explorador() {
  const [terminos, setTerminos] = useState("computadora portatil");
  const [unspsc, setUnspsc] = useState<string | null>(null);
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const buscar = async (u: string | null = unspsc) => {
    setCargando(true); setError("");
    try { setR(await api(`/api/precios/investigar?terminos=${encodeURIComponent(terminos)}${u ? `&unspsc=${u}` : ""}`)); setUnspsc(u); }
    catch (e) { setError((e as Error).message); }
    finally { setCargando(false); }
  };
  const hist = useMemo(() => histograma((r?.compras ?? []).filter((c: any) => !c.atipico).map((c: any) => c.precio_ajustado)), [r]);
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Tarjeta titulo="Explorador de mercado" ayuda="Busca un bien en 214 mil compras públicas de un solo artículo (Guatecompras) y en los precios de referencia históricos del INE. Los precios se llevan a quetzales del último mes del IPC.">
        <form className="fila" onSubmit={(e) => { e.preventDefault(); buscar(null); }}>
          <input className="entrada" style={{ flex: 1, minWidth: 240 }} value={terminos} onChange={(e) => setTerminos(e.target.value)} aria-label="Producto" />
          <button className="boton" disabled={cargando}><Search /> {cargando ? "Buscando…" : "Investigar"}</button>
        </form>
        {r?.grupos?.length > 0 && (
          <div className="fila" style={{ marginTop: 10 }}>
            <span className="pequeno suave">Afina por clasificación UNSPSC:</span>
            {r.grupos.map((g: any) => <button key={g.unspsc + g.unidad} className={`chip ${unspsc === g.unspsc ? "fijo" : ""}`} title={g.ejemplo} onClick={() => buscar(g.unspsc)}>{g.unspsc} · {g.unidad || "sin unidad"} <b>{g.n}</b></button>)}
            {unspsc && <button className="chip" onClick={() => buscar(null)}>Quitar filtro</button>}
          </div>
        )}
      </Tarjeta>
      {error && <Aviso tono="alerta">{error}</Aviso>}
      {r && (
        <>
          <div className="rejilla">
            <div className="c3"><Kpi etiqueta="Precio sugerido" valor={fmt.moneda(r.precio_sugerido)} detalle={`${r.estadistico_recomendado} · ${r.razon}`} /></div>
            <div className="c3"><Kpi tono="verde" etiqueta="Media · Mediana" valor={`${fmt.moneda(r.estadisticos.media, 0)} · ${fmt.moneda(r.estadisticos.mediana, 0)}`} detalle={`Moda ${fmt.moneda(r.estadisticos.moda, 0)}`} /></div>
            <div className="c3"><Kpi tono="morado" etiqueta="Compras comparables" valor={fmt.numero(r.estadisticos.n)} detalle={`${r.atipicos} atípicos excluidos · ${r.periodo.desde} a ${r.periodo.hasta}`} /></div>
            <div className="c3"><Kpi tono="naranja" etiqueta="Dispersión (CV)" valor={fmt.pct(r.estadisticos.cv)} detalle={`Rango ${fmt.moneda(r.estadisticos.minimo, 0)} a ${fmt.moneda(r.estadisticos.maximo, 0)}`} /></div>
          </div>
          <Tarjeta titulo="Distribución de precios unitarios (sin atípicos)" ayuda={`Quetzales de ${r.ajuste_ipc.a_precios_de} · ${r.ajuste_ipc.base}`}>
            <Grafica opcion={opcionBarras(hist.etiquetas, hist.conteos)} />
            <FuenteCita>Guatecompras OCDS 2025 (CC BY 4.0), precio unitario calculado por Nexo; IPC del INE.</FuenteCita>
          </Tarjeta>
          <Tarjeta titulo="Compras encontradas" ayuda="Revisa que sean comparables: misma unidad y especificaciones.">
            <Tabla maximo={100} filas={r.compras} columnas={[
              { id: "f", titulo: "Fecha", valor: (c: any) => c.fecha, celda: (c: any) => fmt.fecha(c.fecha) },
              { id: "d", titulo: "Descripción", valor: (c: any) => c.descripcion, celda: (c: any) => <span className="pequeno">{c.descripcion}</span> },
              { id: "e", titulo: "Entidad", valor: (c: any) => c.origen, celda: (c: any) => <span className="pequeno">{c.origen}</span> },
              { id: "q", titulo: "Cant.", num: true, valor: (c: any) => c.cantidad, celda: (c: any) => fmt.numero(c.cantidad) },
              { id: "p", titulo: "Precio", num: true, valor: (c: any) => c.precio, celda: (c: any) => fmt.moneda(c.precio) },
              { id: "a", titulo: "Ajustado IPC", num: true, valor: (c: any) => c.precio_ajustado, celda: (c: any) => <>{fmt.moneda(c.precio_ajustado)} {c.atipico && <Insignia tono="alerta">atípico</Insignia>}</> },
              { id: "n", titulo: "NOG", valor: (c: any) => c.referencia, celda: (c: any) => <a href={c.enlace} target="_blank" rel="noreferrer noopener">{c.referencia} <ExternalLink size={12} /></a> },
            ]} />
          </Tarjeta>
          {r.referencias_ine.length > 0 && (
            <Tarjeta titulo="Precios de referencia históricos del INE">
              <Tabla filas={r.referencias_ine} columnas={[
                { id: "f", titulo: "Fecha", valor: (c: any) => c.fecha, celda: (c: any) => fmt.fecha(c.fecha) },
                { id: "d", titulo: "Producto y características", valor: (c: any) => c.descripcion, celda: (c: any) => <span className="pequeno">{c.descripcion}</span> },
                { id: "p", titulo: "Precio", num: true, valor: (c: any) => c.precio, celda: (c: any) => fmt.moneda(c.precio) },
                { id: "a", titulo: "Ajustado IPC", num: true, valor: (c: any) => c.precio_ajustado, celda: (c: any) => fmt.moneda(c.precio_ajustado) },
              ]} />
              <FuenteCita>INE, base de Precios de Referencia (junio 2022 y septiembre 2023).</FuenteCita>
            </Tarjeta>
          )}
        </>
      )}
    </div>
  );
}

export default function Precios() {
  const { puede } = useSesion();
  const ubicacion = useLocation();
  const [nueva, setNueva] = useState(false);
  const [pestana, setPestana] = useState<"bandeja" | "mercado">("bandeja");
  const soloEntidad = !puede("dpir:ver");
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado titulo={soloEntidad || ubicacion.pathname === "/mis-solicitudes" ? "Mis solicitudes de precio de referencia" : "Precios de Referencia"}
        subtitulo={soloEntidad ? "Registra lo que tu entidad necesita comprar y da seguimiento a cada etapa hasta recibir el informe técnico."
          : "El proceso de 6 pasos de la DPIR digitalizado: la investigación de mercado se automatiza con Guatecompras y los precios del INE, y el informe sale trazable."}
        acciones={(puede("dpir:solicitar") || puede("dpir:gestionar")) && <button className="boton" onClick={() => setNueva(true)}><Plus /> Nueva solicitud</button>} />
      {!soloEntidad && <Pestanas opciones={[{ id: "bandeja", etiqueta: "Solicitudes" }, { id: "mercado", etiqueta: "Explorador de mercado" }]} activa={pestana} onCambio={setPestana} />}
      {pestana === "bandeja" || soloEntidad ? <Bandeja /> : <Explorador />}
      {soloEntidad && <p className="pequeno suave">¿Dudas sobre el proceso? <Link to="/privacidad">Consulta cómo tratamos tus datos</Link>.</p>}
      {nueva && <NuevaSolicitud onCerrar={() => setNueva(false)} />}
    </div>
  );
}
