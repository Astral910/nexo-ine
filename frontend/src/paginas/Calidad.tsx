// Validador de calidad: crítica de bases, inconsistencias, reglas de la DCE y protección de datos personales.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Upload } from "lucide-react";
import { api, ErrorApi, fmt } from "../api";
import { Aviso, Encabezado, Esqueleto, Insignia, Medidor, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";

function Informe({ r }: { r: any }) {
  const tono = (e: string) => (e === "ok" ? "exito" : e === "falla" ? "critico" : e === "revisar" ? "alerta" : "");
  return (
    <div className="columna" style={{ gap: 16 }}>
      {r.bloqueante && <Aviso tono="critico"><b>No publiques ni compartas este archivo.</b> Contiene posibles datos personales: protege el secreto estadístico eliminando o seudonimizando esas columnas.</Aviso>}
      <div className="rejilla">
        <div className="c3 tarjeta" style={{ display: "grid", placeItems: "center" }}><Medidor valor={Math.round(r.puntaje)} etiqueta="Calidad" /></div>
        <div className="c9">
          <Tarjeta titulo={r.archivo} ayuda={`${fmt.numero(r.filas)} filas · ${r.columnas} columnas · SHA-256 ${r.sha256.slice(0, 16)}… · el archivo no se guardó`}
            acciones={r.id && <a className="boton secundario pequeno" href={`/api/calidad/validaciones/${r.id}/inconsistencias.csv`}><Download /> Reporte para la fuente</a>}>
            <h3 style={{ margin: "4px 0 8px" }}>Las 6 reglas de cuidado de datos de la DCE</h3>
            <div className="rejilla">
              {r.reglas_dce.map((g: any) => (
                <div key={g.regla} className="c6 fila" style={{ alignItems: "flex-start", gap: 8 }}>
                  <Insignia tono={tono(g.estado)}>{g.estado.replace("_", " ")}</Insignia>
                  <div className="pequeno"><b>{g.regla}</b><br /><span className="suave">{g.detalle}</span></div>
                </div>
              ))}
            </div>
          </Tarjeta>
        </div>
      </div>
      <Tarjeta titulo={`Hallazgos (${r.hallazgos.length})`}>
        <Tabla filas={r.hallazgos} vacio="Sin hallazgos: la base pasó todas las reglas." columnas={[
          { id: "s", titulo: "Severidad", valor: (h: any) => h.severidad, celda: (h: any) => <Severidad valor={h.severidad} /> },
          { id: "c", titulo: "Columna", valor: (h: any) => h.columna },
          { id: "r", titulo: "Regla", valor: (h: any) => h.regla },
          { id: "m", titulo: "Hallazgo", valor: (h: any) => h.mensaje, celda: (h: any) => <span>{h.mensaje}{h.ejemplos?.length ? <><br /><span className="mono suave">{h.ejemplos.join(" · ")}</span></> : null}</span> },
          { id: "a", titulo: "Qué hacer", valor: (h: any) => h.recomendacion, celda: (h: any) => <span className="pequeno">{h.recomendacion}</span> },
        ]} />
      </Tarjeta>
      <Tarjeta titulo="Perfil de columnas">
        <Tabla filas={r.detalle_columnas} columnas={[
          { id: "n", titulo: "Columna", valor: (c: any) => c.nombre },
          { id: "t", titulo: "Tipo", valor: (c: any) => c.tipo },
          { id: "v", titulo: "Vacíos", num: true, valor: (c: any) => c.pct_vacios, celda: (c: any) => fmt.pct(c.pct_vacios) },
          { id: "d", titulo: "Distintos", num: true, valor: (c: any) => c.distintos, celda: (c: any) => fmt.numero(c.distintos) },
          { id: "r", titulo: "Rango", celda: (c: any) => (c.minimo !== undefined ? `${fmt.numero(c.minimo, 2)} a ${fmt.numero(c.maximo, 2)}` : "—") },
        ]} />
      </Tarjeta>
    </div>
  );
}

export default function Calidad() {
  const [params] = useSearchParams();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [informe, setInforme] = useState<any>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { datos: historial, recargar } = useDatos<any[]>("/api/calidad/validaciones");
  useEffect(() => { const v = params.get("v"); if (v) api(`/api/calidad/validaciones/${v}`).then(setInforme).catch(() => undefined); }, [params]);
  const validar = async () => {
    if (!archivo) return;
    setCargando(true); setError("");
    const fd = new FormData(); fd.append("archivo", archivo);
    try { setInforme(await api("/api/calidad/validar", { formulario: fd })); recargar(); }
    catch (e) { setError((e as ErrorApi).message); }
    finally { setCargando(false); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Validador de calidad de datos" subtitulo="Crítica automática de bases antes de procesarlas o publicarlas: completitud, valores extremos, duplicados, códigos 98/99, pocos casos y datos personales. Flujo de crítica e inconsistencias de la DESA, con herramientas libres." />
      <Tarjeta titulo="Validar un archivo" ayuda="CSV o XLSX hasta 10 MB. Se procesa en memoria y no se guarda: solo queda el informe con ejemplos enmascarados.">
        <div className="fila">
          <input type="file" accept=".csv,.xlsx" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} aria-label="Archivo" />
          <button className="boton" onClick={validar} disabled={!archivo || cargando}><Upload /> {cargando ? "Validando…" : "Validar"}</button>
        </div>
        {error && <div style={{ marginTop: 10 }}><Aviso tono="critico">{error}</Aviso></div>}
      </Tarjeta>
      {informe ? <Informe r={informe} /> : null}
      <Tarjeta titulo="Validaciones recientes">
        {!historial ? <Esqueleto /> : <Tabla filas={historial} onFila={(v: any) => api(`/api/calidad/validaciones/${v.id}`).then(setInforme)} vacio="Aún no hay validaciones." columnas={[
          { id: "a", titulo: "Archivo", valor: (v: any) => v.archivo },
          { id: "f", titulo: "Filas", num: true, valor: (v: any) => v.filas, celda: (v: any) => fmt.numero(v.filas) },
          { id: "p", titulo: "Puntaje", num: true, valor: (v: any) => v.puntaje },
          { id: "b", titulo: "Datos personales", valor: (v: any) => v.bloqueante, celda: (v: any) => (v.bloqueante ? <Insignia tono="critico">Sí</Insignia> : <Insignia tono="exito">No</Insignia>) },
          { id: "c", titulo: "Fecha", valor: (v: any) => v.creada_en, celda: (v: any) => fmt.fechaHora(v.creada_en) },
        ]} />}
      </Tarjeta>
    </div>
  );
}
