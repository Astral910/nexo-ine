// Tableros: base por rol, propios, y generación a partir de una petición escrita en español.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Copy, Save, Sparkles, Trash2 } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { TableroVista } from "../componentes/Widget";
import { Aviso, avisar, Encabezado, Esqueleto, Insignia, Tarjeta, useDatos } from "../componentes/ui";

function Generador({ inicial }: { inicial: string }) {
  const { puede } = useSesion();
  const navegar = useNavigate();
  const { datos: catalogo } = useDatos<{ ejemplos: string[] }>("/api/analitica/catalogo");
  const [peticion, setPeticion] = useState(inicial);
  const [spec, setSpec] = useState<any>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const generar = async (texto = peticion) => {
    if (!texto.trim()) return;
    setPeticion(texto); setCargando(true); setError(""); setSpec(null);
    try { setSpec(await api("/api/tableros/generar", { cuerpo: { peticion: texto } })); }
    catch (e) { setError((e as ErrorApi).message); }
    finally { setCargando(false); }
  };
  useEffect(() => { if (inicial) generar(inicial); }, [inicial]);
  const guardar = async () => {
    const r: any = await api("/api/tableros", { cuerpo: { titulo: spec.titulo, spec, consulta_texto: peticion } });
    avisar("Tablero guardado en «Mis tableros».");
    navegar(`/tableros/${r.id}`);
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Tarjeta titulo={<><Sparkles size={18} color="#0080FF" style={{ verticalAlign: -3 }} /> Generar un tablero</>}
        ayuda="Escribe en tus palabras qué quieres ver. Nexo identifica la fuente oficial, la medida, el periodo y el desglose, y te muestra cómo lo entendió.">
        <form className="fila" onSubmit={(e) => { e.preventDefault(); generar(); }}>
          <input className="entrada" style={{ flex: 1, minWidth: 260 }} value={peticion} onChange={(e) => setPeticion(e.target.value)} placeholder="Ejemplo: precio de computadoras portátiles por mes en 2025" aria-label="Petición" />
          <button className="boton" disabled={cargando}><Sparkles /> {cargando ? "Generando…" : "Generar"}</button>
        </form>
        <div className="fila" style={{ marginTop: 10 }}>
          {(catalogo?.ejemplos ?? []).map((e) => <button key={e} className="chip" onClick={() => generar(e)}>{e}</button>)}
        </div>
      </Tarjeta>
      {error && <Aviso tono="alerta">{error}</Aviso>}
      {spec && (
        <div className="columna" style={{ gap: 12 }}>
          <div className="fila espaciado">
            <div className="fila"><b>Así lo entendí:</b>{spec.interpretacion.map((i: any, n: number) => <span key={n} className="chip fijo"><span className="suave">{i.tipo}:</span> <b>{i.valor}</b></span>)}</div>
            {puede("tableros:crear") && <button className="boton secundario" onClick={guardar}><Save /> Guardar tablero</button>}
          </div>
          <TableroVista spec={spec} />
        </div>
      )}
    </div>
  );
}

function Detalle({ id }: { id: string }) {
  const navegar = useNavigate();
  const { datos, error } = useDatos<any>(`/api/tableros/${id}`);
  if (error) return <Aviso tono="critico">{error}</Aviso>;
  if (!datos) return <Esqueleto alto={400} />;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado migas={<><Link to="/tableros">Tableros</Link> ›</>} titulo={datos.titulo}
        subtitulo={datos.consulta_texto ? <>Generado a partir de: «{datos.consulta_texto}»</> : datos.origen === "sistema" ? "Tablero base de tu rol" : "Tablero personal"}
        acciones={<>
          <button className="boton secundario" onClick={async () => { const r: any = await api(`/api/tableros/${id}/duplicar`, { metodo: "POST" }); avisar("Copia creada."); navegar(`/tableros/${r.id}`); }}><Copy /> Duplicar</button>
          {datos.propio && <button className="boton peligro" onClick={async () => { await api(`/api/tableros/${id}`, { metodo: "DELETE" }); avisar("Tablero eliminado."); navegar("/tableros"); }}><Trash2 /> Eliminar</button>}
        </>} />
      <TableroVista spec={datos.spec} />
    </div>
  );
}

export default function Tableros() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { datos: lista } = useDatos<any[]>(id ? null : "/api/tableros");
  if (id) return <Detalle id={id} />;
  const base = (lista ?? []).filter((t) => t.origen === "sistema");
  const propios = (lista ?? []).filter((t) => t.origen !== "sistema");
  return (
    <div className="columna" style={{ gap: 20 }}>
      <Encabezado titulo="Tableros generativos" subtitulo="Un tablero base por cada rol, tus tableros personales y la generación de tableros nuevos a partir de texto. Toda cifra viene de la capa semántica: fuentes oficiales, sin SQL y con secreto estadístico." />
      <Generador inicial={params.get("q") ?? ""} />
      <div className="rejilla">
        <div className="c6">
          <Tarjeta titulo="Tableros de tus roles">
            {base.map((t) => <Link key={t.id} to={`/tableros/${t.id}`} className="fila espaciado" style={{ padding: "10px 0", borderBottom: "1px solid #eef2f7", textDecoration: "none" }}><b>{t.titulo}</b><Insignia tono="info">{t.widgets} widgets</Insignia></Link>)}
          </Tarjeta>
        </div>
        <div className="c6">
          <Tarjeta titulo="Mis tableros">
            {propios.length === 0 && <p className="suave pequeno">Aún no guardas tableros. Genera uno arriba y pulsa «Guardar».</p>}
            {propios.map((t) => <Link key={t.id} to={`/tableros/${t.id}`} className="fila espaciado" style={{ padding: "10px 0", borderBottom: "1px solid #eef2f7", textDecoration: "none" }}><span><b>{t.titulo}</b><br /><span className="pequeno suave">{t.consulta_texto ?? "Personalizado"}</span></span><span className="pequeno suave">{fmt.relativo(t.actualizado_en)}</span></Link>)}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
