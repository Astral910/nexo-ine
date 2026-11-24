// Salud de TI: métricas del sistema, agente de TI e inventario de componentes de terceros con su licencia.
import { useState } from "react";
import { Play } from "lucide-react";
import { api, fmt } from "../api";
import { Aviso, avisar, Encabezado, Esqueleto, Kpi, Medidor, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { Hallazgos } from "./Seguridad";

export default function Ti() {
  const { datos, recargar } = useDatos<any>("/api/ti/salud");
  const { datos: comp } = useDatos<any>("/api/ti/componentes");
  const [revisando, setRevisando] = useState(false);
  const m = datos?.metricas;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Salud de TI" subtitulo="El agente de TI revisa latencia, frescura de los datos, automatizaciones fallidas o atrasadas, espacio en disco y respaldos. Es deliberadamente exigente: reporta lo que Informática querría saber antes que nadie."
        acciones={<button className="boton" disabled={revisando} onClick={async () => { setRevisando(true); try { const r: any = await api("/api/ti/revisar", { metodo: "POST" }); avisar(`Salud de TI: ${r.puntaje}/100.`); recargar(); } finally { setRevisando(false); } }}><Play /> {revisando ? "Revisando…" : "Revisar ahora"}</button>} />
      {!m ? <Esqueleto alto={200} /> : (
        <div className="rejilla">
          <div className="c3 tarjeta" style={{ display: "grid", placeItems: "center" }}><Medidor valor={datos.puntaje} etiqueta="Salud TI" /></div>
          <div className="c3"><Kpi etiqueta="Latencia de la base de datos" valor={`${m.latencia_bd_ms} ms`} detalle={`Motor: ${m.motor_bd}${m.tamano_bd_bytes ? ` · ${fmt.numero(m.tamano_bd_bytes / 1048576, 0)} MB` : ""}`} /></div>
          <div className="c3"><Kpi tono={m.programador_activo ? "verde" : "naranja"} etiqueta="Motor de automatizaciones" valor={m.programador_activo ? "Activo" : "Detenido"} detalle={`Python ${m.python} · ${m.sistema}`} /></div>
          <div className="c3"><Kpi tono="morado" etiqueta="Disco libre" valor={fmt.pct(m.disco_libre_pct)} detalle={`Medido ${fmt.relativo(m.medido_en)}`} /></div>
        </div>
      )}
      <Tarjeta titulo="Hallazgos del agente de TI"><Hallazgos agente="ti" /></Tarjeta>
      <Tarjeta titulo="Componentes de terceros y sus licencias" ayuda="Inventario generado desde las dependencias fijadas (requirements.txt con hash y package-lock.json). Todos son de código abierto.">
        {!comp ? <Esqueleto /> : (
          <div className="rejilla">
            <div className="c6"><h3 style={{ marginBottom: 8 }}>Backend (Python)</h3><Tabla filas={comp.python} columnas={[
              { id: "n", titulo: "Paquete", valor: (c: any) => c.nombre }, { id: "v", titulo: "Versión", valor: (c: any) => c.version }, { id: "l", titulo: "Licencia", valor: (c: any) => c.licencia },
            ]} /></div>
            <div className="c6"><h3 style={{ marginBottom: 8 }}>Frontend (JavaScript)</h3><Tabla filas={comp.javascript} columnas={[
              { id: "n", titulo: "Paquete", valor: (c: any) => c.nombre }, { id: "v", titulo: "Versión", valor: (c: any) => c.version }, { id: "l", titulo: "Licencia", valor: (c: any) => c.licencia },
            ]} vacio="Compile el frontend para ver su inventario." /></div>
          </div>
        )}
        <div style={{ marginTop: 10 }}><Aviso tono="info">Sin servicios de pago ni en la nube: Nexo funciona en un servidor del INE con software libre.</Aviso></div>
      </Tarjeta>
    </div>
  );
}
