// Tableros: base por rol, propios, y creación a partir de una consulta escrita en español.
// La consulta está en las dos vistas; en «Resumen» los tableros muestran solo la cifra y la gráfica principal.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Copy, LayoutDashboard, Save, Search, Trash2 } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { TableroVista } from "../componentes/Widget";
import { Aviso, avisar, Encabezado, EsqueletoGrafica, EsqueletoTabla, Modal, Tarjeta, useDatos } from "../componentes/ui";
import { AccionesRapidas, BotonAyuda, EnPocasPalabras, PieResumen, SegunVista, useVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "Tableros con cifras oficiales: los preparados para su rol, los que usted guardó y los que Nexo arma a partir de una pregunta escrita con sus palabras.",
  datos: "La capa semántica de Nexo. Solo consulta las fuentes autorizadas para su rol (IPC, canasta básica, materiales de construcción, Censo 2018, proyecciones de población, compras públicas y precios de referencia, entre otras) y aplica el secreto estadístico. Cada gráfica cita su fuente.",
  pasos: [
    "Escriba su pregunta, por ejemplo «inflación interanual desde 2022», y pulse «Consultar».",
    "Revise «Así interpretó Nexo su consulta»: fuente, medida, periodo y desglose. Si no es lo que buscaba, reformúlela.",
    "Lea «Para interpretar bien» antes de usar una cifra.",
    "Si le sirve, pulse «Guardar tablero» y lo encontrará en «Mis tableros».",
  ],
  resumen: "La cifra principal y la gráfica más importante de cada tablero, con la nota de método clave.",
  completa: "Todos los elementos de cada tablero, la tabla de datos y todas las notas metodológicas.",
  terminos: [
    ["Capa semántica", "Catálogo que traduce una pregunta en una consulta sobre fuentes oficiales, con las medidas y desgloses permitidos."],
    ["Mediana", "El valor del medio cuando se ordenan los datos. No se deja afectar por valores extremos."],
    ["n", "Cantidad de registros detrás de cada cifra. Con pocos registros, la cifra es menos confiable."],
    ["Suprimido", "Cifra oculta porque tiene muy pocos casos y podría identificar a alguien (secreto estadístico)."],
    ["Interpretación", "Cómo entendió Nexo su pregunta: fuente, medida, periodo y desglose."],
  ],
};

