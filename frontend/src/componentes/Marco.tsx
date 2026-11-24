// Estructura principal: barra lateral flotante de vidrio (colapsable, con indicador animado y contadores de
// pendientes), barra superior con ruta y búsqueda (Ctrl+K), notificaciones, tamaño de letra y guía de bienvenida.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, ChevronDown, ChevronRight, ChevronsUpDown, CircleHelp, Database, FileCheck2, Gavel, House, LayoutDashboard, Lock, LogOut, Map,
  Menu, PanelLeftClose, PanelLeftOpen, ScrollText, Search, Server, ShieldCheck, Tags, TrendingUp, Type, User, Users, Wheat, Workflow,
} from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { BarraCarga, Insignia, Modal } from "./ui";

type Item = { ruta: string; texto: string; icono: any; permiso: string[]; soloSin?: string; cuenta?: string; descripcion: string };
const MENU: { grupo: string; items: Item[] }[] = [
  { grupo: "General", items: [
    { ruta: "/", texto: "Centro de mando", icono: House, permiso: ["centro:ver"], descripcion: "Resumen de todo lo que pasa en la plataforma." },
    { ruta: "/mis-solicitudes", texto: "Mis solicitudes", icono: Tags, permiso: ["dpir:solicitar"], soloSin: "dpir:ver", descripcion: "Pida precios de referencia y siga su avance." },
    { ruta: "/tableros", texto: "Tableros generativos", icono: LayoutDashboard, permiso: ["tableros:ver"], descripcion: "Escriba lo que necesita ver y obtenga un tablero con datos oficiales." },
    { ruta: "/automatizaciones", texto: "Automatizaciones", icono: Workflow, permiso: ["automatizaciones:ver"], cuenta: "fallas_24h", descripcion: "Tareas que se ejecutan solas, con historial." },
  ] },
  { grupo: "Procesos estadísticos", items: [
    { ruta: "/precios", texto: "Precios de Referencia", icono: Tags, permiso: ["dpir:ver"], cuenta: "solicitudes_abiertas", descripcion: "Atienda solicitudes con investigación de mercado automática." },
    { ruta: "/indices", texto: "Índices y alertas", icono: TrendingUp, permiso: ["indices:ver"], cuenta: "alertas_nuevas", descripcion: "IPC, materiales de construcción, canasta básica y crítica de precios." },
    { ruta: "/hba", texto: "Balance de Alimentos", icono: Wheat, permiso: ["hba:ver"], descripcion: "Suministro y disponibilidad de alimentos; calculadora de derivados." },
    { ruta: "/territorio", texto: "Territorio y operativos", icono: Map, permiso: ["territorio:ver"], descripcion: "Municipios, lugares poblados y avance de campo." },
    { ruta: "/calidad", texto: "Validador de calidad", icono: FileCheck2, permiso: ["calidad:usar"], descripcion: "Revise una base antes de usarla o publicarla." },
    { ruta: "/datos", texto: "Catálogo y linaje", icono: Database, permiso: ["datos:ver"], descripcion: "De dónde viene cada dato y cuándo se descargó." },
  ] },
  { grupo: "Gobierno y seguridad", items: [
    { ruta: "/seguridad", texto: "Ciberseguridad", icono: ShieldCheck, permiso: ["seguridad:ver"], descripcion: "Postura, riesgos, incidentes y controles." },
    { ruta: "/ti", texto: "Salud de TI", icono: Server, permiso: ["ti:ver"], descripcion: "Estado del sistema y componentes." },
    { ruta: "/bitacora", texto: "Bitácora", icono: ScrollText, permiso: ["bitacora:ver"], descripcion: "Registro a prueba de manipulación." },
    { ruta: "/privacidad", texto: "Privacidad y mis datos", icono: Lock, permiso: [], descripcion: "Sus datos, el aviso de privacidad y la retención." },
    { ruta: "/admin", texto: "Usuarios y roles", icono: Users, permiso: ["usuarios:administrar"], cuenta: "pendientes_aprobacion", descripcion: "Apruebe cuentas y asigne roles." },
    { ruta: "/jurado", texto: "Modo Jurado", icono: Gavel, permiso: ["jurado:ver"], descripcion: "La rúbrica del Datatón con evidencia." },
  ] },
];

