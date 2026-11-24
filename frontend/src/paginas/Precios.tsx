// Precios de Referencia (DPIR): bandeja de solicitudes, nueva solicitud y explorador de mercado.
// Vista «Resumen»: cuántas solicitudes hay en cada una de las 6 etapas, cuáles vencieron y una consulta rápida
// «¿Cuánto cuesta?». Para una entidad solicitante, sus solicitudes como tarjetas con el paso en que va cada una.
// Vista «Completa»: la bandeja con filtros por etapa y el explorador de mercado (también con ?ver=mercado&q=...).
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ExternalLink, Inbox, Plus, Search } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionBarras } from "../componentes/Grafica";
import {
  Aviso, avisar, Campo, Encabezado, EsqueletoKpis, EsqueletoTabla, FuenteCita, GuiaRapida, Insignia, Kpi, Modal, Pestanas, Progreso,
  Tabla, Tarjeta, useDatos,
} from "../componentes/ui";
import {
  AccionesRapidas, BotonAyuda, CifraClara, EnPocasPalabras, PasosSimples, PieResumen, RangoPrecios, SegunVista, useVista, type AyudaPantalla,
} from "../componentes/vista";

type Paso = Parameters<typeof PasosSimples>[0]["pasos"][number];

const AYUDA_DPIR: AyudaPantalla = {
  titulo: "Cómo leer Precios de Referencia",
  que: "Las solicitudes de precio de referencia que atiende la DPIR, en sus 6 etapas, y un explorador para saber cuánto pagó el Estado por un bien.",
  datos: "Las solicitudes son registros de Nexo. Los precios de mercado vienen de Guatecompras OCDS (compras de un solo artículo, licencia CC BY 4.0) y de la base de Precios de Referencia del INE. Todos se llevan a quetzales del último mes con el IPC del INE.",
  pasos: [
    "Abra una solicitud desde la bandeja. Las vencidas aparecen en rojo: atiéndalas primero.",
    "En la etapa 3 pulse «Investigar»: Nexo trae compras comparables de Guatecompras y precios del INE. Después agregue cotizaciones de proveedores.",
    "En la etapa 4 Nexo calcula media, mediana y moda y recomienda una; al final descargue el informe técnico en PDF.",
  ],
  resumen: "Cuántas solicitudes hay en cada etapa, cuáles vencieron y una consulta rápida de cuánto cuesta un producto.",
  completa: "La bandeja con filtros por etapa y el explorador de mercado con todas las compras encontradas, la distribución de precios y los precios históricos del INE.",
  terminos: [
    ["Precio de referencia", "Valor que indica cuánto cuesta un bien o servicio en el mercado. Las instituciones lo usan para comprar a un precio justo (Decreto 57-92)."],
    ["Media", "El promedio: se suman todos los precios y se dividen entre cuántos son. Se afecta si hay precios muy altos o muy bajos."],
    ["Mediana", "El precio del medio: la mitad cuesta menos y la otra mitad más. No se deja afectar por precios extremos."],
    ["Moda", "El precio que más se repite."],
    ["CV (coeficiente de variación)", "Qué tan dispersos están los precios. Con menos de 25 % se consideran parecidos y se usa la media; con más, la mediana."],
    ["Atípico", "Precio muy alejado de los demás (regla de Tukey sobre el logaritmo del precio). Se excluye del cálculo."],
    ["Mercado relevante", "Cotizaciones directas de proveedores y catálogos. La DPIR recomienda que sean más de la mitad de las fuentes."],
    ["UNSPSC", "Clasificación internacional de productos que usa Guatecompras. Sirve para comparar solo bienes del mismo tipo."],
    ["Ajuste por IPC", "Llevar un precio de otra fecha a quetzales de hoy con el Índice de Precios al Consumidor del INE."],
  ],
};

