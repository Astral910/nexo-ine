// Representa cualquier widget de un tablero: de datos (capa semántica) o de sistema (componentes vivos).
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { api, fmt } from "../api";
import { Grafica, opcionBarras, opcionDona, opcionLinea } from "./Grafica";
import { MapaGT } from "./MapaGT";
import { Aviso, Esqueleto, FuenteCita, Insignia, Medidor, Progreso, Severidad, Tabla, Vacio, useDatos } from "./ui";
import { useVista } from "./vista";

/** Ruta que responde las consultas de los widgets: la interna (con sesión) o la pública de Nexo Abierto. */
export const RutaConsulta = createContext("/api/analitica/consulta");

export interface WidgetSpec {
  id: string; tipo: string; titulo: string; ancho: number; consulta?: any; componente?: string; texto?: string;
}

interface Resultado {
  fuente: { titulo: string; cita: string };
  medida: { etiqueta: string; unidad: string; formato: string };
  dimension: { etiqueta: string } | null;
  serie: { etiqueta: string } | null;
  filas: { x: string; serie: string | null; valor: number | null; n: number; suprimido: boolean }[];
  advertencias: string[];
}

export function formateador(formato: string, unidad?: string) {
  if (formato === "moneda") return (v: number) => fmt.moneda(v, v >= 1000 ? 0 : 2);
  if (formato === "porcentaje") return (v: number) => fmt.pct(v, 2);
  if (formato === "indice") return (v: number) => fmt.numero(v, 2);
  return (v: number) => fmt.numero(v, unidad === "personas" || unidad === "compras" ? 0 : 1);
}

