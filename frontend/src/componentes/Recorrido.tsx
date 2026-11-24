// Recorrido guiado: pasos cortos que llevan a la persona por las pantallas clave, resaltan el elemento del que se
// habla y lo explican en una o dos frases. Funciona dentro de Nexo y en Nexo Abierto (sin cuenta). Se maneja con los
// botones o con el teclado (flechas, Enter y Escape) y respeta la preferencia de movimiento reducido.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useSesion } from "../auth";
import { movimientoReducido } from "./Grafica";
import { avisar } from "./ui";
import { useVista, type TipoVista } from "./vista";

export interface PasoRecorrido {
  /** Pantalla a la que se va antes de mostrar el paso (con su consulta, si aplica). */
  ruta?: string;
  /** Valor del atributo data-recorrido del elemento que se resalta. Sin ancla, la tarjeta aparece al centro. */
  ancla?: string;
  titulo: string;
  texto: ReactNode;
  pruebe?: ReactNode;
  vista?: TipoVista;
  /** El paso solo aparece si la persona tiene alguno de estos permisos. */
  permiso?: string[];
}

export interface DefRecorrido {
  id: string;
  titulo: string;
  duracion: string;
  descripcion: string;
  pasos: PasoRecorrido[];
  alTerminar?: string;
}

export const RECORRIDOS: Record<string, DefRecorrido> = {
  general: {
    id: "general", titulo: "Nexo en 3 minutos", duracion: "3 minutos", alTerminar: "/",
    descripcion: "Lo esencial de la plataforma en pasos cortos: qué hace cada módulo y por qué le sirve al INE.",
    pasos: [
      { titulo: "Nexo en 3 minutos", texto: "Le mostraremos lo esencial en pasos cortos. Puede salir cuando quiera y repetirlo desde «Guía de uso».",
        pruebe: "Avance con el botón «Siguiente» o con la flecha derecha del teclado." },
      { ruta: "/", ancla: "vista", vista: "resumen", titulo: "Dos vistas en cada pantalla",
        texto: "«Resumen» muestra lo esencial con explicaciones sencillas. «Completa» muestra todas las tablas, filtros y notas de método.",
        pruebe: "Cambie de vista cuando quiera: Nexo recuerda su preferencia." },
      { ruta: "/", ancla: "inicio-atencion", vista: "resumen", permiso: ["centro:ver"], titulo: "Lo que requiere su atención",
        texto: "Al entrar, Nexo le dice qué está pendiente según su rol: alertas de precios, solicitudes por vencer y cuentas por aprobar." },
      { ruta: "/precios", ancla: "precios-proceso", vista: "resumen", permiso: ["dpir:ver"], titulo: "Precios de Referencia",
        texto: "Los 6 pasos de la DPIR en una sola pantalla. La investigación de mercado, que hoy se hace a mano, toma segundos con 214 mil compras públicas." },
      { ruta: "/precios", ancla: "precios-consulta", vista: "resumen", permiso: ["dpir:ver"], titulo: "¿Cuánto cuesta un producto?",
        texto: "Escriba un producto y vea cuánto pagó el Estado, con la medida que recomienda la DPIR cuando los precios varían mucho.",
        pruebe: "Escriba «papel bond» y pulse «Consultar»." },
      { ruta: "/indices/alertas", ancla: "alertas-resumen", vista: "resumen", permiso: ["indices:ver"], titulo: "Alertas de precios",
        texto: "De cada 100 precios que recolecta el INE para el IPC, unos 3 o 4 se marcan para revisión. El equipo revisa esos, no todos." },
      { ruta: "/territorio", ancla: "territorio-mapa", vista: "resumen", permiso: ["territorio:ver", "tableros:ver"], titulo: "El país en datos",
        texto: "Cada punto es uno de los 20 mil lugares poblados del Censo 2018. Busque un municipio y obtenga su ficha al instante." },
      { ruta: "/tableros", ancla: "tableros-consulta", vista: "resumen", permiso: ["tableros:ver"], titulo: "Pregunte con sus palabras",
        texto: "Escriba lo que necesita y Nexo arma un tablero con datos oficiales, le muestra cómo entendió la pregunta y agrega las notas de método.",
        pruebe: "Por ejemplo: «inflación interanual desde 2022»." },
      { ruta: "/automatizaciones", ancla: "auto-resumen", vista: "resumen", permiso: ["automatizaciones:ver"], titulo: "Trabajo que se hace solo",
        texto: "Revisiones, recordatorios y alertas que corren sin que nadie las ejecute. Cada una explica qué hace y cómo le fue la última vez." },
      { ruta: "/seguridad", ancla: "seguridad-medidor", vista: "resumen", permiso: ["seguridad:ver"], titulo: "Seguridad que se revisa sola",
        texto: "Un agente revisa la plataforma cada 30 minutos y explica qué corregir, con referencias a las normas que aplican." },
      { ruta: "/abierto", ancla: "abierto-entradas", titulo: "Nexo Abierto, sin cuenta",
        texto: "La misma información oficial para la ciudadanía, periodistas, municipalidades y compradores públicos: precios, municipios y preguntas a los datos." },
      { titulo: "Listo", texto: "Ya conoce lo esencial. Puede repetir este recorrido desde «Guía de uso» y abrir «Cómo leer esta pantalla» en cualquier módulo." },
    ],
  },
  abierto: {
    id: "abierto", titulo: "Nexo Abierto en 1 minuto", duracion: "1 minuto", alTerminar: "/abierto",
    descripcion: "Cómo usar los datos del INE sin cuenta: precios, municipios y preguntas.",
    pasos: [
      { ruta: "/abierto", ancla: "abierto-entradas", titulo: "Datos del INE para todos",
        texto: "Tres maneras de usar la información oficial sin crear una cuenta. Todo lo que ve aquí ya es público." },
      { ruta: "/abierto/precios?q=computadora%20port%C3%A1til", ancla: "abierto-rango", vista: "resumen", titulo: "¿Cuánto debería costar?",
        texto: "La barra muestra cuánto pagó el Estado por un producto: dónde cae la mayoría de las compras y cuál fue el precio del medio." },
      { ruta: "/abierto/precios?q=computadora%20port%C3%A1til", ancla: "abierto-mmm", vista: "resumen", titulo: "Media, mediana y moda",
        texto: "Las tres medidas que usa la Dirección de Precios de Referencia, explicadas con un ejemplo de cinco proveedores." },
      { ruta: "/abierto/municipios/0901", ancla: "abierto-ficha", titulo: "Mi municipio en datos",
        texto: "Población, crecimiento y lugares poblados de cualquiera de los 340 municipios, con la fuente lista para citar." },
      { ruta: "/abierto/preguntar?q=Inflaci%C3%B3n%20interanual%20desde%202022", ancla: "abierto-pregunta", titulo: "Pregunte a los datos",
        texto: "Escriba una pregunta y obtenga un tablero con cifras oficiales, cómo se entendió su pregunta y las notas para interpretarlo bien." },
      { ruta: "/abierto", ancla: "abierto-buen-uso", titulo: "Use bien los datos",
        texto: "Cite al INE y la fecha de descarga, y no compare cifras que miden cosas distintas. Cada sección enlaza al archivo original." },
    ],
  },
};

