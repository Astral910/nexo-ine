// Estructura principal: menú lateral por permisos, barra superior, búsqueda global (Ctrl+K) y notificaciones.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Calculator, Database, Gavel, House, LayoutDashboard, Lock, LogOut, Map, Menu, ScrollText, Search, Server,
  ShieldCheck, Sparkles, Tags, TrendingUp, User, Users, Workflow, FileCheck2, Wheat,
} from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Insignia } from "./ui";

const MENU = [
  { grupo: "General", items: [
    { ruta: "/", texto: "Centro de mando", icono: House, permiso: ["centro:ver"] },
    { ruta: "/mis-solicitudes", texto: "Mis solicitudes", icono: Tags, permiso: ["dpir:solicitar"], soloSin: "dpir:ver" },
    { ruta: "/tableros", texto: "Tableros generativos", icono: Sparkles, permiso: ["tableros:ver"] },
    { ruta: "/automatizaciones", texto: "Automatizaciones", icono: Workflow, permiso: ["automatizaciones:ver"] },
  ] },
  { grupo: "Procesos estadísticos", items: [
    { ruta: "/precios", texto: "Precios de Referencia", icono: Tags, permiso: ["dpir:ver"] },
    { ruta: "/indices", texto: "Índices y alertas", icono: TrendingUp, permiso: ["indices:ver"] },
    { ruta: "/hba", texto: "Balance de Alimentos", icono: Wheat, permiso: ["hba:ver"] },
    { ruta: "/territorio", texto: "Territorio y operativos", icono: Map, permiso: ["territorio:ver"] },
    { ruta: "/calidad", texto: "Validador de calidad", icono: FileCheck2, permiso: ["calidad:usar"] },
    { ruta: "/datos", texto: "Catálogo y linaje", icono: Database, permiso: ["datos:ver"] },
  ] },
  { grupo: "Gobierno y seguridad", items: [
    { ruta: "/seguridad", texto: "Ciberseguridad", icono: ShieldCheck, permiso: ["seguridad:ver"] },
    { ruta: "/ti", texto: "Salud de TI", icono: Server, permiso: ["ti:ver"] },
    { ruta: "/bitacora", texto: "Bitácora", icono: ScrollText, permiso: ["bitacora:ver"] },
    { ruta: "/privacidad", texto: "Privacidad y mis datos", icono: Lock, permiso: [] },
    { ruta: "/admin", texto: "Usuarios y roles", icono: Users, permiso: ["usuarios:administrar"] },
    { ruta: "/jurado", texto: "Modo Jurado", icono: Gavel, permiso: ["jurado:ver"] },
  ] },
];

