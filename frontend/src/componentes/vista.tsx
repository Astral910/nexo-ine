// Dos maneras de ver cada pantalla: «Resumen» (lo esencial, en lenguaje sencillo, para quien decide o no es experto)
// y «Completa» (todas las tablas, filtros y notas de método, para quien analiza). La preferencia se recuerda en el
// navegador. Aquí también viven las piezas con las que se arma cada resumen y la ayuda «Cómo leer esta pantalla».
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, CircleCheck, CircleHelp, CircleX, Info } from "lucide-react";
import { fmt } from "../api";
import { Modal, NumeroAnimado } from "./ui";

export type TipoVista = "resumen" | "completa";
const CLAVE = "nexo:vista";

interface ContextoVista { vista: TipoVista; cambiar: (v: TipoVista) => void }
const Contexto = createContext<ContextoVista>({ vista: "resumen", cambiar: () => undefined });

export function ProveedorVista({ children }: { children: ReactNode }) {
  const [vista, setVista] = useState<TipoVista>(() => (localStorage.getItem(CLAVE) === "completa" ? "completa" : "resumen"));
  const cambiar = useCallback((v: TipoVista) => { setVista(v); localStorage.setItem(CLAVE, v); }, []);
  useEffect(() => { document.documentElement.dataset.vista = vista; }, [vista]);
  return <Contexto.Provider value={{ vista, cambiar }}>{children}</Contexto.Provider>;
}

export function useVista() {
  const c = useContext(Contexto);
  return { ...c, esResumen: c.vista === "resumen" };
}

/** Interruptor de la barra superior. El indicador se desliza entre las dos opciones. */
export function SelectorVista() {
  const { vista, cambiar } = useVista();
  return (
    <div className="selector-vista" role="radiogroup" aria-label="Vista de las pantallas" data-recorrido="vista" data-valor={vista}>
      <span className="pulgar" aria-hidden />
      <button type="button" role="radio" aria-checked={vista === "resumen"} onClick={() => cambiar("resumen")} title="Lo esencial, explicado en lenguaje sencillo">Resumen</button>
      <button type="button" role="radio" aria-checked={vista === "completa"} onClick={() => cambiar("completa")} title="Todas las tablas, filtros y notas de método">Completa</button>
    </div>
  );
}

/** Muestra una u otra vista; al cambiar, el contenido entra con una transición suave. */
export function SegunVista({ resumen, completa }: { resumen: ReactNode; completa: ReactNode }) {
  const { vista } = useVista();
  return <div key={vista} className="vista-contenido">{vista === "resumen" ? resumen : completa}</div>;
}

// ---------------------------------------------------------------------------------------------- Ayuda de pantalla

export interface AyudaPantalla {
  titulo?: string;
  /** Qué muestra la pantalla, en una o dos frases. */
  que: ReactNode;
  /** De dónde salen los datos (fuente oficial, fecha, método). */
  datos: ReactNode;
  /** Qué puede hacer aquí, en pasos cortos. */
  pasos?: ReactNode[];
  /** Qué ve en cada vista. */
  resumen?: ReactNode;
  completa?: ReactNode;
  /** Palabras técnicas con su explicación sencilla. */
  terminos?: [string, ReactNode][];
}