const AYUDA_ENTIDAD: AyudaPantalla = {
  titulo: "Cómo leer Mis solicitudes",
  que: "Las solicitudes de precio de referencia que su entidad ha hecho a la DPIR y en qué paso va cada una.",
  datos: "Los registros de sus solicitudes en Nexo. El precio de referencia lo calcula la DPIR con cotizaciones de proveedores, compras públicas de Guatecompras y precios históricos del INE.",
  pasos: [
    "Pulse «Nueva solicitud» y describa el bien, la cantidad y las especificaciones técnicas.",
    "Siga el avance en las tarjetas: cada una dice en qué paso va y qué sigue.",
    "Cuando esté entregada, abra el detalle y descargue el informe técnico en PDF.",
  ],
  resumen: "Sus solicitudes como tarjetas, con el paso en que va cada una y lo que sigue.",
  completa: "Sus solicitudes en una tabla, con filtros por etapa.",
  terminos: [
    ["Precio de referencia", "Valor que indica cuánto cuesta un bien o servicio en el mercado; sirve para comprar a un precio justo."],
    ["Las 6 etapas", "Solicitud, revisión, investigación de mercado, análisis, informe y entrega."],
    ["Fecha límite", "Nexo fija 8 días hábiles desde que se registra la solicitud."],
  ],
};

const DETALLE_ETAPA: Record<string, string> = {
  recibida: "La entidad envía lo que necesita comprar.",
  revision: "Se verifica descripción, cantidad y especificaciones.",
  investigacion: "Compras comparables y cotizaciones.",
  analisis: "Media, mediana y moda.",
  informe: "Informe técnico en PDF.",
  entregada: "El informe llega a la entidad.",
};

const QUE_SIGUE: Record<string, string> = {
  recibida: "La DPIR recibió su solicitud y revisará que esté completa.",
  revision: "La DPIR revisa la descripción, la cantidad y las especificaciones.",
  investigacion: "La DPIR busca precios con proveedores y en compras públicas.",
  analisis: "La DPIR calcula el precio de referencia con media, mediana y moda.",
  informe: "La DPIR prepara el informe técnico.",
  entregada: "Listo: el informe técnico está disponible en el detalle.",
};

const EJEMPLOS = ["papel bond", "computadora portátil", "tóner"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function mesTexto(periodo?: string | null) {
  const m = /^(\d{4})-(\d{2})/.exec(periodo ?? "");
  return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : periodo ?? "";
}
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const sinNumero = (etiqueta: string) => etiqueta.replace(/^\d+\.\s*/, "");

export function NuevaSolicitud({ onCerrar }: { onCerrar: () => void }) {
  const { puede, usuario } = useSesion();
  const navegar = useNavigate();
  const [f, setF] = useState({ entidad: "", producto: "", especificaciones: "", unidad: "Unidad", cantidad: 1, modalidad: "", justificacion: "" });
  const [error, setError] = useState("");
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try { const s: any = await api("/api/precios/solicitudes", { cuerpo: f }); avisar(`Solicitud ${s.codigo} registrada.`); navegar(`/precios/${s.id}`); }
    catch (err) { setError((err as ErrorApi).message); }
  };
  const c = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal titulo="Nueva solicitud de precio de referencia" onCerrar={onCerrar}>
      <form className="columna" onSubmit={enviar}>
        {error && <Aviso tono="critico">{error}</Aviso>}
        {puede("dpir:gestionar") ? <Campo etiqueta="Entidad solicitante"><input value={f.entidad} onChange={(e) => c("entidad", e.target.value)} placeholder="Ministerio de Educación" required /></Campo>
          : <Aviso tono="info">Se registrará a nombre de <b>{usuario?.unidad}</b>.</Aviso>}
        <Campo etiqueta="Bien o servicio"><input required minLength={3} value={f.producto} onChange={(e) => c("producto", e.target.value)} placeholder="Computadora portátil" /></Campo>
        <Campo etiqueta="Especificaciones técnicas" ayuda="Cuanto más precisas, más comparables serán las fuentes."><textarea value={f.especificaciones} onChange={(e) => c("especificaciones", e.target.value)} placeholder="8 GB RAM, 256 GB SSD, pantalla de 14 pulgadas" /></Campo>
        <div className="fila">
          <div style={{ flex: 1 }}><Campo etiqueta="Cantidad"><input type="number" min={1} required value={f.cantidad} onChange={(e) => c("cantidad", Number(e.target.value))} /></Campo></div>
          <div style={{ flex: 1 }}><Campo etiqueta="Unidad de medida"><input value={f.unidad} onChange={(e) => c("unidad", e.target.value)} /></Campo></div>
          <div style={{ flex: 1 }}><Campo etiqueta="Modalidad de compra"><input value={f.modalidad} onChange={(e) => c("modalidad", e.target.value)} placeholder="Cotización" /></Campo></div>
        </div>
        <Campo etiqueta="Justificación (opcional)"><textarea value={f.justificacion} onChange={(e) => c("justificacion", e.target.value)} /></Campo>
        <button className="boton"><Plus /> Registrar solicitud</button>
      </form>
    </Modal>
  );
}