function Lateral({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { usuario, puede } = useSesion();
  return (
    <aside className={`lateral ${abierto ? "abierto" : ""}`} aria-label="Menú principal">
      <div className="franja-ine" />
      <div className="marca">
        <img src="/marca/logo-ine.svg" alt="Instituto Nacional de Estadística" />
        <div className="producto"><LayoutDashboard size={20} color="#0080FF" /> Nexo <small>plataforma integrada</small></div>
      </div>
      <nav onClick={onCerrar}>
        {MENU.map((g) => {
          const items = g.items.filter((i) => (!i.permiso.length || puede(...i.permiso)) && !(i.soloSin && puede(i.soloSin)));
          if (!items.length) return null;
          return (
            <div key={g.grupo}>
              <div className="grupo">{g.grupo}</div>
              {items.map((i) => (
                <NavLink key={i.ruta} to={i.ruta} end={i.ruta === "/"} className={({ isActive }) => `enlace ${isActive ? "activo" : ""}`}>
                  <i.icono aria-hidden />{i.texto}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="pie-lateral">
        <div>{usuario?.roles.map((r) => r.nombre).join(" · ")}</div>
        <div style={{ marginTop: 6 }}>Prototipo del Datatón INE 2026 · no es un sistema oficial del INE.</div>
        <div style={{ marginTop: 4 }}>Fuente de los datos: Instituto Nacional de Estadística.</div>
      </div>
    </aside>
  );
}

function Notificaciones() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{ sin_leer: number; notificaciones: any[] }>({ sin_leer: 0, notificaciones: [] });
  const navegar = useNavigate();
  const cargar = () => api("/api/notificaciones").then(setDatos).catch(() => undefined);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, []);
  const leerTodas = async () => { await api("/api/notificaciones/leer", { cuerpo: { todas: true } }); cargar(); };
  return (
    <div className="relativo">
      <button className="boton fantasma icono" aria-label={`Notificaciones (${datos.sin_leer} sin leer)`} onClick={() => setAbierto(!abierto)}>
        <Bell />{datos.sin_leer > 0 && <span className="contador">{datos.sin_leer}</span>}
      </button>
      {abierto && (
        <div className="popover" onMouseLeave={() => setAbierto(false)}>
          <div className="fila espaciado" style={{ padding: "12px 14px", borderBottom: "1px solid var(--borde)" }}>
            <b>Notificaciones</b>
            {datos.sin_leer > 0 && <button className="boton fantasma pequeno" onClick={leerTodas}>Marcar todas como leídas</button>}
          </div>
          {datos.notificaciones.length === 0 && <div className="vacio">Sin notificaciones.</div>}
          <ul className="actividad" style={{ padding: "0 14px" }}>
            {datos.notificaciones.map((n) => (
              <li key={n.id} style={{ cursor: n.enlace ? "pointer" : "default", opacity: n.leida ? 0.65 : 1 }}
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
    const t = setTimeout(() => api<any[]>(`/api/buscar?q=${encodeURIComponent(q)}`).then((r) => { setRes(r); setSel(0); }).catch(() => setRes([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  const ir = (r: any) => { navegar(r.ruta); onCerrar(); };
  return (
    <div className="paleta" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="caja" role="dialog" aria-label="Búsqueda global">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca módulos, municipios, artículos del IPC, solicitudes o datos del INE…"
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
                <span><Insignia tono="info">{r.tipo}</Insignia> <b>{r.titulo}</b></span>
                <span className="pequeno suave">{r.detalle}</span>
              </a>
            </li>
          ))}
          {q.length >= 2 && res.length === 0 && <li className="vacio pequeno">Sin resultados.</li>}
          {q.length < 2 && <li className="pequeno suave" style={{ padding: 12 }}>Escribe al menos 2 letras. Usa ↑ ↓ y Enter.</li>}
        </ul>
      </div>
    </div>
  );
}

export function Marco() {
  const { usuario, salir } = useSesion();
  const [menu, setMenu] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const ubicacion = useLocation();
  const navegar = useNavigate();
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaleta(true); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [ubicacion.pathname]);
  const iniciales = (usuario?.nombre ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="app">
      <Lateral abierto={menu} onCerrar={() => setMenu(false)} />
      <div className="principal">
        <header className="barra-superior">
          <button className="boton fantasma icono no-imprimir boton-menu" aria-label="Abrir menú" onClick={() => setMenu(!menu)}><Menu /></button>
          <div className="buscador" role="button" tabIndex={0} onClick={() => setPaleta(true)} onKeyDown={(e) => e.key === "Enter" && setPaleta(true)}>
            <Search size={18} /> Buscar en Nexo <kbd>Ctrl K</kbd>
          </div>
          <div className="acciones">
            {usuario?.es_demo && <Insignia tono="demo">Cuenta de demostración</Insignia>}
            <Notificaciones />
            <div className="relativo">
              <button className="boton fantasma" onClick={() => setPerfil(!perfil)} aria-label="Menú de usuario">
                <span className="avatar">{iniciales}</span>
                <span className="pequeno" style={{ textAlign: "left", lineHeight: 1.2 }}><b>{usuario?.nombre}</b><br /><span className="suave">{usuario?.roles[0]?.nombre}</span></span>
              </button>
              {perfil && (
                <div className="popover" style={{ width: 240 }} onMouseLeave={() => setPerfil(false)}>
                  <div className="columna" style={{ padding: 8, gap: 2 }}>
                    <Link className="boton fantasma" style={{ justifyContent: "flex-start" }} to="/perfil" onClick={() => setPerfil(false)}><User /> Mi perfil y seguridad</Link>
                    <Link className="boton fantasma" style={{ justifyContent: "flex-start" }} to="/privacidad" onClick={() => setPerfil(false)}><Lock /> Privacidad y mis datos</Link>
                    <Link className="boton fantasma" style={{ justifyContent: "flex-start" }} to="/hba" onClick={() => setPerfil(false)}><Calculator /> Calculadora HBA</Link>
                    <button className="boton fantasma" style={{ justifyContent: "flex-start" }} onClick={async () => { await salir(); navegar("/login"); }}><LogOut /> Cerrar sesión</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="contenido" id="contenido"><Outlet /></main>
      </div>
      {paleta && <PaletaBusqueda onCerrar={() => setPaleta(false)} />}
    </div>
  );
}
