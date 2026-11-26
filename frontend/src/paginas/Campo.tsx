// Catálogo de campo: el Manual de Características del IPC como aplicación instalable en el teléfono institucional
// (propuesta de la DIEC). Se descarga sin cuenta (no lleva precios ni informantes) y queda guardado en el dispositivo
// para consultarlo sin conexión durante la recolección y la supervisión.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CloudOff, Download, RefreshCw, Search, Smartphone } from "lucide-react";
import { fmt } from "../api";

const CLAVE = "nexo.catalogo-campo.v1";
type Catalogo = { generado_en: string; total: number; fuente: string; articulos: any[] };

function leerGuardado(): Catalogo | null {
  try { const t = localStorage.getItem(CLAVE); return t ? JSON.parse(t) : null; } catch { return null; }
}
function guardar(c: Catalogo) {
  try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* sin almacenamiento: solo se usa en línea */ }
}
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Campo() {
  const [cat, setCat] = useState<Catalogo | null>(leerGuardado);
  const [estado, setEstado] = useState<"cargando" | "en-linea" | "sin-conexion" | "sin-sesion">("cargando");
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [instalar, setInstalar] = useState<any>(null);

  const descargar = async () => {
    setEstado("cargando");
    try {
      const r = await fetch("/api/publico/catalogo-campo", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (r.status === 401 || r.status === 403) { setEstado("sin-sesion"); return; }
      if (!r.ok) throw new Error(String(r.status));
      const c = (await r.json()) as Catalogo;
      guardar(c); setCat(c); setEstado("en-linea");
    } catch {
      setEstado("sin-conexion");
    }
  };
  useEffect(() => {
    descargar();
    const alInstalar = (e: Event) => { e.preventDefault(); setInstalar(e); };
    window.addEventListener("beforeinstallprompt", alInstalar);
    return () => window.removeEventListener("beforeinstallprompt", alInstalar);
  }, []);

  const filtrados = useMemo(() => {
    const lista = cat?.articulos ?? [];
    const f = sinTildes(texto.trim());
    if (!f) return lista;
    return lista.filter((a) => sinTildes(a.articulo).includes(f) || a.codigo.startsWith(f));
  }, [cat, texto]);

  return (
    <div className="campo-app">
      {/* Cabecera y buscador quedan fijos arriba: el buscador está a la mano aunque se baje por la lista. */}
      <div className="campo-fijo">
      <header className="campo-cabecera">
        <Link to="/" className="campo-volver" aria-label="Volver a Nexo"><ArrowLeft size={20} /></Link>
        <div>
          <div className="campo-titulo">Catálogo de campo</div>
          <div className="campo-sub">Artículos del IPC · INE</div>
        </div>
        <button className="campo-icono" onClick={descargar} aria-label="Actualizar catálogo" title="Actualizar"><RefreshCw size={18} /></button>
      </header>
      <label className="campo-buscar">
        <Search size={18} />
        <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar artículo o código" inputMode="search" />
      </label>
      </div>

      <div className="campo-estado" data-estado={estado}>
        {estado === "cargando" && "Actualizando…"}
        {estado === "en-linea" && cat && <>Guardado en este teléfono · {fmt.numero(cat.total)} artículos · {fmt.fechaHora(cat.generado_en)}</>}
        {estado === "sin-conexion" && (cat ? <><CloudOff size={14} /> Sin conexión: usando la copia guardada del {fmt.fechaHora(cat.generado_en)}</> : <><CloudOff size={14} /> Sin conexión y sin copia guardada. Ábralo una vez con internet.</>)}
        {estado === "sin-sesion" && <>Para descargar o actualizar el catálogo <Link to="/login">inicie sesión</Link>{cat && <> · usando la copia guardada</>}</>}
      </div>

      {instalar && (
        <button className="campo-instalar" onClick={async () => { instalar.prompt(); await instalar.userChoice; setInstalar(null); }}>
          <Download size={18} /> Instalar en este teléfono
        </button>
      )}

      {!cat && estado !== "cargando" && <p className="campo-vacio"><Smartphone size={28} /><br />El catálogo se descarga la primera vez que abre esta página con internet.</p>}

      <ul className="campo-lista">
        {filtrados.slice(0, 120).map((a) => (
          <li key={a.codigo} className={abierto === a.codigo ? "abierto" : ""}>
            <button onClick={() => setAbierto(abierto === a.codigo ? null : a.codigo)}>
              <span className="campo-art">{a.articulo}</span>
              <span className="campo-cod">{a.codigo}</span>
            </button>
            {abierto === a.codigo && (
              <dl className="campo-detalle">
                <dt>Presentación más observada</dt><dd>{a.presentacion === null ? "—" : fmt.numero(a.presentacion, 2)}</dd>
                {a.otras_presentaciones.length > 0 && <><dt>Otras presentaciones</dt><dd>{a.otras_presentaciones.map((p: number) => fmt.numero(p, 2)).join(" · ")}</dd></>}
                <dt>Cobertura</dt><dd>{a.regiones} regiones · {a.departamentos} departamentos</dd>
                <dt>Precios observados</dt><dd>{fmt.numero(a.observaciones)} · último periodo {a.ultimo_periodo}</dd>
              </dl>
            )}
          </li>
        ))}
      </ul>
      {filtrados.length > 120 && <p className="campo-vacio">Mostrando 120 de {fmt.numero(filtrados.length)}. Escriba para filtrar.</p>}
      <footer className="campo-pie">
        Fuente: {cat?.fuente ?? "Instituto Nacional de Estadística (INE)"}. Las presentaciones están en la unidad de la cantidad recolectada.
        Prototipo del Datatón INE 2026; no es un sistema oficial.
      </footer>
    </div>
  );
}
