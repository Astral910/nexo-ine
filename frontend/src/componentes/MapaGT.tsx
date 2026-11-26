// Mapa de Guatemala dibujado con los 20 mil centroides de lugares poblados del Censo 2018 (sin mapas externos).
import { useMemo } from "react";
import { Grafica, PALETA } from "./Grafica";
import { Esqueleto, FuenteCita, useDatos } from "./ui";

function agrupar(puntos: number[][]) {
  const grupos = new Map<number, number[][]>();
  for (const p of puntos) {
    const k = p[3] ?? 0;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(p);
  }
  return grupos;
}

export function MapaGT({ departamento, alto = 460, puntos: propios, base = "/api/territorio/mapa" }: {
  departamento?: string; alto?: number; puntos?: number[][]; base?: string;
}) {
  const ruta = propios ? null : `${base}${departamento ? `?departamento=${encodeURIComponent(departamento)}` : ""}`;
  const { datos } = useDatos<{ puntos: number[][] }>(ruta);
  const puntos = propios ?? datos?.puntos;
  const opcion = useMemo(() => {
    if (!puntos) return null;
    const lons = puntos.map((p) => p[0]), lats = puntos.map((p) => p[1]);
    const margen = 0.05;
    return {
      tooltip: { trigger: "item", formatter: (p: any) => `${(p.value[2] ?? 0).toLocaleString("es-GT")} habitantes (2018)` },
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      xAxis: { type: "value", show: false, min: Math.min(...lons) - margen, max: Math.max(...lons) + margen },
      yAxis: { type: "value", show: false, min: Math.min(...lats) - margen, max: Math.max(...lats) + margen },
      // Una serie por departamento (color fijo): el modo "large" de ECharts no admite estilos por punto.
      series: [...agrupar(puntos).entries()].map(([depto, pts]) => ({
        type: "scatter", data: pts, progressive: 0,
        symbolSize: (v: number[]) => Math.max(2, Math.min(14, Math.sqrt(v[2] || 1) / 9)),
        itemStyle: { color: PALETA[depto % PALETA.length], opacity: 0.72 },
      })),
    };
  }, [puntos]);
  if (!opcion) return <Esqueleto alto={alto} />;
  return (
    <div>
      <Grafica opcion={opcion} alto={alto} />
      <FuenteCita>INE, centroides de lugares poblados y Cuadro A1.3 del Censo 2018. Cada punto es un lugar poblado; el tamaño refleja su población.</FuenteCita>
    </div>
  );
}

/** Mapa de un municipio: el departamento de fondo en gris y los lugares poblados del municipio resaltados por área,
 *  con su nombre al pasar el cursor y el nombre de los más poblados. */
export function MapaMunicipio({ lugares, departamento, municipio, base = "/api/territorio/mapa", alto = 320 }: {
  lugares: any[][]; departamento: string; municipio: string; base?: string; alto?: number;
}) {
  const { datos } = useDatos<{ puntos: number[][] }>(`${base}?departamento=${encodeURIComponent(departamento)}`);
  const opcion = useMemo(() => {
    if (!lugares?.length) return null;
    // Encuadre centrado en el municipio, con margen para ver alrededor los demás lugares del departamento.
    const lons = lugares.map((p) => p[0] as number), lats = lugares.map((p) => p[1] as number);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const medio = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats), 0.04) * 0.85;
    const fondo = (datos?.puntos ?? []).filter((p) => Math.abs(p[0] - cx) <= medio * 1.3 && Math.abs(p[1] - cy) <= medio);
    const mayores = [...lugares].sort((a, b) => b[2] - a[2]).slice(0, 1).map((l) => l[3]);
    const tam = (v: any[]) => Math.max(4, Math.min(22, Math.sqrt(v[2] || 1) / 6));
    const serie = (area: string, color: string) => ({
      name: area === "Urbana" ? "Urbano" : "Rural", type: "scatter", z: 3,
      data: lugares.filter((l) => (area === "Urbana") === (l[4] === "Urbana")),
      symbolSize: tam, itemStyle: { color, opacity: 0.85, borderColor: "#fff", borderWidth: 1 },
      label: { show: true, formatter: (p: any) => (mayores.includes(p.value[3]) ? p.value[3] : ""), position: "top", fontSize: 12, fontWeight: 600, color: "#0f1c2e" },
      labelLayout: { hideOverlap: true },
    });
    return {
      tooltip: { trigger: "item", formatter: (p: any) => p.seriesIndex === 0 ? `${departamento}: otro municipio`
        : `<b>${p.value[3]}</b><br/>${(p.value[2] ?? 0).toLocaleString("es-GT")} habitantes (2018) · ${p.value[4] || "—"}` },
      legend: { bottom: 0, data: ["Urbano", "Rural"], textStyle: { fontSize: 12 } },
      grid: { left: 0, right: 0, top: 4, bottom: 28 },
      xAxis: { type: "value", show: false, min: cx - medio * 1.3, max: cx + medio * 1.3 },
      yAxis: { type: "value", show: false, min: cy - medio, max: cy + medio },
      series: [
        { name: departamento, type: "scatter", data: fondo, symbolSize: 4, silent: false, z: 1, itemStyle: { color: "#b9c3d1", opacity: 0.8 } },
        serie("Urbana", "#ff5500"),
        serie("Rural", PALETA[1] ?? "#0080ff"),
      ],
    };
  }, [lugares, datos, departamento]);
  if (!opcion) return <Esqueleto alto={alto} />;
  return (
    <div>
      <Grafica opcion={opcion} alto={alto} />
      <FuenteCita>INE, centroides de lugares poblados y Cuadro A1.3 del Censo 2018. En color, los lugares poblados de {municipio} (tamaño según su población); en gris, el resto de {departamento}.</FuenteCita>
    </div>
  );
}
