// Centro de mando: lo que requiere atención, las cifras oficiales clave, el tablero del espacio de trabajo y el acceso
// a cada módulo. Vista «Resumen»: lo pendiente de hoy en frases y tres cifras oficiales explicadas. Vista «Completa»:
// además el estado de la plataforma, el tablero del espacio de trabajo, todos los módulos y la actividad reciente.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, CircleCheck, Database, FileCheck2, Gavel, LayoutDashboard, Lock, Map, ScrollText, Search, Server, ShieldCheck,
  ShoppingBasket, Tags, TrendingUp, Users, UsersRound, Wheat, Workflow,
} from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { TableroVista } from "../componentes/Widget";
import { Encabezado, EsqueletoGrafica, EsqueletoKpis, EsqueletoTabla, Kpi, Pestanas, Progreso, Tarjeta, useDatos } from "../componentes/ui";
import {
  AccionesRapidas, BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, type AyudaPantalla, type ElementoLista,
} from "../componentes/vista";

const ICONOS: Record<string, any> = {
  precios: Tags, indices: TrendingUp, hba: Wheat, territorio: Map, calidad: FileCheck2, tableros: LayoutDashboard,
  automatizaciones: Workflow, datos: Database, seguridad: ShieldCheck, ti: Server, bitacora: ScrollText, privacidad: Lock,
  admin: Users, jurado: Gavel,
};

