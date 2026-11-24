// Índices y Estadísticas Continuas: IPC, CBA, IPMC, alertas de precios atípicos y catálogo de artículos.
// Cada subpantalla tiene su «Resumen» (la idea principal en frases, pocas cifras explicadas y una sola gráfica o
// lista) y su vista «Completa» (todas las series, tablas, filtros y el recálculo de alertas).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Play, Search, ShoppingBasket, TrendingUp } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionBarras, opcionLinea } from "../componentes/Grafica";
import {
  Aviso, avisar, Campo, Encabezado, EsqueletoGrafica, EsqueletoKpis, EsqueletoTabla, FuenteCita, Kpi, Modal, Pestanas, Severidad, Tabla,
  Tarjeta, useDatos,
} from "../componentes/ui";
import {
  AccionesRapidas, BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, type AyudaPantalla, type ElementoLista,
} from "../componentes/vista";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function mesTexto(periodo?: string | null) {
  const m = /^(\d{4})-(\d{2})/.exec(periodo ?? "");
  return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : periodo ?? "";
}
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const conSigno = (v: number, dec = 1) => `${v > 0 ? "+" : ""}${fmt.numero(v, dec)} %`;

const AYUDA_INDICADORES: AyudaPantalla = {
  titulo: "Cómo leer los indicadores de precios",
  que: "La inflación (IPC), el costo de la canasta básica alimentaria y el índice de materiales de construcción, tal como los publica el INE.",
  datos: "Bases publicadas por el INE: Empalme del IPC por República y por región (base anual 2024 = 100), costo de la CBA urbana y rural e IPMC mensual por artículo. Cada archivo tiene su fecha de descarga en «Catálogo y linaje».",
  pasos: [
    "Lea la inflación interanual: cuánto cambiaron los precios en un año.",
    "Compare el costo de la canasta básica en el área urbana y en la rural.",
    "En la vista Completa vea el IPC por región y el índice de materiales de construcción por artículo.",
  ],
  resumen: "La inflación del último mes, la canasta básica explicada y la inflación mes a mes desde 2019.",
  completa: "Además el IPC por región, la canasta urbana y rural mes a mes y el IPMC por artículo.",
  terminos: [
    ["IPC", "Índice de Precios al Consumidor: mide cómo cambian los precios de lo que compran los hogares."],
    ["Base 2024 = 100", "El promedio de 2024 vale 100. Un índice de 103 significa precios 3 % más altos que ese promedio."],
    ["Inflación interanual", "Cambio de los precios frente al mismo mes del año anterior."],
    ["Inflación mensual", "Cambio de los precios frente al mes anterior."],
    ["CBA", "Canasta Básica Alimentaria: costo de los alimentos mínimos de una persona al mes (2,052 kilocalorías diarias en el área urbana y 2,172 en la rural)."],
    ["IPMC", "Índice de Precios de Materiales de Construcción. El INE lo publica por artículo; Nexo no calcula agregados sin sus ponderaciones."],
  ],
};

const AYUDA_ALERTAS: AyudaPantalla = {
  titulo: "Cómo leer las alertas de precios",
  que: "Los precios recolectados para el IPC que cambiaron de forma inusual y conviene confirmar con el recolector antes de usarlos.",
  datos: "Archivos públicos de precios recolectados del IPC (julio 2022 y año 2023). Nexo calcula las alertas; no se publican: son una ayuda para la crítica de precios.",
  pasos: [
    "Empiece por las alertas de severidad alta.",
    "Abra una alerta y compare su precio con lo que pasó con el mismo artículo en otros lugares.",
    "Confírmela si el cambio es real o descártela si fue un error de captura. Su comentario queda en la bitácora.",
  ],
  resumen: "Cuántos precios se marcaron de cada 100, cuántas alertas faltan por revisar y por cuáles empezar.",
  completa: "La lista completa con filtros por mes, severidad, estado y artículo, y el recálculo de un mes.",
  terminos: [
    ["Hidiroglou-Berthelot", "Compara cuánto cambió cada precio con lo que cambió el mismo artículo en otros lugares y marca los cambios muy distintos. Se usa en julio de 2022, cuando el archivo trae el precio anterior y el actual por informante codificado."],
    ["Desvío de nivel", "En 2023 el archivo no trae el código del informante: se marcan los precios muy alejados de la mediana del mismo artículo y mes."],
    ["Relativo de precio", "Precio actual dividido entre el anterior. 1.10 significa que subió 10 %; un precio sin cambio nunca se marca como atípico."],
    ["Severidad", "Qué tan lejos está el cambio de lo normal: alta, media o baja."],
    ["Mediana del grupo", "El valor del medio entre todos los lugares que reportaron el mismo artículo ese mes."],
  ],
};

