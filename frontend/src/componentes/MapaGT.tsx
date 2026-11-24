// Mapa de Guatemala dibujado con los 20 mil centroides de lugares poblados del Censo 2018 (sin mapas externos).
import { useMemo } from "react";
import { Grafica, PALETA } from "./Grafica";
import { Esqueleto, FuenteCita, useDatos } from "./ui";

export function MapaGT({ departamento, alto = 460, puntos: propios }: { departamento?: string; alto?: number; puntos?: number[][] }) {
  const ruta = propios ? null : `/api/territorio/mapa${departamento ? `?departamento=${encodeURIComponent(departamento)}` : ""}`;
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
      series: [{
        type: "scatter", large: true, largeThreshold: 3000, data: puntos,
        symbolSize: (v: number[]) => Math.max(2, Math.min(14, Math.sqrt(v[2] || 1) / 9)),
        itemStyle: { color: (p: any) => PALETA[(p.value[3] ?? 0) % PALETA.length], opacity: 0.75 },
      }],
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
