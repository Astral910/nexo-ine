// Territorio: país, departamentos, ficha municipal (Censo 2018 y proyecciones) y avance de operativos de campo.
// Cada subpantalla tiene su «Resumen» (las cifras clave en frases, el mapa o la gráfica principal y un buscador de
// municipios) y su vista «Completa» (todas las tablas, el detalle por departamento y el registro del avance).
import { useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MapPin, Search, UsersRound } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionLinea } from "../componentes/Grafica";
import { MapaGT, MapaMunicipio } from "../componentes/MapaGT";
import {
  Aviso, avisar, Campo, Encabezado, EsqueletoGrafica, EsqueletoKpis, EsqueletoTabla, FuenteCita, Kpi, Modal, Pestanas, Progreso, Tabla, Tarjeta, useDatos,
} from "../componentes/ui";
import {
  BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, useVista, type AyudaPantalla, type ElementoLista,
} from "../componentes/vista";

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const conSigno = (v: number) => `${v > 0 ? "+" : ""}${fmt.numero(v, 1)} %`;
const FUENTE_POBLACION = "INE, XII Censo Nacional de Población 2018 y estimaciones y proyecciones de población 2015-2030";

const AYUDA_PAIS: AyudaPantalla = {
  titulo: "Cómo leer el territorio",
  que: "La población de Guatemala por departamento, municipio y lugar poblado, según el Censo 2018 y las proyecciones del INE.",
  datos: "XII Censo Nacional de Población 2018 (Cuadro A1.3 y centroides de lugares poblados) y estimaciones y proyecciones de población 2015-2030 del INE.",
  pasos: [
    "Busque su municipio por nombre y abra su ficha.",
    "En el mapa, cada punto es un lugar poblado; el tamaño refleja su población.",
    "En la vista Completa, elija un departamento para ver sus municipios o busque una aldea o caserío.",
  ],
  resumen: "La población del país en tres cifras, el mapa de los lugares poblados y un buscador de municipios.",
  completa: "Las tablas por departamento y municipio, el mapa por departamento y el buscador de lugares poblados.",
  terminos: [
    ["Lugar poblado", "Aldea, caserío, colonia, finca u otro lugar con nombre propio donde vive la gente."],
    ["Población censada", "Personas contadas en el Censo 2018, sin ajuste por omisión censal."],
    ["Población proyectada", "Estimación oficial del INE para cada año, calculada a partir del Censo 2018."],
    ["Centroide", "Punto que ubica en el mapa el centro de un lugar poblado."],
  ],
};

const AYUDA_MUNICIPIO: AyudaPantalla = {
  titulo: "Cómo leer la ficha municipal",
  que: "La población de un municipio: lo que contó el Censo 2018, cuánto proyecta el INE y en qué lugares poblados vive la gente.",
  datos: "XII Censo Nacional de Población 2018 (Cuadro A1.3 y centroides) y proyecciones de población 2015-2030 del INE.",
  pasos: [
    "Lea la población de 2018 y la proyección para este año.",
    "Vea en la gráfica cómo crece el municipio según las proyecciones.",
    "En la vista Completa revise el mapa y los lugares poblados con más población.",
  ],
  resumen: "Las cifras clave del municipio en frases y la proyección de población hasta 2030.",
  completa: "Además el mapa de los lugares poblados del municipio y la tabla de los más poblados.",
  terminos: [
    ["Proyección", "Estimación oficial del INE de la población de cada año. El crecimiento se compara entre proyecciones, no con el censo."],
    ["Población urbana", "Personas que viven en lugares poblados clasificados como área urbana."],
    ["Lugar poblado", "Aldea, caserío, colonia, finca u otro lugar con nombre propio donde vive la gente."],
  ],
};

