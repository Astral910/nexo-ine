// Cliente HTTP: mismo origen, cookies de sesión HttpOnly y cabecera CSRF en toda operación que modifica datos.

export class ErrorApi extends Error {
  estado: number;
  errores?: { campo: string; mensaje: string }[];
  constructor(estado: number, mensaje: string, errores?: { campo: string; mensaje: string }[]) {
    super(mensaje);
    this.estado = estado;
    this.errores = errores;
  }
}

function leerCookie(nombre: string): string {
  const par = document.cookie.split("; ").find((c) => c.startsWith(nombre + "="));
  return par ? decodeURIComponent(par.split("=")[1]) : "";
}

type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T = any>(ruta: string, opciones: { metodo?: Metodo; cuerpo?: unknown; formulario?: FormData } = {}): Promise<T> {
  const metodo = opciones.metodo ?? (opciones.cuerpo !== undefined || opciones.formulario ? "POST" : "GET");
  const cabeceras: Record<string, string> = { Accept: "application/json" };
  if (metodo !== "GET") cabeceras["X-CSRF-Token"] = leerCookie("nexo_csrf");
  let body: BodyInit | undefined;
  if (opciones.formulario) body = opciones.formulario;
  else if (opciones.cuerpo !== undefined) {
    cabeceras["Content-Type"] = "application/json";
    body = JSON.stringify(opciones.cuerpo);
  }
  const r = await fetch(ruta, { method: metodo, headers: cabeceras, body, credentials: "same-origin" });
  if (r.status === 401 && !ruta.startsWith("/api/auth/")) {
    window.dispatchEvent(new CustomEvent("nexo:sesion-expirada"));
  }
  const tipo = r.headers.get("content-type") ?? "";
  const datos = tipo.includes("application/json") ? await r.json() : await r.text();
  if (!r.ok) {
    const mensaje = typeof datos === "object" && datos?.detalle ? String(datos.detalle) : `Error ${r.status}`;
    throw new ErrorApi(r.status, mensaje, typeof datos === "object" ? datos?.errores : undefined);
  }
  return datos as T;
}

export const fmt = {
  numero: (v: number | null | undefined, dec = 0) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : v.toLocaleString("es-GT", { maximumFractionDigits: dec, minimumFractionDigits: dec }),
  moneda: (v: number | null | undefined, dec = 2) =>
    v === null || v === undefined ? "—" : "Q" + v.toLocaleString("es-GT", { maximumFractionDigits: dec, minimumFractionDigits: dec }),
  pct: (v: number | null | undefined, dec = 1) => (v === null || v === undefined ? "—" : `${v.toLocaleString("es-GT", { maximumFractionDigits: dec })} %`),
  fecha: (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
    return d.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Guatemala" });
  },
  fechaHora: (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
    return d.toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Guatemala" });
  },
  relativo: (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
    const s = (Date.now() - d.getTime()) / 1000;
    const futuro = s < 0;
    const a = Math.abs(s);
    const t = a < 60 ? "unos segundos" : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} días`;
    return futuro ? `en ${t}` : `hace ${t}`;
  },
};

export function descargar(ruta: string) {
  window.open(ruta, "_blank", "noopener");
}