const AYUDA_CATALOGO: AyudaPantalla = {
  titulo: "Cómo leer el catálogo de artículos",
  que: "Los artículos del IPC con precios recolectados: cuántos precios hay de cada uno, en cuántos departamentos y hasta qué mes.",
  datos: "Archivos públicos de precios recolectados del IPC del INE (julio 2022 y año 2023).",
  pasos: [
    "Escriba el nombre de un artículo, por ejemplo frijol, gas propano o cuaderno.",
    "Abra el artículo para ver su precio mediano por mes y por departamento.",
    "Use el catálogo como base del Manual de Características digital que propuso la DIEC.",
  ],
  resumen: "Un buscador y los artículos con más precios recolectados.",
  completa: "La tabla con código, observaciones, departamentos y último periodo de hasta 300 artículos.",
  terminos: [
    ["Observación", "Un precio recolectado de un artículo en un establecimiento y un mes."],
    ["Manual de Características", "Documento que describe cada artículo del IPC para que el recolector cotice siempre lo mismo."],
  ],
};

const AYUDA_ARTICULO: AyudaPantalla = {
  titulo: "Cómo leer la ficha de un artículo",
  que: "El precio unitario mediano de un artículo del IPC, mes a mes y por departamento.",
  datos: "Precios recolectados del IPC (INE). Precio unitario = precio ÷ cantidad. Las celdas con pocos informantes se ocultan por secreto estadístico.",
  pasos: ["Vea cómo cambió el precio mediano entre los meses con datos.", "Compare departamentos en la vista Completa.", "Si un departamento no aparece, tenía muy pocos informantes para mostrarlo."],
  resumen: "El precio mediano más reciente, su cambio en el periodo y la serie mensual.",
  completa: "Además el precio mediano por departamento.",
  terminos: [
    ["Precio unitario mediano", "El precio del medio por unidad de medida: la mitad de los precios es menor y la otra mitad mayor."],
    ["Secreto estadístico", "La ley prohíbe publicar datos que permitan identificar a un informante; por eso se suprimen celdas con pocos informantes."],
  ],
};

// ------------------------------------------------------------------------------------------------ Indicadores

const serieDe = (d: any, filtro?: (c: string) => boolean) => (d?.series ?? []).filter((s: any) => !filtro || filtro(s.clave))
  .map((s: any) => ({ nombre: s.clave, puntos: s.puntos.map((p: any) => [p.x, p.valor]) }));

function ResumenIndicadores({ r, rep }: { r: any; rep: any }) {
  if (!r) return <><div className="esqueleto" style={{ height: 92, borderRadius: 14 }} /><EsqueletoKpis /><div className="tarjeta"><EsqueletoGrafica /></div></>;
  const hay = !!r.ipc.periodo;
  const inter = serieDe(rep, (c) => c === "Variación interanual");
  return (
    <>
      <EnPocasPalabras>
        {hay ? (
          <>
            <p>En {mesTexto(r.ipc.periodo)} la inflación interanual fue de <b>{fmt.pct(r.ipc.interanual, 2)}</b>: lo que costaba Q100 hace un año hoy cuesta en promedio <b>{fmt.moneda(100 + r.ipc.interanual)}</b>.</p>
            {r.cba.periodo && <p>La canasta básica alimentaria urbana costó <b>{fmt.moneda(r.cba.urbana)}</b> por persona al mes en {mesTexto(r.cba.periodo)}.</p>}
          </>
        ) : "Aún no hay datos del IPC cargados en Nexo."}
      </EnPocasPalabras>
      {hay && (
        <div className="rejilla escalonada">
          <div className="c3"><CifraClara icono={<TrendingUp />} etiqueta="Inflación interanual" numero={r.ipc.interanual} formato={(v) => fmt.pct(v, 2)} detalle={mesTexto(r.ipc.periodo)}
            significa={<>Lo que costaba Q100 hace un año hoy cuesta en promedio {fmt.moneda(100 + r.ipc.interanual)}.</>} /></div>
          <div className="c3"><CifraClara icono={<TrendingUp />} tono="morado" etiqueta="Inflación mensual" numero={r.ipc.mensual} formato={(v) => fmt.pct(v, 2)} detalle={mesTexto(r.ipc.periodo)}
            significa={<>Frente al mes anterior: lo que costaba Q100 el mes pasado hoy cuesta {fmt.moneda(100 + r.ipc.mensual)}.</>} /></div>
          <div className="c3"><CifraClara icono={<ShoppingBasket />} tono="verde" etiqueta="Canasta básica urbana" numero={r.cba.urbana} formato={(v) => fmt.moneda(v)} detalle="Por persona al mes"
            significa="Lo que cuesta al mes la alimentación mínima de una persona en el área urbana (2,052 kilocalorías diarias)." /></div>
          <div className="c3"><CifraClara icono={<ShoppingBasket />} tono="verde" etiqueta="Canasta básica rural" numero={r.cba.rural} formato={(v) => fmt.moneda(v)} detalle="Por persona al mes"
            significa="Lo mismo en el área rural, donde se calcula con 2,172 kilocalorías diarias." /></div>
        </div>
      )}
      <Tarjeta titulo="Inflación interanual mes a mes desde 2019 (%)" ayuda="Cada punto compara los precios de un mes con los del mismo mes del año anterior.">
        {!rep ? <EsqueletoGrafica /> : inter.length ? <Grafica opcion={opcionLinea(inter, (v) => fmt.pct(v, 1))} /> : <p className="suave pequeno">No hay serie de inflación cargada.</p>}
        <FuenteCita>INE, Empalme del IPC por República, base anual 2024=100.</FuenteCita>
      </Tarjeta>
      <AccionesRapidas acciones={[
        { titulo: "Alertas de precios", texto: `${fmt.numero(r.alertas.nuevas)} por revisar, ${fmt.numero(r.alertas.altas)} de severidad alta.`, ruta: "/indices/alertas", icono: TrendingUp },
        { titulo: "Catálogo de artículos", texto: "Busque un artículo y vea su precio por mes y por departamento.", ruta: "/indices/catalogo", icono: Search },
      ]} />
      <PieResumen fuente="INE, Empalme del IPC base anual 2024=100 y costo de la CBA urbana y rural">
        La vista Completa agrega el IPC por región y el índice de materiales de construcción.
      </PieResumen>
    </>
  );
}