interface ContextoRecorrido { iniciar: (id: string) => void; activo: boolean }
const Contexto = createContext<ContextoRecorrido>({ iniciar: () => undefined, activo: false });
export const useRecorrido = () => useContext(Contexto);

function coincide(ruta: string, pathname: string, search: string) {
  const destino = new URL(ruta, window.location.origin);
  if (destino.pathname !== pathname) return false;
  if (!destino.search) return true;
  const a = new URLSearchParams(destino.search), b = new URLSearchParams(search);
  return [...a.entries()].every(([k, v]) => b.get(k) === v);
}

export function ProveedorRecorrido({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ id: string; indice: number } | null>(null);
  const { puede, usuario } = useSesion();
  const navegar = useNavigate();
  const def = estado ? RECORRIDOS[estado.id] : null;
  const pasos = useMemo(() => (def ? def.pasos.filter((p) => !p.permiso || puede(...p.permiso)) : []), [def, puede]);
  const iniciar = useCallback((id: string) => { if (RECORRIDOS[id]) setEstado({ id, indice: 0 }); }, []);
  const salir = useCallback((terminado: boolean) => {
    if (!estado || !def) return;
    localStorage.setItem(`nexo:recorrido:${estado.id}`, terminado ? "visto" : "interrumpido");
    setEstado(null);
    if (terminado) {
      avisar("Recorrido terminado. Puede repetirlo desde «Guía de uso».", "exito");
      if (def.alTerminar && (usuario || def.alTerminar.startsWith("/abierto"))) navegar(def.alTerminar);
    }
  }, [estado, def, navegar, usuario]);
  return (
    <Contexto.Provider value={{ iniciar, activo: !!estado }}>
      {children}
      {estado && def && pasos.length > 0 && (
        <Superposicion def={def} pasos={pasos} indice={Math.min(estado.indice, pasos.length - 1)}
          ir={(i) => setEstado({ id: estado.id, indice: Math.max(0, Math.min(i, pasos.length - 1)) })} salir={salir} />
      )}
    </Contexto.Provider>
  );
}

