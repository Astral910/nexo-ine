// Centro de ciberseguridad: agente de postura, hallazgos, riesgos, incidentes, eventos y controles.
import { useState } from "react";
import { Play, Plus } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica } from "../componentes/Grafica";
import { MatrizRiesgos } from "../componentes/Widget";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, Kpi, Medidor, Modal, Pestanas, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";

export function Hallazgos({ agente }: { agente: "seguridad" | "ti" }) {
  const { puede } = useSesion();
  const { datos, recargar } = useDatos<any[]>(`/api/seguridad/hallazgos?agente=${agente}`);
  const [decidir, setDecidir] = useState<any>(null);
  const [justificacion, setJustificacion] = useState("");
  if (!datos) return <Esqueleto />;
  return (
    <>
      <Tabla filas={datos} vacio="El agente no encontró problemas." onFila={puede("seguridad:gestionar") ? setDecidir : undefined} columnas={[
        { id: "s", titulo: "Severidad", valor: (h: any) => h.severidad, celda: (h: any) => <Severidad valor={h.severidad} /> },
        { id: "t", titulo: "Hallazgo", valor: (h: any) => h.titulo, celda: (h: any) => <span><b>{h.titulo}</b><br /><span className="pequeno suave">{h.detalle}</span></span> },
        { id: "r", titulo: "Qué hacer", valor: (h: any) => h.recomendacion, celda: (h: any) => <span className="pequeno">{h.recomendacion}<br /><span className="suave">{h.referencias}</span></span> },
        { id: "e", titulo: "Estado", valor: (h: any) => h.estado, celda: (h: any) => <Severidad valor={h.estado} /> },
        { id: "u", titulo: "Visto", valor: (h: any) => h.ultima_vez, celda: (h: any) => fmt.relativo(h.ultima_vez) },
      ]} />
      {decidir && (
        <Modal titulo={decidir.titulo} onCerrar={() => setDecidir(null)}>
          <p className="pequeno">{decidir.detalle}</p>
          <Campo etiqueta="Justificación (queda en la bitácora)"><textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} /></Campo>
          <div className="fila" style={{ marginTop: 10 }}>
            {["aceptado", "resuelto", "abierto"].map((estado) => (
              <button key={estado} className={`boton ${estado === "aceptado" ? "secundario" : ""}`} onClick={async () => {
                try { await api(`/api/seguridad/hallazgos/${decidir.id}`, { metodo: "PATCH", cuerpo: { estado, justificacion } }); avisar("Decisión registrada."); setDecidir(null); setJustificacion(""); recargar(); }
                catch (e) { avisar((e as Error).message, "critico"); }
              }}>{estado === "aceptado" ? "Aceptar el riesgo" : estado === "resuelto" ? "Marcar resuelto" : "Reabrir"}</button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function Incidentes() {
  const { puede } = useSesion();
  const { datos, recargar } = useDatos<any[]>("/api/seguridad/incidentes");
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ titulo: "", descripcion: "", severidad: "media" });
  const [nota, setNota] = useState<{ id: number; estado: string; nota: string } | null>(null);
  return (
    <Tarjeta titulo="Incidentes" ayuda="Registro y seguimiento con cronología. La Ley Marco de Ciberseguridad (Decreto 26-2026) establece plazos de reporte de incidentes." acciones={puede("seguridad:gestionar") && <button className="boton secundario pequeno" onClick={() => setNuevo(true)}><Plus /> Registrar incidente</button>}>
      {!datos ? <Esqueleto /> : <Tabla filas={datos} vacio="Sin incidentes registrados." onFila={puede("seguridad:gestionar") ? (i: any) => setNota({ id: i.id, estado: i.estado, nota: "" }) : undefined} columnas={[
        { id: "c", titulo: "Código", valor: (i: any) => i.codigo },
        { id: "t", titulo: "Incidente", valor: (i: any) => i.titulo, celda: (i: any) => <span><b>{i.titulo}</b><br /><span className="pequeno suave">{i.cronologia.at(-1)?.nota}</span></span> },
        { id: "s", titulo: "Severidad", valor: (i: any) => i.severidad, celda: (i: any) => <Severidad valor={i.severidad} /> },
        { id: "e", titulo: "Estado", valor: (i: any) => i.estado, celda: (i: any) => <Severidad valor={i.estado} /> },
        { id: "f", titulo: "Registrado", valor: (i: any) => i.creado_en, celda: (i: any) => fmt.fechaHora(i.creado_en) },
      ]} />}
      {nuevo && (
        <Modal titulo="Registrar incidente" onCerrar={() => setNuevo(false)}>
          <div className="columna">
            <Campo etiqueta="Título"><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
            <Campo etiqueta="Descripción"><textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo>
            <Campo etiqueta="Severidad"><select value={f.severidad} onChange={(e) => setF({ ...f, severidad: e.target.value })}><option value="critica">Crítica</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></Campo>
            <button className="boton" onClick={async () => { await api("/api/seguridad/incidentes", { cuerpo: f }); setNuevo(false); recargar(); avisar("Incidente registrado."); }}>Registrar</button>
          </div>
        </Modal>
      )}
      {nota && (
        <Modal titulo="Actualizar incidente" onCerrar={() => setNota(null)}>
          <div className="columna">
            <Campo etiqueta="Estado"><select value={nota.estado} onChange={(e) => setNota({ ...nota, estado: e.target.value })}><option value="abierto">Abierto</option><option value="contenido">Contenido</option><option value="resuelto">Resuelto</option><option value="cerrado">Cerrado</option></select></Campo>
            <Campo etiqueta="Nota para la cronología"><textarea value={nota.nota} onChange={(e) => setNota({ ...nota, nota: e.target.value })} /></Campo>
            <button className="boton" onClick={async () => { await api(`/api/seguridad/incidentes/${nota.id}`, { metodo: "PATCH", cuerpo: { estado: nota.estado, nota: nota.nota } }); setNota(null); recargar(); }}>Guardar</button>
          </div>
        </Modal>
      )}
    </Tarjeta>
  );
}

export default function Seguridad() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<"postura" | "riesgos" | "incidentes" | "controles">("postura");
  const { datos: p, recargar } = useDatos<any>("/api/seguridad/postura");
  const { datos: riesgos } = useDatos<any[]>("/api/seguridad/riesgos");
  const { datos: eventos } = useDatos<any>("/api/seguridad/eventos?horas=72");
  const { datos: controles } = useDatos<any[]>(pestana === "controles" ? "/api/seguridad/controles" : null);
  const [revisando, setRevisando] = useState(false);
  const revisar = async () => {
    setRevisando(true);
    try { const r: any = await api("/api/seguridad/revisar", { metodo: "POST" }); avisar(`Revisión completa: ${r.puntaje}/100, ${r.nuevos} hallazgos nuevos.`); recargar(); }
    finally { setRevisando(false); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Centro de ciberseguridad" subtitulo="Un agente automático revisa la plataforma cada 30 minutos con reglas verificables, alineadas con ISO/IEC 27001:2022, NIST CSF 2.0 y OWASP, y con el marco de Guatemala sobre secreto estadístico, acceso a la información y ciberseguridad."
        acciones={puede("seguridad:gestionar") && <button className="boton" onClick={revisar} disabled={revisando}><Play /> {revisando ? "Revisando…" : "Revisar ahora"}</button>} />
      <Pestanas opciones={[{ id: "postura", etiqueta: "Postura y hallazgos" }, { id: "riesgos", etiqueta: "Registro de riesgos" }, { id: "incidentes", etiqueta: "Incidentes" }, { id: "controles", etiqueta: "Controles implementados" }]} activa={pestana} onCambio={setPestana} />
      {pestana === "postura" && (!p ? <Esqueleto alto={300} /> : (
        <>
          <div className="rejilla">
            <div className="c3 tarjeta" style={{ display: "grid", placeItems: "center" }}><Medidor valor={p.puntaje} etiqueta="Postura" /></div>
            <div className="c3"><Kpi etiqueta="Cuentas con segundo factor" valor={fmt.pct(p.mfa_pct)} detalle={`Privilegiadas con MFA: ${p.privilegiados_con_mfa} de ${p.privilegiados}`} /></div>
            <div className="c3"><Kpi tono="naranja" etiqueta="Intentos fallidos en 24 h" valor={fmt.numero(p.intentos_fallidos_24h)} detalle={`${p.cuentas_bloqueadas} cuentas bloqueadas ahora`} /></div>
            <div className="c3"><Kpi tono="morado" etiqueta="Sesiones activas" valor={fmt.numero(p.sesiones_activas)} detalle={`${p.incidentes_abiertos} incidentes abiertos · ${p.riesgos_altos} riesgos altos`} /></div>
          </div>
          {eventos && (
            <Tarjeta titulo="Inicios de sesión en las últimas 72 horas">
              <Grafica clase="grafica baja" opcion={{
                tooltip: { trigger: "axis" }, legend: { top: 0 },
                xAxis: { type: "category", data: eventos.por_hora.map((h: any) => h.hora.slice(5)) }, yAxis: { type: "value" },
                series: [{ name: "Exitosos", type: "bar", stack: "t", data: eventos.por_hora.map((h: any) => h.exitosos), itemStyle: { color: "#0080FF" } },
                  { name: "Fallidos", type: "bar", stack: "t", data: eventos.por_hora.map((h: any) => h.fallidos), itemStyle: { color: "#FF5500" } }],
              }} />
            </Tarjeta>
          )}
          <Tarjeta titulo="Hallazgos del agente de ciberseguridad"><Hallazgos agente="seguridad" /></Tarjeta>
        </>
      ))}
      {pestana === "riesgos" && (!riesgos ? <Esqueleto /> : (
        <div className="rejilla">
          <div className="c4"><Tarjeta titulo="Mapa de calor"><MatrizRiesgos riesgos={riesgos} /></Tarjeta></div>
          <div className="c8"><Tarjeta titulo={`${riesgos.length} riesgos`} ayuda="Probabilidad × impacto (1 a 5). Referencias a ISO/IEC 27001:2022 y NIST CSF 2.0.">
            <Tabla filas={riesgos} columnas={[
              { id: "c", titulo: "Código", valor: (r: any) => r.codigo },
              { id: "t", titulo: "Riesgo", valor: (r: any) => r.titulo, celda: (r: any) => <span><b>{r.titulo}</b><br /><span className="pequeno suave">{r.controles}</span></span> },
              { id: "p", titulo: "P×I", num: true, valor: (r: any) => r.puntaje, celda: (r: any) => <Severidad valor={r.puntaje >= 15 ? "alta" : r.puntaje >= 8 ? "media" : "baja"} /> },
              { id: "d", titulo: "Dueño", valor: (r: any) => r.dueno },
              { id: "r", titulo: "Referencias", valor: (r: any) => r.referencias, celda: (r: any) => <span className="pequeno">{r.referencias}</span> },
            ]} />
          </Tarjeta></div>
        </div>
      ))}
      {pestana === "incidentes" && <Incidentes />}
      {pestana === "controles" && (!controles ? <Esqueleto /> : (
        <Tarjeta titulo={`${controles.length} controles con evidencia en el código`} ayuda="Para revisión del jurado y de Informática: cada control indica el archivo donde se implementa.">
          <Aviso tono="info">Marco aplicable: Decreto-Ley 3-85, Ley Orgánica del INE (art. 25: confidencialidad de los datos estadísticos); Decreto 57-2008, Ley de Acceso a la Información Pública (datos personales e información confidencial); Decreto 26-2026, Ley Marco de Ciberseguridad; normas de control interno de la Contraloría General de Cuentas; Principios Fundamentales de las Estadísticas Oficiales de la ONU.</Aviso>
          <div style={{ height: 10 }} />
          <Tabla filas={controles} columnas={[
            { id: "c", titulo: "Control", valor: (c: any) => c.control },
            { id: "e", titulo: "Evidencia", valor: (c: any) => c.evidencia, celda: (c: any) => <span className="mono">{c.evidencia}</span> },
            { id: "r", titulo: "Referencias", valor: (c: any) => c.referencias, celda: (c: any) => <span className="pequeno">{c.referencias}</span> },
          ]} />
        </Tarjeta>
      ))}
    </div>
  );
}
