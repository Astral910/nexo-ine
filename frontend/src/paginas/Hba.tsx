// Hoja de Balance de Alimentos 2024: disponibilidad, dependencia de importaciones y calculadora de derivados.
// Vista «Resumen»: los alimentos con más disponibilidad por persona, el más importado entre los principales y una
// calculadora sencilla. Vista «Completa»: el balance por producto y grupo y la calculadora con todos los derivados.
import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { api, fmt } from "../api";
import { Grafica, opcionBarras } from "../componentes/Grafica";
import { Aviso, Campo, Encabezado, EsqueletoGrafica, EsqueletoKpis, EsqueletoTabla, FuenteCita, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, PieResumen, SegunVista, useVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  titulo: "Cómo leer la Hoja de Balance de Alimentos",
  que: "Cuántos alimentos tuvo el país en 2024: lo que se produjo, se importó y se exportó, y cuánto quedó disponible por persona.",
  datos: "Hoja de Balance de Alimentos 2024 del INE (metodología de la FAO) y proyecciones de población del INE para 2024.",
  pasos: [
    "Vea qué alimentos tienen más disponibilidad por persona.",
    "Revise cuánto depende el país de las importaciones en cada producto.",
    "Use la calculadora para estimar cuánto producto derivado sale de una cantidad de producto primario.",
  ],
  resumen: "Los alimentos con más disponibilidad por persona, el más importado entre los principales y una calculadora sencilla.",
  completa: "El balance completo por producto y grupo, con producción, importaciones, exportaciones, suministro y disponibilidad diaria, y la calculadora con todos los derivados.",
  terminos: [
    ["Suministro interno", "Producción + importaciones − exportaciones − cambio de existencias."],
    ["Disponibilidad por persona", "Lo destinado a alimentación dividido entre la población. No es lo que cada persona comió."],
    ["Dependencia de importaciones", "Importaciones ÷ (producción + importaciones − exportaciones), según la FAO. Pasa de 100 % cuando una parte de lo importado se reexporta, por ejemplo trigo que sale como harina."],
    ["Relación aparente", "Producción del derivado ÷ cantidad procesada del primario, observada en el balance de 2024. Es lo que usa la calculadora mientras no se carguen las tasas de extracción oficiales."],
    ["Tasa de extracción", "Proporción oficial de producto derivado que se obtiene de un primario, por ejemplo harina a partir de trigo. La DIEC pidió aplicarlas en la calculadora."],
  ],
};