function Generador({ inicial, maxEjemplos }: { inicial: string; maxEjemplos?: number }) {
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
  const ejemplos = (catalogo?.ejemplos ?? []).slice(0, maxEjemplos);
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Tarjeta titulo="Crear un tablero a partir de una consulta"
        ayuda="Escriba con sus palabras qué necesita ver. Nexo identifica la fuente oficial, la medida, el periodo y el desglose, y le muestra cómo interpretó la consulta antes de presentar las cifras.">
        <form className="consulta tarjeta" style={{ padding: "6px 6px 6px 14px", boxShadow: "none" }} data-recorrido="tableros-consulta" onSubmit={(e) => { e.preventDefault(); generar(); }}>
          <Search className="icono-lupa" size={20} />
          <input value={peticion} onChange={(e) => setPeticion(e.target.value)} placeholder="Por ejemplo: precio de computadoras portátiles por mes en 2025" aria-label="Consulta" autoComplete="off" />
          <button className="boton" disabled={cargando}>{cargando ? "Consultando…" : "Consultar"}</button>
        </form>
        {ejemplos.length > 0 && (
          <div className="fila pequeno" style={{ marginTop: 10, gap: 8 }}>
            <span className="suave">Ejemplos:</span>
            {ejemplos.map((e) => <button key={e} type="button" className="chip" onClick={() => generar(e)}>{e}</button>)}
          </div>
        )}
      </Tarjeta>
      {error && <Aviso tono="alerta">{error}</Aviso>}
      {cargando && <div className="rejilla"><div className="c6 tarjeta"><EsqueletoGrafica /></div><div className="c6 tarjeta"><EsqueletoTabla filas={6} /></div></div>}
      {spec && (
        <div className="columna aparecer" style={{ gap: 12 }}>
          <div className="tarjeta" style={{ padding: "12px 16px" }}>
            <div className="fila espaciado">
              <div className="fila" style={{ gap: 8 }}>
                <b className="pequeno">Así interpretó Nexo su consulta:</b>
                {spec.interpretacion.map((i: any, n: number) => <span key={n} className="chip fijo"><span className="suave">{i.tipo}:</span> <b>{i.valor}</b></span>)}
              </div>
              {puede("tableros:crear") && <button className="boton secundario" onClick={guardar}><Save /> Guardar tablero</button>}
            </div>
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
  const [confirmar, setConfirmar] = useState(false);
  if (error) return <Aviso tono="critico">{error}</Aviso>;
  if (!datos) return <div className="columna"><div className="esqueleto" style={{ height: 34, width: 320 }} /><div className="rejilla"><div className="c6 tarjeta"><EsqueletoGrafica /></div><div className="c6 tarjeta"><EsqueletoGrafica /></div></div></div>;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado migas={<><Link to="/tableros">Tableros</Link> ›</>} titulo={datos.titulo}
        subtitulo={datos.consulta_texto ? <>Creado a partir de la consulta: «{datos.consulta_texto}»</> : datos.origen === "sistema" ? "Tablero base de su rol" : "Tablero personal"}
        acciones={<>
          <BotonAyuda ayuda={AYUDA} />
          <button className="boton secundario" onClick={async () => { const r: any = await api(`/api/tableros/${id}/duplicar`, { metodo: "POST" }); avisar("Copia creada."); navegar(`/tableros/${r.id}`); }}><Copy /> Duplicar</button>
          {datos.propio && <button className="boton secundario" onClick={() => setConfirmar(true)}><Trash2 /> Eliminar</button>}
        </>} />
      <TableroVista spec={datos.spec} />
      {confirmar && (
        <Modal titulo="¿Eliminar este tablero?" onCerrar={() => setConfirmar(false)}>
          <div className="columna">
            <p>Se eliminará «{datos.titulo}» de sus tableros. Esta acción no se puede deshacer. Los datos oficiales no se ven afectados.</p>
            <div className="fila" style={{ justifyContent: "flex-end" }}>
              <button className="boton secundario" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button className="boton peligro" onClick={async () => { await api(`/api/tableros/${id}`, { metodo: "DELETE" }); avisar("Tablero eliminado."); navegar("/tableros"); }}><Trash2 /> Eliminar tablero</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Lista({ titulo, ayuda, filas, vacio }: { titulo: string; ayuda: string; filas: any[] | null; vacio: string }) {
  return (
    <Tarjeta titulo={titulo} ayuda={ayuda}>
      {!filas ? <EsqueletoTabla filas={3} /> : filas.length === 0 ? <p className="suave pequeno">{vacio}</p> : (
        <ul className="actividad">
          {filas.map((t) => (
            <li key={t.id} style={{ alignItems: "center" }}>
              <Link to={`/tableros/${t.id}`} className="fila espaciado" style={{ flex: 1, textDecoration: "none", color: "inherit" }}>
                <span><b>{t.titulo}</b><br /><span className="pequeno suave">{t.consulta_texto ?? `${t.widgets} elementos`}</span></span>
                <span className="fila pequeno suave" style={{ gap: 8 }}>{t.actualizado_en && fmt.relativo(t.actualizado_en)}<ArrowRight size={16} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

/** Tableros listos para abrir, como tarjetas grandes. */
function TarjetasTableros({ sobretitulo, titulo, filas, vacio }: { sobretitulo: string; titulo: string; filas: any[] | null; vacio: string }) {
  return (
    <section className="columna" style={{ gap: 10 }} aria-label={titulo}>
      <div><div className="sobretitulo">{sobretitulo}</div><h2 style={{ marginTop: 4 }}>{titulo}</h2></div>
      {!filas ? <div className="rejilla">{[0, 1, 2].map((i) => <div key={i} className="c4 tarjeta"><EsqueletoTabla filas={2} /></div>)}</div>
        : filas.length === 0 ? <p className="suave pequeno">{vacio}</p>
          : <AccionesRapidas acciones={filas.map((t) => ({
            titulo: t.titulo, icono: LayoutDashboard, ruta: `/tableros/${t.id}`,
            texto: t.consulta_texto ? `Consulta: «${t.consulta_texto}»` : `${fmt.numero(t.widgets)} elementos · actualizado ${fmt.relativo(t.actualizado_en)}`,
          }))} />}
    </section>
  );
}

export default function Tableros() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { esResumen } = useVista();
  const { datos: lista } = useDatos<any[]>(id ? null : "/api/tableros");
  if (id) return <Detalle id={id} />;
  const base = lista ? lista.filter((t) => t.origen === "sistema") : null;
  const propios = lista ? lista.filter((t) => t.origen !== "sistema") : null;
  const plural = (n: number, s: string, p: string) => `${fmt.numero(n)} ${n === 1 ? s : p}`;
  return (
    <div className="columna" style={{ gap: 20 }}>
      <Encabezado sobretitulo="Tableros" titulo="Tableros generativos"
        subtitulo="Consulte los tableros de su rol, guarde los suyos y cree tableros nuevos escribiendo lo que necesita. Toda cifra proviene de fuentes oficiales del INE y respeta el secreto estadístico."
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      {esResumen && (
        <EnPocasPalabras>
          Escriba lo que necesita ver y Nexo arma un tablero con cifras oficiales del INE, le muestra cómo entendió la pregunta y agrega las notas para
          interpretarlo bien.{base && base.length > 0 && <> Tiene <b>{plural(base.length, "tablero preparado", "tableros preparados")}</b> para su rol{propios && propios.length > 0 ? <> y {plural(propios.length, "guardado", "guardados")} por usted</> : null}.</>}
        </EnPocasPalabras>
      )}
      <Generador inicial={params.get("q") ?? ""} maxEjemplos={esResumen ? 4 : undefined} />
      <SegunVista
        resumen={<>
          <TarjetasTableros sobretitulo="Preparados para su rol" titulo="Tableros listos para usar" filas={base} vacio="Su rol no tiene tableros base." />
          {propios && propios.length > 0 && <TarjetasTableros sobretitulo="Guardados por usted" titulo="Mis tableros" filas={propios} vacio="" />}
          <PieResumen fuente="capa semántica de Nexo sobre las bases publicadas por el INE; cada gráfica cita su fuente" />
        </>}
        completa={(
          <div className="rejilla">
            <div className="c6"><Lista titulo="Tableros de sus roles" ayuda="Preparados para cada dirección del INE" filas={base} vacio="Su rol no tiene tableros base." /></div>
            <div className="c6"><Lista titulo="Mis tableros" ayuda="Los que usted guardó o duplicó" filas={propios} vacio="Aún no guarda tableros. Cree uno arriba y pulse «Guardar tablero»." /></div>
          </div>
        )}
      />
    </div>
  );
}