function Bandeja({ datos }: { datos: any }) {
  const { puede } = useSesion();
  const [filtro, setFiltro] = useState<string>("todas");
  const navegar = useNavigate();
  if (!datos) return <div className="tarjeta"><EsqueletoTabla filas={6} /></div>;
  const conteo = (e: string) => datos.solicitudes.filter((s: any) => s.estado === e).length;
  const filas = datos.solicitudes.filter((s: any) => filtro === "todas" || s.estado === filtro);
  return (
    <div className="columna">
      <div className="fila">
        <button className={`chip ${filtro === "todas" ? "fijo" : ""}`} onClick={() => setFiltro("todas")}>Todas <b>{datos.solicitudes.length}</b></button>
        {datos.etapas.map((e: any) => <button key={e.id} className={`chip ${filtro === e.id ? "fijo" : ""}`} onClick={() => setFiltro(e.id)}>{e.etiqueta} <b>{conteo(e.id)}</b></button>)}
      </div>
      <Tabla filas={filas} onFila={(s: any) => navegar(`/precios/${s.id}`)} vacio="No hay solicitudes en esta etapa." columnas={[
        { id: "c", titulo: "Código", valor: (s: any) => s.codigo, celda: (s: any) => <b style={{ whiteSpace: "nowrap" }}>{s.codigo}</b> },
        { id: "p", titulo: "Bien o servicio", valor: (s: any) => s.producto },
        { id: "e", titulo: "Entidad", valor: (s: any) => s.entidad },
        { id: "q", titulo: "Cantidad", num: true, valor: (s: any) => s.cantidad, celda: (s: any) => `${fmt.numero(s.cantidad)} ${s.unidad}` },
        { id: "t", titulo: "Etapa", valor: (s: any) => s.paso, celda: (s: any) => (s.rechazada ? <Insignia tono="critico">Rechazada</Insignia> : <Insignia tono={s.estado === "entregada" ? "exito" : "info"}>{s.etapa}</Insignia>) },
        { id: "v", titulo: "Vence", valor: (s: any) => s.fecha_limite, celda: (s: any) => <span style={{ color: s.vencida ? "#b42318" : undefined, fontWeight: s.vencida ? 700 : 400 }}>{fmt.fecha(s.fecha_limite)}{s.vencida ? " · vencida" : ""}</span> },
        { id: "r", titulo: "Precio de referencia", num: true, valor: (s: any) => s.precio_referencia, celda: (s: any) => fmt.moneda(s.precio_referencia) },
        ...(puede("dpir:ver") ? [{ id: "a", titulo: "Asignada a", valor: (s: any) => s.asignada_a ?? "—" }] : []),
      ]} />
    </div>
  );
}

export function histograma(valores: number[], cubetas = 14) {
  if (!valores.length) return { etiquetas: [], conteos: [] };
  const min = Math.min(...valores), max = Math.max(...valores);
  const ancho = (max - min) / cubetas || 1;
  const conteos = Array(cubetas).fill(0);
  valores.forEach((v) => { conteos[Math.min(cubetas - 1, Math.floor((v - min) / ancho))]++; });
  return { etiquetas: conteos.map((_, i) => fmt.moneda(min + i * ancho, 0)), conteos };
}

