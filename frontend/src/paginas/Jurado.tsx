// Modo Jurado: la rúbrica oficial con evidencia en vivo, el cumplimiento de los lineamientos y un recorrido guiado.
import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck, CircleX } from "lucide-react";
import { fmt } from "../api";
import { Encabezado, Esqueleto, Insignia, Kpi, Tarjeta, useDatos } from "../componentes/ui";

const RECORRIDO = [
  ["Centro de mando", "Súper resumen de toda la plataforma y espacio de trabajo por rol.", "/"],
  ["Precios de Referencia", "Abre una solicitud, investiga el mercado en un clic y genera el informe técnico.", "/precios"],
  ["Tablero generativo", "Escribe «IPC de Quetzaltenango» o «precio de cemento gris por mes en 2025».", "/tableros?q=IPC%20de%20Quetzaltenango"],
  ["Alertas de precios", "Hidiroglou-Berthelot sobre los precios recolectados del IPC.", "/indices/alertas?periodo=2022-07"],
  ["Territorio", "El país dibujado con 20 mil lugares poblados y fichas municipales.", "/territorio"],
  ["Validador", "Sube un CSV y mira cómo detecta datos personales y códigos 98/99.", "/calidad"],
  ["Ciberseguridad", "Agente, riesgos, incidentes y 22 controles con su evidencia en el código.", "/seguridad"],
  ["Bitácora", "Verifica la integridad de la cadena HMAC.", "/bitacora"],
];

export default function Jurado() {
  const { datos } = useDatos<any>("/api/jurado/evidencia");
  if (!datos) return <Esqueleto alto={400} />;
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado titulo="Modo Jurado" subtitulo="Cómo Nexo responde a cada criterio de la rúbrica del Datatón INE 2026 (Categoría 2), con evidencia que se calcula en vivo desde la plataforma." />
      <div className="rejilla">
        <div className="c3"><Kpi etiqueta="Fuentes analíticas" valor={datos.cifras.fuentes_semanticas} detalle="en la capa semántica" /></div>
        <div className="c3"><Kpi tono="verde" etiqueta="Postura de seguridad" valor={`${datos.cifras.puntaje_seguridad}/100`} detalle={`Salud de TI ${datos.cifras.puntaje_ti}/100`} /></div>
        <div className="c3"><Kpi tono="morado" etiqueta="Riesgos gestionados" valor={datos.cifras.riesgos} detalle="con referencias ISO y NIST" /></div>
        <div className="c3"><Kpi tono="naranja" etiqueta="Eventos en la bitácora" valor={fmt.numero(datos.cifras.eventos_bitacora)} detalle="encadenados con HMAC" /></div>
      </div>
      <div className="rejilla">
        {datos.criterios.map((c: any) => (
          <div key={c.criterio} className="c6 tarjeta">
            <div className="fila espaciado"><h2>{c.criterio}</h2><Insignia tono="info">{c.peso} %</Insignia></div>
            <ul style={{ paddingLeft: 18 }}>{c.evidencia.map((e: string, i: number) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}</ul>
            <div className="fila">{c.rutas.map((r: string) => <Link key={r} className="chip" to={r}>Ver {r} <ArrowRight size={13} /></Link>)}</div>
          </div>
        ))}
      </div>
      <div className="rejilla">
        <div className="c6">
          <Tarjeta titulo="Cumplimiento de los lineamientos de la Categoría 2">
            <ul className="actividad">
              {datos.cumplimiento.map((r: any) => (
                <li key={r.regla}>{r.cumple ? <CircleCheck color="#2f8f2f" size={18} /> : <CircleX color="#b42318" size={18} />}<span>{r.regla} {r.ruta && <Link to={r.ruta} className="pequeno">ver</Link>}</span></li>
              ))}
            </ul>
          </Tarjeta>
        </div>
        <div className="c6">
          <Tarjeta titulo="Recorrido sugerido (7 minutos)">
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              {RECORRIDO.map(([t, d, r]) => <li key={t} style={{ marginBottom: 8 }}><Link to={r}><b>{t}</b></Link><br /><span className="pequeno suave">{d}</span></li>)}
            </ol>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
