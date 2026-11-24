// Envoltorio de Apache ECharts con la paleta del INE. Solo se importan los módulos que se usan.
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, PieChart, ScatterChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, VisualMapComponent, CanvasRenderer]);

// Paleta del INE en tonos con contraste suficiente sobre blanco (el verde lima y el amarillo se oscurecen).
export const PALETA = ["#004080", "#0080FF", "#E04B00", "#5E8C0A", "#7B5CD6", "#A88600", "#4D5B6E", "#4F86C6", "#A33A00", "#2E6FB5"];

/** Sin animación si la persona pidió movimiento reducido (sistema operativo o preferencia de Nexo). */
export function movimientoReducido() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("sin-animacion");
}

const BASE = {
  animationDuration: 450,
  animationEasing: "cubicOut" as const,
  animationDurationUpdate: 300,
  color: PALETA,
  textStyle: { fontFamily: "Ubuntu Sans, system-ui, sans-serif", color: "#14243a" },
  grid: { left: 12, right: 18, top: 28, bottom: 8, containLabel: true },
  tooltip: { confine: true, backgroundColor: "rgba(255,255,255,0.97)", borderColor: "#e1e6ee", borderWidth: 1, padding: [8, 12],
    textStyle: { color: "#0f1c2e", fontSize: 12 }, extraCssText: "box-shadow: 0 8px 16px rgba(15,28,46,.12); border-radius: 8px;" },
};

export function Grafica({ opcion, clase = "grafica", alto }: { opcion: Record<string, unknown>; clase?: string; alto?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const instancia = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    instancia.current = echarts.init(ref.current, undefined, { renderer: "canvas" });
    const observador = new ResizeObserver(() => instancia.current?.resize());
    observador.observe(ref.current);
    return () => { observador.disconnect(); instancia.current?.dispose(); instancia.current = null; };
  }, []);
  useEffect(() => {
    instancia.current?.setOption({ ...BASE, animation: !movimientoReducido(), ...opcion }, true);
  }, [opcion]);
  return <div ref={ref} className={clase} style={alto ? { height: alto } : undefined} role="img" aria-label="Gráfica" />;
}

/** Etiquetas de eje compactas ("1.5 mil", "Q2 M"): el valor exacto se ve al pasar el cursor. */
function etiquetaEje(formato?: (v: number) => string) {
  const compacto = (v: number) => v.toLocaleString("es-GT", { notation: "compact", maximumFractionDigits: 1 });
  if (!formato) return compacto;
  const muestra = formato(1);
  if (muestra.startsWith("Q")) return (v: number) => (Math.abs(v) >= 1000 ? "Q" + compacto(v) : formato(v));
  if (muestra.includes("%")) return formato;
  return (v: number) => (Math.abs(v) >= 1000 ? compacto(v) : Number.isInteger(v) ? v.toLocaleString("es-GT") : formato(v));
}

const eje = { axisLine: { lineStyle: { color: "#c7d0dc" } }, axisTick: { show: false }, axisLabel: { color: "#3d4b5f" }, splitLine: { lineStyle: { color: "#edf0f5" } } };

export function opcionLinea(series: { nombre: string; puntos: [string, number | null][] }[], formato?: (v: number) => string) {
  return {
    tooltip: { trigger: "axis", valueFormatter: (v: number) => (v === null || v === undefined ? "—" : formato ? formato(v) : v.toLocaleString("es-GT")) },
    legend: series.length > 1 ? { top: 0, type: "scroll" } : undefined,
    grid: { ...BASE.grid, top: series.length > 1 ? 36 : 16 },
    xAxis: { type: "category", data: Array.from(new Set(series.flatMap((s) => s.puntos.map((p) => p[0])))).sort(), ...eje, boundaryGap: false },
    yAxis: { type: "value", scale: true, ...eje, axisLabel: { color: "#4d5b6e", formatter: etiquetaEje(formato) } },
    dataZoom: series[0]?.puntos.length > 36 ? [{ type: "inside" }] : undefined,
    // Sin suavizado: entre dos periodos no hay datos, y una curva sugeriría valores que no existen.
    series: series.map((s) => ({ name: s.nombre, type: "line", smooth: false, showSymbol: s.puntos.length < 30, symbolSize: 5, data: s.puntos,
      lineStyle: { width: 2 }, connectNulls: false })),
  };
}

export function opcionBarras(etiquetas: string[], valores: (number | null)[], horizontal = false, formato?: (v: number) => string, color = "#004080") {
  const categoria = { type: "category", data: etiquetas, ...eje, axisLabel: { color: "#4d5b6e", width: horizontal ? 170 : 90, overflow: "truncate", interval: 0, rotate: !horizontal && etiquetas.length > 8 ? 35 : 0 } };
  const valor = { type: "value", ...eje, axisLabel: { color: "#4d5b6e", formatter: etiquetaEje(formato) } };
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => (v === null ? "Suprimido" : formato ? formato(v) : v.toLocaleString("es-GT")) },
    xAxis: horizontal ? valor : categoria,
    yAxis: horizontal ? { ...categoria, inverse: true } : valor,
    series: [{ type: "bar", data: valores, itemStyle: { color, borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] }, barMaxWidth: 32 }],
  };
}

export function opcionDona(datos: { name: string; value: number }[]) {
  return {
    tooltip: { trigger: "item", valueFormatter: (v: number) => v.toLocaleString("es-GT") },
    legend: { bottom: 0, type: "scroll" },
    series: [{ type: "pie", radius: ["52%", "74%"], center: ["50%", "45%"], itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { show: false }, data: datos }],
  };
}