function Explorador({ inicial }: { inicial?: string | null }) {
  const [terminos, setTerminos] = useState(inicial || "computadora portatil");
  const [unspsc, setUnspsc] = useState<string | null>(null);
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const buscar = async (u: string | null = unspsc, t: string = terminos) => {
    setCargando(true); setError("");
    try { setR(await api(`/api/precios/investigar?terminos=${encodeURIComponent(t)}${u ? `&unspsc=${u}` : ""}`)); setUnspsc(u); }
    catch (e) { setError((e as Error).message); }
    finally { setCargando(false); }
  };
  // Si se llega desde el resumen con un producto (?ver=mercado&q=...), se investiga de inmediato.
  useEffect(() => { if (inicial) { setTerminos(inicial); buscar(null, inicial); } }, [inicial]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useMemo(() => histograma((r?.compras ?? []).filter((c: any) => !c.atipico).map((c: any) => c.precio_ajustado)), [r]);
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Tarjeta titulo="Explorador de mercado" ayuda="Busque un bien en 214 mil compras públicas de un solo artículo (Guatecompras) y en los precios de referencia históricos del INE. Los precios se llevan a quetzales del último mes del IPC.">
        <form className="fila" onSubmit={(e) => { e.preventDefault(); buscar(null); }}>
          <input className="entrada" style={{ flex: 1, minWidth: 240 }} value={terminos} onChange={(e) => setTerminos(e.target.value)} aria-label="Producto" />
          <button className="boton" disabled={cargando}><Search /> {cargando ? "Buscando…" : "Investigar"}</button>
        </form>
        {r?.grupos?.length > 0 && (
          <div className="fila" style={{ marginTop: 10 }}>
            <span className="pequeno suave">Afine por clasificación UNSPSC:</span>
            {r.grupos.map((g: any) => <button key={g.unspsc + g.unidad} className={`chip ${unspsc === g.unspsc ? "fijo" : ""}`} title={g.ejemplo} onClick={() => buscar(g.unspsc)}>{g.unspsc} · {g.unidad || "sin unidad"} <b>{g.n}</b></button>)}
            {unspsc && <button className="chip" onClick={() => buscar(null)}>Quitar filtro</button>}
          </div>
        )}
      </Tarjeta>
      {error && <Aviso tono="alerta">{error}</Aviso>}
      {cargando && !r && <><EsqueletoKpis /><div className="tarjeta"><EsqueletoTabla filas={6} /></div></>}
      {r && (
        <>
          <div className="rejilla">
            <div className="c3"><Kpi etiqueta="Precio sugerido" valor={fmt.moneda(r.precio_sugerido)} detalle={`${r.estadistico_recomendado} · ${r.razon}`} /></div>
            <div className="c3"><Kpi tono="verde" etiqueta="Media · Mediana" valor={`${fmt.moneda(r.estadisticos.media, 0)} · ${fmt.moneda(r.estadisticos.mediana, 0)}`} detalle={`Moda ${fmt.moneda(r.estadisticos.moda, 0)}`} /></div>
            <div className="c3"><Kpi tono="morado" etiqueta="Compras comparables" valor={fmt.numero(r.estadisticos.n)} detalle={`${r.atipicos} atípicos excluidos · ${r.periodo.desde} a ${r.periodo.hasta}`} /></div>
            <div className="c3"><Kpi tono="naranja" etiqueta="Dispersión (CV)" valor={fmt.pct(r.estadisticos.cv)} detalle={`Rango ${fmt.moneda(r.estadisticos.minimo, 0)} a ${fmt.moneda(r.estadisticos.maximo, 0)}`} /></div>
          </div>
          <Tarjeta titulo="Distribución de precios unitarios (sin atípicos)" ayuda={`Quetzales de ${r.ajuste_ipc.a_precios_de} · ${r.ajuste_ipc.base}`}>
            <Grafica opcion={opcionBarras(hist.etiquetas, hist.conteos)} />
            <FuenteCita>Guatecompras OCDS 2025 (CC BY 4.0), precio unitario calculado por Nexo; IPC del INE.</FuenteCita>
          </Tarjeta>
          <Tarjeta titulo="Compras encontradas" ayuda="Revise que sean comparables: misma unidad y especificaciones.">
            <Tabla maximo={100} filas={r.compras} columnas={[
              { id: "f", titulo: "Fecha", valor: (c: any) => c.fecha, celda: (c: any) => fmt.fecha(c.fecha) },
              { id: "d", titulo: "Descripción", valor: (c: any) => c.descripcion, celda: (c: any) => <span className="pequeno">{c.descripcion}</span> },
              { id: "e", titulo: "Entidad", valor: (c: any) => c.origen, celda: (c: any) => <span className="pequeno">{c.origen}</span> },
              { id: "q", titulo: "Cant.", num: true, valor: (c: any) => c.cantidad, celda: (c: any) => fmt.numero(c.cantidad) },
              { id: "p", titulo: "Precio", num: true, valor: (c: any) => c.precio, celda: (c: any) => fmt.moneda(c.precio) },
              { id: "a", titulo: "Ajustado IPC", num: true, valor: (c: any) => c.precio_ajustado, celda: (c: any) => <>{fmt.moneda(c.precio_ajustado)} {c.atipico && <Insignia tono="alerta">atípico</Insignia>}</> },
              { id: "n", titulo: "NOG", valor: (c: any) => c.referencia, celda: (c: any) => <a href={c.enlace} target="_blank" rel="noreferrer noopener">{c.referencia} <ExternalLink size={12} /></a> },
            ]} />
          </Tarjeta>
          {r.referencias_ine.length > 0 && (
            <Tarjeta titulo="Precios de referencia históricos del INE">
              <Tabla filas={r.referencias_ine} columnas={[
                { id: "f", titulo: "Fecha", valor: (c: any) => c.fecha, celda: (c: any) => fmt.fecha(c.fecha) },
                { id: "d", titulo: "Producto y características", valor: (c: any) => c.descripcion, celda: (c: any) => <span className="pequeno">{c.descripcion}</span> },
                { id: "p", titulo: "Precio", num: true, valor: (c: any) => c.precio, celda: (c: any) => fmt.moneda(c.precio) },
                { id: "a", titulo: "Ajustado IPC", num: true, valor: (c: any) => c.precio_ajustado, celda: (c: any) => fmt.moneda(c.precio_ajustado) },
              ]} />
              <FuenteCita>INE, base de Precios de Referencia (junio 2022 y septiembre 2023).</FuenteCita>
            </Tarjeta>
          )}
        </>
      )}
    </div>
  );
}