function CompletaIndicadores({ r, rep, reg, cba }: { r: any; rep: any; reg: any; cba: any }) {
  if (!r) return <><EsqueletoKpis /><div className="rejilla"><div className="c6 tarjeta"><EsqueletoGrafica /></div><div className="c6 tarjeta"><EsqueletoGrafica /></div></div></>;
  return (
    <>
      <div className="rejilla">
        <div className="c3"><Kpi etiqueta="IPC República (2024=100)" valor={fmt.numero(r.ipc.indice, 2)} detalle={`Periodo ${r.ipc.periodo}`} /></div>
        <div className="c3"><Kpi tono="naranja" etiqueta="Inflación interanual" valor={fmt.pct(r.ipc.interanual, 2)} detalle={`Mensual ${fmt.pct(r.ipc.mensual, 2)}`} /></div>
        <div className="c3"><Kpi tono="verde" etiqueta="CBA urbana por persona" valor={fmt.moneda(r.cba.urbana)} detalle={`Rural ${fmt.moneda(r.cba.rural)} · ${r.cba.periodo}`} /></div>
        <div className="c3"><Kpi tono="morado" etiqueta="Alertas por revisar" valor={fmt.numero(r.alertas.nuevas)} detalle={`${fmt.numero(r.alertas.altas)} de severidad alta`} /></div>
      </div>
      <div className="rejilla">
        <div className="c6"><Tarjeta titulo="Inflación: variación interanual y mensual (%)">{rep ? <Grafica opcion={opcionLinea(serieDe(rep), (v) => fmt.pct(v, 1))} /> : <EsqueletoGrafica />}<FuenteCita>INE, Empalme del IPC por República, base anual 2024=100.</FuenteCita></Tarjeta></div>
        <div className="c6"><Tarjeta titulo="IPC por región (2024=100)">{reg ? <Grafica opcion={opcionLinea(serieDe(reg), (v) => fmt.numero(v, 1))} /> : <EsqueletoGrafica />}<FuenteCita>INE, Empalme del IPC por Región, base anual 2024=100.</FuenteCita></Tarjeta></div>
        <div className="c6"><Tarjeta titulo="Costo mensual per cápita de la canasta básica alimentaria (Q)">{cba ? <Grafica opcion={opcionLinea(serieDe(cba), (v) => fmt.moneda(v, 0))} /> : <EsqueletoGrafica />}<FuenteCita>INE, costo de la CBA urbana y rural 2024-2026.</FuenteCita></Tarjeta></div>
        <div className="c6">
          <Tarjeta titulo={`Índice de Precios de Materiales de Construcción · ${r.ipmc.periodo}`} ayuda="Índices por artículo tal como los publica el INE">
            <Tabla maximo={12} filas={r.ipmc.articulos} columnas={[
              { id: "a", titulo: "Artículo", valor: (x: any) => x.articulo },
              { id: "i", titulo: "Índice", num: true, valor: (x: any) => x.indice, celda: (x: any) => fmt.numero(x.indice, 2) },
            ]} />
            <FuenteCita>INE, IPMC mensual.</FuenteCita>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

function Indicadores() {
  const { datos: r } = useDatos<any>("/api/indices/resumen");
  const { datos: rep } = useDatos<any>("/api/indices/series?indicador=IPC&ambito=republica_var&desde_anio=2019");
  const { datos: reg } = useDatos<any>("/api/indices/series?indicador=IPC&ambito=region&desde_anio=2024");
  const { datos: cba } = useDatos<any>("/api/indices/series?indicador=CBA&desde_anio=2024");
  return <SegunVista resumen={<ResumenIndicadores r={r} rep={rep} />} completa={<CompletaIndicadores r={r} rep={rep} reg={reg} cba={cba} />} />;
}

// ------------------------------------------------------------------------------------------------ Alertas

/** Explica una alerta en una frase, según el método con que se marcó. */
function describirAlerta(a: any): ReactNode {
  if (a.precio_anterior && a.precio_actual) {
    const cambio = (a.precio_actual / a.precio_anterior - 1) * 100;
    const tipico = a.mediana_grupo ? (a.mediana_grupo - 1) * 100 : null;
    return <>Pasó de {fmt.moneda(a.precio_anterior)} a {fmt.moneda(a.precio_actual)} ({conSigno(cambio)}) en {mesTexto(a.periodo)}
      {tipico !== null && <>; en los demás lugares el cambio típico del mismo artículo fue {Math.abs(tipico) < 0.05 ? "de 0 %" : `de ${conSigno(tipico)}`}</>}.</>;
  }
  if (a.precio_actual && a.mediana_grupo) {
    const desvio = (a.precio_actual / a.mediana_grupo - 1) * 100;
    return <>Precio de {fmt.moneda(a.precio_actual)} en {mesTexto(a.periodo)}; el precio mediano del mismo artículo ese mes fue {fmt.moneda(a.mediana_grupo)} ({conSigno(desvio)}).</>;
  }
  return <>Marcada en {mesTexto(a.periodo)}.</>;
}

function ResumenAlertas() {
  const { puede } = useSesion();
  const { datos: res } = useDatos<any>("/api/indices/alertas/resumen");
  const { datos: altas, recargar } = useDatos<any>("/api/indices/alertas?severidad=alta&estado=nueva");
  const [conteos, setConteos] = useState<Record<string, number> | null>(null);
  const [revisar, setRevisar] = useState<any>(null);
  // Denominador: precios recolectados por mes (capa semántica; si la persona no tiene acceso, se omite).
  useEffect(() => {
    api<any>("/api/analitica/consulta", { cuerpo: { consulta: { fuente: "precios_ipc", medida: "conteo", dimension: "periodo", limite: 600 } } })
      .then((d) => setConteos(Object.fromEntries((d.filas ?? []).filter((f: any) => f.valor !== null).map((f: any) => [String(f.x), f.valor]))))
      .catch(() => setConteos({}));
  }, []);
  if (!res || !altas) return <div data-recorrido="alertas-resumen"><div className="esqueleto" style={{ height: 110, borderRadius: 14 }} /><div style={{ height: 16 }} /><EsqueletoKpis n={3} /></div>;
  const periodos = Object.keys(res.por_periodo ?? {}).sort();
  const filas = periodos.map((p) => {
    const precios = conteos?.[p];
    return { p, alertas: res.por_periodo[p] as number, tasa: precios ? (res.por_periodo[p] / precios) * 100 : null };
  });
  const tasas = filas.filter((f) => f.tasa !== null).map((f) => f.tasa as number);
  const nuevas = res.por_estado?.nueva ?? 0;
  const revisadas = (res.por_estado?.confirmada ?? 0) + (res.por_estado?.descartada ?? 0) + (res.por_estado?.en_revision ?? 0);
  const altasNuevas = altas.total as number;
  const minimo = tasas.length ? Math.min(...tasas) : null, maximo = tasas.length ? Math.max(...tasas) : null;
  const elementos: ElementoLista[] = (altas.alertas as any[]).slice(0, 6).map((a) => ({
    estado: "atencion",
    titulo: <>{a.articulo} <span className="suave">· {a.departamento}{a.municipio ? `, ${a.municipio}` : ""}</span></>,
    texto: describirAlerta(a),
    accion: puede("indices:alertas") ? <button type="button" className="boton secundario pequeno" onClick={() => setRevisar(a)}>Revisar</button> : undefined,
  }));
  return (
    <>
      <EnPocasPalabras ancla="alertas-resumen">
        {periodos.length === 0 ? "Aún no hay alertas calculadas. Recalcule un mes en la vista Completa." : (
          <>
            {minimo !== null && maximo !== null && (
              <p>De cada 100 precios recolectados para el IPC, {Math.abs(maximo - minimo) < 0.15 ? <>unos <b>{fmt.numero(minimo, 1)}</b></> : <>entre <b>{fmt.numero(minimo, 1)}</b> y <b>{fmt.numero(maximo, 1)}</b></>} se marcaron para revisión. El equipo revisa esos, no todos.</p>
            )}
            <p>{nuevas ? <>Hay <b>{fmt.numero(nuevas)}</b> {plural(nuevas, "alerta sin revisar", "alertas sin revisar")}; <b>{fmt.numero(altasNuevas)}</b> {plural(altasNuevas, "es", "son")} de severidad alta: empiece por esas.</> : "No hay alertas sin revisar."}</p>
            {tasas.length > 0 && (
              <p className="pequeno suave">Por mes: {filas.filter((f) => f.tasa !== null).map((f) => `${mesTexto(f.p)}, ${fmt.numero(f.tasa as number, 1)} de cada 100`).join(" · ")}.</p>
            )}
          </>
        )}
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c4"><CifraClara etiqueta="Alertas sin revisar" numero={nuevas} formato={(v) => fmt.numero(v)}
          significa="Precios marcados que nadie ha confirmado ni descartado todavía." /></div>
        <div className="c4"><CifraClara tono="naranja" etiqueta="De severidad alta, sin revisar" numero={altasNuevas} formato={(v) => fmt.numero(v)}
          significa="Su cambio es el más distinto al del mismo artículo en otros lugares. Revíselas primero." /></div>
        <div className="c4"><CifraClara tono="verde" etiqueta="Ya revisadas" numero={revisadas} formato={(v) => fmt.numero(v)}
          significa="Confirmadas, descartadas o en revisión; cada decisión queda con su comentario en la bitácora." /></div>
      </div>
      {elementos.length > 0 && (
        <Tarjeta titulo="Por dónde empezar" ayuda="Alertas de severidad alta sin revisar, del mes más reciente primero.">
          <ListaSimple elementos={elementos} />
        </Tarjeta>
      )}
      <PieResumen fuente="INE, precios recolectados del IPC (julio 2022 y año 2023); cálculo de alertas: Nexo">
        La vista Completa tiene todas las alertas con filtros y el recálculo de un mes.
      </PieResumen>
      {revisar && <RevisarAlerta alerta={revisar} onCerrar={() => { setRevisar(null); recargar(); }} />}
    </>
  );
}

function CompletaAlertas() {
  const { puede } = useSesion();
  const [params, setParams] = useSearchParams();
  const periodo = params.get("periodo") ?? "";
  const [severidad, setSeveridad] = useState("");
  const [estado, setEstado] = useState("nueva");
  const [texto, setTexto] = useState("");
  const [pagina, setPagina] = useState(1);
  const { datos: resumen } = useDatos<any>("/api/indices/alertas/resumen");
  const consulta = new URLSearchParams({ ...(periodo && { periodo }), ...(severidad && { severidad }), ...(estado && { estado }), ...(texto && { texto }), pagina: String(pagina) });
  const { datos, recargar } = useDatos<any>(`/api/indices/alertas?${consulta}`);
  const [revisar, setRevisar] = useState<any>(null);
  const [detectando, setDetectando] = useState(false);
  useEffect(() => setPagina(1), [periodo, severidad, estado, texto]);
  const detectar = async () => {
    if (!periodo) { avisar("Elija un periodo para recalcular.", "alerta"); return; }
    setDetectando(true);
    try { const r: any = await api("/api/indices/alertas/detectar", { cuerpo: { periodo, c: 4 } }); avisar(`${r.alertas} alertas (${(r.proporcion * 100).toFixed(1)} %) con ${r.metodo}.`); recargar(); }
    finally { setDetectando(false); }
  };
  return (
    <>
      <Aviso tono="info">
        <b>Crítica de precios.</b> En julio 2022 el archivo público trae precio anterior y actual por informante codificado: se aplica <b>Hidiroglou-Berthelot</b> a los relativos de precio. En 2023 no trae código de informante, así que se marcan precios cuyo <b>nivel</b> se aleja de la mediana del mismo artículo y mes (mediana y MAD). Un precio sin cambio nunca se marca como atípico.
      </Aviso>
      <div className="fila">
        <select className="entrada" style={{ width: 160 }} value={periodo} onChange={(e) => setParams(e.target.value ? { periodo: e.target.value } : {})} aria-label="Periodo">
          <option value="">Todos los periodos</option>
          {(resumen?.periodos_disponibles ?? []).map((p: string) => <option key={p} value={p}>{p} ({resumen?.por_periodo?.[p] ?? 0})</option>)}
        </select>
        <select className="entrada" style={{ width: 150 }} value={severidad} onChange={(e) => setSeveridad(e.target.value)} aria-label="Severidad">
          <option value="">Toda severidad</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
        </select>
        <select className="entrada" style={{ width: 160 }} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todo estado</option><option value="nueva">Nuevas</option><option value="en_revision">En revisión</option><option value="confirmada">Confirmadas</option><option value="descartada">Descartadas</option>
        </select>
        <input className="entrada" style={{ width: 200 }} placeholder="Artículo…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        {puede("indices:alertas") && <button className="boton secundario" onClick={detectar} disabled={detectando}><Play /> {detectando ? "Calculando…" : "Recalcular periodo"}</button>}
      </div>
      {!datos ? <div className="tarjeta"><EsqueletoTabla filas={8} /></div> : (
        <>
          <Tabla filas={datos.alertas} onFila={puede("indices:alertas") ? setRevisar : undefined} vacio="Sin alertas con estos filtros." columnas={[
            { id: "p", titulo: "Periodo", valor: (a: any) => a.periodo },
            { id: "a", titulo: "Artículo", valor: (a: any) => a.articulo },
            { id: "d", titulo: "Lugar", valor: (a: any) => a.departamento, celda: (a: any) => <span className="pequeno">{a.departamento}<br /><span className="suave">{a.municipio}</span></span> },
            { id: "i", titulo: "Informante", valor: (a: any) => a.informante, celda: (a: any) => <span className="mono">{a.informante}</span> },
            { id: "pa", titulo: "Antes", num: true, valor: (a: any) => a.precio_anterior, celda: (a: any) => fmt.moneda(a.precio_anterior) },
            { id: "pc", titulo: "Ahora", num: true, valor: (a: any) => a.precio_actual, celda: (a: any) => fmt.moneda(a.precio_actual) },
            { id: "r", titulo: "Relativo", num: true, valor: (a: any) => a.relativo, celda: (a: any) => `${fmt.numero(a.relativo, 2)} (med. ${fmt.numero(a.mediana_grupo, 2)})` },
            { id: "s", titulo: "Severidad", valor: (a: any) => a.orden, celda: (a: any) => <Severidad valor={a.severidad} /> },
            { id: "e", titulo: "Estado", valor: (a: any) => a.estado, celda: (a: any) => <Severidad valor={a.estado} /> },
          ]} />
          <div className="fila espaciado pequeno">
            <span className="suave">{fmt.numero(datos.total)} alertas · página {datos.pagina}</span>
            <div className="fila"><button className="boton secundario pequeno" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button><button className="boton secundario pequeno" disabled={pagina * 50 >= datos.total} onClick={() => setPagina(pagina + 1)}>Siguiente</button></div>
          </div>
          <FuenteCita>INE, precios recolectados del IPC (julio 2022 y año 2023). Cálculo de alertas: Nexo.</FuenteCita>
        </>
      )}
      {revisar && <RevisarAlerta alerta={revisar} onCerrar={() => { setRevisar(null); recargar(); }} />}
    </>
  );
}

function Alertas() {
  return <SegunVista resumen={<ResumenAlertas />} completa={<CompletaAlertas />} />;
}

function RevisarAlerta({ alerta, onCerrar }: { alerta: any; onCerrar: () => void }) {
  const [estado, setEstado] = useState(alerta.estado === "nueva" ? "confirmada" : alerta.estado);
  const [comentario, setComentario] = useState(alerta.comentario ?? "");
  const [error, setError] = useState("");
  return (
    <Modal titulo={`Revisar alerta · ${alerta.articulo}`} onCerrar={onCerrar}>
      <div className="columna">
        <p className="pequeno">{alerta.departamento}, {alerta.municipio} · informante <span className="mono">{alerta.informante}</span> · {alerta.periodo}</p>
        <div className="rejilla">
          <div className="c4"><Kpi etiqueta="Precio anterior" valor={fmt.moneda(alerta.precio_anterior)} /></div>
          <div className="c4"><Kpi tono="naranja" etiqueta="Precio actual" valor={fmt.moneda(alerta.precio_actual)} /></div>
          <div className="c4"><Kpi tono="morado" etiqueta="Relativo / mediana" valor={`${fmt.numero(alerta.relativo, 2)} / ${fmt.numero(alerta.mediana_grupo, 2)}`} detalle={`n = ${alerta.n_grupo} · ${alerta.metodo}`} /></div>
        </div>
        <p className="pequeno suave">{describirAlerta(alerta)}</p>
        {error && <Aviso tono="critico">{error}</Aviso>}
        <Campo etiqueta="Decisión"><select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="confirmada">Confirmar: el precio es correcto (cambio real)</option>
          <option value="descartada">Descartar: error de captura (corregir con la fuente)</option>
          <option value="en_revision">En revisión con el recolector</option>
        </select></Campo>
        <Campo etiqueta="Comentario (obligatorio para confirmar o descartar; queda en la bitácora)"><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} /></Campo>
        <button className="boton" onClick={async () => {
          try { await api(`/api/indices/alertas/${alerta.id}`, { metodo: "PATCH", cuerpo: { estado, comentario } }); avisar("Alerta revisada."); onCerrar(); }
          catch (e) { setError((e as Error).message); }
        }}>Guardar revisión</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ Catálogo

function ResumenCatalogo({ texto, setTexto, datos }: { texto: string; setTexto: (t: string) => void; datos: any[] | null }) {
  const navegar = useNavigate();
  const buscando = texto.length >= 2;
  const total = (datos ?? []).reduce((s, a) => s + (a.observaciones ?? 0), 0);
  return (
    <>
      <EnPocasPalabras>
        Busque cualquier artículo del IPC y vea su precio mediano por mes y por departamento. Este catálogo es la base del
        «Manual de Características» digital que propuso la DIEC para los dispositivos de campo.
      </EnPocasPalabras>
      <Tarjeta titulo="Busque un artículo">
        <label className="buscador-grande">
          <Search size={20} aria-hidden />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Frijol, gas propano, cuaderno…" aria-label="Artículo" autoComplete="off" />
        </label>
      </Tarjeta>
      {!datos ? <><EsqueletoKpis n={2} /><div className="tarjeta"><EsqueletoTabla filas={6} /></div></> : (
        <>
          <div className="rejilla escalonada">
            <div className="c6"><CifraClara etiqueta={buscando ? "Artículos encontrados" : "Artículos en la lista"} numero={datos.length} formato={(v) => fmt.numero(v)}
              detalle={!buscando && datos.length >= 300 ? "Los 300 con más precios recolectados" : undefined}
              significa="Cada artículo tiene su código, cuántos precios se recolectaron y en cuántos departamentos." /></div>
            <div className="c6"><CifraClara tono="morado" etiqueta="Precios recolectados de estos artículos" numero={total} formato={(v) => fmt.numero(v)}
              significa="Cada precio es una observación de un artículo en un establecimiento y un mes (julio 2022 y año 2023)." /></div>
          </div>
          <Tarjeta titulo={buscando ? `Resultados para «${texto}»` : "Artículos con más precios recolectados"} ayuda="Pulse un artículo para ver su ficha.">
            <Tabla maximo={12} filas={datos} onFila={(a: any) => navegar(`/indices/articulo/${a.codigo}`)} vacio="No encontramos artículos con ese nombre." columnas={[
              { id: "a", titulo: "Artículo", valor: (a: any) => a.articulo, celda: (a: any) => <b>{a.articulo}</b> },
              { id: "o", titulo: "Precios recolectados", num: true, valor: (a: any) => a.observaciones, celda: (a: any) => fmt.numero(a.observaciones) },
              { id: "d", titulo: "Departamentos", num: true, valor: (a: any) => a.departamentos },
            ]} />
          </Tarjeta>
        </>
      )}
      <PieResumen fuente="INE, precios recolectados del IPC" />
    </>
  );
}

function Catalogo() {
  const [texto, setTexto] = useState("");
  const { datos } = useDatos<any[]>(`/api/indices/articulos${texto.length >= 2 ? `?texto=${encodeURIComponent(texto)}` : ""}`);
  const navegar = useNavigate();
  return (
    <SegunVista resumen={<ResumenCatalogo texto={texto} setTexto={setTexto} datos={datos} />} completa={<>
      <Aviso tono="info">Catálogo digital de artículos del IPC con su cobertura: base para el «Manual de Características» en dispositivos móviles que propuso la DIEC.</Aviso>
      <input className="entrada" placeholder="Busque un artículo: frijol, gas propano, cuaderno…" value={texto} onChange={(e) => setTexto(e.target.value)} />
      {!datos ? <div className="tarjeta"><EsqueletoTabla filas={8} /></div> : (
        <Tabla maximo={150} filas={datos} onFila={(a: any) => navegar(`/indices/articulo/${a.codigo}`)} columnas={[
          { id: "c", titulo: "Código", valor: (a: any) => a.codigo, celda: (a: any) => <span className="mono">{a.codigo}</span> },
          { id: "a", titulo: "Artículo", valor: (a: any) => a.articulo },
          { id: "o", titulo: "Observaciones", num: true, valor: (a: any) => a.observaciones, celda: (a: any) => fmt.numero(a.observaciones) },
          { id: "d", titulo: "Departamentos", num: true, valor: (a: any) => a.departamentos },
          { id: "u", titulo: "Último periodo", valor: (a: any) => a.ultimo_periodo },
        ]} />
      )}
    </>} />
  );
}

// ------------------------------------------------------------------------------------------------ Artículo

function ResumenArticulo({ datos, linea }: { datos: any; linea: any }) {
  const meses = (datos.por_mes as any[]).filter((m) => m.mediana !== null);
  const ultimo = meses.at(-1), primero = meses[0];
  const deptos = (datos.por_departamento as any[]).filter((d) => !d.suprimido && d.mediana !== null).sort((a, b) => b.mediana - a.mediana);
  const suprimidos = (datos.por_departamento as any[]).length - deptos.length;
  const k = /menos de (\d+)/.exec(datos.nota ?? "")?.[1];
  const cambio = ultimo && primero && ultimo !== primero ? (ultimo.mediana / primero.mediana - 1) * 100 : null;
  return (
    <>
      <EnPocasPalabras>
        {ultimo ? (
          <>
            <p>En {mesTexto(ultimo.x)}, el precio unitario mediano de <b>{String(datos.articulo).toLowerCase()}</b> fue <b>{fmt.moneda(ultimo.mediana)}</b>.</p>
            {deptos.length >= 2 && <p>El departamento con el precio mediano más alto fue {deptos[0].x} ({fmt.moneda(deptos[0].mediana)}) y el más bajo, {deptos.at(-1).x} ({fmt.moneda(deptos.at(-1).mediana)}).</p>}
          </>
        ) : "Este artículo no tiene meses con suficientes informantes para mostrar su precio."}
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c4"><CifraClara etiqueta="Precio unitario mediano" valor={ultimo ? fmt.moneda(ultimo.mediana) : "—"} detalle={ultimo ? mesTexto(ultimo.x) : undefined}
          significa="El precio del medio: la mitad cuesta menos y la otra mitad más; no se deja afectar por precios extremos." /></div>
        <div className="c4"><CifraClara tono="morado" etiqueta="Cambio en el periodo" valor={cambio !== null ? conSigno(cambio) : "—"}
          detalle={cambio !== null ? `De ${mesTexto(primero.x)} a ${mesTexto(ultimo.x)}` : undefined}
          significa="Compara el primer y el último mes con datos publicados (julio 2022 y año 2023)." /></div>
        <div className="c4"><CifraClara tono="verde" etiqueta="Departamentos con dato" numero={deptos.length} formato={(v) => fmt.numero(v)}
          significa={suprimidos ? `${suprimidos} ${plural(suprimidos, "departamento no se muestra", "departamentos no se muestran")} por tener ${k ? `menos de ${k}` : "pocos"} informantes: así se protege el secreto estadístico.` : "Todos los departamentos con precios de este artículo tienen suficientes informantes."} /></div>
      </div>
      <Tarjeta titulo="Precio unitario mediano por mes">{linea ? <Grafica opcion={linea} /> : <EsqueletoGrafica />}</Tarjeta>
      <PieResumen fuente="INE, precios recolectados del IPC. Supresión por secreto estadístico aplicada">
        La vista Completa agrega el precio mediano por departamento.
      </PieResumen>
    </>
  );
}

function Articulo() {
  const { codigo } = useParams();
  const { datos } = useDatos<any>(`/api/indices/articulos/${codigo}`);
  const linea = useMemo(() => datos ? opcionLinea([{ nombre: "Precio unitario mediano", puntos: datos.por_mes.map((p: any) => [p.x, p.mediana]) }], (v) => fmt.moneda(v)) : null, [datos]);
  if (!datos) return <div className="columna" style={{ gap: 16 }}><div className="esqueleto" style={{ height: 56, width: "50%" }} /><EsqueletoKpis n={3} /><div className="tarjeta"><EsqueletoGrafica /></div></div>;
  const deptos = datos.por_departamento.filter((d: any) => !d.suprimido).slice(0, 22);
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado migas={<><Link to="/indices">Índices</Link> › <Link to="/indices/catalogo">Catálogo</Link> ›</>} titulo={datos.articulo} subtitulo={<>Código {datos.codigo}. {datos.nota}</>}
        acciones={<BotonAyuda ayuda={AYUDA_ARTICULO} />} />
      <SegunVista resumen={<ResumenArticulo datos={datos} linea={linea} />} completa={<>
        <div className="rejilla">
          <div className="c6"><Tarjeta titulo="Precio unitario mediano por mes">{linea && <Grafica opcion={linea} />}</Tarjeta></div>
          <div className="c6"><Tarjeta titulo="Precio unitario mediano por departamento"><Grafica opcion={opcionBarras(deptos.map((d: any) => d.x), deptos.map((d: any) => d.mediana), true, (v) => fmt.moneda(v))} alto={Math.max(260, deptos.length * 24)} /></Tarjeta></div>
        </div>
        <FuenteCita>INE, precios recolectados del IPC. Supresión por secreto estadístico aplicada.</FuenteCita>
      </>} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Página

const AYUDAS: Record<string, AyudaPantalla> = { resumen: AYUDA_INDICADORES, alertas: AYUDA_ALERTAS, catalogo: AYUDA_CATALOGO };

export default function Indices() {
  const navegar = useNavigate();
  const params = useParams();
  const sub = (params["*"] ?? "").split("/")[0] || "resumen";
  return (
    <div className="columna" style={{ gap: 16 }}>
      {!sub.startsWith("articulo") && (
        <Encabezado titulo="Índices y Estadísticas Continuas" subtitulo="IPC base 2024, canasta básica, materiales de construcción y la crítica automática de los precios recolectados."
          acciones={<BotonAyuda ayuda={AYUDAS[sub] ?? AYUDA_INDICADORES} />} />
      )}
      {!sub.startsWith("articulo") && <Pestanas opciones={[{ id: "resumen", etiqueta: "Indicadores" }, { id: "alertas", etiqueta: "Alertas de precios" }, { id: "catalogo", etiqueta: "Catálogo de artículos" }]} activa={sub as any} onCambio={(id) => navegar(`/indices/${id === "resumen" ? "" : id}`)} />}
      <Routes>
        <Route index element={<Indicadores />} />
        <Route path="alertas" element={<Alertas />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="articulo/:codigo" element={<Articulo />} />
      </Routes>
    </div>
  );
}