/** Botón «Cómo leer esta pantalla»: explica la pantalla para que cualquiera pueda usarla o presentarla. */
export function BotonAyuda({ ayuda, etiqueta = "Cómo leer esta pantalla" }: { ayuda: AyudaPantalla; etiqueta?: string }) {
  const [abierta, setAbierta] = useState(false);
  const { cambiar } = useVista();
  return (
    <>
      <button type="button" className="boton secundario" onClick={() => setAbierta(true)} data-recorrido="ayuda"><CircleHelp /> {etiqueta}</button>
      {abierta && (
        <Modal titulo={ayuda.titulo ?? "Cómo leer esta pantalla"} onCerrar={() => setAbierta(false)} ancho>
          <div className="ayuda-pantalla">
            <div className="ayuda-columnas">
              <section>
                <h3>Qué muestra</h3>
                <p>{ayuda.que}</p>
                <h3>De dónde salen los datos</h3>
                <p>{ayuda.datos}</p>
              </section>
              {ayuda.pasos && ayuda.pasos.length > 0 && (
                <section>
                  <h3>Qué puede hacer aquí</h3>
                  <ol className="ayuda-pasos">{ayuda.pasos.map((p, i) => <li key={i}><span className="numero">{i + 1}</span><span>{p}</span></li>)}</ol>
                </section>
              )}
            </div>
            {(ayuda.resumen || ayuda.completa) && (
              <section className="ayuda-vistas">
                <div><b>Vista Resumen</b><p>{ayuda.resumen ?? "Lo esencial en pocas cifras, cada una con su explicación."}</p>
                  <button type="button" className="boton secundario pequeno" onClick={() => { cambiar("resumen"); setAbierta(false); }}>Ver en Resumen</button></div>
                <div><b>Vista Completa</b><p>{ayuda.completa ?? "Todas las tablas, filtros y notas de método."}</p>
                  <button type="button" className="boton secundario pequeno" onClick={() => { cambiar("completa"); setAbierta(false); }}>Ver en Completa</button></div>
              </section>
            )}
            {ayuda.terminos && ayuda.terminos.length > 0 && (
              <section>
                <h3>Palabras que conviene conocer</h3>
                <dl className="glosario">{ayuda.terminos.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
              </section>
            )}
            <div className="fila" style={{ justifyContent: "flex-end" }}><button type="button" className="boton" onClick={() => setAbierta(false)}>Entendido</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------- Piezas del resumen

/** Frase destacada al inicio de un resumen: la idea principal de la pantalla. */
export function EnPocasPalabras({ children, titulo = "En pocas palabras", ancla }: { children: ReactNode; titulo?: string; ancla?: string }) {
  return (
    <section className="en-pocas" aria-label={titulo} data-recorrido={ancla}>
      <span className="sobretitulo">{titulo}</span>
      <div className="frase">{children}</div>
    </section>
  );
}

/** Cifra grande con lo que significa en una frase sencilla y, si aplica, a dónde ir para actuar. */
export function CifraClara({ etiqueta, valor, numero, formato, significa, detalle, icono, tono = "acento", ir, ancla }: {
  etiqueta: ReactNode; valor?: ReactNode; numero?: number | null; formato?: (v: number) => string; significa?: ReactNode;
  detalle?: ReactNode; icono?: ReactNode; tono?: "acento" | "naranja" | "verde" | "morado" | "amarillo";
  ir?: { texto: string; ruta: string }; ancla?: string;
}) {
  return (
    <div className="tarjeta cifra-clara" data-tono={tono} data-recorrido={ancla}>
      <div className="cifra-cabeza">{icono && <span className="kpi-icono">{icono}</span>}<span className="etiqueta">{etiqueta}</span></div>
      <div className="cifra-valor">{numero !== undefined && numero !== null && formato ? <NumeroAnimado valor={numero} formato={formato} /> : valor ?? "—"}</div>
      {detalle && <div className="cifra-detalle">{detalle}</div>}
      {significa && <p className="cifra-significa">{significa}</p>}
      {ir && <Link className="cifra-ir" to={ir.ruta}>{ir.texto} <ArrowRight size={15} /></Link>}
    </div>
  );
}

export interface ElementoLista {
  estado: "ok" | "atencion" | "critico" | "info";
  titulo: ReactNode;
  texto?: ReactNode;
  accion?: ReactNode;
}

/** Lista en lenguaje sencillo con un estado claro por renglón (bien, atención, grave o informativo). */
export function ListaSimple({ elementos, vacio = "Nada que mostrar." }: { elementos: ElementoLista[]; vacio?: ReactNode }) {
  if (!elementos.length) return <p className="suave pequeno">{vacio}</p>;
  const ICONOS = { ok: CircleCheck, atencion: CircleAlert, critico: CircleX, info: Info };
  const NOMBRES = { ok: "Bien", atencion: "Atención", critico: "Urgente", info: "Información" };
  return (
    <ul className="lista-simple">
      {elementos.map((e, i) => {
        const Icono = ICONOS[e.estado];
        return (
          <li key={i} data-estado={e.estado}>
            <Icono aria-label={NOMBRES[e.estado]} />
            <div className="texto"><div className="titulo">{e.titulo}</div>{e.texto && <div className="pequeno suave">{e.texto}</div>}</div>
            {e.accion && <div className="accion">{e.accion}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/** Etapas de un proceso con cuántos casos hay en cada una. */
export function PasosSimples({ pasos, ancla }: {
  pasos: { titulo: string; cifra?: ReactNode; detalle?: ReactNode; estado?: "hecho" | "actual" | "pendiente" }[]; ancla?: string;
}) {
  return (
    <ol className="pasos-simples" data-recorrido={ancla} style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
      {pasos.map((p, i) => (
        <li key={p.titulo} data-estado={p.estado ?? "pendiente"}>
          <span className="numero">{p.estado === "hecho" ? <CircleCheck size={16} aria-label="Hecho" /> : i + 1}</span>
          <span className="titulo">{p.titulo}</span>
          {p.cifra !== undefined && <span className="cifra">{p.cifra}</span>}
          {p.detalle && <span className="pequeno suave">{p.detalle}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Accesos grandes a lo que más se hace en la pantalla. */
export function AccionesRapidas({ acciones }: {
  acciones: { titulo: string; texto?: ReactNode; ruta?: string; onClick?: () => void; icono?: any }[];
}) {
  return (
    <div className="rejilla escalonada">
      {acciones.map((a) => {
        const contenido = (
          <>
            {a.icono && <span className="icono-modulo"><a.icono size={20} /></span>}
            <div style={{ minWidth: 0 }}><h3>{a.titulo}</h3>{a.texto && <p className="pequeno suave">{a.texto}</p>}</div>
            <ArrowRight className="ir" size={18} />
          </>
        );
        return a.ruta
          ? <Link key={a.titulo} to={a.ruta} className="c4 tarjeta modulo">{contenido}</Link>
          : <button key={a.titulo} type="button" onClick={a.onClick} className="c4 tarjeta modulo interactiva" style={{ textAlign: "left", font: "inherit" }}>{contenido}</button>;
      })}
    </div>
  );
}

/** Cierre de cada resumen: la fuente y el paso a la vista completa. */
export function PieResumen({ fuente, children }: { fuente?: ReactNode; children?: ReactNode }) {
  const { cambiar } = useVista();
  return (
    <div className="pie-resumen">
      <div className="pequeno suave">{fuente && <>Fuente: {fuente}. </>}{children}</div>
      <button type="button" className="boton secundario" onClick={() => { cambiar("completa"); window.scrollTo({ top: 0 }); }}>
        Ver la pantalla completa <ArrowRight />
      </button>
    </div>
  );
}

/**
 * Rango de precios: dónde cae el 80 % de los casos (P10 a P90), la mitad central (P25 a P75) y la mediana.
 * Se dibuja sin librerías para que sea nítido y accesible; la descripción completa va en texto para lectores de pantalla.
 */
export function RangoPrecios({ p10, p25, mediana, p75, p90, ancla, formato = (v: number) => fmt.moneda(v, v >= 1000 ? 0 : 2) }: {
  p10: number; p25: number; mediana: number; p75: number; p90: number; ancla?: string; formato?: (v: number) => string;
}) {
  const lo = p10 - (p90 - p10) * 0.06, hi = p90 + (p90 - p10) * 0.06;
  const pos = (v: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50);
  const descripcion = `El 80 % de los casos está entre ${formato(p10)} y ${formato(p90)}. La mitad central, entre ${formato(p25)} y ${formato(p75)}. La mediana es ${formato(mediana)}.`;
  return (
    <figure className="rango-precios" data-recorrido={ancla} aria-label={descripcion}>
      <div className="pista" aria-hidden>
        <span className="extremos" style={{ left: `${pos(p10)}%`, width: `${pos(p90) - pos(p10)}%` }} />
        <span className="central" style={{ left: `${pos(p25)}%`, width: `${Math.max(1, pos(p75) - pos(p25))}%` }} />
        <span className="mediana" style={{ left: `${pos(mediana)}%` }} />
      </div>
      <div className="marcas" aria-hidden>
        <span style={{ left: `${pos(p10)}%` }}><b>{formato(p10)}</b>10 % más barato</span>
        <span className="arriba" style={{ left: `${pos(mediana)}%` }}>Mediana <b>{formato(mediana)}</b></span>
        <span style={{ left: `${pos(p90)}%` }}><b>{formato(p90)}</b>10 % más caro</span>
      </div>
      <figcaption className="pequeno suave">{descripcion}</figcaption>
    </figure>
  );
}