type Caja = { top: number; left: number; width: number; height: number };

function Superposicion({ def, pasos, indice, ir, salir }: {
  def: DefRecorrido; pasos: PasoRecorrido[]; indice: number; ir: (i: number) => void; salir: (terminado: boolean) => void;
}) {
  const paso = pasos[indice];
  const ultimo = indice === pasos.length - 1;
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const { cambiar } = useVista();
  const objetivo = useRef<HTMLElement | null>(null);
  const navegadoEn = useRef<number>(-1);
  const tarjeta = useRef<HTMLDivElement>(null);
  const siguienteRef = useRef<HTMLButtonElement>(null);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [posicion, setPosicion] = useState<{ top: number; left: number } | null>(null);
  const reducido = movimientoReducido();

  // 1. Vista y pantalla del paso; 2. buscar el elemento que se resalta (el contenido puede tardar en cargar).
  useEffect(() => {
    objetivo.current = null;
    setCaja(null);
    setBuscando(!!paso.ancla);
    if (paso.vista) cambiar(paso.vista);
    if (paso.ruta && !coincide(paso.ruta, ubicacion.pathname, ubicacion.search) && navegadoEn.current !== indice) {
      navegadoEn.current = indice;
      navegar(paso.ruta);
      return;
    }
    if (!paso.ancla) return;
    let vivo = true, intentos = 0, t = 0;
    const buscar = () => {
      if (!vivo) return;
      const el = document.querySelector<HTMLElement>(`[data-recorrido="${paso.ancla}"]`);
      if (el && el.getBoundingClientRect().height > 0) {
        objetivo.current = el;
        el.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? "start" : "center", behavior: reducido ? "auto" : "smooth" });
        setBuscando(false);
        return;
      }
      if (++intentos < 60) t = window.setTimeout(buscar, 100);
      else setBuscando(false);
    };
    t = window.setTimeout(buscar, 80);
    return () => { vivo = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, ubicacion.pathname, ubicacion.search]);

  // Sigue la posición del elemento (desplazamiento, cambios de tamaño, contenido que termina de cargar). Si la
  // pantalla reemplaza el elemento (por ejemplo, el esqueleto de carga por el contenido real), lo vuelve a buscar.
  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      let el = objetivo.current;
      if ((!el || !document.contains(el)) && paso.ancla && !buscando) {
        el = document.querySelector<HTMLElement>(`[data-recorrido="${paso.ancla}"]`);
        objetivo.current = el;
      }
      if (el && document.contains(el)) {
        const r = el.getBoundingClientRect();
        setCaja((a) => (a && Math.abs(a.top - r.top) < 0.5 && Math.abs(a.left - r.left) < 0.5 && Math.abs(a.width - r.width) < 0.5
          && Math.abs(a.height - r.height) < 0.5 ? a : { top: r.top, left: r.left, width: r.width, height: r.height }));
      } else setCaja((a) => (a ? null : a));
      cuadro = requestAnimationFrame(medir);
    };
    cuadro = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(cuadro);
  }, [buscando, indice]);

  // Ubica la tarjeta junto al elemento sin salirse de la ventana (abajo, arriba, a un lado o en la esquina).
  useLayoutEffect(() => {
    const t = tarjeta.current;
    if (!t) return;
    const vw = window.innerWidth, vh = window.innerHeight, w = t.offsetWidth, h = t.offsetHeight, m = 14;
    if (!caja || vw < 720) { setPosicion(null); return; }
    const izq = Math.min(Math.max(12, caja.left), vw - w - 12);
    if (caja.top + caja.height + m + h < vh - 8) setPosicion({ top: caja.top + caja.height + m, left: izq });
    else if (caja.top - m - h > 8) setPosicion({ top: caja.top - m - h, left: izq });
    else if (caja.left + caja.width + m + w < vw - 8) setPosicion({ top: Math.min(Math.max(12, caja.top), vh - h - 12), left: caja.left + caja.width + m });
    else if (caja.left - m - w > 8) setPosicion({ top: Math.min(Math.max(12, caja.top), vh - h - 12), left: caja.left - m - w });
    else setPosicion({ top: vh - h - 16, left: vw - w - 16 });
  }, [caja, indice]);

  useEffect(() => { siguienteRef.current?.focus({ preventScroll: true }); }, [indice]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const destino = e.target as HTMLElement | null;
      const escribiendo = destino && (["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName) || destino.isContentEditable);
      if (e.key === "Escape") { e.preventDefault(); salir(false); }
      else if (escribiendo) return;
      else if (e.key === "ArrowRight") { e.preventDefault(); if (ultimo) salir(true); else ir(indice + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ir(indice - 1); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [indice, ultimo, ir, salir]);

  const margen = 6;
  const centrada = !caja && !buscando;
  return (
    <div className="recorrido" aria-live="polite">
      {caja ? (
        <div className="recorrido-foco" aria-hidden style={{ top: caja.top - margen, left: caja.left - margen, width: caja.width + margen * 2, height: caja.height + margen * 2 }} />
      ) : <div className="recorrido-velo" aria-hidden />}
      <div ref={tarjeta} className={`recorrido-tarjeta ${centrada ? "centrada" : ""} ${posicion ? "anclada" : ""}`} role="dialog" aria-modal="false"
        aria-labelledby="recorrido-titulo" style={posicion ? { top: posicion.top, left: posicion.left } : undefined}>
        <div className="fila espaciado" style={{ gap: 8 }}>
          <span className="sobretitulo">{def.titulo} · paso {indice + 1} de {pasos.length}</span>
          <button type="button" className="boton fantasma pequeno icono" onClick={() => salir(false)} aria-label="Salir del recorrido"><X /></button>
        </div>
        <div className="recorrido-avance" aria-hidden><span style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} /></div>
        <h2 id="recorrido-titulo">{paso.titulo}</h2>
        <p>{paso.texto}</p>
        {paso.pruebe && <p className="recorrido-pruebe"><b>Pruebe:</b> {paso.pruebe}</p>}
        {buscando && paso.ancla && <p className="pequeno suave">Abriendo la pantalla…</p>}
        <div className="fila espaciado" style={{ marginTop: 4 }}>
          <button type="button" className="boton fantasma pequeno" onClick={() => salir(false)}>Salir</button>
          <div className="fila" style={{ gap: 8 }}>
            {indice > 0 && <button type="button" className="boton secundario" onClick={() => ir(indice - 1)}><ArrowLeft /> Anterior</button>}
            <button ref={siguienteRef} type="button" className="boton" onClick={() => (ultimo ? salir(true) : ir(indice + 1))}>
              {ultimo ? "Terminar" : <>Siguiente <ArrowRight /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