const AYUDA_OPERATIVOS: AyudaPantalla = {
  titulo: "Cómo leer el avance de operativos",
  que: "Cuánto lleva el operativo de campo en cada departamento y municipio, para que la Coordinación Regional compare delegaciones.",
  datos: "El universo es real: los lugares poblados del Censo 2018 por municipio. El avance es de demostración hasta conectarlo con el sistema de captura de campo.",
  pasos: [
    "Vea el avance nacional y los departamentos más atrasados.",
    "Abra un departamento para ver sus municipios, del más rezagado al más avanzado.",
    "Si tiene permiso, registre el avance de un municipio en la vista Completa.",
  ],
  resumen: "El avance nacional, cuántos departamentos van bien o atrasados y los tres más rezagados.",
  completa: "Todos los departamentos con su barra de avance y la tabla de municipios para registrar el avance.",
  terminos: [
    ["Meta", "Lugares poblados que la delegación debe visitar en el operativo."],
    ["Avance", "Lugares completados ÷ meta."],
    ["Delegación", "Oficina departamental del INE; hay 22, coordinadas por 8 coordinaciones regionales."],
  ],
};

// ------------------------------------------------------------------------------------------------ País

function BuscarMunicipio() {
  const { datos } = useDatos<any[]>("/api/territorio/municipios");
  const [texto, setTexto] = useState("");
  const navegar = useNavigate();
  const resultados = useMemo(() => {
    if (!datos) return [];
    const t = sinTildes(texto.trim());
    const lista = t.length >= 2 ? datos.filter((m) => sinTildes(`${m.municipio} ${m.departamento}`).includes(t)) : [...datos].sort((a, b) => b.poblacion_2018 - a.poblacion_2018);
    return lista.slice(0, 8);
  }, [datos, texto]);
  return (
    <Tarjeta titulo="Busque su municipio" ayuda="Escriba el nombre del municipio o del departamento y abra su ficha.">
      <label className="buscador-grande">
        <Search size={20} aria-hidden />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: Cobán, Mixco, Huehuetenango" aria-label="Municipio" autoComplete="off" />
      </label>
      {!datos ? <div style={{ marginTop: 12 }}><EsqueletoTabla filas={5} /></div> : (
        <>
          <p className="pequeno suave" style={{ marginTop: 10 }}>{texto.trim().length >= 2 ? `${resultados.length ? "Resultados" : "No encontramos municipios con ese nombre"}` : "Los municipios con más población en 2018:"}</p>
          <ul className="lista-municipios">
            {resultados.map((m) => (
              <li key={m.codigo}>
                <button type="button" onClick={() => navegar(`/territorio/municipio/${m.codigo}`)}>
                  <span><b>{m.municipio}</b> <span className="suave pequeno">· {m.departamento}</span></span>
                  <span className="poblacion">{fmt.numero(m.poblacion_2018)} hab.</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tarjeta>
  );
}

function ResumenPais({ datos }: { datos: any }) {
  if (!datos) return <><div className="esqueleto" style={{ height: 92, borderRadius: 14 }} /><EsqueletoKpis n={3} /><div className="rejilla"><div className="c7 tarjeta"><EsqueletoGrafica alto={380} /></div><div className="c5 tarjeta"><EsqueletoTabla filas={6} /></div></div></>;
  const deptos = datos.departamentos as any[];
  const total = deptos.reduce((s, d) => s + d.poblacion_2018, 0);
  const proy = deptos.reduce((s, d) => s + d.poblacion_proyectada, 0);
  const lugares = deptos.reduce((s, d) => s + d.lugares_poblados, 0);
  const municipios = deptos.reduce((s, d) => s + d.municipios, 0);
  return (
    <>
      <EnPocasPalabras>
        Guatemala tenía <b>{fmt.numero(total)}</b> habitantes en el Censo 2018 y el INE proyecta <b>{fmt.numero(proy)}</b> para {datos.anio_proyeccion}.
        La población vive en {fmt.numero(lugares)} lugares poblados de {fmt.numero(municipios)} municipios y {fmt.numero(deptos.length)} departamentos.
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c4"><CifraClara icono={<UsersRound />} etiqueta="Población censada 2018" numero={total} formato={(v) => fmt.numero(v)}
          significa="Personas contadas por el XII Censo Nacional de Población." /></div>
        <div className="c4"><CifraClara icono={<UsersRound />} tono="morado" etiqueta={`Población proyectada ${datos.anio_proyeccion}`} numero={proy} formato={(v) => fmt.numero(v)}
          significa="Estimación oficial del INE para este año, calculada a partir del censo." /></div>
        <div className="c4"><CifraClara icono={<MapPin />} tono="verde" etiqueta="Lugares poblados" numero={lugares} formato={(v) => fmt.numero(v)}
          significa="Aldeas, caseríos, colonias, fincas y otros lugares con nombre propio donde vive la gente." /></div>
      </div>
      <div className="rejilla">
        <div className="c7" data-recorrido="territorio-mapa">
          <Tarjeta titulo="Guatemala en 20 mil lugares poblados" ayuda="Cada punto es un lugar poblado; el tamaño refleja su población en 2018.">
            <MapaGT alto={420} />
          </Tarjeta>
        </div>
        <div className="c5"><BuscarMunicipio /></div>
      </div>
      <PieResumen fuente={FUENTE_POBLACION}>La vista Completa tiene las tablas por departamento y municipio y el buscador de aldeas y caseríos.</PieResumen>
    </>
  );
}

function CompletaPais({ datos }: { datos: any }) {
  const [depto, setDepto] = useState("");
  const { datos: munis } = useDatos<any[]>(depto ? `/api/territorio/municipios?departamento=${encodeURIComponent(depto)}` : null);
  const navegar = useNavigate();
  const [buscar, setBuscar] = useState("");
  const { datos: lugares } = useDatos<any[]>(buscar.length >= 3 ? `/api/territorio/lugares?texto=${encodeURIComponent(buscar)}` : null);
  if (!datos) return <><EsqueletoKpis /><div className="rejilla"><div className="c7 tarjeta"><EsqueletoGrafica alto={420} /></div><div className="c5 tarjeta"><EsqueletoTabla filas={8} /></div></div></>;
  const total = datos.departamentos.reduce((s: number, d: any) => s + d.poblacion_2018, 0);
  const proy = datos.departamentos.reduce((s: number, d: any) => s + d.poblacion_proyectada, 0);
  return (
    <>
      <div className="rejilla">
        <div className="c3"><Kpi etiqueta="Población censada 2018" valor={fmt.numero(total)} detalle="XII Censo Nacional de Población" /></div>
        <div className="c3"><Kpi tono="morado" etiqueta={`Población proyectada ${datos.anio_proyeccion}`} valor={fmt.numero(proy)} detalle="Estimaciones y proyecciones del INE" /></div>
        <div className="c3"><Kpi tono="verde" etiqueta="Lugares poblados" valor={fmt.numero(datos.departamentos.reduce((s: number, d: any) => s + d.lugares_poblados, 0))} detalle="Con centroide georreferenciado" /></div>
        <div className="c3"><Kpi tono="naranja" etiqueta="Municipios" valor={fmt.numero(datos.departamentos.reduce((s: number, d: any) => s + d.municipios, 0))} detalle="22 departamentos" /></div>
      </div>
      <div className="rejilla">
        <div className="c7" data-recorrido="territorio-mapa"><Tarjeta titulo={depto ? `Lugares poblados de ${depto}` : "Guatemala en 20 mil lugares poblados"} acciones={depto && <button className="boton fantasma pequeno" onClick={() => setDepto("")}>Ver todo el país</button>}><MapaGT departamento={depto || undefined} /></Tarjeta></div>
        <div className="c5">
          <Tarjeta titulo="Buscar un lugar poblado">
            <input className="entrada" placeholder="Nombre de aldea, caserío, colonia…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            {lugares && <div style={{ marginTop: 10 }}><Tabla maximo={10} filas={lugares} onFila={(l: any) => navegar(`/territorio/municipio/${l.cod_municipio}`)} columnas={[
              { id: "n", titulo: "Lugar", valor: (l: any) => l.nombre, celda: (l: any) => <span>{l.nombre}<br /><span className="pequeno suave">{l.municipio}, {l.departamento}</span></span> },
              { id: "p", titulo: "Población", num: true, valor: (l: any) => l.poblacion, celda: (l: any) => fmt.numero(l.poblacion) },
            ]} /></div>}
          </Tarjeta>
          <div style={{ height: 16 }} />
          <Tarjeta titulo="Departamentos" ayuda="Seleccione un departamento para ver sus municipios">
            <Tabla filas={datos.departamentos} onFila={(d: any) => setDepto(d.departamento)} columnas={[
              { id: "d", titulo: "Departamento", valor: (d: any) => d.departamento },
              { id: "p", titulo: "2018", num: true, valor: (d: any) => d.poblacion_2018, celda: (d: any) => fmt.numero(d.poblacion_2018) },
              { id: "x", titulo: String(datos.anio_proyeccion), num: true, valor: (d: any) => d.poblacion_proyectada, celda: (d: any) => fmt.numero(d.poblacion_proyectada) },
              { id: "m", titulo: "Mujeres", num: true, valor: (d: any) => d.mujeres_pct, celda: (d: any) => fmt.pct(d.mujeres_pct) },
            ]} />
          </Tarjeta>
        </div>
      </div>
      {munis && (
        <Tarjeta titulo={`Municipios de ${depto}`}>
          <Tabla filas={munis} onFila={(m: any) => navegar(`/territorio/municipio/${m.codigo}`)} columnas={[
            { id: "c", titulo: "Código", valor: (m: any) => m.codigo, celda: (m: any) => <span className="mono">{m.codigo}</span> },
            { id: "m", titulo: "Municipio", valor: (m: any) => m.municipio },
            { id: "p", titulo: "Población 2018", num: true, valor: (m: any) => m.poblacion_2018, celda: (m: any) => fmt.numero(m.poblacion_2018) },
            { id: "l", titulo: "Lugares poblados", num: true, valor: (m: any) => m.lugares_poblados },
          ]} />
        </Tarjeta>
      )}
    </>
  );
}

function Pais() {
  const { datos } = useDatos<any>("/api/territorio/departamentos");
  return <SegunVista resumen={<ResumenPais datos={datos} />} completa={<CompletaPais datos={datos} />} />;
}

// ------------------------------------------------------------------------------------------------ Municipio

function ResumenMunicipio({ datos, proy }: { datos: any; proy: any }) {
  const anio = Math.min(Math.max(new Date().getFullYear(), 2015), 2030);
  const pAct = (datos.proyeccion as any[]).find((p) => p.anio === anio);
  const p2018 = (datos.proyeccion as any[]).find((p) => p.anio === 2018);
  const crecimiento = pAct && p2018?.poblacion ? (pAct.poblacion / p2018.poblacion - 1) * 100 : null;
  const principal = datos.principales?.[0];
  return (
    <>
      <EnPocasPalabras>
        <p>{datos.municipio}, en {datos.departamento}, tenía <b>{fmt.numero(datos.poblacion_2018)}</b> habitantes en el Censo 2018: {fmt.numero(datos.mujeres)} mujeres y {fmt.numero(datos.hombres)} hombres.</p>
        {pAct && <p>El INE proyecta <b>{fmt.numero(pAct.poblacion)}</b> habitantes para {anio}{crecimiento !== null && <>, {fmt.numero(Math.abs(crecimiento), 1)} % {crecimiento >= 0 ? "más" : "menos"} que su proyección para 2018</>}.</p>}
        <p>{datos.urbana_pct !== null && <>El {fmt.pct(datos.urbana_pct)} vive en área urbana. </>}Tiene {fmt.numero(datos.lugares_poblados)} {plural(datos.lugares_poblados, "lugar poblado", "lugares poblados")}{principal && <>; el más poblado es {principal.nombre}, con {fmt.numero(principal.poblacion)} habitantes en 2018</>}.</p>
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c3"><CifraClara etiqueta="Población 2018" numero={datos.poblacion_2018} formato={(v) => fmt.numero(v)}
          detalle={`${fmt.numero(datos.mujeres)} mujeres · ${fmt.numero(datos.hombres)} hombres`}
          significa="Personas contadas en el XII Censo Nacional de Población." /></div>
        <div className="c3"><CifraClara tono="morado" etiqueta={`Proyección ${anio}`} valor={pAct ? fmt.numero(pAct.poblacion) : "—"}
          detalle={crecimiento !== null ? `${conSigno(crecimiento)} frente a la proyección de 2018` : undefined}
          significa="Estimación del INE. El crecimiento compara proyecciones de 2018 y de este año, no el censo." /></div>
        <div className="c3"><CifraClara tono="verde" etiqueta="Población urbana" valor={fmt.pct(datos.urbana_pct)}
          significa="Parte de la población que vive en lugares poblados de área urbana." /></div>
        <div className="c3"><CifraClara tono="naranja" etiqueta="Lugares poblados" numero={datos.lugares_poblados} formato={(v) => fmt.numero(v)}
          significa={principal ? `El más poblado es ${principal.nombre}.` : "Aldeas, caseríos, colonias y otros lugares con nombre propio."} /></div>
      </div>
      <Tarjeta titulo="Población proyectada 2015-2030" ayuda="Cada punto es la estimación del INE para un año.">
        {proy ? <Grafica opcion={proy} /> : <EsqueletoGrafica />}
        <FuenteCita>{datos.fuente}</FuenteCita>
      </Tarjeta>
      <PieResumen fuente={datos.fuente}>La vista Completa agrega el mapa y los lugares poblados con más población.</PieResumen>
    </>
  );
}

function Municipio() {
  const { codigo } = useParams();
  const { datos } = useDatos<any>(`/api/territorio/municipios/${codigo}`);
  const proy = useMemo(() => datos ? opcionLinea([{ nombre: "Población proyectada", puntos: datos.proyeccion.map((p: any) => [String(p.anio), p.poblacion]) }], (v) => fmt.numero(v)) : null, [datos]);
  if (!datos) return <div className="columna" style={{ gap: 16 }}><div className="esqueleto" style={{ height: 56, width: "45%" }} /><EsqueletoKpis /><div className="tarjeta"><EsqueletoGrafica /></div></div>;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado migas={<><Link to="/territorio">Territorio</Link> › {datos.departamento} ›</>} titulo={datos.municipio}
        subtitulo={`Ficha municipal con datos del Censo 2018 y proyecciones del INE. Código ${datos.codigo}.`}
        acciones={<BotonAyuda ayuda={AYUDA_MUNICIPIO} />} />
      <SegunVista resumen={<ResumenMunicipio datos={datos} proy={proy} />} completa={<>
        <div className="rejilla">
          <div className="c3"><Kpi etiqueta="Población 2018" valor={fmt.numero(datos.poblacion_2018)} detalle={`${fmt.numero(datos.mujeres)} mujeres · ${fmt.numero(datos.hombres)} hombres`} /></div>
          <div className="c3"><Kpi tono="verde" etiqueta="Población urbana" valor={fmt.pct(datos.urbana_pct)} detalle="Según área del lugar poblado" /></div>
          <div className="c3"><Kpi tono="morado" etiqueta="Lugares poblados" valor={fmt.numero(datos.lugares_poblados)} /></div>
          <div className="c3"><Kpi tono="naranja" etiqueta="Proyección 2030" valor={fmt.numero(datos.proyeccion.find((p: any) => p.anio === 2030)?.poblacion)} /></div>
        </div>
        <div className="rejilla">
          <div className="c6"><Tarjeta titulo="Lugares poblados del municipio"><MapaMunicipio lugares={datos.lugares ?? []} departamento={datos.departamento} municipio={datos.municipio} alto={360} /></Tarjeta></div>
          <div className="c6"><Tarjeta titulo="Población proyectada 2015-2030">{proy && <Grafica opcion={proy} />}<FuenteCita>{datos.fuente}</FuenteCita></Tarjeta></div>
        </div>
        <Tarjeta titulo="Lugares poblados con más población">
          <Tabla filas={datos.principales} columnas={[
            { id: "n", titulo: "Lugar poblado", valor: (l: any) => l.nombre },
            { id: "a", titulo: "Área", valor: (l: any) => l.area },
            { id: "p", titulo: "Población 2018", num: true, valor: (l: any) => l.poblacion, celda: (l: any) => fmt.numero(l.poblacion) },
            { id: "c", titulo: "Código", valor: (l: any) => l.codigo, celda: (l: any) => <span className="mono">{l.codigo}</span> },
          ]} />
        </Tarjeta>
      </>} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Operativos

function ResumenOperativos({ datos, nombre }: { datos: any; nombre: string }) {
  const { cambiar } = useVista();
  const navegar = useNavigate();
  const deptos = [...(datos.departamentos as any[])].sort((a, b) => a.avance_pct - b.avance_pct);
  const meta = deptos.reduce((s, d) => s + d.meta, 0);
  const completados = deptos.reduce((s, d) => s + d.completados, 0);
  const avance = meta ? (completados / meta) * 100 : 0;
  const atrasados = deptos.slice(0, 3);
  const bien = deptos.filter((d) => d.avance_pct >= 80).length;
  const mal = deptos.filter((d) => d.avance_pct < 50).length;
  const verDepto = (d: string) => { cambiar("completa"); navegar(`/territorio/operativos?depto=${encodeURIComponent(d)}`); window.scrollTo({ top: 0 }); };
  const elementos: ElementoLista[] = atrasados.map((d) => ({
    estado: d.avance_pct < 50 ? "atencion" : "info",
    titulo: <>{d.departamento}: {fmt.pct(d.avance_pct)}</>,
    texto: <><Progreso valor={d.avance_pct} color={d.avance_pct < 50 ? "#c4320a" : d.avance_pct < 80 ? "#0b4f96" : "#2b6a0f"} /><span style={{ display: "block", marginTop: 4 }}>{fmt.numero(d.completados)} de {fmt.numero(d.meta)} lugares poblados en {fmt.numero(d.municipios)} {plural(d.municipios, "municipio", "municipios")}.</span></>,
    accion: <button type="button" className="boton secundario pequeno" onClick={() => verDepto(d.departamento)}>Ver municipios</button>,
  }));
  return (
    <>
      {datos.es_demo && <Aviso tono="alerta">{datos.nota}</Aviso>}
      <EnPocasPalabras>
        El operativo «{nombre}» lleva <b>{fmt.pct(avance)}</b> de avance nacional: {fmt.numero(completados)} de {fmt.numero(meta)} lugares poblados.
        {atrasados.length > 0 && <> Los departamentos más atrasados son {atrasados.map((d, i) => <span key={d.departamento}>{i > 0 && (i === atrasados.length - 1 ? " y " : ", ")}{d.departamento} ({fmt.pct(d.avance_pct)})</span>)}.</>}
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c4"><CifraClara etiqueta="Avance nacional" valor={fmt.pct(avance)} detalle={`${fmt.numero(completados)} de ${fmt.numero(meta)} lugares poblados`}
          significa="Lugares poblados ya completados de la meta total del operativo." /></div>
        <div className="c4"><CifraClara tono="verde" etiqueta="Departamentos con 80 % o más" numero={bien} formato={(v) => fmt.numero(v)}
          significa={`De ${deptos.length} departamentos, ${plural(bien, "este va", "estos van")} cerca de terminar.`} /></div>
        <div className="c4"><CifraClara tono="naranja" etiqueta="Departamentos con menos de 50 %" numero={mal} formato={(v) => fmt.numero(v)}
          significa="Conviene revisar con su delegación qué les falta para avanzar." /></div>
      </div>
      <Tarjeta titulo="Los tres departamentos más atrasados" ayuda="Del menor al mayor avance.">
        <ListaSimple elementos={elementos} />
      </Tarjeta>
      <PieResumen fuente="avance registrado en Nexo por delegación; universo: lugares poblados del Censo 2018">
        La vista Completa muestra todos los departamentos y permite registrar el avance de cada municipio.
      </PieResumen>
    </>
  );
}

function CompletaOperativos({ datos, nombre, recargar }: { datos: any; nombre: string; recargar: () => void }) {
  const { puede } = useSesion();
  const [params] = useSearchParams();
  const [depto, setDepto] = useState(params.get("depto") ?? "");
  const [editando, setEditando] = useState<any>(null);
  const [valor, setValor] = useState("");
  const guardar = async () => {
    if (!editando) return;
    await api(`/api/territorio/operativos/${encodeURIComponent(nombre)}/${editando.codigo}`, { metodo: "PATCH", cuerpo: { completados: Number(valor) } });
    avisar("Avance actualizado."); setEditando(null); recargar();
  };
  const actualizar = (m: any) => { setEditando(m); setValor(String(m.completados)); };
  return (
    <>
      {datos.es_demo && <Aviso tono="alerta">{datos.nota}</Aviso>}
      <div className="rejilla">
        {datos.departamentos.map((d: any) => (
          <button key={d.departamento} className="c3 tarjeta" style={{ textAlign: "left", cursor: "pointer", border: depto === d.departamento ? "2px solid var(--ine-celeste)" : undefined }} onClick={() => setDepto(depto === d.departamento ? "" : d.departamento)}>
            <div className="fila espaciado"><b>{d.departamento}</b><span className="pequeno">{fmt.pct(d.avance_pct)}</span></div>
            <Progreso valor={d.avance_pct} color={d.avance_pct < 50 ? "#c4320a" : d.avance_pct < 80 ? "#0b4f96" : "#2b6a0f"} />
            <div className="pequeno suave" style={{ marginTop: 4 }}>{fmt.numero(d.completados)} de {fmt.numero(d.meta)} lugares · {d.municipios} municipios</div>
          </button>
        ))}
      </div>
      <Tarjeta titulo={depto ? `Municipios de ${depto}` : "Municipios más rezagados"} ayuda={puede("territorio:gestionar") ? "Seleccione un municipio para registrar su avance." : undefined}>
        <Tabla maximo={60} filas={datos.municipios.filter((m: any) => !depto || m.departamento === depto).sort((a: any, b: any) => a.avance_pct - b.avance_pct)}
          onFila={puede("territorio:gestionar") ? actualizar : undefined} columnas={[
            { id: "m", titulo: "Municipio", valor: (m: any) => m.municipio, celda: (m: any) => <span>{m.municipio}<br /><span className="pequeno suave">{m.departamento}</span></span> },
            { id: "d", titulo: "Delegación", valor: (m: any) => m.delegacion },
            { id: "a", titulo: "Avance", valor: (m: any) => m.avance_pct, celda: (m: any) => <div style={{ minWidth: 140 }}><Progreso valor={m.avance_pct} /><span className="pequeno">{fmt.pct(m.avance_pct)}</span></div> },
            { id: "c", titulo: "Completados / meta", num: true, valor: (m: any) => m.completados, celda: (m: any) => `${fmt.numero(m.completados)} / ${fmt.numero(m.meta)}` },
          ]} />
      </Tarjeta>
      {editando && (
        <Modal titulo={`Avance en ${editando.municipio}`} onCerrar={() => setEditando(null)}>
          <div className="columna">
            <Campo etiqueta={`Lugares poblados completados (meta ${fmt.numero(editando.meta)})`}>
              <input type="number" min={0} max={editando.meta} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            </Campo>
            <button className="boton" onClick={guardar}>Guardar avance</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Operativos() {
  const { datos: lista } = useDatos<any[]>("/api/territorio/operativos");
  const nombre = lista?.[0]?.operativo;
  const { datos, recargar } = useDatos<any>(nombre ? `/api/territorio/operativos/${encodeURIComponent(nombre)}` : null);
  if (lista && !lista.length) return <Aviso tono="info">No hay operativos registrados.</Aviso>;
  if (!lista || !datos) return <><EsqueletoKpis n={3} /><div className="tarjeta"><EsqueletoTabla filas={4} /></div></>;
  return <SegunVista resumen={<ResumenOperativos datos={datos} nombre={nombre} />} completa={<CompletaOperativos datos={datos} nombre={nombre} recargar={recargar} />} />;
}

// ------------------------------------------------------------------------------------------------ Página

export default function Territorio() {
  const navegar = useNavigate();
  const params = useParams();
  const sub = (params["*"] ?? "").split("/")[0] || "pais";
  const { puede } = useSesion();
  return (
    <div className="columna" style={{ gap: 16 }}>
      {sub !== "municipio" && (
        <Encabezado titulo="Territorio y operativos" subtitulo="Consultas por departamento, municipio y lugar poblado con el Censo 2018 y las proyecciones del INE, y seguimiento del avance de campo por delegación."
          acciones={<BotonAyuda ayuda={sub === "operativos" ? AYUDA_OPERATIVOS : AYUDA_PAIS} />} />
      )}
      {sub !== "municipio" && <Pestanas opciones={[{ id: "pais", etiqueta: "País y municipios" }, ...(puede("territorio:ver") ? [{ id: "operativos", etiqueta: "Avance de operativos" }] : [])]} activa={sub as any} onCambio={(id) => navegar(id === "pais" ? "/territorio" : `/territorio/${id}`)} />}
      <Routes>
        <Route index element={<Pais />} />
        <Route path="operativos" element={<Operativos />} />
        <Route path="municipio/:codigo" element={<Municipio />} />
      </Routes>
    </div>
  );
}