const AYUDA: AyudaPantalla = {
  titulo: "Cómo leer el Centro de mando",
  que: "Lo que pasa hoy en Nexo según su rol: lo que requiere su atención, las cifras oficiales clave del INE y el acceso a cada módulo.",
  datos: "Las cifras oficiales salen de las bases que publica el INE (IPC, canasta básica alimentaria y proyecciones de población), cada una con su fecha de descarga en «Catálogo y linaje». Los pendientes se cuentan en los registros de Nexo al abrir la pantalla.",
  pasos: [
    "Revise «Requiere su atención» y pulse el botón de cada renglón para resolverlo.",
    "Escriba en el buscador lo que necesita ver: Nexo arma un tablero con cifras oficiales.",
    "Entre a un módulo desde los accesos de abajo o desde el menú de la izquierda.",
  ],
  resumen: "Lo pendiente de hoy en frases, tres cifras oficiales con su explicación y los accesos a sus módulos.",
  completa: "Además: el estado de la seguridad y de TI, el tablero de su espacio de trabajo, todos sus módulos y la actividad reciente.",
  terminos: [
    ["Inflación interanual", "Cuánto cambiaron en promedio los precios de lo que compran los hogares, frente al mismo mes del año anterior."],
    ["IPC (base 2024 = 100)", "Índice de Precios al Consumidor: mide cómo cambian los precios de una canasta de bienes y servicios. El promedio de 2024 vale 100."],
    ["Canasta Básica Alimentaria (CBA)", "Costo mensual de los alimentos mínimos de una persona: 2,052 kilocalorías diarias en el área urbana y 2,172 en la rural."],
    ["Población proyectada", "Estimación del INE de cuántas personas viven en el país este año, calculada a partir del Censo 2018."],
    ["Lugar poblado", "Aldea, caserío, colonia, finca u otro lugar con nombre propio donde vive la gente."],
  ],
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function mesTexto(periodo?: string | null) {
  const m = /^(\d{4})-(\d{2})/.exec(periodo ?? "");
  return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : "";
}
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Une frases con comas y una «y» final. */
function unir(partes: ReactNode[]) {
  return partes.map((p, i) => <Fragment key={i}>{i > 0 && (i === partes.length - 1 ? " y " : ", ")}{p}</Fragment>);
}

function saludo() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Guatemala" }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

function fechaLarga() {
  const t = new Date().toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Guatemala" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Rol cuyo tablero se muestra; lo elige la persona en la barra lateral («Espacio de trabajo»). */
function useRolActivo() {
  const [rol, setRol] = useState(() => localStorage.getItem("nexo:rol-activo") ?? "");
  useEffect(() => {
    const escuchar = (e: Event) => setRol((e as CustomEvent<string>).detail);
    window.addEventListener("nexo:rol", escuchar);
    return () => window.removeEventListener("nexo:rol", escuchar);
  }, []);
  return rol;
}

interface Pendiente {
  n: number; titulo: string; detalle: string; ruta: string; accion: string; icono: any; urgente: boolean;
  frase: ReactNode; alDia: string;
}

/** Tareas abiertas según los permisos de la persona (las usan las dos vistas). */
function pendientesDe(k: any, puede: (...p: string[]) => boolean): Pendiente[] {
  const lista: (Pendiente | false)[] = [
    puede("indices:ver") && {
      n: k.alertas_nuevas, titulo: "Alertas de precios por revisar", detalle: `${fmt.numero(k.alertas_altas)} de severidad alta`,
      ruta: "/indices/alertas", accion: "Revisar alertas", icono: TrendingUp, urgente: false,
      frase: <><b>{fmt.numero(k.alertas_nuevas)}</b> {plural(k.alertas_nuevas, "alerta de precios", "alertas de precios")} por revisar</>,
      alDia: "No hay alertas de precios por revisar.",
    },
    puede("dpir:ver") && {
      n: k.solicitudes_abiertas, titulo: "Solicitudes de precio de referencia abiertas",
      detalle: k.solicitudes_vencidas ? `${fmt.numero(k.solicitudes_vencidas)} con la fecha límite vencida` : "Todas dentro del plazo",
      ruta: "/precios", accion: "Atender solicitudes", icono: Tags, urgente: k.solicitudes_vencidas > 0,
      frase: <><b>{fmt.numero(k.solicitudes_abiertas)}</b> {plural(k.solicitudes_abiertas, "solicitud de precio abierta", "solicitudes de precio abiertas")}{k.solicitudes_vencidas ? <> ({fmt.numero(k.solicitudes_vencidas)} {plural(k.solicitudes_vencidas, "vencida", "vencidas")})</> : null}</>,
      alDia: "No hay solicitudes de precio de referencia abiertas.",
    },
    puede("usuarios:administrar") && {
      n: k.pendientes_aprobacion, titulo: "Cuentas que esperan aprobación", detalle: "Confirme la identidad y asigne el rol adecuado",
      ruta: "/admin", accion: "Revisar cuentas", icono: UsersRound, urgente: false,
      frase: <><b>{fmt.numero(k.pendientes_aprobacion)}</b> {plural(k.pendientes_aprobacion, "cuenta que espera", "cuentas que esperan")} aprobación</>,
      alDia: "No hay cuentas esperando aprobación.",
    },
    puede("automatizaciones:ver") && {
      n: k.fallas_24h, titulo: "Automatizaciones con fallas en las últimas 24 horas", detalle: `${fmt.numero(k.ejecuciones_24h)} ejecuciones en total`,
      ruta: "/automatizaciones", accion: "Ver historial", icono: Workflow, urgente: false,
      frase: <><b>{fmt.numero(k.fallas_24h)}</b> {plural(k.fallas_24h, "ejecución de automatizaciones falló", "ejecuciones de automatizaciones fallaron")} en las últimas 24 horas</>,
      alDia: "Las automatizaciones funcionaron sin fallas en las últimas 24 horas.",
    },
  ];
  return lista.filter(Boolean) as Pendiente[];
}

function fraseHoy(items: Pendiente[]) {
  const con = items.filter((i) => i.n > 0);
  if (!items.length) return <>Desde aquí puede consultar las cifras oficiales del INE y entrar a los módulos de su rol.</>;
  if (!con.length) return <>Todo está al día: no tiene tareas pendientes en este momento.</>;
  const urgente = con.find((i) => i.urgente);
  return (
    <>
      <p>Tiene {con.length === 1 ? "un asunto" : `${con.length} asuntos`} por atender: {unir(con.map((i) => i.frase))}.</p>
      {urgente && <p>Empiece por las solicitudes vencidas: ya pasaron su fecha límite.</p>}
    </>
  );
}

function EspacioDeTrabajo() {
  const { usuario } = useSesion();
  const rolActivo = useRolActivo();
  const { datos: lista } = useDatos<any[]>("/api/tableros");
  const base = (lista ?? []).filter((t) => t.origen === "sistema" && usuario?.roles.some((r) => r.codigo === t.rol));
  const [activo, setActivo] = useState<number | null>(null);
  const [spec, setSpec] = useState<any>(null);
  useEffect(() => {
    if (!base.length) return;
    const preferido = base.find((t) => t.rol === rolActivo) ?? base[0];
    setActivo(preferido.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, rolActivo]);
  useEffect(() => { if (activo) { setSpec(null); api(`/api/tableros/${activo}`).then((t: any) => setSpec(t.spec)).catch(() => undefined); } }, [activo]);
  if (!lista) return <Tarjeta><EsqueletoGrafica /></Tarjeta>;
  if (!base.length) return null;
  const actual = base.find((t) => t.id === activo);
  return (
    <section className="columna" style={{ gap: 10 }} aria-label="Tablero de su espacio de trabajo">
      <div className="fila espaciado">
        <div>
          <div className="sobretitulo">Su espacio de trabajo</div>
          <h2 style={{ marginTop: 4 }}>{actual?.titulo ?? "Tablero"}</h2>
        </div>
        <Link className="boton secundario pequeno" to="/tableros">Personalizar o crear tableros</Link>
      </div>
      {base.length > 1 && <Pestanas opciones={base.map((t) => ({ id: String(t.id), etiqueta: t.titulo }))} activa={String(activo)} onCambio={(id) => setActivo(Number(id))} />}
      {spec ? <TableroVista spec={spec} /> : <Tarjeta><EsqueletoGrafica /></Tarjeta>}
    </section>
  );
}

function Pendientes({ k }: { k: any }) {
  const { puede } = useSesion();
  const items = pendientesDe(k, puede);
  if (!items.length) return null;
  const conPendiente = items.filter((i) => i.n > 0);
  return (
    <Tarjeta titulo="Requiere su atención" ayuda="Tareas abiertas según su rol, al momento de abrir esta pantalla."
      acciones={conPendiente.length === 0 ? <span className="insignia exito"><CircleCheck size={13} /> Todo al día</span> : undefined}>
      <ul className="actividad">
        {items.map((i) => (
          <li key={i.ruta} className="pendiente">
            <span className="cifra" style={{ color: i.n > 0 ? "var(--texto)" : "var(--texto-3)" }}>{fmt.numero(i.n)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{i.titulo}</div>
              <div className="pequeno suave">{i.detalle}</div>
            </div>
            <Link className={`boton pequeno ${i.n > 0 ? "" : "secundario"}`} to={i.ruta}>{i.accion} <ArrowRight /></Link>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function EstadoPlataforma({ k }: { k: any }) {
  const { puede } = useSesion();
  const filas = [
    { etiqueta: "Postura de ciberseguridad", valor: k.puntaje_seguridad, ruta: puede("seguridad:ver") ? "/seguridad" : null },
    { etiqueta: "Salud de TI", valor: k.puntaje_ti, ruta: puede("ti:ver") ? "/ti" : null },
  ];
  return (
    <Tarjeta titulo="Estado de la plataforma" ayuda="Revisión automática de los agentes de seguridad y de TI">
      <div className="columna" style={{ gap: 14 }}>
        {filas.map((f) => (
          <div key={f.etiqueta}>
            <div className="fila espaciado pequeno" style={{ marginBottom: 6 }}>
              {f.ruta ? <Link to={f.ruta} style={{ fontWeight: 600, textDecoration: "none" }}>{f.etiqueta}</Link> : <b>{f.etiqueta}</b>}
              <span style={{ fontVariantNumeric: "tabular-nums" }}><b>{f.valor}</b> / 100</span>
            </div>
            <Progreso valor={f.valor} color={f.valor >= 80 ? "#2b6a0f" : f.valor >= 60 ? "#b36b00" : "#b42318"} />
          </div>
        ))}
        <div className="separador" />
        <div className="fila espaciado pequeno"><span className="suave">Automatizaciones activas</span><b>{fmt.numero(k.automatizaciones_activas)}</b></div>
        <div className="fila espaciado pequeno"><span className="suave">Usuarios activos</span><b>{fmt.numero(k.usuarios_activos)}</b></div>
        <div className="fila espaciado pequeno"><span className="suave">Registros oficiales cargados</span><b>{fmt.numero(k.registros_totales)}</b></div>
      </div>
    </Tarjeta>
  );
}

function Consulta() {
  const { puede } = useSesion();
  const navegar = useNavigate();
  const [pregunta, setPregunta] = useState("");
  const { datos: catalogo } = useDatos<{ ejemplos: string[] }>(puede("tableros:ver") ? "/api/analitica/catalogo" : null);
  if (!puede("tableros:ver")) return null;
  const ir = (texto: string) => navegar(`/tableros?q=${encodeURIComponent(texto)}`);
  return (
    <section className="vidrio" style={{ padding: "14px 16px" }} aria-label="Consultar datos oficiales">
      <label htmlFor="consulta-inicio" style={{ fontWeight: 600, fontSize: "0.9rem", display: "block", marginBottom: 8 }}>
        ¿Qué dato necesita? Escríbalo con sus palabras y Nexo arma un tablero con cifras oficiales.
      </label>
      <form className="consulta tarjeta" style={{ padding: "6px 6px 6px 14px", boxShadow: "none" }} onSubmit={(e) => { e.preventDefault(); if (pregunta.trim()) ir(pregunta); }}>
        <Search className="icono-lupa" size={20} />
        <input id="consulta-inicio" value={pregunta} onChange={(e) => setPregunta(e.target.value)}
          placeholder="Por ejemplo: precio del cemento gris por mes en 2025" autoComplete="off" />
        <button className="boton">Consultar</button>
      </form>
      {!!catalogo?.ejemplos?.length && (
        <div className="fila pequeno" style={{ marginTop: 10, gap: 8 }}>
          <span className="suave">Pruebe con:</span>
          {catalogo.ejemplos.slice(0, 3).map((e) => <button key={e} type="button" className="chip" onClick={() => ir(e)}>{e}</button>)}
        </div>
      )}
    </section>
  );
}

function ResumenInicio({ datos }: { datos: any }) {
  const { puede } = useSesion();
  const k = datos?.indicadores;
  if (!k) {
    return (
      <>
        <div className="esqueleto" style={{ height: 92, borderRadius: 14 }} />
        <div className="tarjeta"><EsqueletoTabla filas={3} /></div>
        <EsqueletoKpis n={3} />
      </>
    );
  }
  const items = pendientesDe(k, puede);
  const elementos: ElementoLista[] = items.map((i) => ({
    estado: i.n === 0 ? "ok" : i.urgente ? "critico" : "atencion",
    titulo: i.n === 0 ? i.alDia : i.frase,
    texto: i.n === 0 ? undefined : i.detalle + ".",
    accion: i.n > 0 ? <Link className="boton pequeno" to={i.ruta}>{i.accion} <ArrowRight /></Link> : undefined,
  }));
  const modulos: any[] = datos.modulos ?? [];
  const hayIpc = !!k.ipc_periodo;
  return (
    <>
      <EnPocasPalabras titulo="Hoy en Nexo">{fraseHoy(items)}</EnPocasPalabras>
      {items.length > 0 && (
        <div data-recorrido="inicio-atencion">
          <Tarjeta titulo="Requiere su atención" ayuda="Según su rol, al momento de abrir esta pantalla.">
            <ListaSimple elementos={elementos} />
          </Tarjeta>
        </div>
      )}
      <Consulta />
      <section aria-label="Cifras oficiales del INE">
        <div className="sobretitulo" style={{ marginBottom: 10 }}>Cifras oficiales del INE</div>
        <div className="rejilla escalonada">
          <div className="c4">
            <CifraClara icono={<TrendingUp />} etiqueta="Inflación interanual" numero={hayIpc ? k.ipc_interanual : null} formato={(v) => fmt.pct(v, 2)}
              detalle={hayIpc ? `IPC de ${mesTexto(k.ipc_periodo)}` : undefined}
              significa={hayIpc ? <>Lo que costaba Q100 hace un año hoy cuesta en promedio <b>{fmt.moneda(100 + k.ipc_interanual)}</b>.</> : "Aún no hay datos del IPC cargados."}
              ir={puede("indices:ver") ? { texto: "Ver los índices de precios", ruta: "/indices" } : undefined} />
          </div>
          <div className="c4">
            <CifraClara icono={<ShoppingBasket />} tono="verde" etiqueta="Canasta básica urbana" numero={k.cba_periodo ? k.cba_urbana : null} formato={(v) => fmt.moneda(v)}
              detalle={k.cba_periodo ? `Por persona al mes · ${mesTexto(k.cba_periodo)}` : undefined}
              significa={k.cba_periodo
                ? <>Es lo que cuesta al mes la alimentación mínima de una persona en el área urbana (2,052 kilocalorías diarias). En el área rural: {fmt.moneda(k.cba_rural)}.</>
                : "Aún no hay datos de la canasta básica cargados."} />
          </div>
          <div className="c4">
            <CifraClara icono={<UsersRound />} tono="morado" etiqueta={`Población proyectada ${k.anio_poblacion}`} numero={k.poblacion_proyectada} formato={(v) => fmt.numero(v)}
              detalle={`${fmt.numero(k.lugares_poblados)} lugares poblados (Censo 2018)`}
              significa="Personas que el INE estima que viven este año en Guatemala, calculadas a partir del Censo 2018."
              ir={puede("territorio:ver", "tableros:ver") ? { texto: "Ver el territorio", ruta: "/territorio" } : undefined} />
          </div>
        </div>
      </section>
      {modulos.length > 0 && (
        <section aria-label="Sus módulos">
          <div className="sobretitulo" style={{ marginBottom: 10 }}>Para empezar</div>
          <AccionesRapidas acciones={modulos.slice(0, 3).map((m) => ({ titulo: m.titulo, texto: m.descripcion, ruta: m.ruta, icono: ICONOS[m.id] ?? LayoutDashboard }))} />
        </section>
      )}
      <PieResumen fuente="INE (IPC, canasta básica alimentaria y proyecciones de población) y registros de Nexo">
        {modulos.length > 3 ? `Su rol tiene ${modulos.length} módulos; la vista Completa los muestra todos, con el estado de la plataforma y la actividad reciente.` : null}
      </PieResumen>
    </>
  );
}

function CompletaInicio({ datos }: { datos: any }) {
  const k = datos?.indicadores;
  return (
    <>
      <Consulta />
      {!k ? (
        <div className="rejilla"><div className="c8 tarjeta"><EsqueletoTabla filas={4} /></div><div className="c4 tarjeta"><EsqueletoTabla filas={4} /></div></div>
      ) : (
        <div className="rejilla">
          <div className="c8" data-recorrido="inicio-atencion"><Pendientes k={k} /></div>
          <div className="c4"><EstadoPlataforma k={k} /></div>
        </div>
      )}
      <section aria-label="Indicadores oficiales">
        <div className="fila espaciado" style={{ marginBottom: 10 }}>
          <div><div className="sobretitulo">Indicadores oficiales</div><h2 style={{ marginTop: 4 }}>Cifras clave del Instituto Nacional de Estadística</h2></div>
        </div>
        {!k ? <EsqueletoKpis /> : (
          <div className="rejilla escalonada">
            <div className="c3"><Kpi icono={<TrendingUp />} etiqueta="Inflación interanual (IPC)" numero={k.ipc_interanual} formato={(v) => fmt.pct(v, 2)}
              detalle={`Índice ${fmt.numero(k.ipc_indice, 2)} (2024 = 100) · ${k.ipc_periodo}`} /></div>
            <div className="c3"><Kpi icono={<ShoppingBasket />} etiqueta="Canasta básica urbana" numero={k.cba_urbana} formato={(v) => fmt.moneda(v)}
              detalle={`Por persona al mes · rural ${fmt.moneda(k.cba_rural)} · ${k.cba_periodo}`} /></div>
            <div className="c3"><Kpi icono={<UsersRound />} etiqueta={`Población proyectada ${k.anio_poblacion}`} numero={k.poblacion_proyectada} formato={(v) => fmt.numero(v)}
              detalle={`${fmt.numero(k.lugares_poblados)} lugares poblados (Censo 2018)`} /></div>
            <div className="c3"><Kpi icono={<Database />} etiqueta="Registros oficiales" numero={k.registros_totales} formato={(v) => fmt.numero(v)}
              detalle={`${k.fuentes} archivos con fecha y huella SHA-256`} /></div>
          </div>
        )}
      </section>
      <EspacioDeTrabajo />
      <div className="rejilla">
        <section className="c8" aria-label="Módulos">
          <div className="sobretitulo">Módulos disponibles para su rol</div>
          <h2 style={{ margin: "4px 0 10px" }}>¿Qué desea hacer hoy?</h2>
          <div className="rejilla escalonada">
            {(datos?.modulos ?? []).map((m: any) => {
              const Icono = ICONOS[m.id] ?? LayoutDashboard;
              return (
                <Link key={m.id} to={m.ruta} className="c6 tarjeta modulo">
                  <span className="icono-modulo"><Icono size={20} /></span>
                  <div style={{ minWidth: 0 }}><h3>{m.titulo}</h3><p className="pequeno suave">{m.descripcion}</p><p className="pequeno" style={{ marginTop: 6, color: "var(--texto-3)" }}>{m.area}</p></div>
                  <ArrowRight className="ir" size={18} />
                </Link>
              );
            })}
            {!datos && [0, 1, 2, 3].map((i) => <div key={i} className="c6 tarjeta"><EsqueletoTabla filas={2} /></div>)}
          </div>
        </section>
        <div className="c4">
          <Tarjeta titulo="Actividad reciente" ayuda="Últimas acciones registradas en la bitácora de auditoría">
            {!datos ? <EsqueletoTabla filas={6} /> : (
              <ul className="actividad">
                {(datos.actividad ?? []).map((a: any) => (
                  <li key={a.id}><span className={`punto ${a.resultado}`} /><div><div>{a.texto}</div><div className="pequeno suave">{fmt.relativo(a.ts)} · {a.modulo}</div></div></li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

export default function Inicio() {
  const { usuario } = useSesion();
  const { datos } = useDatos<any>("/api/centro/resumen");
  const k = datos?.indicadores;
  return (
    <div className="columna" style={{ gap: 22 }}>
      <Encabezado sobretitulo={fechaLarga()} titulo={`${saludo()}, ${usuario?.nombre.split(" ")[0] ?? ""}`}
        subtitulo={`Este es el Centro de mando. Arriba verá lo que requiere su atención; más abajo, las cifras oficiales del INE${k?.ipc_periodo ? ` (IPC al ${k.ipc_periodo})` : ""} y el acceso a cada módulo.`}
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista resumen={<ResumenInicio datos={datos} />} completa={<CompletaInicio datos={datos} />} />
    </div>
  );
}