export const ESCALAS = [
  { id: "", texto: "Normal" },
  { id: "grande", texto: "Grande" },
  { id: "muy-grande", texto: "Muy grande" },
];

function usarCuentas(activo: boolean) {
  const [cuentas, setCuentas] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!activo) return;
    const cargar = () => api<any>("/api/centro/resumen").then((r) => setCuentas(r.indicadores)).catch(() => undefined);
    cargar();
    const t = window.setInterval(cargar, 60000);
    return () => window.clearInterval(t);
  }, [activo]);
  return cuentas;
}

function Lateral({ abierto, colapsada, onPlegar, onCerrar, onGuia }: {
  abierto: boolean; colapsada: boolean; onPlegar: () => void; onCerrar: () => void; onGuia: () => void;
}) {
  const { usuario, puede, salir } = useSesion();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const [indicador, setIndicador] = useState<{ top: number; alto: number; visible: boolean }>({ top: 0, alto: 0, visible: false });
  const [cerrados, setCerrados] = useState<Record<string, boolean>>(() => JSON.parse(localStorage.getItem("nexo:grupos") ?? "{}"));
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [menuEspacio, setMenuEspacio] = useState(false);
  const [rolActivo, setRolActivo] = useState(() => localStorage.getItem("nexo:rol-activo") ?? "");
  const cuentas = usarCuentas(puede("centro:ver"));

  const medir = useCallback(() => {
    const nav = navRef.current;
    const activo = nav?.querySelector<HTMLElement>("a.enlace.activo");
    if (!nav || !activo) { setIndicador((i) => ({ ...i, visible: false })); return; }
    const caja = activo.getBoundingClientRect();
    const base = nav.getBoundingClientRect();
    if (caja.height < 4) { setIndicador((i) => ({ ...i, visible: false })); return; }
    setIndicador({ top: caja.top - base.top + nav.scrollTop, alto: caja.height, visible: true });
  }, []);
  useLayoutEffect(() => { medir(); const t = window.setTimeout(medir, 320); return () => window.clearTimeout(t); },
    [ubicacion.pathname, colapsada, cerrados, medir]);

  const alternar = (g: string) => {
    const n = { ...cerrados, [g]: !cerrados[g] };
    setCerrados(n);
    localStorage.setItem("nexo:grupos", JSON.stringify(n));
  };
  const roles = usuario?.roles ?? [];
  const espacio = roles.find((r) => r.codigo === rolActivo) ?? roles[0];
  const elegirEspacio = (codigo: string) => {
    setRolActivo(codigo);
    localStorage.setItem("nexo:rol-activo", codigo);
    window.dispatchEvent(new CustomEvent("nexo:rol", { detail: codigo }));
    setMenuEspacio(false);
    navegar("/");
  };
  const iniciales = (usuario?.nombre ?? "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <aside className={`lateral ${abierto ? "abierto" : ""}`} aria-label="Menú principal">
      <div className="cabeza">
        <img src="/favicon.svg" alt="" />
        <div className="producto ocultable"><b>Nexo</b><span>Instituto Nacional de Estadística</span></div>
        <button className="boton fantasma pequeno icono plegar ocultable" onClick={onPlegar} aria-label="Contraer menú"><PanelLeftClose /></button>
      </div>
      {colapsada && <button className="boton fantasma pequeno icono" style={{ margin: "0 auto 8px" }} onClick={onPlegar} aria-label="Expandir menú" data-tip="Expandir menú"><PanelLeftOpen /></button>}
      {roles.length > 0 && (
        <div className="relativo">
          <button className="espacio" onClick={() => setMenuEspacio(!menuEspacio)} data-tip={`Espacio: ${espacio?.nombre}`} aria-haspopup="menu">
            <LayoutDashboard size={18} color="#004080" />
            <div className="ocultable" style={{ minWidth: 0, flex: 1 }}>
              <div className="titulo">Espacio de trabajo</div>
              <div className="valor">{espacio?.nombre}</div>
            </div>
            {roles.length > 1 && <ChevronsUpDown size={15} className="ocultable" color="#5f6b7c" />}
          </button>
          {menuEspacio && roles.length > 1 && (
            <div className="popover" style={{ left: 12, right: "auto", width: 280 }} onMouseLeave={() => setMenuEspacio(false)} role="menu">
              <div className="pequeno suave" style={{ padding: "10px 14px 4px" }}>Cambiar de espacio de trabajo</div>
              {roles.map((r) => (
                <button key={r.codigo} className="boton fantasma" style={{ width: "100%", justifyContent: "flex-start", height: "auto", padding: "8px 14px" }} onClick={() => elegirEspacio(r.codigo)} role="menuitem">
                  <span style={{ textAlign: "left" }}><b>{r.nombre}</b><br /><span className="pequeno suave">{r.area}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <nav ref={navRef} onClick={onCerrar}>
        <div className="indicador" style={{ transform: `translateY(${indicador.top}px)`, height: indicador.alto, opacity: indicador.visible ? 1 : 0, top: 0 }} />
        {MENU.map((g) => {
          const items = g.items.filter((i) => (!i.permiso.length || puede(...i.permiso)) && !(i.soloSin && puede(i.soloSin)));
          if (!items.length) return null;
          const cerrado = !!cerrados[g.grupo] && !colapsada;
          return (
            <div key={g.grupo}>
              <button className={`grupo ${cerrado ? "cerrado" : ""}`} onClick={(e) => { e.stopPropagation(); alternar(g.grupo); }} aria-expanded={!cerrado}>
                <span>{g.grupo}</span><ChevronDown className="ocultable" />
              </button>
              <div className={`items ${cerrado ? "cerrado" : ""}`}>
                <div>
                  {items.map((i) => {
                    const n = i.cuenta ? cuentas[i.cuenta] : undefined;
                    return (
                      <NavLink key={i.ruta} to={i.ruta} end={i.ruta === "/"} className={({ isActive }) => `enlace ${isActive ? "activo" : ""}`} data-tip={i.texto} title={colapsada ? undefined : i.descripcion}>
                        <i.icono aria-hidden />
                        <span className="ocultable">{i.texto}</span>
                        {!!n && <span className={`cuenta ocultable ${i.cuenta === "fallas_24h" || i.cuenta === "pendientes_aprobacion" ? "atencion" : ""}`}>{n > 999 ? `${Math.floor(n / 1000)}k` : n}</span>}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
      <div className="pie">
        <button className="boton fantasma pequeno" style={{ justifyContent: colapsada ? "center" : "flex-start" }} onClick={onGuia} data-tip="Guía de uso"><CircleHelp /><span className="ocultable">Guía de uso</span></button>
        <div className="relativo">
          <button className="usuario" onClick={() => setMenuUsuario(!menuUsuario)} aria-haspopup="menu" data-tip={usuario?.nombre}>
            <span className="avatar">{iniciales}</span>
            <span className="datos ocultable"><b>{usuario?.nombre}</b><span>{usuario?.email}</span></span>
          </button>
          {menuUsuario && (
            <div className="popover arriba" style={{ width: 280 }} onMouseLeave={() => setMenuUsuario(false)} role="menu">
              <div className="columna" style={{ padding: 8, gap: 2 }}>
                <Link className="boton fantasma" style={{ justifyContent: "flex-start" }} to="/perfil" onClick={() => setMenuUsuario(false)}><User /> Mi perfil y seguridad</Link>
                <Link className="boton fantasma" style={{ justifyContent: "flex-start" }} to="/privacidad" onClick={() => setMenuUsuario(false)}><Lock /> Privacidad y mis datos</Link>
                <div className="separador" />
                <div className="pequeno suave" style={{ padding: "2px 10px" }}><Type size={13} style={{ verticalAlign: -2 }} /> Tamaño de letra</div>
                <div className="fila" style={{ padding: "2px 8px 6px", gap: 6 }}>
                  {ESCALAS.map((e) => (
                    <button key={e.id || "normal"} className={`boton pequeno ${(document.documentElement.dataset.escala ?? "") === e.id ? "" : "secundario"}`}
                      onClick={() => { if (e.id) document.documentElement.dataset.escala = e.id; else delete document.documentElement.dataset.escala; localStorage.setItem("nexo:escala", e.id); setMenuUsuario(false); }}>{e.texto}</button>
                  ))}
                </div>
                <div className="separador" />
                <button className="boton fantasma" style={{ justifyContent: "flex-start" }} onClick={async () => { await salir(); navegar("/login"); }}><LogOut /> Cerrar sesión</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Notificaciones() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{ sin_leer: number; notificaciones: any[] }>({ sin_leer: 0, notificaciones: [] });
  const navegar = useNavigate();
  const cargar = () => api("/api/notificaciones").then(setDatos).catch(() => undefined);
  useEffect(() => { cargar(); const t = window.setInterval(cargar, 30000); return () => window.clearInterval(t); }, []);
  const leerTodas = async () => { await api("/api/notificaciones/leer", { cuerpo: { todas: true } }); cargar(); };
  return (
    <div className="relativo">
      <button className="boton fantasma icono" aria-label={`Notificaciones (${datos.sin_leer} sin leer)`} onClick={() => setAbierto(!abierto)}>
        <Bell />{datos.sin_leer > 0 && <span className="contador">{datos.sin_leer > 99 ? "99+" : datos.sin_leer}</span>}
      </button>
      {abierto && (
        <div className="popover" onMouseLeave={() => setAbierto(false)}>
          <div className="fila espaciado" style={{ padding: "12px 14px", borderBottom: "1px solid var(--borde)" }}>
            <b>Notificaciones</b>
            {datos.sin_leer > 0 && <button className="boton fantasma pequeno" onClick={leerTodas}>Marcar todas como leídas</button>}
          </div>
          {datos.notificaciones.length === 0 && <div className="vacio">No tiene notificaciones.</div>}
          <ul className="actividad" style={{ padding: "0 14px" }}>
            {datos.notificaciones.map((n) => (
              <li key={n.id} style={{ cursor: n.enlace ? "pointer" : "default", opacity: n.leida ? 0.6 : 1 }}
                onClick={() => { if (n.enlace) { navegar(n.enlace); setAbierto(false); } }}>
                <span className={`punto ${n.nivel === "critico" || n.nivel === "alerta" ? "error" : ""}`} />
                <div><div><b>{n.titulo}</b></div><div className="pequeno suave">{n.cuerpo}</div><div className="pequeno suave">{fmt.relativo(n.creada_en)}</div></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PaletaBusqueda({ onCerrar }: { onCerrar: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any[]>([]);
  const [sel, setSel] = useState(0);
  const navegar = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = window.setTimeout(() => api<any[]>(`/api/buscar?q=${encodeURIComponent(q)}`).then((r) => { setRes(r); setSel(0); }).catch(() => setRes([])), 220);
    return () => window.clearTimeout(t);
  }, [q]);
  const ir = (r: any) => { navegar(r.ruta); onCerrar(); };
  return (
    <div className="paleta" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="caja" role="dialog" aria-label="Búsqueda">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque un módulo, municipio, artículo del IPC, solicitud o conjunto de datos"
          onKeyDown={(e) => {
            if (e.key === "Escape") onCerrar();
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, res.length - 1));
            if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            if (e.key === "Enter" && res[sel]) ir(res[sel]);
          }} />
        <ul>
          {res.map((r, i) => (
            <li key={i} className={i === sel ? "activo" : ""}>
              <a href={r.ruta} onClick={(e) => { e.preventDefault(); ir(r); }}>
                <span><Insignia>{r.tipo}</Insignia> <b>{r.titulo}</b></span>
                <span className="pequeno suave">{r.detalle}</span>
              </a>
            </li>
          ))}
          {q.length >= 2 && res.length === 0 && <li className="vacio pequeno">Sin resultados.</li>}
          {q.length < 2 && <li className="pequeno suave" style={{ padding: 12 }}>Escriba al menos 2 letras. Use las flechas y Enter para abrir.</li>}
        </ul>
      </div>
    </div>
  );
}

function Bienvenida({ onCerrar }: { onCerrar: () => void }) {
  const { usuario, puede } = useSesion();
  const disponibles = MENU.flatMap((g) => g.items).filter((i) => (!i.permiso.length || puede(...i.permiso)) && !(i.soloSin && puede(i.soloSin)));
  return (
    <Modal titulo={`Bienvenido a Nexo, ${usuario?.nombre.split(" ")[0]}`} onCerrar={onCerrar} ancho>
      <div className="columna">
        <p className="suave">Nexo reúne en un solo lugar los procesos del INE. Esto es lo que puede hacer con su perfil ({usuario?.roles.map((r) => r.nombre).join(", ")}):</p>
        <div className="rejilla escalonada">
          {disponibles.map((i) => (
            <Link key={i.ruta} to={i.ruta} className="c4 tarjeta modulo" onClick={onCerrar} style={{ boxShadow: "none" }}>
              <span className="icono-modulo"><i.icono size={20} /></span>
              <div><h3>{i.texto}</h3><p className="pequeno suave">{i.descripcion}</p></div>
            </Link>
          ))}
        </div>
        <div className="aviso info"><CircleHelp /><div>Consejos: use <b>Ctrl + K</b> para buscar cualquier cosa; cambie el <b>tamaño de letra</b> desde su nombre, abajo a la izquierda; y vuelva a esta guía con <b>Guía de uso</b>.</div></div>
        <div className="fila" style={{ justifyContent: "flex-end" }}><button className="boton" onClick={onCerrar}>Comenzar</button></div>
      </div>
    </Modal>
  );
}

function nombreRuta(ruta: string): { modulo: string; detalle?: string } {
  const todos = MENU.flatMap((g) => g.items);
  const exacto = todos.find((i) => i.ruta === ruta);
  if (exacto) return { modulo: exacto.texto };
  const padre = todos.filter((i) => i.ruta !== "/" && ruta.startsWith(i.ruta)).sort((a, b) => b.ruta.length - a.ruta.length)[0];
  if (padre) return { modulo: padre.texto, detalle: "Detalle" };
  if (ruta.startsWith("/perfil")) return { modulo: "Mi perfil" };
  return { modulo: "Nexo" };
}

export function Marco() {
  const { usuario } = useSesion();
  const [menu, setMenu] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [colapsada, setColapsada] = useState(() => localStorage.getItem("nexo:lateral") === "colapsada");
  const [guia, setGuia] = useState(false);
  const ubicacion = useLocation();
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaleta(true); } };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [ubicacion.pathname]);
  useEffect(() => { if (usuario && !localStorage.getItem(`nexo:bienvenida:${usuario.id}`)) setGuia(true); }, [usuario]);
  const cerrarGuia = () => { if (usuario) localStorage.setItem(`nexo:bienvenida:${usuario.id}`, "vista"); setGuia(false); };
  const plegar = () => { const n = !colapsada; setColapsada(n); localStorage.setItem("nexo:lateral", n ? "colapsada" : ""); };
  const { modulo, detalle } = nombreRuta(ubicacion.pathname);
  return (
    <div className={`app ${colapsada ? "colapsada" : ""}`}>
      <BarraCarga />
      <Lateral abierto={menu} colapsada={colapsada} onPlegar={plegar} onCerrar={() => setMenu(false)} onGuia={() => setGuia(true)} />
      <div className="principal">
        <header className="barra-superior">
          <button className="boton fantasma icono no-imprimir boton-menu" aria-label="Abrir menú" onClick={() => setMenu(!menu)}><Menu /></button>
          <div className="ruta">
            <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Inicio</Link>
            {modulo !== "Centro de mando" && <><ChevronRight size={14} /><b>{modulo}</b></>}
            {detalle && <><ChevronRight size={14} /><span>{detalle}</span></>}
          </div>
          <div className="buscador" role="button" tabIndex={0} onClick={() => setPaleta(true)} onKeyDown={(e) => e.key === "Enter" && setPaleta(true)}>
            <Search size={17} /> Buscar en Nexo <kbd>Ctrl K</kbd>
          </div>
          <div className="acciones">
            {usuario?.es_demo && <Insignia tono="demo">Cuenta de demostración</Insignia>}
            <Notificaciones />
          </div>
        </header>
        <main className="contenido" id="contenido" key={ubicacion.pathname}><Outlet /></main>
        <footer className="pie-pagina">
          <span>Nexo · prototipo del Datatón INE 2026. No es un sistema oficial del Instituto Nacional de Estadística.</span>
          <span>Fuente de los datos: Instituto Nacional de Estadística (INE), Guatemala.</span>
        </footer>
      </div>
      {paleta && <PaletaBusqueda onCerrar={() => setPaleta(false)} />}
      {guia && <Bienvenida onCerrar={cerrarGuia} />}
    </div>
  );
}
