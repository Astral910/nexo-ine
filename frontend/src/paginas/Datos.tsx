// Catálogo y linaje: qué datos usa Nexo, de dónde salen, cuándo se descargaron y con qué huella.
// Vista Resumen: los conjuntos oficiales en fichas sencillas. Vista Completa: cada archivo con su huella y el catálogo del INE.
import { useMemo, useState } from "react";
import { CalendarClock, Copy, Database, ExternalLink, FileStack, Landmark, RefreshCw } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { avisar, Encabezado, Esqueleto, EsqueletoKpis, EsqueletoTabla, Insignia, Pestanas, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, PieResumen, SegunVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "La lista de cada archivo oficial que usa Nexo: quién lo publica, para qué se usa, cuándo se descargó y su huella digital. Así cualquiera puede comprobar y reproducir las cifras.",
  datos: "El portal de datos abiertos del INE (datos.ine.gob.gt) como fuente principal y, como complemento, otras fuentes abiertas como Guatecompras. La pestaña «Catálogo del INE» se sincroniza con la interfaz pública del portal.",
  pasos: [
    "Revise de qué publicación sale cada cifra y cuándo se descargó.",
    "Pulse «Abrir en el portal del INE» para ver el archivo original.",
    "En la vista Completa, copie la huella SHA-256 si necesita comprobar que el archivo no cambió.",
    "En «Catálogo del INE», busque otros conjuntos publicados que podrían sumarse a Nexo.",
  ],
  resumen: "Cuántas publicaciones oficiales usa Nexo, cuántas son del INE y qué tan recientes son, en fichas sencillas.",
  completa: "Cada archivo con su licencia, filas, fecha y huella, y el catálogo completo del portal del INE.",
  terminos: [
    ["Linaje", "El camino de un dato: de qué archivo viene, cuándo se descargó y cómo se transformó hasta la cifra que usted ve."],
    ["Conjunto de datos", "Una publicación del portal, por ejemplo «Precios de Referencia». Puede tener varios archivos (recursos)."],
    ["SHA-256", "Huella digital de un archivo. Si cambia un solo dato, la huella cambia por completo."],
    ["CKAN", "El sistema que usa el portal de datos abiertos del INE. Tiene una interfaz pública que Nexo consulta para sincronizar el catálogo."],
    ["Licencia", "Las condiciones para reutilizar los datos. CC BY 4.0, por ejemplo, permite usarlos siempre que se cite la fuente."],
  ],
};

// Nombres legibles de los conjuntos conocidos; si aparece uno nuevo se usa el título de su primer archivo.
const NOMBRES: Record<string, string> = {
  "guatecompras-ocds": "Compras públicas (Guatecompras)",
  "costos-de-la-cba-urbana-y-rural": "Canasta básica alimentaria urbana y rural",
  "censo-2018-lugares-poblados": "Censo 2018 por lugar poblado",
  "hoja-de-balance-de-alimentos-hba-actualizacion-2024": "Hoja de Balance de Alimentos 2024",
  "ipc-por-producto-ano-2024-100-0": "Índice de Precios al Consumidor (IPC)",
  "indice-de-precios-de-materiales-de-construccion-ipmc": "Índice de Precios de Materiales de Construcción (IPMC)",
  "precios-de-referencia": "Precios de Referencia (DPIR)",
  "precios-recolectados-indice-de-precios-al-consumidor": "Precios recolectados para el IPC",
  "proyecciones-de-poblacion-2015-2030": "Estimaciones y proyecciones de población 2015-2030",
};

const esIne = (publicador?: string) => (publicador ?? "").startsWith("Instituto Nacional de Estadística");

interface Conjunto { clave: string; nombre: string; publicador: string; archivos: number; usos: string[]; ultima: string | null; licencia: string; pagina: string }

function agrupar(fuentes: any[]): Conjunto[] {
  const grupos = new Map<string, Conjunto>();
  for (const f of fuentes) {
    const clave = f.conjunto || f.titulo;
    const g: Conjunto = grupos.get(clave) ?? { clave, nombre: NOMBRES[clave] ?? f.titulo, publicador: f.publicador, archivos: 0, usos: [], ultima: null,
      licencia: f.licencia, pagina: f.pagina || f.url };
    g.archivos += 1;
    for (const u of String(f.usado_en ?? "").split(";").map((x) => x.trim()).filter(Boolean)) if (!g.usos.includes(u)) g.usos.push(u);
    if (f.descargado_en && (!g.ultima || f.descargado_en > g.ultima)) g.ultima = f.descargado_en;
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => Number(esIne(b.publicador)) - Number(esIne(a.publicador)) || a.nombre.localeCompare(b.nombre, "es"));
}

