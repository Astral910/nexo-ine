// Hoja de Balance de Alimentos 2024: disponibilidad, dependencia de importaciones y calculadora de derivados.
import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { api, fmt } from "../api";
import { Grafica, opcionBarras } from "../componentes/Grafica";
import { Aviso, Campo, Encabezado, Esqueleto, FuenteCita, Tabla, Tarjeta, useDatos } from "../componentes/ui";

export default function Hba() {
  const { datos } = useDatos<any>("/api/hba/productos");
  const { datos: conv } = useDatos<any[]>("/api/hba/conversiones");
  const [primario, setPrimario] = useState("Trigo");
  const [cantidad, setCantidad] = useState(1000);
  const [resultado, setResultado] = useState<any>(null);
  const [soloGrupos, setSoloGrupos] = useState(false);
  const top = useMemo(() => (datos?.productos ?? []).filter((p: any) => !p.es_grupo && p.kg_persona_anio).sort((a: any, b: any) => b.kg_persona_anio - a.kg_persona_anio).slice(0, 15), [datos]);
  const calcular = async () => setResultado(await api("/api/hba/calcular", { cuerpo: { primario, cantidad } }));
  if (!datos) return <Esqueleto alto={400} />;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Hoja de Balance de Alimentos 2024" subtitulo={<>Suministro y uso de alimentos en Guatemala, con disponibilidad por persona calculada con la población proyectada por el INE para 2024 ({fmt.numero(datos.poblacion)} personas).</>} />
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
    </div>
  );
}
