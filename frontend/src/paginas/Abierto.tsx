// Nexo Abierto: la información pública del INE sin cuenta. Tres entradas: «¿Cuánto debería costar?» (lo que pagó el
// Estado y los precios de referencia del INE), «Mi municipio en datos» (Censo 2018 y proyecciones) y «Pregunte a los
// datos» (tableros armados solo con fuentes públicas). Es de solo lectura, muestra únicamente cifras ya publicadas y
// cada sección enlaza al archivo original. Usa /api/publico/*, que no pide sesión y limita las consultas por conexión.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpenCheck, Copy, ExternalLink, LogIn, MapPin, Route as IconoRuta, Scale, Search, ShieldCheck, Tags } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionBarras, opcionLinea } from "../componentes/Grafica";
import { MapaGT } from "../componentes/MapaGT";
import { useRecorrido } from "../componentes/Recorrido";
import { RutaConsulta, TableroVista } from "../componentes/Widget";
import { Aviso, avisar, Encabezado, EsqueletoGrafica, EsqueletoKpis, EsqueletoTabla, FuenteCita, Insignia, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { CifraClara, EnPocasPalabras, PieResumen, RangoPrecios, SegunVista, SelectorVista, useVista } from "../componentes/vista";

const PORTAL_INE = "https://datos.ine.gob.gt";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesTexto = (periodo?: string | null) => {
  if (!periodo) return "";
  const [a, m] = periodo.split("-").map(Number);
  return m ? `${MESES[m - 1]} de ${a}` : String(a);
};

interface Fuente { titulo: string; publicador?: string; pagina?: string; url?: string; licencia?: string; descargado_en?: string | null; usado_en?: string }

/** Archivos oficiales que usa Nexo (null mientras cargan). */
function useFuentes(filtro: (f: Fuente) => boolean): Fuente[] | null {
  const { datos } = useDatos<Fuente[]>("/api/publico/fuentes");
  return useMemo(() => (datos ? datos.filter(filtro) : null), [datos]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Enlaces a los archivos originales, con su fecha de descarga: cualquiera puede verificar la cifra. */
function EnlacesFuente({ fuentes, extra }: { fuentes: Fuente[]; extra?: ReactNode }) {
  return (
    <div className="pequeno suave columna" style={{ gap: 4 }}>
      {fuentes.map((f) => (
        <span key={f.titulo + (f.pagina ?? "")}>
          {f.pagina ? <a href={f.pagina} target="_blank" rel="noreferrer noopener">{f.titulo} <ExternalLink size={12} /></a> : f.titulo}
          {f.licencia && <> · {f.licencia}</>}{f.descargado_en && <> · descargado el {fmt.fecha(f.descargado_en)}</>}
        </span>
      ))}
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Marco público

function MarcoPublico({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const { iniciar } = useRecorrido();
  useEffect(() => {
    const previo = document.title;
    document.title = "Nexo Abierto · datos públicos del INE";
    return () => { document.title = previo; };
  }, []);
  const enlaces = [
    { ruta: "/abierto", texto: "Inicio", fin: true },
    { ruta: "/abierto/precios", texto: "¿Cuánto debería costar?" },
    { ruta: "/abierto/municipios", texto: "Mi municipio en datos" },
    { ruta: "/abierto/preguntar", texto: "Pregunte a los datos" },
  ];
  return (
    <div className="publico">
      <header className="publico-barra">
        <Link to="/abierto" className="marca" aria-label="Nexo Abierto, inicio">
          <img src="/favicon.svg" alt="" />
          <span><b>Nexo Abierto</b><small>Datos públicos del INE, sin cuenta</small></span>
        </Link>
        <nav aria-label="Secciones de Nexo Abierto">
          {enlaces.map((e) => <NavLink key={e.ruta} to={e.ruta} end={e.fin} className={({ isActive }) => (isActive ? "activo" : "")}>{e.texto}</NavLink>)}
        </nav>
        <div className="acciones">
          <SelectorVista />
          <button type="button" className="boton fantasma pequeno" onClick={() => iniciar("abierto")}><IconoRuta /> Recorrido</button>
          {usuario ? <Link className="boton secundario pequeno" to="/">Volver a Nexo</Link>
            : <Link className="boton secundario pequeno" to="/login" title="Solo para personal del INE y entidades registradas"><LogIn /> Entrar</Link>}
        </div>
      </header>
      <main className="publico-contenido" id="contenido">{children}</main>
      <footer className="publico-pie">
        <span>Fuente de los datos: Instituto Nacional de Estadística (INE), Guatemala, y Guatecompras OCDS (CC BY 4.0). <a href={PORTAL_INE} target="_blank" rel="noreferrer noopener">Portal de datos abiertos del INE</a>.</span>
        <span>Nexo es un prototipo del Datatón INE 2026; no es un sitio oficial del INE.</span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Portada

function Portada() {
  const { datos: d } = useDatos<any>("/api/publico/inicio");
  const { iniciar } = useRecorrido();
  const navegar = useNavigate();
  const fuentes = useFuentes(() => true);
  const ipc = d?.ipc, cba = d?.cba, pob = d?.poblacion, compras = d?.compras;
  return (
    <div className="columna" style={{ gap: 22 }}>
      <section className="vidrio portada">
        <div>
          <span className="sobretitulo">Información estadística oficial</span>
          <h1 style={{ marginTop: 8 }}>Los datos del INE, explicados para todos</h1>
          <p className="lead">Consulte sin crear una cuenta cuánto paga el Estado por lo que compra, cómo es su municipio y qué dicen las cifras oficiales. Cada número trae su fuente y el enlace al archivo original.</p>
          <div className="fila" style={{ marginTop: 18 }}>
            <button type="button" className="boton" onClick={() => navegar("/abierto/precios")}><Tags /> Consultar un precio</button>
            <button type="button" className="boton secundario" onClick={() => iniciar("abierto")}><IconoRuta /> Recorrido de 1 minuto</button>
          </div>
        </div>
        {!d ? <EsqueletoTabla filas={4} /> : (
          <div className="cifras" aria-label="Cifras de hoy">
            <div><b>{fmt.pct(ipc?.interanual, 2)}</b><span>Inflación en 12 meses · {mesTexto(ipc?.periodo)}</span></div>
            <div><b>{fmt.moneda(cba?.urbana)}</b><span>Canasta básica urbana por persona al mes</span></div>
            <div><b>{fmt.numero(pob?.proyectada)}</b><span>Habitantes proyectados para {pob?.anio}</span></div>
            <div><b>{fmt.numero(compras?.n)}</b><span>Compras públicas con precio por unidad</span></div>
          </div>
        )}
      </section>

      <section aria-label="Qué puede hacer" data-recorrido="abierto-entradas">
        <div className="sobretitulo" style={{ marginBottom: 10 }}>Tres maneras de usar los datos</div>
        <div className="rejilla escalonada">
          {[
            { ruta: "/abierto/precios", icono: Tags, titulo: "¿Cuánto debería costar?", texto: "Escriba un producto y vea cuánto pagó el Estado, con la mediana y el rango, y los precios de referencia del INE." },
            { ruta: "/abierto/municipios", icono: MapPin, titulo: "Mi municipio en datos", texto: "Población del Censo 2018, proyección para este año y sus lugares poblados, lista para citar." },
            { ruta: "/abierto/preguntar", icono: Search, titulo: "Pregunte a los datos del INE", texto: "Escriba una pregunta con sus palabras y obtenga un tablero con cifras oficiales y sus notas de método." },
          ].map((e) => (
            <Link key={e.ruta} to={e.ruta} className="c4 tarjeta modulo">
              <span className="icono-modulo"><e.icono size={20} /></span>
              <div style={{ minWidth: 0 }}><h3>{e.titulo}</h3><p className="pequeno suave">{e.texto}</p></div>
              <ArrowRight className="ir" size={18} />
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Cifras de hoy, explicadas">
        <div className="sobretitulo" style={{ marginBottom: 10 }}>Cifras de hoy, explicadas</div>
        {!d ? <EsqueletoKpis n={3} /> : (
          <div className="rejilla escalonada">
            <div className="c4"><CifraClara etiqueta="Inflación en 12 meses (IPC)" numero={ipc?.interanual} formato={(v) => fmt.pct(v, 2)} detalle={`Dato de ${mesTexto(ipc?.periodo)}`}
              significa={ipc?.interanual != null ? <>Lo que costaba <b>Q100</b> hace un año, hoy cuesta en promedio <b>{fmt.moneda(100 + ipc.interanual)}</b>.</> : undefined} /></div>
            <div className="c4"><CifraClara tono="verde" etiqueta="Canasta básica alimentaria urbana" numero={cba?.urbana} formato={(v) => fmt.moneda(v)} detalle={`Rural ${fmt.moneda(cba?.rural)} · ${mesTexto(cba?.periodo)}`}
              significa="Lo que cuesta al mes la alimentación mínima de una persona en el área urbana (2,052 kilocalorías diarias)." /></div>
            <div className="c4"><CifraClara tono="morado" etiqueta={`Población proyectada ${pob?.anio ?? ""}`} numero={pob?.proyectada} formato={(v) => fmt.numero(v)}
              detalle={`Censo 2018: ${fmt.numero(pob?.censo_2018)} personas censadas`}
              significa={<>Estimación oficial del INE para este año en {fmt.numero(pob?.municipios)} municipios y {fmt.numero(pob?.lugares_poblados)} lugares poblados.</>} /></div>
          </div>
        )}
      </section>

      <Tarjeta titulo="Cómo usar bien estos datos" ayuda="Tres cuidados para no sacar conclusiones equivocadas, basados en las recomendaciones del INE sobre el uso de sus datos.">
        <div className="consejos" data-recorrido="abierto-buen-uso">
          <div className="modulo"><span className="icono-modulo"><BookOpenCheck size={20} /></span><div><h3>Cite la fuente y la fecha</h3><p className="pequeno suave">Escriba «Fuente: INE» y la fecha en que consultó el dato. Cada sección le da el texto listo para copiar.</p></div></div>
          <div className="modulo"><span className="icono-modulo"><Scale size={20} /></span><div><h3>Compare lo comparable</h3><p className="pequeno suave">Un índice y un precio no se comparan, ni dos productos con especificaciones distintas. Lea las notas de cada cifra.</p></div></div>
          <div className="modulo"><span className="icono-modulo"><ShieldCheck size={20} /></span><div><h3>Las cifras con pocos casos se ocultan</h3><p className="pequeno suave">Por secreto estadístico, Nexo nunca muestra datos que permitan identificar a una persona, un hogar o una empresa.</p></div></div>
        </div>
      </Tarjeta>

      <SegunVista
        resumen={<PieResumen fuente={<>Instituto Nacional de Estadística, <a href={PORTAL_INE} target="_blank" rel="noreferrer noopener">datos.ine.gob.gt</a></>}>La vista Completa muestra cada archivo que usa Nexo con su fecha de descarga.</PieResumen>}
        completa={
          <Tarjeta titulo="Archivos oficiales que usa Nexo" ayuda="Descargados del portal de datos abiertos del INE; la huella SHA-256 permite verificar que no cambiaron.">
            {!fuentes ? <EsqueletoTabla filas={5} /> : <EnlacesFuente fuentes={fuentes} />}
          </Tarjeta>
        } />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- ¿Cuánto debería costar?

const EJEMPLOS_PRECIOS = ["computadora portátil", "papel bond", "tóner", "silla de oficina", "escritorio", "impresora", "aire acondicionado", "cemento"];

function EjemploMediaMedianaModa({ recomendado, razon }: { recomendado?: string; razon?: string }) {
  return (
    <Tarjeta titulo="Media, mediana y moda: ¿cuál usar?" ayuda="El ejemplo de cinco proveedores con el que la Dirección de Precios e Índices de Referencia explica las tres medidas.">
      <div data-recorrido="abierto-mmm" className="columna" style={{ gap: 12 }}>
        <div className="proveedores" aria-label="Cinco cotizaciones de ejemplo">{["Q4,200", "Q4,500", "Q4,800", "Q5,100", "Q5,400"].map((p, i) => <span key={p}>Proveedor {String.fromCharCode(65 + i)}: <b>{p}</b></span>)}</div>
        <div className="ejemplo-mmm">
          <div><span className="pequeno suave">Media (promedio)</span><b>Q4,800</b><span className="pequeno">Se suman los cinco precios y se dividen entre 5. Usa todos los datos, pero un precio muy alto la mueve: si un proveedor cobrara Q20,000 en vez de Q5,400, la media subiría a Q7,720.</span></div>
          <div><span className="pequeno suave">Mediana</span><b>Q4,800</b><span className="pequeno">El precio del medio al ordenarlos de menor a mayor. Con el proveedor de Q20,000 seguiría en Q4,800: no se deja afectar por los extremos.</span></div>
          <div><span className="pequeno suave">Moda</span><b>el más repetido</b><span className="pequeno">El precio que más proveedores cobran. Sirve para conocer el precio más común del mercado.</span></div>
        </div>
        {recomendado && (
          <Aviso tono="info">
            En esta búsqueda Nexo usa la <b>{recomendado}</b>{recomendado === "mediana"
              ? ": los precios varían mucho o hay precios extremos, y la mediana no se deja afectar por ellos."
              : ": los precios son parecidos entre sí, así que el promedio aprovecha todos los datos."}
            {razon && <span className="suave"> Detalle técnico: {razon}</span>}
          </Aviso>
        )}
      </div>
    </Tarjeta>
  );
}

function PreciosPublicos() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const unspsc = params.get("unspsc") ?? "";
  const [texto, setTexto] = useState(q);
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const fuentesPr = useFuentes((f) => /referencia/i.test(`${f.titulo} ${f.usado_en ?? ""}`));
  useEffect(() => setTexto(q), [q]);
  useEffect(() => {
    if (q.trim().length < 2) { setR(null); return; }
    let vivo = true;
    setCargando(true); setError("");
    api<any>(`/api/publico/precios?q=${encodeURIComponent(q)}${unspsc ? `&unspsc=${encodeURIComponent(unspsc)}` : ""}`)
      .then((d) => vivo && setR(d)).catch((e: ErrorApi) => vivo && (setError(e.message), setR(null)))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [q, unspsc]);
  const buscar = (t: string, u = "") => setParams(t.trim() ? { q: t.trim(), ...(u && { unspsc: u }) } : {});
  const s = r?.resumen;
  const hist = useMemo(() => (r?.histograma ?? []).map((b: any) => ({ e: fmt.moneda(b.desde, 0), n: b.n })), [r]);
  const linea = useMemo(() => (r?.por_mes?.length ? opcionLinea([{ nombre: "Precio mediano", puntos: r.por_mes.map((m: any) => [m.mes, m.mediana]) }], (v) => fmt.moneda(v, 0)) : null), [r]);
  const veces = s?.p10 && s?.p90 ? s.p90 / s.p10 : null;
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado sobretitulo="Compras públicas" titulo="¿Cuánto debería costar?"
        subtitulo="Escriba un producto y vea cuánto pagaron las instituciones del Estado por unidad en los últimos dos años, y los precios de referencia que ha publicado el INE." />
      <Tarjeta>
        <form className="consulta tarjeta" style={{ padding: "6px 6px 6px 14px", boxShadow: "none" }} onSubmit={(e: FormEvent) => { e.preventDefault(); buscar(texto); }}>
          <Search className="icono-lupa" size={20} />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: computadora portátil" aria-label="Producto" autoComplete="off" />
          <button className="boton" disabled={cargando}>{cargando ? "Consultando…" : "Consultar"}</button>
        </form>
        <div className="fila pequeno" style={{ marginTop: 10, gap: 8 }}>
          <span className="suave">Pruebe con:</span>
          {EJEMPLOS_PRECIOS.map((e) => <button key={e} type="button" className="chip" onClick={() => buscar(e)}>{e}</button>)}
        </div>
      </Tarjeta>
      {error && <Aviso tono="alerta">{error}</Aviso>}
      {cargando && !r && <><EsqueletoKpis n={3} /><Tarjeta><EsqueletoGrafica alto={120} /></Tarjeta></>}
      {!q && !cargando && <EjemploMediaMedianaModa />}
      {r && s && (
        !r.suficiente ? (
          <Aviso tono="info">Encontramos {fmt.numero(s.n)} compra{s.n === 1 ? "" : "s"} comparable{s.n === 1 ? "" : "s"} de «{r.consulta}»: son muy pocas para dar un rango confiable. Pruebe con otras palabras o con un nombre más general.</Aviso>
        ) : (
          <SegunVista
            resumen={
              <>
                <EnPocasPalabras>
                  La mitad de las compras públicas de <b>{r.consulta}</b> costó menos de <b>{fmt.moneda(s.mediana, 0)}</b> por unidad, y 8 de cada 10 costaron entre <b>{fmt.moneda(s.p10, 0)}</b> y <b>{fmt.moneda(s.p90, 0)}</b>.
                  {" "}<span className="suave">Son {fmt.numero(s.n)} compras de {fmt.numero(s.entidades)} instituciones, llevadas a quetzales de {mesTexto(r.ajuste?.a_precios_de)}.</span>
                </EnPocasPalabras>
                <Tarjeta titulo="Dónde cae la mayoría de los precios">
                  <RangoPrecios ancla="abierto-rango" p10={s.p10} p25={s.p25} mediana={s.mediana} p75={s.p75} p90={s.p90} />
                </Tarjeta>
                <div className="rejilla escalonada">
                  <div className="c4"><CifraClara etiqueta="Precio orientativo" valor={fmt.moneda(s.precio_orientativo, 0)} detalle={`Con la ${s.estadistico_recomendado}`}
                    significa="Sirve para planificar una compra. No sustituye al precio de referencia oficial que emite el INE a solicitud de cada entidad." /></div>
                  <div className="c4"><CifraClara tono="morado" etiqueta="Compras comparables" numero={s.n} formato={(v) => fmt.numero(v)} detalle={`${fmt.numero(s.entidades)} instituciones · ${s.atipicos} atípicas fuera`}
                    significa="Compras de un solo artículo en Guatecompras, con su precio por unidad calculado y comparable entre sí." /></div>
                  <div className="c4"><CifraClara tono="naranja" etiqueta="Diferencia entre barato y caro" valor={veces ? `${fmt.numero(veces, 1)} veces` : "—"} detalle="10 % más caro frente a 10 % más barato"
                    significa="Una diferencia grande suele venir de especificaciones distintas. Afine la búsqueda para comparar lo mismo." /></div>
                </div>
                {r.grupos?.length > 1 && (
                  <div className="fila pequeno">
                    <span className="suave">¿Busca algo más específico? Elija el tipo:</span>
                    {r.grupos.slice(0, 6).map((g: any) => (
                      <button key={g.unspsc + g.unidad} type="button" className="chip" title={g.ejemplo} aria-pressed={unspsc === g.unspsc} onClick={() => buscar(q, unspsc === g.unspsc ? "" : g.unspsc)}>
                        {g.ejemplo.slice(0, 42)}{g.ejemplo.length > 42 ? "…" : ""} <b>{g.n}</b>
                      </button>
                    ))}
                  </div>
                )}
                <EjemploMediaMedianaModa recomendado={s.estadistico_recomendado} razon={s.razon} />
                <PieResumen fuente={<>Guatecompras OCDS (CC BY 4.0), precio por unidad calculado por Nexo; ajuste con el IPC del INE</>}>
                  La vista Completa muestra la distribución, la evolución mensual y cada compra con su enlace.
                </PieResumen>
              </>
            }
            completa={
              <>
                <div className="rejilla">
                  <div className="c3"><CifraClara etiqueta="Mediana" valor={fmt.moneda(s.mediana)} detalle={`Media ${fmt.moneda(s.media, 0)} · moda ${fmt.moneda(s.moda, 0)}`} /></div>
                  <div className="c3"><CifraClara tono="verde" etiqueta="Mitad central (P25 a P75)" valor={<span style={{ fontSize: "1.3rem" }}>{fmt.moneda(s.p25, 0)} a {fmt.moneda(s.p75, 0)}</span>} detalle={`P10 ${fmt.moneda(s.p10, 0)} · P90 ${fmt.moneda(s.p90, 0)}`} /></div>
                  <div className="c3"><CifraClara tono="morado" etiqueta="Compras · instituciones" valor={`${fmt.numero(s.n)} · ${fmt.numero(s.entidades)}`} detalle={`${s.atipicos} atípicas excluidas · ${fmt.fecha(r.periodo?.desde)} a ${fmt.fecha(r.periodo?.hasta)}`} /></div>
                  <div className="c3"><CifraClara tono="naranja" etiqueta="Dispersión (CV)" valor={fmt.pct(s.cv)} detalle={`Mínimo ${fmt.moneda(s.minimo, 0)} · máximo ${fmt.moneda(s.maximo, 0)}`} /></div>
                </div>
                <div className="rejilla">
                  <div className="c6"><Tarjeta titulo="Distribución de precios por unidad (sin atípicos)" ayuda={`Quetzales de ${mesTexto(r.ajuste?.a_precios_de)} · ${r.ajuste?.base}`}>
                    <Grafica opcion={opcionBarras(hist.map((h: any) => h.e), hist.map((h: any) => h.n))} />
                  </Tarjeta></div>
                  <div className="c6"><Tarjeta titulo="Precio mediano por mes">{linea ? <Grafica opcion={linea} /> : <p className="suave pequeno">Sin suficientes meses con datos.</p>}</Tarjeta></div>
                </div>
                <Tarjeta titulo="Compras encontradas" ayuda="Revise que sean comparables: misma unidad y especificaciones. Cada número de operación (NOG) abre el expediente en Guatecompras.">
                  <Tabla maximo={50} filas={r.compras} columnas={[
                    { id: "f", titulo: "Fecha", valor: (c: any) => c.fecha, celda: (c: any) => fmt.fecha(c.fecha) },
                    { id: "d", titulo: "Descripción", valor: (c: any) => c.descripcion, celda: (c: any) => <span className="pequeno">{c.descripcion}</span> },
                    { id: "e", titulo: "Institución", valor: (c: any) => c.entidad, celda: (c: any) => <span className="pequeno">{c.entidad}</span> },
                    { id: "q", titulo: "Cant.", num: true, valor: (c: any) => c.cantidad, celda: (c: any) => fmt.numero(c.cantidad) },
                    { id: "p", titulo: "Precio", num: true, valor: (c: any) => c.precio, celda: (c: any) => fmt.moneda(c.precio) },
                    { id: "a", titulo: "Ajustado IPC", num: true, valor: (c: any) => c.precio_ajustado, celda: (c: any) => <>{fmt.moneda(c.precio_ajustado)} {c.atipico && <Insignia tono="alerta">atípico</Insignia>}</> },
                    { id: "n", titulo: "NOG", valor: (c: any) => c.nog, celda: (c: any) => (c.enlace ? <a href={c.enlace} target="_blank" rel="noreferrer noopener">{c.nog} <ExternalLink size={12} /></a> : c.nog) },
                  ]} />
                </Tarjeta>
                {r.referencias_ine?.length > 0 && (
                  <Tarjeta titulo="Precios de referencia publicados por el INE" ayuda="Precios que la DPIR entregó a instituciones del Estado, según las bases publicadas por el INE (versiones de junio de 2022 y septiembre de 2023). La fecha es la de entrega de cada precio; la búsqueda es por palabras, así que revise que el producto sea el mismo.">
                    <Tabla filas={r.referencias_ine} columnas={[
                      { id: "f", titulo: "Fecha", valor: (c: any) => c.fecha, celda: (c: any) => fmt.fecha(c.fecha) },
                      { id: "d", titulo: "Producto y características", valor: (c: any) => c.producto, celda: (c: any) => <span className="pequeno"><b>{c.producto}</b><br /><span className="suave">{c.caracteristicas}</span></span> },
                      { id: "u", titulo: "Presentación", valor: (c: any) => c.presentacion, celda: (c: any) => <span className="pequeno">{c.presentacion}</span> },
                      { id: "p", titulo: "Precio", num: true, valor: (c: any) => c.precio, celda: (c: any) => fmt.moneda(c.precio) },
                      { id: "a", titulo: "Ajustado IPC", num: true, valor: (c: any) => c.precio_ajustado, celda: (c: any) => fmt.moneda(c.precio_ajustado) },
                    ]} />
                  </Tarjeta>
                )}
                <Tarjeta titulo="Notas de método">
                  <ul className="pequeno" style={{ margin: 0, paddingLeft: 18 }}>{(r.notas ?? []).map((n: string) => <li key={n}>{n}</li>)}</ul>
                  <div style={{ marginTop: 10 }}><EnlacesFuente fuentes={[...(r.fuentes ?? []), ...(fuentesPr ?? []).filter((f) => !(r.fuentes ?? []).some((x: Fuente) => x.pagina === f.pagina))]} /></div>
                </Tarjeta>
              </>
            } />
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Mi municipio en datos

function Municipios() {
  const [texto, setTexto] = useState("");
  const [depto, setDepto] = useState("");
  const { datos: deps } = useDatos<any>("/api/publico/departamentos");
  const consulta = new URLSearchParams({ ...(texto.trim().length >= 2 && { texto: texto.trim() }), ...(depto && { departamento: depto }) }).toString();
  const { datos: lista } = useDatos<any[]>(`/api/publico/municipios${consulta ? `?${consulta}` : ""}`);
  const navegar = useNavigate();
  const { esResumen } = useVista();
  const filas = useMemo(() => [...(lista ?? [])].sort((a, b) => b.poblacion_2018 - a.poblacion_2018), [lista]);
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado sobretitulo="Censo 2018 y proyecciones" titulo="Mi municipio en datos"
        subtitulo="Busque cualquiera de los 340 municipios de Guatemala y obtenga su ficha: población, crecimiento proyectado y lugares poblados, con la fuente para citarla." />
      <div className="rejilla">
        <div className="c5 columna" style={{ gap: 16 }}>
          <Tarjeta titulo="Busque su municipio">
            <div className="columna" style={{ gap: 10 }}>
              <input className="entrada" placeholder="Escriba el nombre: Cobán, Mixco, San Marcos…" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Nombre del municipio" autoFocus />
              <select className="entrada" value={depto} onChange={(e) => setDepto(e.target.value)} aria-label="Departamento">
                <option value="">Todos los departamentos</option>
                {(deps?.departamentos ?? []).map((d: any) => <option key={d.codigo} value={d.departamento}>{d.departamento}</option>)}
              </select>
            </div>
          </Tarjeta>
          <Tarjeta titulo={lista ? `${fmt.numero(filas.length)} municipios` : "Municipios"} ayuda="Ordenados por población censada en 2018. Pulse uno para abrir su ficha.">
            {!lista ? <EsqueletoTabla filas={6} /> : (
              <Tabla maximo={esResumen ? 12 : 340} filas={filas} onFila={(m: any) => navegar(`/abierto/municipios/${m.codigo}`)} vacio="No encontramos municipios con ese nombre." columnas={[
                { id: "m", titulo: "Municipio", valor: (m: any) => m.municipio, celda: (m: any) => <span><b>{m.municipio}</b><br /><span className="pequeno suave">{m.departamento}</span></span> },
                { id: "p", titulo: "Población 2018", num: true, valor: (m: any) => m.poblacion_2018, celda: (m: any) => fmt.numero(m.poblacion_2018) },
                ...(esResumen ? [] : [{ id: "l", titulo: "Lugares poblados", num: true, valor: (m: any) => m.lugares_poblados, celda: (m: any) => fmt.numero(m.lugares_poblados) },
                  { id: "c", titulo: "Código", valor: (m: any) => m.codigo, celda: (m: any) => <span className="mono">{m.codigo}</span> }]),
              ]} />
            )}
            {esResumen && filas.length > 12 && <p className="pequeno suave" style={{ marginTop: 8 }}>Se muestran 12. Escriba el nombre para encontrar el suyo o cambie a la vista Completa para ver la lista entera.</p>}
          </Tarjeta>
        </div>
        <div className="c7">
          <Tarjeta titulo={depto ? `Lugares poblados de ${depto}` : "Guatemala en 20 mil lugares poblados"} ayuda="Cada punto es un lugar poblado del Censo 2018; el tamaño refleja su población.">
            <MapaGT base="/api/publico/mapa" departamento={depto || undefined} />
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

function CopiarCita({ texto }: { texto: string }) {
  return (
    <div className="fila" style={{ alignItems: "flex-start", gap: 10 }}>
      <p className="mono" style={{ flex: 1, minWidth: 240, background: "var(--superficie-2)", border: "1px solid var(--borde)", borderRadius: 8, padding: "8px 10px" }}>{texto}</p>
      <button type="button" className="boton secundario pequeno" onClick={() => { navigator.clipboard.writeText(texto); avisar("Cita copiada."); }}><Copy /> Copiar</button>
    </div>
  );
}

function FichaMunicipio() {
  const { codigo } = useParams();
  const { datos: m, error } = useDatos<any>(`/api/publico/municipios/${codigo}`);
  const fuentes = useFuentes((f) => /censo|proyecc|lugares/i.test(`${f.titulo} ${f.usado_en ?? ""}`));
  const proy = useMemo(() => (m?.proyeccion?.length ? opcionLinea([{ nombre: "Población proyectada", puntos: m.proyeccion.map((p: any) => [String(p.anio), p.poblacion]) }], (v) => fmt.numero(v)) : null), [m]);
  if (error) return <div className="columna"><Aviso tono="alerta">{error}</Aviso><Link to="/abierto/municipios">Volver a la búsqueda de municipios</Link></div>;
  if (!m) return <div className="columna" style={{ gap: 16 }}><div className="esqueleto" style={{ height: 40, width: 320 }} /><EsqueletoKpis /><Tarjeta><EsqueletoGrafica /></Tarjeta></div>;
  const mayor = m.principales?.[0];
  const mujeresPct = m.poblacion_2018 ? (m.mujeres / m.poblacion_2018) * 100 : null;
  const hoy = new Date().toLocaleDateString("es-GT", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Guatemala" });
  const cita = `Fuente: Instituto Nacional de Estadística (INE), XII Censo Nacional de Población 2018 y Estimaciones y proyecciones de población 2015-2030. Municipio de ${m.municipio}, ${m.departamento} (código ${m.codigo}). Consultado en Nexo Abierto el ${hoy}.`;
  const crece = m.crecimiento_desde_2018_pct;
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado migas={<><Link to="/abierto/municipios">Mi municipio en datos</Link> › {m.departamento} ›</>} titulo={m.municipio}
        subtitulo={`Ficha municipal con datos públicos del INE. Departamento de ${m.departamento}, código ${m.codigo}.`} />
      <EnPocasPalabras ancla="abierto-ficha">
        En el Censo 2018, <b>{m.municipio}</b> tenía <b>{fmt.numero(m.poblacion_2018)}</b> habitantes{mujeresPct ? <> ({fmt.pct(mujeresPct)} mujeres)</> : null}.
        {m.poblacion_anio_actual ? <> El INE proyecta <b>{fmt.numero(m.poblacion_anio_actual)}</b> para {m.anio_actual}{crece != null ? (crece >= 0
          ? <>, un <b>{fmt.pct(crece)}</b> más que en 2018 según sus propias proyecciones</>
          : <>, una baja de <b>{fmt.pct(Math.abs(crece))}</b> frente a 2018 según sus propias proyecciones</>) : null}.</> : null}
        {m.rango_departamento ? <> Es el municipio número <b>{m.rango_departamento}</b> en población de los {m.municipios_departamento} de {m.departamento}.</> : null}
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c3"><CifraClara etiqueta="Población censada 2018" numero={m.poblacion_2018} formato={(v) => fmt.numero(v)} detalle={`${fmt.numero(m.mujeres)} mujeres · ${fmt.numero(m.hombres)} hombres`}
          significa="Personas contadas en el XII Censo Nacional de Población." /></div>
        <div className="c3"><CifraClara tono="morado" etiqueta={`Proyección ${m.anio_actual ?? ""}`} numero={m.poblacion_anio_actual} formato={(v) => fmt.numero(v)}
          detalle={crece != null ? `${crece >= 0 ? "+" : ""}${fmt.pct(crece)} frente a la proyección de 2018` : undefined}
          significa="Estimación oficial del INE para este año, calculada a partir del censo." /></div>
        <div className="c3"><CifraClara tono="verde" etiqueta="Vive en área urbana" valor={fmt.pct(m.urbana_pct)}
          significa="Porcentaje de la población censada que vive en lugares poblados clasificados como urbanos." /></div>
        <div className="c3"><CifraClara tono="naranja" etiqueta="Lugares poblados" numero={m.lugares_poblados} formato={(v) => fmt.numero(v)}
          detalle={mayor ? `El más poblado: ${mayor.nombre}` : undefined}
          significa="Aldeas, caseríos, colonias, cantones y la cabecera municipal registrados en el censo." /></div>
      </div>
      <SegunVista
        resumen={
          <>
            <div className="rejilla">
              <div className="c6"><Tarjeta titulo="Cómo crecerá la población">{proy ? <Grafica opcion={proy} /> : <EsqueletoGrafica />}<FuenteCita>INE, Estimaciones y proyecciones de población 2015-2030.</FuenteCita></Tarjeta></div>
              <div className="c6"><Tarjeta titulo="Dónde vive la gente"><MapaGT puntos={(m.puntos ?? []).map((p: number[]) => [...p, 3])} alto={300} /></Tarjeta></div>
            </div>
            <Tarjeta titulo="Cite estos datos"><CopiarCita texto={cita} /></Tarjeta>
            <PieResumen fuente="INE, XII Censo Nacional de Población 2018 y proyecciones 2015-2030">La vista Completa agrega los lugares poblados más grandes y los archivos originales.</PieResumen>
          </>
        }
        completa={
          <>
            <div className="rejilla">
              <div className="c6"><Tarjeta titulo="Población proyectada 2015-2030">{proy && <Grafica opcion={proy} />}<FuenteCita>{m.fuente}</FuenteCita></Tarjeta></div>
              <div className="c6"><Tarjeta titulo="Lugares poblados del municipio"><MapaGT puntos={(m.puntos ?? []).map((p: number[]) => [...p, 3])} alto={300} /></Tarjeta></div>
            </div>
            <Tarjeta titulo="Lugares poblados con más población" ayuda="Población censada en 2018 por lugar poblado (Cuadro A1.3 del Censo).">
              <Tabla filas={m.principales ?? []} columnas={[
                { id: "n", titulo: "Lugar poblado", valor: (l: any) => l.nombre },
                { id: "a", titulo: "Área", valor: (l: any) => l.area },
                { id: "p", titulo: "Población 2018", num: true, valor: (l: any) => l.poblacion, celda: (l: any) => fmt.numero(l.poblacion) },
                { id: "c", titulo: "Código", valor: (l: any) => l.codigo, celda: (l: any) => <span className="mono">{l.codigo}</span> },
              ]} />
            </Tarjeta>
            <Tarjeta titulo="Proyección por año">
              <Tabla filas={m.proyeccion ?? []} columnas={[
                { id: "a", titulo: "Año", valor: (p: any) => p.anio },
                { id: "t", titulo: "Total", num: true, valor: (p: any) => p.poblacion, celda: (p: any) => fmt.numero(p.poblacion) },
                { id: "m", titulo: "Mujeres", num: true, valor: (p: any) => p.mujeres, celda: (p: any) => fmt.numero(p.mujeres) },
                { id: "h", titulo: "Hombres", num: true, valor: (p: any) => p.hombres, celda: (p: any) => fmt.numero(p.hombres) },
              ]} />
            </Tarjeta>
            <Tarjeta titulo="Cite estos datos y vea los archivos originales">
              <CopiarCita texto={cita} />
              <div style={{ marginTop: 10 }}>{fuentes ? <EnlacesFuente fuentes={fuentes} /> : <EsqueletoTabla filas={2} />}</div>
            </Tarjeta>
          </>
        } />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Pregunte a los datos

function Preguntar() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [texto, setTexto] = useState(q);
  const [spec, setSpec] = useState<any>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { datos: catalogo } = useDatos<{ fuentes: any[]; ejemplos: string[] }>("/api/publico/catalogo");
  const { esResumen } = useVista();
  useEffect(() => setTexto(q), [q]);
  useEffect(() => {
    if (q.trim().length < 3) { setSpec(null); return; }
    let vivo = true;
    setCargando(true); setError(""); setSpec(null);
    api<any>("/api/publico/generar", { cuerpo: { peticion: q } })
      .then((d) => vivo && setSpec(d)).catch((e: ErrorApi) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [q]);
  const preguntar = (t: string) => setParams(t.trim() ? { q: t.trim() } : {});
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado sobretitulo="Tableros con datos oficiales" titulo="Pregunte a los datos del INE"
        subtitulo="Escriba con sus palabras qué quiere saber. Nexo busca la fuente oficial adecuada, le muestra cómo entendió su pregunta y arma un tablero con las notas para interpretarlo bien." />
      <Tarjeta>
        <form data-recorrido="abierto-pregunta" className="consulta tarjeta" style={{ padding: "6px 6px 6px 14px", boxShadow: "none" }} onSubmit={(e: FormEvent) => { e.preventDefault(); preguntar(texto); }}>
          <Search className="icono-lupa" size={20} />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: población proyectada de Quetzaltenango hasta 2030" aria-label="Pregunta" autoComplete="off" />
          <button className="boton" disabled={cargando}>{cargando ? "Consultando…" : "Preguntar"}</button>
        </form>
        {!!catalogo?.ejemplos?.length && (
          <div className="fila pequeno" style={{ marginTop: 10, gap: 8 }}>
            <span className="suave">Ejemplos:</span>
            {catalogo.ejemplos.map((e) => <button key={e} type="button" className="chip" onClick={() => preguntar(e)}>{e}</button>)}
          </div>
        )}
      </Tarjeta>
      {error && <Aviso tono="alerta">{error}</Aviso>}
      {cargando && <div className="rejilla"><div className="c4 tarjeta"><EsqueletoTabla filas={2} /></div><div className="c8 tarjeta"><EsqueletoGrafica /></div></div>}
      {spec && (
        <div className="columna aparecer" style={{ gap: 12 }}>
          <div className="tarjeta" style={{ padding: "12px 16px" }}>
            <div className="fila" style={{ gap: 8 }}>
              <b className="pequeno">Así entendió Nexo su pregunta:</b>
              {spec.interpretacion.map((i: any, n: number) => <span key={n} className="chip fijo"><span className="suave">{i.tipo}:</span> <b>{i.valor}</b></span>)}
            </div>
          </div>
          <RutaConsulta.Provider value="/api/publico/consulta"><TableroVista spec={spec} /></RutaConsulta.Provider>
        </div>
      )}
      {!spec && !cargando && !esResumen && catalogo && (
        <Tarjeta titulo="Fuentes que puede consultar sin cuenta" ayuda="Solo bases públicas. Los precios recolectados con su informante y los datos internos no están disponibles aquí.">
          <Tabla filas={catalogo.fuentes} columnas={[
            { id: "t", titulo: "Fuente", valor: (f: any) => f.titulo, celda: (f: any) => <span><b>{f.titulo}</b><br /><span className="pequeno suave">{f.cita}</span></span> },
            { id: "m", titulo: "Qué puede medir", celda: (f: any) => <span className="pequeno">{f.medidas.map((x: any) => x.etiqueta).join(" · ")}</span> },
            { id: "d", titulo: "Por", celda: (f: any) => <span className="pequeno">{f.dimensiones.map((x: any) => x.etiqueta).join(" · ")}</span> },
          ]} />
        </Tarjeta>
      )}
      {!spec && !cargando && esResumen && (
        <PieResumen fuente="INE y Guatecompras OCDS">La vista Completa lista todas las fuentes que se pueden consultar sin cuenta y qué mide cada una.</PieResumen>
      )}
    </div>
  );
}

export default function Abierto() {
  return (
    <MarcoPublico>
      <Routes>
        <Route index element={<Portada />} />
        <Route path="precios" element={<PreciosPublicos />} />
        <Route path="municipios" element={<Municipios />} />
        <Route path="municipios/:codigo" element={<FichaMunicipio />} />
        <Route path="preguntar" element={<Preguntar />} />
        <Route path="*" element={<div className="vacio"><h2>Página no encontrada</h2><Link to="/abierto">Volver a Nexo Abierto</Link></div>} />
      </Routes>
    </MarcoPublico>
  );
}
