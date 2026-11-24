// Centro de mando: súper resumen de todo lo que pasa en la plataforma y acceso a cada módulo y rol.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Database, FileCheck2, Gavel, Lock, Map, ScrollText, Server, ShieldCheck, Sparkles, Tags, TrendingUp, Users, Wheat, Workflow,
} from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { TableroVista } from "../componentes/Widget";
import { Encabezado, Esqueleto, Kpi, Pestanas, Tarjeta, useDatos } from "../componentes/ui";

const ICONOS: Record<string, [any, string]> = {
  precios: [Tags, "#004080"], indices: [TrendingUp, "#0080FF"], hba: [Wheat, "#3f6b06"], territorio: [Map, "#5b35c4"],
  calidad: [FileCheck2, "#b33c00"], tableros: [Sparkles, "#0080FF"], automatizaciones: [Workflow, "#004080"],
  datos: [Database, "#2E6FB5"], seguridad: [ShieldCheck, "#a1261b"], ti: [Server, "#4d4d4d"], bitacora: [ScrollText, "#4d4d4d"],
  privacidad: [Lock, "#5b35c4"], admin: [Users, "#004080"], jurado: [Gavel, "#b33c00"],
};

function saludo() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Guatemala" }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

function EspacioDeRol() {
  const { usuario } = useSesion();
  const { datos: lista } = useDatos<any[]>("/api/tableros");
  const base = (lista ?? []).filter((t) => t.origen === "sistema" && usuario?.roles.some((r) => r.codigo === t.rol));
  const [activo, setActivo] = useState<number | null>(null);
  const [spec, setSpec] = useState<any>(null);
  useEffect(() => { if (base.length && activo === null) setActivo(base[0].id); }, [base, activo]);
  useEffect(() => { if (activo) { setSpec(null); api(`/api/tableros/${activo}`).then((t: any) => setSpec(t.spec)); } }, [activo]);
  if (!lista) return <Esqueleto alto={200} />;
  if (!base.length) return null;
  return (
    <div>
      <div className="fila espaciado" style={{ marginBottom: 8 }}>
        <h2>Tu espacio de trabajo</h2>
        <Link className="boton secundario pequeno" to="/tableros">Personalizar o crear tableros</Link>
      </div>
      {base.length > 1 && <Pestanas opciones={base.map((t) => ({ id: String(t.id), etiqueta: t.titulo }))} activa={String(activo)} onCambio={(id) => setActivo(Number(id))} />}
      {spec ? <TableroVista spec={spec} /> : <Esqueleto alto={240} />}
    </div>
  );
}

export default function Inicio() {
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const { datos } = useDatos<any>("/api/centro/resumen");
  const [pregunta, setPregunta] = useState("");
  const k = datos?.indicadores;
  return (
    <div className="columna" style={{ gap: 22 }}>
      <Encabezado
        titulo={`${saludo()}, ${usuario?.nombre.split(" ")[0]}`}
        subtitulo={<>Centro de mando de Nexo: todo lo que se mueve en la plataforma, en un solo lugar. Datos oficiales del Instituto Nacional de Estadística{k ? `, IPC al ${k.ipc_periodo}` : ""}.</>}
        acciones={<Link className="boton" to="/tableros"><Sparkles /> Generar un tablero</Link>}
      />
      <Tarjeta>
        <form className="fila" onSubmit={(e) => { e.preventDefault(); if (pregunta.trim()) navegar(`/tableros?q=${encodeURIComponent(pregunta)}`); }}>
          <Sparkles color="#0080FF" />
          <input className="entrada" style={{ flex: 1, minWidth: 240 }} value={pregunta} onChange={(e) => setPregunta(e.target.value)}
            placeholder="Escribe lo que quieres ver, por ejemplo: «precio de cemento gris por mes en 2025» o «IPC de Quetzaltenango»" aria-label="Pedir un tablero" />
          <button className="boton">Ver tablero</button>
        </form>
      </Tarjeta>
      {!k ? <Esqueleto alto={110} /> : (
        <div className="rejilla">
          <div className="c3"><Kpi etiqueta="IPC: variación interanual" valor={fmt.pct(k.ipc_interanual, 2)} detalle={`Índice ${fmt.numero(k.ipc_indice, 2)} (2024=100) · ${k.ipc_periodo}`} /></div>
          <div className="c3"><Kpi tono="verde" etiqueta="Canasta básica urbana por persona" valor={fmt.moneda(k.cba_urbana)} detalle={`Rural ${fmt.moneda(k.cba_rural)} · ${k.cba_periodo}`} /></div>
          <div className="c3"><Kpi tono="naranja" etiqueta="Alertas de precios por revisar" valor={fmt.numero(k.alertas_nuevas)} detalle={`${fmt.numero(k.alertas_altas)} de severidad alta`} /></div>
          <div className="c3"><Kpi tono="morado" etiqueta="Solicitudes de precio abiertas" valor={fmt.numero(k.solicitudes_abiertas)} detalle={`${k.solicitudes_vencidas} vencidas`} /></div>
          <div className="c3"><Kpi etiqueta="Automatizaciones activas" valor={fmt.numero(k.automatizaciones_activas)} detalle={`${k.ejecuciones_24h} ejecuciones y ${k.fallas_24h} fallas en 24 h`} /></div>
          <div className="c3"><Kpi tono={k.puntaje_seguridad >= 80 ? "verde" : "naranja"} etiqueta="Postura de seguridad" valor={`${k.puntaje_seguridad}/100`} detalle={`Salud de TI ${k.puntaje_ti}/100`} /></div>
          <div className="c3"><Kpi tono="amarillo" etiqueta="Registros oficiales cargados" valor={fmt.numero(k.registros_totales)} detalle={`${k.fuentes} archivos con fecha y huella SHA-256`} /></div>
          <div className="c3"><Kpi etiqueta={`Población proyectada ${k.anio_poblacion}`} valor={fmt.numero(k.poblacion_proyectada)} detalle={`${fmt.numero(k.lugares_poblados)} lugares poblados (Censo 2018)`} /></div>
        </div>
      )}
      <EspacioDeRol />
      <div className="rejilla">
        <div className="c8">
          <h2 style={{ marginBottom: 10 }}>Módulos</h2>
          <div className="rejilla">
            {(datos?.modulos ?? []).map((m: any) => {
              const [Icono, color] = ICONOS[m.id] ?? [Sparkles, "#0080FF"];
              return (
                <Link key={m.id} to={m.ruta} className="c6 tarjeta modulo">
                  <span className="icono-modulo" style={{ background: color }}><Icono size={22} /></span>
                  <div><h3>{m.titulo}</h3><p className="pequeno suave">{m.descripcion}</p><span className="insignia" style={{ marginTop: 6 }}>{m.area}</span></div>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="c4">
          <Tarjeta titulo="Lo que está pasando" ayuda="Últimas acciones registradas en la bitácora">
            <ul className="actividad">
              {(datos?.actividad ?? []).map((a: any) => (
                <li key={a.id}><span className={`punto ${a.resultado}`} /><div><div>{a.texto}</div><div className="pequeno suave">{fmt.relativo(a.ts)} · {a.modulo}</div></div></li>
              ))}
            </ul>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