/** Respuesta en lenguaje sencillo a «¿Cuánto cuesta?», con el rango de precios que pagó el Estado. */
function RespuestaPrecio({ r }: { r: any }) {
  const s = r.resumen ?? {};
  if (!s.n) {
    return <Aviso tono="info">No encontramos compras de «{r.consulta}» en los últimos 24 meses. Pruebe con otras palabras, por ejemplo el nombre común del producto.</Aviso>;
  }
  if (!r.suficiente) {
    return <Aviso tono="info">Solo hay {fmt.numero(s.n)} {plural(s.n, "compra", "compras")} de «{r.consulta}»: son muy pocas para dar un rango confiable. Pruebe con palabras más generales o abra el explorador completo.</Aviso>;
  }
  const rango = [s.p10, s.p25, s.mediana, s.p75, s.p90].every((v) => typeof v === "number");
  return (
    <div className="columna aparecer" style={{ gap: 10 }}>
      <p className="respuesta-precio">
        Para «<b>{r.consulta}</b>» hay <b>{fmt.numero(s.n)}</b> compras públicas de <b>{fmt.numero(s.entidades)}</b> {plural(s.entidades, "entidad", "entidades")}.
        La mitad costó menos de <b>{fmt.moneda(s.mediana)}</b> por unidad y la otra mitad, más.
      </p>
      {rango && <RangoPrecios p10={s.p10} p25={s.p25} mediana={s.mediana} p75={s.p75} p90={s.p90} />}
      {s.precio_orientativo != null && (
        <p className="pequeno">Para un precio de referencia, la DPIR usaría la <b>{s.estadistico_recomendado}</b> ({fmt.moneda(s.precio_orientativo)}). {s.razon}</p>
      )}
      {r.grupos?.length > 1 && (
        <p className="pequeno suave">La búsqueda reúne {r.grupos.length} grupos de productos con clasificación o unidad de medida distintas. En el explorador completo puede elegir uno solo para comparar lo mismo.</p>
      )}
      <p className="pequeno suave">
        {r.ajuste?.a_precios_de ? <>Precios llevados a quetzales de {mesTexto(r.ajuste.a_precios_de)} con el IPC del INE. </> : null}Es una referencia orientativa: el precio de referencia oficial lo emite la DPIR.
      </p>
    </div>
  );
}