/** Calculadora de derivados en una frase (la vista Completa muestra todos los derivados en una tabla). */
function CalculadoraSencilla({ conv }: { conv: any[] | null }) {
  const [primario, setPrimario] = useState("Trigo");
  const [cantidad, setCantidad] = useState(1000);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState("");
  const { cambiar } = useVista();
  useEffect(() => {
    if (conv?.length && !conv.some((c) => c.primario === primario)) setPrimario(conv[0].primario);
  }, [conv]); // eslint-disable-line react-hooks/exhaustive-deps
  const calcular = async () => {
    setError("");
    try { setResultado(await api("/api/hba/calcular", { cuerpo: { primario, cantidad } })); }
    catch (e) { setError((e as Error).message); setResultado(null); }
  };
  const principales = resultado ? [...resultado.derivados].sort((a: any, b: any) => b.tasa - a.tasa).slice(0, 3) : [];
  return (
    <Tarjeta titulo={<><Calculator size={18} style={{ verticalAlign: -3 }} /> ¿Cuánto producto derivado se obtiene?</>}
      ayuda="Reto propuesto por la DIEC: de una cantidad de producto primario, cuánto sale de cada derivado.">
      <div className="columna">
        <div className="fila" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 200 }}><Campo etiqueta="Producto primario"><select value={primario} onChange={(e) => { setPrimario(e.target.value); setResultado(null); }}>{(conv ?? []).map((c: any) => <option key={c.primario}>{c.primario}</option>)}</select></Campo></div>
          <div style={{ flex: 1, minWidth: 140 }}><Campo etiqueta="Toneladas métricas"><input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} /></Campo></div>
          <button className="boton" onClick={calcular} disabled={!conv || cantidad <= 0}><Calculator /> Calcular</button>
        </div>
        {error && <Aviso tono="alerta">{error}</Aviso>}
        {resultado && principales.length > 0 && (
          <div className="columna aparecer" style={{ gap: 8 }}>
            <p className="respuesta-precio">
              Con <b>{fmt.numero(resultado.cantidad)}</b> toneladas de {String(resultado.primario).toLowerCase()} se obtendrían aproximadamente{" "}
              {principales.map((d: any, i: number) => (
                <span key={d.derivado}>{i > 0 && (i === principales.length - 1 ? " y " : ", ")}<b>{fmt.numero(d.cantidad_estimada, 1)} t</b> de {String(d.derivado).toLowerCase()}</span>
              ))}.
            </p>
            <p className="pequeno suave">
              Se calcula con relaciones aparentes del balance publicado (producción del derivado ÷ cantidad procesada del primario), no con las tasas de
              extracción oficiales. Algunos derivados salen de etapas intermedias, por eso las cantidades no se suman entre sí.
              {resultado.derivados.length > 3 && <> <button type="button" className="boton fantasma pequeno" onClick={() => cambiar("completa")}>Ver los {resultado.derivados.length} derivados</button></>}
            </p>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

function ResumenHba({ datos, conv }: { datos: any; conv: any[] | null }) {
  const top = useMemo(() => (datos?.productos ?? []).filter((p: any) => !p.es_grupo && p.kg_persona_anio)
    .sort((a: any, b: any) => b.kg_persona_anio - a.kg_persona_anio), [datos]);
  if (!datos) return <><div className="esqueleto" style={{ height: 92, borderRadius: 14 }} /><EsqueletoKpis n={3} /><div className="tarjeta"><EsqueletoGrafica /></div></>;
  const primero = top[0];
  // El más importado entre los 15 con más disponibilidad (sin los que pasan de 100 % por reexportación).
  const dep = top.slice(0, 15).filter((p: any) => p.dependencia_importaciones !== null && p.dependencia_importaciones <= 100)
    .sort((a: any, b: any) => b.dependencia_importaciones - a.dependencia_importaciones)[0];
  const diez = top.slice(0, 10);
  return (
    <>
      <EnPocasPalabras>
        {primero ? (
          <>
            <p>En 2024 hubo disponibles para alimentación, en promedio, <b>{fmt.numero(primero.kg_persona_anio, 1)} kg</b> de {String(primero.producto).toLowerCase()} por persona al año (unos {fmt.numero(primero.g_persona_dia, 0)} gramos al día).</p>
            {dep && <p>De cada 100 toneladas de {String(dep.producto).toLowerCase()} disponibles en el país, unas <b>{fmt.numero(dep.dependencia_importaciones, 0)}</b> vinieron de otros países.</p>}
          </>
        ) : "Aún no hay datos de la Hoja de Balance cargados."}
      </EnPocasPalabras>
      {primero && (
        <div className="rejilla escalonada">
          <div className="c4"><CifraClara etiqueta="Alimento con más disponibilidad" valor={`${fmt.numero(primero.kg_persona_anio, 1)} kg`} detalle={primero.producto}
            significa="Por persona al año. Es lo disponible para alimentación, no lo que cada persona comió." /></div>
          {dep && <div className="c4"><CifraClara tono="naranja" etiqueta="Más importado entre los principales" valor={fmt.pct(dep.dependencia_importaciones)} detalle={dep.producto}
            significa="Parte de lo disponible en el país que se importó: importaciones ÷ (producción + importaciones − exportaciones)." /></div>}
          <div className="c4"><CifraClara tono="morado" etiqueta="Población para el cálculo" numero={datos.poblacion} formato={(v) => fmt.numero(v)} detalle="Proyección del INE para 2024"
            significa="Con ella se calcula cuánto alimento toca por persona." /></div>
        </div>
      )}
      <Tarjeta titulo="Los 10 alimentos con más disponibilidad por persona (kg al año)">
        <Grafica opcion={opcionBarras(diez.map((p: any) => p.producto), diez.map((p: any) => p.kg_persona_anio), true, (v) => fmt.numero(v, 1))} alto={340} />
        <FuenteCita>INE, Hoja de Balance de Alimentos 2024 y proyecciones de población 2015-2030.</FuenteCita>
      </Tarjeta>
      <CalculadoraSencilla conv={conv} />
      <PieResumen fuente="INE, Hoja de Balance de Alimentos 2024 y proyecciones de población 2015-2030">
        La vista Completa tiene el balance de cada producto y grupo.
      </PieResumen>
    </>
  );
}

function CompletaHba({ datos, conv }: { datos: any; conv: any[] | null }) {
  const [primario, setPrimario] = useState("Trigo");
  const [cantidad, setCantidad] = useState(1000);
  const [resultado, setResultado] = useState<any>(null);
  const [soloGrupos, setSoloGrupos] = useState(false);
  const top = useMemo(() => (datos?.productos ?? []).filter((p: any) => !p.es_grupo && p.kg_persona_anio).sort((a: any, b: any) => b.kg_persona_anio - a.kg_persona_anio).slice(0, 15), [datos]);
  const calcular = async () => setResultado(await api("/api/hba/calcular", { cuerpo: { primario, cantidad } }));
  if (!datos) return <div className="rejilla"><div className="c5 tarjeta"><EsqueletoTabla filas={5} /></div><div className="c7 tarjeta"><EsqueletoGrafica alto={420} /></div></div>;
  return (
    <>
      <div className="rejilla">
        <div className="c5">
          <Tarjeta titulo={<><Calculator size={18} style={{ verticalAlign: -3 }} /> Calculadora de productos derivados</>} ayuda="Reto propuesto por la DIEC: cuánto producto derivado se obtiene de una cantidad de producto primario.">
            <div className="columna">
              <Campo etiqueta="Producto primario"><select value={primario} onChange={(e) => setPrimario(e.target.value)}>{(conv ?? []).map((c: any) => <option key={c.primario}>{c.primario}</option>)}</select></Campo>
              <Campo etiqueta="Cantidad (toneladas métricas)"><input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} /></Campo>
              <button className="boton" onClick={calcular}><Calculator /> Calcular</button>
              {resultado && (
                <>
                  <Tabla filas={resultado.derivados} columnas={[
                    { id: "d", titulo: "Derivado", valor: (x: any) => x.derivado },
                    { id: "t", titulo: "Relación", num: true, valor: (x: any) => x.tasa, celda: (x: any) => fmt.pct(x.tasa * 100, 1) },
                    { id: "c", titulo: "Estimado (t)", num: true, valor: (x: any) => x.cantidad_estimada, celda: (x: any) => fmt.numero(x.cantidad_estimada, 1) },
                  ]} />
                  <Aviso tono="info">{resultado.metodo} Equivale a {fmt.pct(resultado.porcentaje_del_procesado_nacional, 2)} de lo procesado en el país en 2024.</Aviso>
                </>
              )}
            </div>
          </Tarjeta>
        </div>
        <div className="c7">
          <Tarjeta titulo="Disponibilidad de alimentos por persona (kg al año)">
            <Grafica opcion={opcionBarras(top.map((p: any) => p.producto), top.map((p: any) => p.kg_persona_anio), true, (v) => fmt.numero(v, 1))} alto={420} />
            <FuenteCita>INE, Hoja de Balance de Alimentos 2024 y proyecciones de población 2015-2030.</FuenteCita>
          </Tarjeta>
        </div>
      </div>
      <Tarjeta titulo="Balance por producto" ayuda={datos.nota} acciones={<label className="casilla" style={{ whiteSpace: "nowrap" }}><input type="checkbox" checked={soloGrupos} onChange={(e) => setSoloGrupos(e.target.checked)} /> Solo grupos</label>}>
        <Tabla filas={datos.productos.filter((p: any) => !soloGrupos || p.es_grupo)} columnas={[
          { id: "p", titulo: "Producto", valor: (p: any) => p.producto, celda: (p: any) => (p.es_grupo ? <b>{p.producto}</b> : <span style={{ paddingLeft: 12 }}>{p.producto}</span>) },
          { id: "pr", titulo: "Producción (t)", num: true, valor: (p: any) => p.valores["Producción"], celda: (p: any) => fmt.numero(p.valores["Producción"]) },
          { id: "im", titulo: "Importaciones (t)", num: true, valor: (p: any) => p.valores["Importaciones"], celda: (p: any) => fmt.numero(p.valores["Importaciones"]) },
          { id: "ex", titulo: "Exportaciones (t)", num: true, valor: (p: any) => p.valores["Exportaciones"], celda: (p: any) => fmt.numero(p.valores["Exportaciones"]) },
          { id: "s", titulo: "Suministro interno (t)", num: true, valor: (p: any) => p.suministro_interno, celda: (p: any) => fmt.numero(p.suministro_interno) },
          { id: "d", titulo: "Depende de importación", num: true, valor: (p: any) => p.dependencia_importaciones, celda: (p: any) => (p.dependencia_importaciones === null ? "—" : (
            <span className="medida-celda" title="Importaciones ÷ (producción + importaciones − exportaciones)">
              <span className="barra-celda" aria-hidden><span style={{ width: `${Math.min(100, p.dependencia_importaciones)}%` }} /></span>
              {fmt.pct(p.dependencia_importaciones)}{p.dependencia_importaciones > 100 && <sup>1</sup>}
            </span>)) },
          { id: "k", titulo: "kg/persona/año", num: true, valor: (p: any) => p.kg_persona_anio, celda: (p: any) => fmt.numero(p.kg_persona_anio, 1) },
          { id: "g", titulo: "g/persona/día", num: true, valor: (p: any) => p.g_persona_dia, celda: (p: any) => fmt.numero(p.g_persona_dia, 0) },
        ]} />
        <p className="pequeno suave" style={{ marginTop: 10 }}>
          <sup>1</sup> Mayor a 100 %: las importaciones superan el uso interno porque una parte se reexporta (por ejemplo, trigo importado que sale del país como harina o pastas). Es el comportamiento esperado del coeficiente de la FAO.
        </p>
      </Tarjeta>
    </>
  );
}

export default function Hba() {
  const { datos } = useDatos<any>("/api/hba/productos");
  const { datos: conv } = useDatos<any[]>("/api/hba/conversiones");
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Hoja de Balance de Alimentos 2024"
        subtitulo={datos ? <>Suministro y uso de alimentos en Guatemala, con disponibilidad por persona calculada con la población proyectada por el INE para 2024 ({fmt.numero(datos.poblacion)} personas).</>
          : "Suministro y uso de alimentos en Guatemala, con disponibilidad por persona calculada con la población proyectada por el INE para 2024."}
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista resumen={<ResumenHba datos={datos} conv={conv} />} completa={<CompletaHba datos={datos} conv={conv} />} />
    </div>
  );
}
