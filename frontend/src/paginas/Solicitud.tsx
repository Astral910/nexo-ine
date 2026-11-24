// Detalle de una solicitud de precio de referencia: los 6 pasos de la DPIR con investigación automática.
import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Ban, Download, ExternalLink, FileText, Plus, Search, Undo2 } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionBarras } from "../componentes/Grafica";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, FuenteCita, Insignia, Kpi, Modal, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { histograma } from "./Precios";

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
    <Tarjeta titulo="3. Investigación de mercado automática" ayuda="Busca compras comparables en Guatecompras (fuente secundaria) y precios de referencia históricos del INE. Después agrega cotizaciones del mercado relevante (fuente primaria).">
      <form className="fila" onSubmit={(e) => { e.preventDefault(); investigar(null); }}>
        <input className="entrada" style={{ flex: 1, minWidth: 220 }} value={terminos} onChange={(e) => setTerminos(e.target.value)} aria-label="Términos de búsqueda" />
        <button className="boton" disabled={cargando}><Search /> {cargando ? "Investigando…" : "Investigar"}</button>
      </form>
      {error && <div style={{ marginTop: 10 }}><Aviso tono="alerta">{error}</Aviso></div>}
      {r && (
        <div className="columna" style={{ marginTop: 12 }}>
          {r.grupos.length > 1 && (
            <div className="fila">
              <span className="pequeno suave">Afina por clasificación UNSPSC para comparar lo mismo:</span>
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

export default function Solicitud() {
  const { id } = useParams();
  const { puede } = useSesion();
  const { datos: sol, error, recargar } = useDatos<any>(`/api/precios/solicitudes/${id}`);
  const [comentario, setComentario] = useState("");
  const [fuenteNueva, setFuenteNueva] = useState(false);
  const [rechazo, setRechazo] = useState(false);
  const gestiona = puede("dpir:gestionar");
  if (error) return <Aviso tono="critico">{error}</Aviso>;
  if (!sol) return <Esqueleto alto={400} />;
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
        acciones={sol.resultado && (gestiona || sol.estado === "entregada") && sol.estado !== "recibida" && (
          <a className="boton secundario" href={`/api/precios/solicitudes/${sol.id}/informe.pdf`} target="_blank" rel="noopener"><FileText /> Informe técnico (PDF)</a>
        )} />
      <Tarjeta><Pasos estado={sol.estado} /></Tarjeta>
      <div className="rejilla">
        <div className="c8 columna" style={{ gap: 16 }}>
          {gestiona && sol.estado === "investigacion" && <Investigacion sol={sol} alTerminar={recargar} />}
          {gestiona && ["investigacion", "analisis", "informe", "entregada"].includes(sol.estado) && (
            <Tarjeta titulo="Fuentes de precio" ayuda="Activa o desactiva cada fuente. Las primarias (cotizaciones y catálogos) deben ser más de la mitad."
              acciones={sol.estado !== "entregada" && <button className="boton secundario pequeno" onClick={() => setFuenteNueva(true)}><Plus /> Cotización</button>}>
              <Tabla maximo={80} filas={sol.fuentes} vacio="Aún no hay fuentes. Usa la investigación automática y agrega cotizaciones." columnas={[
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
          {!gestiona && sol.estado !== "entregada" && <Aviso tono="info">La DPIR está trabajando en tu solicitud. Te avisaremos por notificación y correo cuando el informe esté listo.</Aviso>}
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
