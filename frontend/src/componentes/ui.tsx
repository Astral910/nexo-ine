// Componentes base de la interfaz (sin dependencias externas).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CircleCheck, CircleX, Info, Inbox, TriangleAlert, X } from "lucide-react";
import { api, ErrorApi } from "../api";

export function Tarjeta({ titulo, ayuda, acciones, children, className = "", estilo }: {
  titulo?: ReactNode; ayuda?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string; estilo?: React.CSSProperties;
}) {
  return (
    <section className={`tarjeta ${className}`} style={estilo}>
      {(titulo || acciones) && (
        <header>
          <div>
            {titulo && <h3>{titulo}</h3>}
            {ayuda && <div className="ayuda">{ayuda}</div>}
          </div>
          {acciones && <div className="fila">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Encabezado({ titulo, subtitulo, migas, acciones }: { titulo: ReactNode; subtitulo?: ReactNode; migas?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="encabezado">
      <div>
        {migas && <div className="migas">{migas}</div>}
        <h1>{titulo}</h1>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
      </div>
      {acciones && <div className="fila">{acciones}</div>}
    </div>
  );
}

export function Kpi({ etiqueta, valor, detalle, tono = "acento", icono }: {
  etiqueta: ReactNode; valor: ReactNode; detalle?: ReactNode; tono?: "acento" | "naranja" | "verde" | "morado" | "amarillo"; icono?: ReactNode;
}) {
  return (
    <div className={`tarjeta kpi ${tono}`}>
      <span className="etiqueta">{icono}{etiqueta}</span>
      <span className="valor">{valor}</span>
      {detalle && <span className="detalle">{detalle}</span>}
    </div>
  );
}

export function Insignia({ tono = "", children }: { tono?: string; children: ReactNode }) {
  return <span className={`insignia ${tono}`}>{children}</span>;
}

const TONOS_SEVERIDAD: Record<string, string> = {
  critica: "critico", alta: "critico", media: "alerta", baja: "info", info: "", ok: "exito", error: "critico",
  nueva: "alerta", en_revision: "info", confirmada: "critico", descartada: "exito", abierto: "alerta", resuelto: "exito",
  aceptado: "morado", mitigado: "exito", contenido: "info", cerrado: "", activo: "exito", pendiente_aprobacion: "alerta",
  pendiente_verificacion: "", rechazado: "critico", desactivado: "", entregada: "exito", en_curso: "info", denegado: "alerta",
};
export function Severidad({ valor }: { valor: string | null | undefined }) {
  if (!valor) return <Insignia>—</Insignia>;
  return <Insignia tono={TONOS_SEVERIDAD[valor] ?? ""}>{valor.replace(/_/g, " ")}</Insignia>;
}

export function Aviso({ tono = "info", children }: { tono?: "info" | "alerta" | "critico" | "exito"; children: ReactNode }) {
  const Icono = tono === "exito" ? CircleCheck : tono === "critico" ? CircleX : tono === "alerta" ? TriangleAlert : Info;
  return (
    <div className={`aviso ${tono}`} role={tono === "critico" ? "alert" : "status"}>
      <Icono aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Vacio({ children, icono }: { children: ReactNode; icono?: ReactNode }) {
  return <div className="vacio">{icono ?? <Inbox />}<div>{children}</div></div>;
}

export function Esqueleto({ alto = 120 }: { alto?: number }) {
  return <div className="esqueleto" style={{ height: alto }} aria-busy="true" aria-label="Cargando" />;
}

export function Modal({ titulo, onCerrar, children, ancho = false }: { titulo: ReactNode; onCerrar: () => void; children: ReactNode; ancho?: boolean }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={`modal ${ancho ? "ancho" : ""}`} role="dialog" aria-modal="true">
        <header>
          <h2>{titulo}</h2>
          <button className="boton fantasma icono" onClick={onCerrar} aria-label="Cerrar"><X /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Campo({ etiqueta, ayuda, error, children }: { etiqueta: string; ayuda?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label>{etiqueta}</label>
      {children}
      {ayuda && <span className="ayuda">{ayuda}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Pestanas<T extends string>({ opciones, activa, onCambio }: {
  opciones: { id: T; etiqueta: ReactNode }[]; activa: T; onCambio: (id: T) => void;
}) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === activa} className={o.id === activa ? "activa" : ""} onClick={() => onCambio(o.id)}>
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export interface Columna<F> {
  id: string;
  titulo: ReactNode;
  valor?: (f: F) => unknown;
  celda?: (f: F) => ReactNode;
  num?: boolean;
  ancho?: number;
}

export function Tabla<F>({ columnas, filas, onFila, vacio = "Sin datos", maximo }: {
  columnas: Columna<F>[]; filas: F[]; onFila?: (f: F) => void; vacio?: ReactNode; maximo?: number;
}) {
  const [orden, setOrden] = useState<{ id: string; asc: boolean } | null>(null);
  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const col = columnas.find((c) => c.id === orden.id);
    if (!col?.valor) return filas;
    return [...filas].sort((a, b) => {
      const va = col.valor!(a) as any, vb = col.valor!(b) as any;
      const r = va === vb ? 0 : va === null || va === undefined ? 1 : vb === null || vb === undefined ? -1 : va > vb ? 1 : -1;
      return orden.asc ? r : -r;
    });
  }, [filas, orden, columnas]);
  if (!filas.length) return <Vacio>{vacio}</Vacio>;
  const visibles = maximo ? ordenadas.slice(0, maximo) : ordenadas;
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.id} className={`${c.num ? "num" : ""} ${c.valor ? "ordenable" : ""}`} style={c.ancho ? { width: c.ancho } : undefined}
                onClick={() => c.valor && setOrden((o) => ({ id: c.id, asc: o?.id === c.id ? !o.asc : false }))}
                aria-sort={orden?.id === c.id ? (orden.asc ? "ascending" : "descending") : undefined}>
                {c.titulo}{orden?.id === c.id ? (orden.asc ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibles.map((f, i) => (
            <tr key={i} className={onFila ? "clicable" : ""} onClick={() => onFila?.(f)}>
              {columnas.map((c) => (
                <td key={c.id} className={c.num ? "num" : ""}>{c.celda ? c.celda(f) : String(c.valor?.(f) ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Progreso({ valor, color }: { valor: number; color?: string }) {
  return (
    <div className="progreso" role="progressbar" aria-valuenow={Math.round(valor)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.max(0, Math.min(100, valor))}%`, background: color }} />
    </div>
  );
}

export function Medidor({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  const color = valor >= 85 ? "#2f8f2f" : valor >= 65 ? "#0080ff" : valor >= 45 ? "#ff9f1a" : "#d92d20";
  return (
    <div className="medidor" style={{ background: `conic-gradient(${color} ${valor * 3.6}deg, #e8eef5 0)` }} aria-label={`${etiqueta}: ${valor} de 100`}>
      <div className="centro"><div><b>{valor}</b><div className="pequeno suave">{etiqueta}</div></div></div>
    </div>
  );
}

export function FuenteCita({ children }: { children: ReactNode }) {
  return <div className="fuente-cita">Fuente: {children}</div>;
}

/** Hook de datos: carga una ruta del API y expone estado, error y recarga. */
export function useDatos<T>(ruta: string | null, deps: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!!ruta);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!ruta) return;
    let vivo = true;
    setCargando(true);
    api<T>(ruta)
      .then((d) => vivo && (setDatos(d), setError(null)))
      .catch((e: ErrorApi) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta, version, ...deps]);
  return { datos, error, cargando, recargar: () => setVersion((v) => v + 1), setDatos };
}

/** Notificaciones breves en pantalla. */
let emisor: ((m: { texto: string; tono: string }) => void) | null = null;
export function avisar(texto: string, tono: "exito" | "critico" | "info" | "alerta" = "exito") {
  emisor?.({ texto, tono });
}
export function Avisos() {
  const [lista, setLista] = useState<{ id: number; texto: string; tono: string }[]>([]);
  useEffect(() => {
    emisor = (m) => {
      const id = Date.now() + Math.random();
      setLista((l) => [...l, { id, ...m }]);
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), 5000);
    };
    return () => { emisor = null; };
  }, []);
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 200, maxWidth: 420 }} aria-live="polite">
      {lista.map((m) => <Aviso key={m.id} tono={m.tono as any}>{m.texto}</Aviso>)}
    </div>
  );
}