function WidgetDatos({ w }: { w: WidgetSpec }) {
  const [r, setR] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ruta = useContext(RutaConsulta);
  const clave = JSON.stringify(w.consulta);
  useEffect(() => {
    let vivo = true;
    setR(null); setError(null);
    api<Resultado>(ruta, { cuerpo: { consulta: w.consulta } })
      .then((d) => vivo && setR(d)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [clave, ruta]);
  const contenido = useMemo(() => {
    if (!r) return null;
    const f = formateador(r.medida.formato, r.medida.unidad);
    if (!r.filas.length) return <Vacio>No hay datos para esta combinación.</Vacio>;
    if (w.tipo === "kpi") {
      return (
        <div className="columna" style={{ gap: 6 }}>
          {r.filas.slice(0, 4).map((x, i) => (
            <div key={i} className="kpi">
              {r.filas.length > 1 && <span className="etiqueta">{x.x}</span>}
              <span className="valor">{x.suprimido ? "Suprimido" : x.valor === null ? "—" : f(x.valor)}</span>
              <span className="detalle">{r.medida.unidad} · n = {fmt.numero(x.n)}</span>
            </div>
          ))}
        </div>
      );
    }
    if (w.tipo === "linea") {
      const grupos = new Map<string, [string, number | null][]>();
      r.filas.forEach((x) => {
        const s = x.serie ?? r.medida.etiqueta;
        if (!grupos.has(s)) grupos.set(s, []);
        grupos.get(s)!.push([String(x.x), x.valor]);
      });
      return <Grafica opcion={opcionLinea([...grupos.entries()].slice(0, 10).map(([nombre, puntos]) => ({ nombre, puntos })), f)} />;
    }
    if (w.tipo === "dona") return <Grafica opcion={opcionDona(r.filas.map((x) => ({ name: String(x.x), value: x.valor ?? 0 })))} />;
    if (w.tipo === "barras" || w.tipo === "barras_h") {
      return <Grafica opcion={opcionBarras(r.filas.map((x) => String(x.x)), r.filas.map((x) => x.valor), w.tipo === "barras_h", f)}
        alto={w.tipo === "barras_h" ? Math.max(240, r.filas.length * 26 + 40) : undefined} />;
    }
    return (
      <Tabla maximo={60} filas={r.filas} columnas={[
        { id: "x", titulo: r.dimension?.etiqueta ?? "Grupo", valor: (x) => x.x },
        ...(r.serie ? [{ id: "s", titulo: r.serie.etiqueta, valor: (x: any) => x.serie }] : []),
        { id: "v", titulo: r.medida.etiqueta, num: true, valor: (x) => x.valor, celda: (x) => (x.suprimido ? <Insignia tono="demo">Suprimido</Insignia> : x.valor === null ? "—" : f(x.valor)) },
        { id: "n", titulo: "n", num: true, valor: (x) => x.n, celda: (x) => fmt.numero(x.n) },
      ]} />
    );
  }, [r, w.tipo]);
  if (error) return <Aviso tono="alerta">{error}</Aviso>;
  if (!r) return <Esqueleto alto={w.tipo === "kpi" ? 80 : 240} />;
  return (
    <>
      {contenido}
      {r.advertencias.length > 0 && (
        <details className="pequeno suave" style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer" }}><TriangleAlert size={13} style={{ verticalAlign: -2 }} /> Notas metodológicas ({r.advertencias.length})</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{r.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
      <FuenteCita>{r.fuente.cita}</FuenteCita>
    </>
  );
}

function WidgetSistema({ w }: { w: WidgetSpec }) {
  const { datos, error } = useDatos<any>(`/api/componentes/${w.componente}`);
  if (error) return <Aviso tono="alerta">{error}</Aviso>;
  if (!datos) return <Esqueleto alto={160} />;
  switch (w.componente) {
    case "indicadores_clave":
      return (
        <div className="rejilla">
          {[
            ["IPC interanual", fmt.pct(datos.ipc_interanual, 2), `Índice ${fmt.numero(datos.ipc_indice, 2)} · ${datos.ipc_periodo}`, "acento"],
            ["CBA urbana por persona", fmt.moneda(datos.cba_urbana), `Rural ${fmt.moneda(datos.cba_rural)} · ${datos.cba_periodo}`, "verde"],
            ["Alertas de precios nuevas", fmt.numero(datos.alertas_nuevas), `${fmt.numero(datos.alertas_altas)} de severidad alta`, "naranja"],
            ["Solicitudes abiertas", fmt.numero(datos.solicitudes_abiertas), `${datos.solicitudes_vencidas} vencidas`, "morado"],
          ].map(([e, v, d]) => (
            <div key={e} className="c3 kpi" style={{ padding: "4px 2px" }}>
              <span className="etiqueta">{e}</span><span className="valor">{v}</span><span className="detalle">{d}</span>
            </div>
          ))}
        </div>
      );
    case "actividad_reciente":
      return (
        <ul className="actividad">
          {(datos as any[]).map((a) => (
            <li key={a.id}><span className={`punto ${a.resultado}`} /><div><div>{a.texto}</div><div className="pequeno suave">{fmt.relativo(a.ts)} · {a.modulo}</div></div></li>
          ))}
        </ul>
      );
    case "alertas_recientes":
      return <Tabla filas={datos} columnas={[
        { id: "a", titulo: "Artículo", valor: (a: any) => a.articulo, celda: (a: any) => <Link to={`/indices/alertas?periodo=${a.periodo}`}>{a.articulo}</Link> },
        { id: "d", titulo: "Departamento", valor: (a: any) => a.departamento },
        { id: "p", titulo: "Periodo", valor: (a: any) => a.periodo },
        { id: "r", titulo: "Relativo", num: true, valor: (a: any) => a.relativo, celda: (a: any) => fmt.numero(a.relativo, 2) },
        { id: "s", titulo: "Severidad", valor: (a: any) => a.severidad, celda: (a: any) => <Severidad valor={a.severidad} /> },
      ]} vacio="No hay alertas nuevas." />;
    case "solicitudes_activas":
    case "mis_solicitudes":
      return <Tabla filas={datos} columnas={[
        { id: "c", titulo: "Código", valor: (s: any) => s.codigo, celda: (s: any) => <Link to={`/precios/${s.id}`}>{s.codigo}</Link> },
        { id: "p", titulo: "Producto", valor: (s: any) => s.producto },
        { id: "e", titulo: "Entidad", valor: (s: any) => s.entidad },
        { id: "t", titulo: "Etapa", valor: (s: any) => s.estado, celda: (s: any) => <Severidad valor={s.estado} /> },
        { id: "f", titulo: "Vence", valor: (s: any) => s.fecha_limite, celda: (s: any) => <span style={{ color: s.vencida ? "#b42318" : undefined }}>{fmt.fecha(s.fecha_limite)}</span> },
        { id: "r", titulo: "Precio", num: true, valor: (s: any) => s.precio_referencia, celda: (s: any) => fmt.moneda(s.precio_referencia) },
      ]} vacio="No hay solicitudes en curso." />;
    case "automatizaciones_estado":
      return <Tabla filas={datos} columnas={[
        { id: "n", titulo: "Automatización", valor: (a: any) => a.nombre },
        { id: "f", titulo: "Frecuencia", valor: (a: any) => a.frecuencia },
        { id: "e", titulo: "Último estado", valor: (a: any) => a.ultimo_estado, celda: (a: any) => <Severidad valor={a.ultimo_estado ?? "pendiente"} /> },
        { id: "u", titulo: "Última", valor: (a: any) => a.ultima, celda: (a: any) => fmt.relativo(a.ultima) },
        { id: "p", titulo: "Próxima", valor: (a: any) => a.proxima, celda: (a: any) => (a.activa ? fmt.relativo(a.proxima) : "Pausada") },
      ]} />;
    case "postura_seguridad":
    case "salud_ti":
      return (
        <div className="fila" style={{ alignItems: "flex-start", gap: 20 }}>
          <Medidor valor={datos.puntaje} etiqueta={w.componente === "salud_ti" ? "Salud TI" : "Seguridad"} />
          <div style={{ flex: 1, minWidth: 240 }}>
            {datos.hallazgos.length === 0 ? <Aviso tono="exito">Sin hallazgos abiertos.</Aviso> : (
              <ul className="actividad">{datos.hallazgos.map((h: any) => (
                <li key={h.id}><Severidad valor={h.severidad} /><div><div>{h.titulo}</div><div className="pequeno suave">{h.detalle}</div></div></li>
              ))}</ul>
            )}
          </div>
        </div>
      );
    case "frescura_datos":
      return <Tabla filas={datos} columnas={[
        { id: "t", titulo: "Fuente", valor: (f: any) => f.titulo },
        { id: "p", titulo: "Periodicidad", valor: (f: any) => f.periodicidad },
        { id: "d", titulo: "Descargada", valor: (f: any) => f.descargado_en, celda: (f: any) => fmt.fecha(f.descargado_en) },
        { id: "f", titulo: "Filas", num: true, valor: (f: any) => f.filas, celda: (f: any) => fmt.numero(f.filas) },
      ]} />;
    case "avance_operativo":
      return (
        <div className="columna">
          {(datos as any[]).some((d) => d.es_demo) && <Aviso tono="alerta">Avance de demostración sobre el universo real de lugares poblados del Censo 2018.</Aviso>}
          <div className="rejilla">
            {(datos as any[]).map((d) => (
              <div key={d.departamento} className="c4">
                <div className="fila espaciado pequeno"><b>{d.departamento}</b><span>{fmt.pct(d.avance_pct)} · {fmt.numero(d.completados)}/{fmt.numero(d.meta)}</span></div>
                <Progreso valor={d.avance_pct} color={d.avance_pct < 50 ? "#c4320a" : d.avance_pct < 80 ? "#0b4f96" : "#2b6a0f"} />
              </div>
            ))}
          </div>
        </div>
      );
    case "mapa_riesgos":
      return <MatrizRiesgos riesgos={datos} />;
    case "validaciones_recientes":
      return <Tabla filas={datos} vacio="Aún no ha validado archivos." columnas={[
        { id: "a", titulo: "Archivo", valor: (v: any) => v.archivo, celda: (v: any) => <Link to={`/calidad?v=${v.id}`}>{v.archivo}</Link> },
        { id: "p", titulo: "Puntaje", num: true, valor: (v: any) => v.puntaje },
        { id: "b", titulo: "Datos personales", valor: (v: any) => v.bloqueante, celda: (v: any) => (v.bloqueante ? <Insignia tono="critico">Sí</Insignia> : <Insignia tono="exito">No</Insignia>) },
      ]} />;
    case "rubrica_jurado":
      return (
        <div className="rejilla">
          {datos.criterios.map((c: any) => (
            <div key={c.criterio} className="c4 tarjeta" style={{ boxShadow: "none" }}>
              <div className="fila espaciado"><h3>{c.criterio}</h3><Insignia tono="info">{c.peso} %</Insignia></div>
              <ul className="pequeno" style={{ paddingLeft: 18, marginBottom: 0 }}>{c.evidencia.slice(0, 3).map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
            </div>
          ))}
        </div>
      );
    default:
      return <Vacio>Componente no disponible.</Vacio>;
  }
}

export function MatrizRiesgos({ riesgos }: { riesgos: { codigo: string; titulo: string; probabilidad: number; impacto: number; estado: string }[] }) {
  const color = (p: number) => (p >= 15 ? "#fde2df" : p >= 8 ? "#fff1e2" : p >= 4 ? "#fffbe0" : "#eef9e0");
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "28px repeat(5, 1fr)", gap: 4, fontSize: "0.72rem" }}>
        {[5, 4, 3, 2, 1].map((imp) => (
          <div key={imp} style={{ display: "contents" }}>
            <div className="suave" style={{ display: "grid", placeItems: "center" }}>{imp}</div>
            {[1, 2, 3, 4, 5].map((pro) => {
              const aqui = riesgos.filter((r) => r.impacto === imp && r.probabilidad === pro && r.estado !== "mitigado");
              return (
                <div key={pro} title={aqui.map((r) => `${r.codigo}: ${r.titulo}`).join("\n")}
                  style={{ background: color(imp * pro), borderRadius: 8, minHeight: 44, padding: 4, display: "flex", flexWrap: "wrap", gap: 3, alignContent: "flex-start" }}>
                  {aqui.map((r) => <span key={r.codigo} className="insignia" style={{ fontSize: "0.65rem", padding: "0 5px" }}>{r.codigo}</span>)}
                </div>
              );
            })}
          </div>
        ))}
        <div />
        {[1, 2, 3, 4, 5].map((p) => <div key={p} className="suave" style={{ textAlign: "center" }}>{p}</div>)}
      </div>
      <div className="pequeno suave" style={{ marginTop: 6 }}>Vertical: impacto · Horizontal: probabilidad (1 a 5)</div>
    </div>
  );
}

export function Widget({ w }: { w: WidgetSpec }) {
  let cuerpo;
  if (w.tipo === "sistema") cuerpo = <WidgetSistema w={w} />;
  else if (w.tipo === "mapa") cuerpo = <MapaGT alto={420} />;
  else if (w.tipo === "nota") cuerpo = <p>{w.texto}</p>;
  else cuerpo = <WidgetDatos w={w} />;
  return (
    <section className="tarjeta" style={{ gridColumn: `span ${Math.min(12, Math.max(3, w.ancho || 6))}` }}>
      <header><h3>{w.titulo}</h3></header>
      {cuerpo}
    </section>
  );
}

/**
 * Tablero completo o en resumen. En «Resumen» se muestran los primeros elementos que no son tablas (la cifra y la
 * gráfica principal) y una sola nota; en «Completa», todos los elementos y todas las notas de método.
 */
export function TableroVista({ spec, vista: forzada }: { spec: { widgets: WidgetSpec[]; advertencias?: string[] }; vista?: "resumen" | "completa" }) {
  const { vista: global, cambiar } = useVista();
  const vista = forzada ?? global;
  const widgets = vista === "resumen" ? spec.widgets.filter((w) => w.tipo !== "tabla").slice(0, 3) : spec.widgets;
  const ocultos = spec.widgets.length - widgets.length;
  const notas = spec.advertencias ?? [];
  return (
    <div className="columna" style={{ gap: 16 }}>
      {notas.length > 0 && (
        <Aviso tono="info"><b>Para interpretar bien:</b>{vista === "resumen" ? <> {notas[0]}{notas.length > 1 && <span className="suave"> ({notas.length - 1} nota{notas.length > 2 ? "s" : ""} más en la vista Completa)</span>}</>
          : <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{notas.map((a, i) => <li key={i}>{a}</li>)}</ul>}</Aviso>
      )}
      <div className="rejilla">{widgets.map((w) => <Widget key={w.id + JSON.stringify(w.consulta ?? w.componente)} w={w} />)}</div>
      {vista === "resumen" && ocultos > 0 && !forzada && (
        <div className="fila espaciado pequeno suave">
          <span>Se muestran {widgets.length} de {spec.widgets.length} elementos, sin la tabla de datos.</span>
          <button type="button" className="boton secundario pequeno" onClick={() => cambiar("completa")}>Ver el tablero completo</button>
        </div>
      )}
    </div>
  );
}