function ConsultaPrecio() {
  const [texto, setTexto] = useState("");
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const { cambiar } = useVista();
  const navegar = useNavigate();
  const consultar = async (t = texto) => {
    const q = t.trim();
    if (q.length < 2) return;
    setTexto(q); setCargando(true); setError("");
    try { setR(await api(`/api/publico/precios?q=${encodeURIComponent(q)}`)); }
    catch (e) { setError((e as ErrorApi).message); setR(null); }
    finally { setCargando(false); }
  };
  const abrirExplorador = () => {
    const q = (r?.consulta || texto).trim();
    cambiar("completa");
    navegar(`/precios?ver=mercado${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    window.scrollTo({ top: 0 });
  };
  return (
    <div data-recorrido="precios-consulta">
      <Tarjeta titulo="¿Cuánto cuesta un producto?" ayuda="Escriba un bien y vea cuánto pagó el Estado en compras de un solo artículo de los últimos 24 meses (Guatecompras), a precios de hoy.">
        <div className="columna" style={{ gap: 14 }}>
          <form className="consulta tarjeta" style={{ padding: "6px 6px 6px 14px", boxShadow: "none" }} onSubmit={(e) => { e.preventDefault(); consultar(); }}>
            <Search className="icono-lupa" size={20} />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: papel bond, tóner, computadora portátil" aria-label="Producto" autoComplete="off" />
            <button className="boton" disabled={cargando || texto.trim().length < 2}>{cargando ? "Consultando…" : "Consultar"}</button>
          </form>
          <div className="fila pequeno" style={{ gap: 8 }}>
            <span className="suave">Pruebe con:</span>
            {EJEMPLOS.map((e) => <button key={e} type="button" className="chip" onClick={() => consultar(e)}>{e}</button>)}
          </div>
          {error && <Aviso tono="alerta">{error}</Aviso>}
          {cargando && !r && <div className="esqueleto" style={{ height: 120 }} />}
          {r && <RespuestaPrecio r={r} />}
          <div className="fila">
            <button type="button" className="boton secundario" onClick={abrirExplorador}>Abrir el explorador completo <ArrowRight /></button>
            <span className="pequeno suave">Muestra cada compra con su enlace a Guatecompras, permite afinar por clasificación y ver los precios históricos del INE.</span>
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}

function ResumenDpir({ datos, puedeCrear, onNueva }: { datos: any; puedeCrear: boolean; onNueva: () => void }) {
  const { datos: est, cargando: cargandoEst } = useDatos<any>("/api/precios/estadisticas");
  const { cambiar } = useVista();
  const navegar = useNavigate();
  if (!datos) {
    return (
      <>
        <div className="esqueleto" style={{ height: 92, borderRadius: 14 }} />
        <div className="tarjeta"><div className="esqueleto" style={{ height: 110 }} /></div>
        <EsqueletoKpis n={3} />
      </>
    );
  }
  const activas = (datos.solicitudes as any[]).filter((s) => !s.rechazada);
  const porEtapa = (id: string) => activas.filter((s) => s.estado === id).length;
  const abiertas = activas.filter((s) => s.estado !== "entregada");
  const vencidas = abiertas.filter((s) => s.vencida);
  const entregadas = porEtapa("entregada");
  const etapas = datos.etapas as { id: string; etiqueta: string }[];
  const masCargada = etapas.filter((e) => e.id !== "entregada").sort((a, b) => porEtapa(b.id) - porEtapa(a.id))[0];
  const pasos: Paso[] = etapas.map((e) => {
    const n = porEtapa(e.id);
    return { titulo: sinNumero(e.etiqueta), cifra: fmt.numero(n), detalle: DETALLE_ETAPA[e.id],
      estado: e.id === "entregada" ? (n ? "hecho" : "pendiente") : n ? "actual" : "pendiente" };
  });
  const irBandeja = () => { cambiar("completa"); navegar("/precios"); window.scrollTo({ top: 0 }); };
  const irMercado = () => { cambiar("completa"); navegar("/precios?ver=mercado"); window.scrollTo({ top: 0 }); };
  let frase: ReactNode;
  if (!abiertas.length) {
    frase = <>No hay solicitudes en curso. Se han entregado <b>{fmt.numero(entregadas)}</b> {plural(entregadas, "informe", "informes")}; las nuevas solicitudes aparecerán aquí en cuanto una entidad las registre.</>;
  } else {
    frase = (
      <>
        <p>Hay <b>{fmt.numero(abiertas.length)}</b> {plural(abiertas.length, "solicitud en curso", "solicitudes en curso")}{vencidas.length ? <>; <b>{fmt.numero(vencidas.length)}</b> {plural(vencidas.length, "ya pasó", "ya pasaron")} su fecha límite</> : null}. Se han entregado <b>{fmt.numero(entregadas)}</b> {plural(entregadas, "informe", "informes")}.</p>
        {masCargada && porEtapa(masCargada.id) > 0 && <p>La etapa con más trabajo ahora es «{sinNumero(masCargada.etiqueta)}», con {fmt.numero(porEtapa(masCargada.id))} {plural(porEtapa(masCargada.id), "solicitud", "solicitudes")}.</p>}
      </>
    );
  }
  return (
    <>
      <EnPocasPalabras>{frase}</EnPocasPalabras>
      <div data-recorrido="precios-proceso">
        <Tarjeta titulo="Las 6 etapas de la DPIR" ayuda="Cuántas solicitudes hay ahora en cada etapa (sin contar las rechazadas).">
          <PasosSimples pasos={pasos} />
        </Tarjeta>
      </div>
      <div className="rejilla escalonada">
        <div className="c4">
          <CifraClara icono={<Inbox />} etiqueta="Solicitudes en curso" numero={abiertas.length} formato={(v) => fmt.numero(v)}
            significa="Pedidos de precio de referencia que todavía no se entregan a la entidad." />
        </div>
        <div className="c4">
          <CifraClara tono="naranja" etiqueta="Pasaron su fecha límite" numero={vencidas.length} formato={(v) => fmt.numero(v)}
            significa={vencidas.length ? "Nexo fija 8 días hábiles desde que llega la solicitud. Atienda estas primero." : "Ninguna solicitud ha pasado su fecha límite de 8 días hábiles."} />
        </div>
        <div className="c4">
          <CifraClara tono="verde" etiqueta="Tiempo promedio de entrega"
            valor={cargandoEst ? "…" : est?.dias_promedio != null ? (est.dias_promedio < 1 ? "Menos de 1 día" : `${fmt.numero(est.dias_promedio, 1)} días`) : "—"}
            significa={cargandoEst ? "Calculando con las solicitudes entregadas…" : est?.dias_promedio != null
              ? `Desde que llega la solicitud hasta que se entrega el informe, en ${plural(est.entregadas, "la solicitud entregada", `las ${fmt.numero(est.entregadas)} solicitudes entregadas`)}.`
              : "Aún no hay solicitudes entregadas para calcularlo."} />
        </div>
      </div>
      <ConsultaPrecio />
      <AccionesRapidas acciones={[
        { titulo: "Atender solicitudes", texto: vencidas.length ? `Empiece por ${plural(vencidas.length, "la vencida", `las ${vencidas.length} vencidas`)}.` : "Abra la bandeja con todas las solicitudes.", onClick: irBandeja, icono: Inbox },
        { titulo: "Explorador de mercado", texto: "Precios de 214 mil compras públicas y de la base de Precios de Referencia del INE.", onClick: irMercado, icono: Search },
        ...(puedeCrear ? [{ titulo: "Nueva solicitud", texto: "Registre lo que una entidad necesita comprar.", onClick: onNueva, icono: Plus }] : []),
      ]} />
      <PieResumen fuente="solicitudes registradas en Nexo; Guatecompras OCDS (CC BY 4.0) y Precios de Referencia del INE, ajustados con el IPC" />
    </>
  );
}

function TarjetaSolicitud({ s }: { s: any }) {
  return (
    <Link to={`/precios/${s.id}`} className="c6 tarjeta solicitud-simple">
      <div className="fila espaciado">
        <b>{s.codigo}</b>
        {s.rechazada ? <Insignia tono="critico">Rechazada</Insignia> : s.estado === "entregada" ? <Insignia tono="exito">Entregada</Insignia> : s.vencida ? <Insignia tono="alerta">Vencida</Insignia> : null}
      </div>
      <h3>{s.producto}</h3>
      <p className="pequeno suave">{fmt.numero(s.cantidad)} {s.unidad} · {s.estado === "entregada" ? "entregada" : `fecha límite ${fmt.fecha(s.fecha_limite)}`}</p>
      <div className="pequeno" style={{ marginTop: 6 }}>Paso {s.paso} de 6: <b>{sinNumero(s.etapa)}</b></div>
      <Progreso valor={(s.paso / 6) * 100} />
      <p className="pequeno que-sigue">{s.rechazada ? "La DPIR rechazó la solicitud. El motivo está en el detalle." : QUE_SIGUE[s.estado]}</p>
      {s.estado === "entregada" && s.precio_referencia != null && (
        <p>Precio de referencia: <b>{fmt.moneda(s.precio_referencia)}</b> por {String(s.unidad).toLowerCase()}.</p>
      )}
      <span className="cifra-ir">Ver el detalle <ArrowRight size={15} /></span>
    </Link>
  );
}

function ResumenEntidad({ datos, onNueva }: { datos: any; onNueva: () => void }) {
  if (!datos) return <><div className="esqueleto" style={{ height: 92, borderRadius: 14 }} /><div className="rejilla"><div className="c6 tarjeta"><EsqueletoTabla filas={3} /></div><div className="c6 tarjeta"><EsqueletoTabla filas={3} /></div></div></>;
  const sols = datos.solicitudes as any[];
  const enCurso = sols.filter((s) => s.estado !== "entregada" && !s.rechazada);
  const entregadas = sols.filter((s) => s.estado === "entregada");
  return (
    <>
      <EnPocasPalabras>
        {sols.length === 0
          ? "Aún no ha registrado solicitudes. Pulse «Nueva solicitud» para pedir a la DPIR el precio de referencia de un bien o servicio."
          : <>Tiene <b>{fmt.numero(enCurso.length)}</b> {plural(enCurso.length, "solicitud en curso", "solicitudes en curso")} y <b>{fmt.numero(entregadas.length)}</b> {plural(entregadas.length, "entregada", "entregadas")}. Cada tarjeta dice en qué paso va y qué sigue; le avisaremos por notificación y correo cuando un informe esté listo.</>}
      </EnPocasPalabras>
      {sols.length > 0 && <div className="rejilla escalonada">{sols.map((s) => <TarjetaSolicitud key={s.id} s={s} />)}</div>}
      <AccionesRapidas acciones={[{ titulo: "Nueva solicitud", texto: "Pida el precio de referencia de un bien o servicio.", onClick: onNueva, icono: Plus }]} />
      <PieResumen fuente="registro de sus solicitudes en Nexo" />
    </>
  );
}

export default function Precios() {
  const { puede } = useSesion();
  const ubicacion = useLocation();
  const [params, setParams] = useSearchParams();
  const [nueva, setNueva] = useState(false);
  const { datos } = useDatos<any>("/api/precios/solicitudes");
  const soloEntidad = !puede("dpir:ver");
  const puedeCrear = puede("dpir:solicitar") || puede("dpir:gestionar");
  const pestana: "bandeja" | "mercado" = !soloEntidad && params.get("ver") === "mercado" ? "mercado" : "bandeja";
  const cambiarPestana = (p: "bandeja" | "mercado") => {
    const n = new URLSearchParams(params);
    if (p === "mercado") n.set("ver", "mercado"); else { n.delete("ver"); n.delete("q"); }
    setParams(n, { replace: true });
  };
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado titulo={soloEntidad || ubicacion.pathname === "/mis-solicitudes" ? "Mis solicitudes de precio de referencia" : "Precios de Referencia"}
        subtitulo={soloEntidad ? "Registre lo que su entidad necesita comprar y dé seguimiento a cada etapa hasta recibir el informe técnico."
          : "El proceso de 6 pasos de la DPIR digitalizado: la investigación de mercado se automatiza con Guatecompras y los precios del INE, y el informe sale trazable."}
        acciones={<>
          <BotonAyuda ayuda={soloEntidad ? AYUDA_ENTIDAD : AYUDA_DPIR} />
          {puedeCrear && <button className="boton" onClick={() => setNueva(true)}><Plus /> Nueva solicitud</button>}
        </>} />
      <SegunVista
        resumen={soloEntidad ? <ResumenEntidad datos={datos} onNueva={() => setNueva(true)} /> : <ResumenDpir datos={datos} puedeCrear={puedeCrear} onNueva={() => setNueva(true)} />}
        completa={<>
          {!soloEntidad && (
            <GuiaRapida id="dpir" titulo="Cómo atender una solicitud de precio de referencia" pasos={[
              { titulo: "Abra la solicitud", texto: "Pulse el código en la lista. Las vencidas aparecen en rojo; use los filtros de etapa para ordenar el trabajo." },
              { titulo: "Investigue el mercado", texto: "En la etapa 3, pulse «Investigar»: Nexo busca compras comparables en Guatecompras y precios del INE. Agregue cotizaciones si hace falta." },
              { titulo: "Analice y entregue", texto: "Calcule los estadísticos, justifique si hay menos de 50 % de cotizaciones y descargue el informe técnico en PDF." },
            ]} />
          )}
          {!soloEntidad && <Pestanas opciones={[{ id: "bandeja", etiqueta: "Solicitudes" }, { id: "mercado", etiqueta: "Explorador de mercado" }]} activa={pestana} onCambio={cambiarPestana} />}
          {pestana === "bandeja" || soloEntidad ? <Bandeja datos={datos} /> : <Explorador inicial={params.get("q")} />}
          {soloEntidad && <p className="pequeno suave">¿Dudas sobre el proceso? <Link to="/privacidad">Consulte cómo tratamos sus datos</Link>.</p>}
        </>} />
      {nueva && <NuevaSolicitud onCerrar={() => setNueva(false)} />}
    </div>
  );
}