function ResumenDatos({ fuentes, cat }: { fuentes: any[] | null; cat: any }) {
  const conjuntos = useMemo(() => agrupar(fuentes ?? []), [fuentes]);
  if (!fuentes) {
    return <><EsqueletoKpis n={4} /><div className="rejilla">{[0, 1, 2].map((i) => <div key={i} className="c4 tarjeta"><EsqueletoTabla filas={3} /></div>)}</div></>;
  }
  const delIne = conjuntos.filter((c) => esIne(c.publicador));
  const fechas = fuentes.map((f) => f.descargado_en).filter(Boolean).sort();
  const antigua = fechas[0], reciente = fechas[fechas.length - 1];
  const periodo = !reciente ? "" : fmt.fecha(antigua) === fmt.fecha(reciente) ? ` el ${fmt.fecha(reciente)}` : ` entre el ${fmt.fecha(antigua)} y el ${fmt.fecha(reciente)}`;
  return (
    <>
      <EnPocasPalabras>
        Nexo usa <b>{conjuntos.length} publicaciones oficiales</b> ({fmt.numero(fuentes.length)} archivos): {delIne.length} del Instituto Nacional de Estadística
        {conjuntos.length > delIne.length ? ` y ${conjuntos.length - delIne.length} de otras fuentes abiertas que complementan` : ""}. Se descargaron{periodo}, y cada archivo
        tiene su enlace al original, su licencia y su huella digital.
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c3"><CifraClara etiqueta="Publicaciones oficiales" icono={<Database />} numero={conjuntos.length} formato={(v) => fmt.numero(v)}
          significa="Conjuntos de datos de donde salen las cifras de Nexo." /></div>
        <div className="c3"><CifraClara tono="morado" etiqueta="Archivos descargados" icono={<FileStack />} numero={fuentes.length} formato={(v) => fmt.numero(v)}
          significa="Cada uno con su enlace, licencia, fecha de descarga y huella SHA-256." /></div>
        <div className="c3"><CifraClara tono="verde" etiqueta="Del INE" icono={<Landmark />} valor={`${delIne.length} de ${conjuntos.length}`}
          significa="El portal de datos abiertos del INE es la fuente principal, como piden las reglas del Datatón." /></div>
        <div className="c3"><CifraClara tono="naranja" etiqueta="Última descarga" icono={<CalendarClock />} valor={reciente ? fmt.fecha(reciente) : "—"}
          significa={cat?.total ? `El portal del INE publica ${fmt.numero(cat.total)} conjuntos en total; vea el catálogo en la vista Completa.` : "Fecha en hora de Guatemala."} /></div>
      </div>
      <section className="columna" style={{ gap: 10 }} aria-label="Publicaciones que usa Nexo">
        <div><div className="sobretitulo">De dónde salen las cifras</div><h2 style={{ marginTop: 4 }}>Las publicaciones, una por una</h2></div>
        <div className="rejilla escalonada">
          {conjuntos.map((c) => (
            <article key={c.clave} className="c4 tarjeta ficha-conjunto">
              <span className="sobretitulo">{esIne(c.publicador) ? "INE" : c.publicador.split(" (")[0]}</span>
              <h3>{c.nombre}</h3>
              <dl>
                <dt>Se usa en</dt><dd>{c.usos.join(" · ") || "—"}</dd>
                <dt>Archivos</dt><dd>{fmt.numero(c.archivos)}</dd>
                <dt>Descargado</dt><dd>{fmt.fecha(c.ultima)}</dd>
                <dt>Licencia</dt><dd>{c.licencia || "—"}</dd>
              </dl>
              {c.pagina && (
                <a className="boton secundario pequeno" href={c.pagina} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> {esIne(c.publicador) ? "Abrir en el portal del INE" : "Abrir la fuente original"}
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
      <PieResumen fuente="registro de descargas de Nexo (URL, fecha y huella SHA-256 de cada archivo)" />
    </>
  );
}

export default function Datos() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<"fuentes" | "catalogo">("fuentes");
  const { datos: fuentes } = useDatos<any[]>("/api/datos/fuentes");
  const [texto, setTexto] = useState("");
  const [usados, setUsados] = useState(false);
  const { datos: cat, recargar } = useDatos<any>(`/api/datos/catalogo?solo_usados=${usados}${texto.length >= 2 ? `&texto=${encodeURIComponent(texto)}` : ""}`);
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizar = async () => {
    setSincronizando(true);
    try { const r: any = await api("/api/datos/catalogo/sincronizar", { metodo: "POST" }); avisar(r.resumen); recargar(); }
    catch (e) { avisar((e as Error).message, "critico"); }
    finally { setSincronizando(false); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Catálogo y linaje de datos" subtitulo="Fuente principal: portal de datos abiertos del Instituto Nacional de Estadística. Cada archivo queda con su URL, fecha de descarga, licencia y huella SHA-256 para que cualquiera pueda reproducir las cifras."
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista
        resumen={<ResumenDatos fuentes={fuentes} cat={cat} />}
        completa={<>
          <Pestanas opciones={[{ id: "fuentes", etiqueta: "Fuentes que usa Nexo" }, { id: "catalogo", etiqueta: "Catálogo del INE" }]} activa={pestana} onCambio={setPestana} />
          {pestana === "fuentes" ? (
            !fuentes ? <Esqueleto alto={300} /> : (
              <Tarjeta titulo={`${fuentes.length} archivos descargados`} ayuda="La fecha de descarga se muestra en hora de Guatemala.">
                <Tabla filas={fuentes} columnas={[
                  { id: "t", titulo: "Conjunto de datos", valor: (f: any) => f.titulo, celda: (f: any) => <span><b>{f.titulo}</b><br /><span className="pequeno suave">{f.publicador}</span></span> },
                  { id: "u", titulo: "Se usa en", valor: (f: any) => f.usado_en, celda: (f: any) => <span className="pequeno">{f.usado_en}</span> },
                  { id: "l", titulo: "Licencia", valor: (f: any) => f.licencia, celda: (f: any) => <span className="pequeno">{f.licencia}</span> },
                  { id: "d", titulo: "Descargado", valor: (f: any) => f.descargado_en, celda: (f: any) => fmt.fechaHora(f.descargado_en) },
                  { id: "n", titulo: "Filas", num: true, valor: (f: any) => f.filas, celda: (f: any) => fmt.numero(f.filas) },
                  { id: "h", titulo: "SHA-256", celda: (f: any) => f.sha256 && <button className="boton fantasma pequeno mono" title={f.sha256} onClick={() => { navigator.clipboard.writeText(f.sha256); avisar("Huella copiada."); }}>{f.sha256.slice(0, 10)}… <Copy size={12} /></button> },
                  { id: "e", titulo: "", celda: (f: any) => <a href={f.pagina} target="_blank" rel="noreferrer noopener" aria-label="Página de origen"><ExternalLink size={15} /></a> },
                ]} />
              </Tarjeta>
            )
          ) : (
            <Tarjeta titulo={cat ? `${fmt.numero(cat.total)} conjuntos en el portal del INE` : "Catálogo del INE"}
              ayuda={cat?.sincronizado_en ? `Sincronizado ${fmt.relativo(cat.sincronizado_en)} con la API pública de datos.ine.gob.gt` : "Aún no se sincroniza."}
              acciones={puede("datos:sincronizar") && <button className="boton secundario pequeno" onClick={sincronizar} disabled={sincronizando}><RefreshCw /> {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}</button>}>
              <div className="fila" style={{ marginBottom: 10 }}>
                <input className="entrada" style={{ flex: 1 }} placeholder="Buscar: censo, IPC, educación, violencia…" value={texto} onChange={(e) => setTexto(e.target.value)} />
                <label className="casilla"><input type="checkbox" checked={usados} onChange={(e) => setUsados(e.target.checked)} /> Solo los que usa Nexo</label>
              </div>
              {!cat ? <Esqueleto /> : <Tabla maximo={150} filas={cat.conjuntos} vacio="Sin resultados. Si el catálogo está vacío, sincronícelo." columnas={[
                { id: "t", titulo: "Conjunto", valor: (c: any) => c.titulo, celda: (c: any) => <span><b>{c.titulo}</b> {c.usado_por_nexo && <Insignia tono="exito">en Nexo</Insignia>}<br /><span className="pequeno suave">{c.organizacion}</span></span> },
                { id: "r", titulo: "Recursos", num: true, valor: (c: any) => c.recursos },
                { id: "f", titulo: "Formatos", valor: (c: any) => c.formatos, celda: (c: any) => <span className="pequeno">{c.formatos}</span> },
                { id: "m", titulo: "Modificado", valor: (c: any) => c.modificado, celda: (c: any) => fmt.fecha(c.modificado) },
                { id: "e", titulo: "", celda: (c: any) => <a href={c.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir en el portal del INE"><ExternalLink size={15} /></a> },
              ]} />}
            </Tarjeta>
          )}
        </>}
      />
    </div>
  );
}
