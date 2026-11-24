// Privacidad: aviso, registro de tratamientos, políticas de retención, «Mis datos» y solicitudes de titulares.
import { useState } from "react";
import { Download, Play, Trash2 } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, Insignia, Kpi, Modal, Pestanas, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";

function MisDatos() {
  const { datos } = useDatos<any>("/api/privacidad/mis-datos");
  const [solicitud, setSolicitud] = useState<"eliminar" | "rectificar" | null>(null);
  const [detalle, setDetalle] = useState("");
  if (!datos) return <Esqueleto alto={300} />;
  const p = datos.perfil;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <div className="rejilla">
        <div className="c4"><Kpi etiqueta="Tu cuenta" valor={<span style={{ fontSize: "1.1rem" }}>{p.nombre}</span>} detalle={`${p.email} · ${p.roles.join(", ")}`} /></div>
        <div className="c4"><Kpi tono="verde" etiqueta="Consentimiento" valor={<span style={{ fontSize: "1.1rem" }}>Versión {p.consentimiento.version ?? "—"}</span>} detalle={`Aceptado ${fmt.fecha(p.consentimiento.fecha)}`} /></div>
        <div className="c4"><Kpi tono="morado" etiqueta="Lo que guardamos de ti" valor={fmt.numero(datos.actividad.length)} detalle={`eventos recientes · ${datos.sesiones_activas} sesiones · ${datos.tableros_propios} tableros · ${datos.automatizaciones} automatizaciones`} /></div>
      </div>
      <div className="fila">
        <a className="boton" href="/api/privacidad/mis-datos/exportar"><Download /> Descargar mis datos (JSON)</a>
        <button className="boton secundario" onClick={() => setSolicitud("rectificar")}>Pedir rectificación</button>
        <button className="boton fantasma" onClick={() => setSolicitud("eliminar")}><Trash2 /> Pedir eliminación de mi cuenta</button>
      </div>
      {datos.solicitudes.length > 0 && <Tarjeta titulo="Mis solicitudes"><Tabla filas={datos.solicitudes} columnas={[
        { id: "t", titulo: "Tipo", valor: (s: any) => s.tipo }, { id: "e", titulo: "Estado", valor: (s: any) => s.estado, celda: (s: any) => <Severidad valor={s.estado} /> },
        { id: "f", titulo: "Fecha", valor: (s: any) => s.creada_en, celda: (s: any) => fmt.fecha(s.creada_en) }, { id: "r", titulo: "Respuesta", valor: (s: any) => s.respuesta },
      ]} /></Tarjeta>}
      <Tarjeta titulo="Tu actividad registrada" ayuda="Lo que la bitácora guarda de tus acciones (últimos 200 eventos).">
        <Tabla maximo={60} filas={datos.actividad} columnas={[
          { id: "f", titulo: "Fecha", valor: (a: any) => a.ts, celda: (a: any) => fmt.fechaHora(a.ts) },
          { id: "a", titulo: "Acción", valor: (a: any) => a.accion, celda: (a: any) => <span className="mono">{a.accion}</span> },
          { id: "m", titulo: "Módulo", valor: (a: any) => a.modulo },
          { id: "r", titulo: "Resultado", valor: (a: any) => a.resultado, celda: (a: any) => <Severidad valor={a.resultado} /> },
        ]} />
      </Tarjeta>
      {solicitud && (
        <Modal titulo={solicitud === "eliminar" ? "Pedir la eliminación de tu cuenta" : "Pedir rectificación de tus datos"} onCerrar={() => setSolicitud(null)}>
          <div className="columna">
            {solicitud === "eliminar" && <Aviso tono="alerta">Se borrarán tus datos personales. La bitácora conserva solo tu identificador numérico por rendición de cuentas.</Aviso>}
            <Campo etiqueta="Detalle"><textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} /></Campo>
            <button className="boton" onClick={async () => { await api("/api/privacidad/solicitudes", { cuerpo: { tipo: solicitud, detalle } }); avisar("Solicitud enviada al responsable de privacidad."); setSolicitud(null); }}>Enviar solicitud</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Politicas() {
  const { puede } = useSesion();
  const { datos, recargar } = useDatos<any[]>("/api/privacidad/politicas");
  const [editar, setEditar] = useState<any>(null);
  if (!datos) return <Esqueleto />;
  return (
    <Tarjeta titulo="Políticas de retención" ayuda="Una automatización diaria elimina o anonimiza lo que ya no se necesita. La bitácora se conserva."
      acciones={puede("privacidad:administrar") && <button className="boton secundario pequeno" onClick={async () => { await api("/api/privacidad/aplicar", { metodo: "POST" }); avisar("Políticas aplicadas."); recargar(); }}><Play /> Aplicar ahora</button>}>
      <Tabla filas={datos} onFila={puede("privacidad:administrar") ? setEditar : undefined} columnas={[
        { id: "n", titulo: "Datos", valor: (p: any) => p.nombre, celda: (p: any) => <span><b>{p.nombre}</b><br /><span className="pequeno suave">{p.descripcion}</span></span> },
        { id: "d", titulo: "Plazo", num: true, valor: (p: any) => p.dias, celda: (p: any) => `${fmt.numero(p.dias)} días` },
        { id: "a", titulo: "Acción", valor: (p: any) => p.accion, celda: (p: any) => <Insignia tono={p.accion === "conservar" ? "info" : p.accion === "anonimizar" ? "morado" : "alerta"}>{p.accion}</Insignia> },
        { id: "f", titulo: "Fundamento", valor: (p: any) => p.fundamento, celda: (p: any) => <span className="pequeno">{p.fundamento}</span> },
        { id: "u", titulo: "Última aplicación", valor: (p: any) => p.ultima_ejecucion, celda: (p: any) => <span className="pequeno">{fmt.relativo(p.ultima_ejecucion)}<br /><span className="suave">{p.ultimo_resultado}</span></span> },
      ]} />
      {editar && <EditarPolitica p={editar} onCerrar={() => { setEditar(null); recargar(); }} />}
    </Tarjeta>
  );
}

function EditarPolitica({ p, onCerrar }: { p: any; onCerrar: () => void }) {
  const [dias, setDias] = useState(p.dias);
  const [activa, setActiva] = useState(p.activa);
  const [justificacion, setJustificacion] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal titulo={p.nombre} onCerrar={onCerrar}>
      <div className="columna">
        {error && <Aviso tono="critico">{error}</Aviso>}
        <Campo etiqueta="Días de conservación"><input type="number" min={1} value={dias} onChange={(e) => setDias(Number(e.target.value))} /></Campo>
        <label className="casilla"><input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Política activa</label>
        <Campo etiqueta="Justificación del cambio (queda en la bitácora)"><textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} /></Campo>
        <button className="boton" onClick={async () => { try { await api(`/api/privacidad/politicas/${p.id}`, { metodo: "PUT", cuerpo: { dias, activa, justificacion } }); onCerrar(); } catch (e) { setError((e as Error).message); } }}>Guardar</button>
      </div>
    </Modal>
  );
}

function Solicitudes() {
  const { datos, recargar } = useDatos<any[]>("/api/privacidad/solicitudes");
  if (!datos) return <Esqueleto />;
  return (
    <Tarjeta titulo="Solicitudes de los titulares" ayuda="La LAIP da 10 días hábiles para dar acceso a los datos propios.">
      <Tabla filas={datos} vacio="Sin solicitudes." columnas={[
        { id: "u", titulo: "Persona", valor: (s: any) => s.usuario }, { id: "t", titulo: "Tipo", valor: (s: any) => s.tipo },
        { id: "d", titulo: "Detalle", valor: (s: any) => s.detalle }, { id: "e", titulo: "Estado", valor: (s: any) => s.estado, celda: (s: any) => <Severidad valor={s.estado} /> },
        { id: "a", titulo: "", celda: (s: any) => s.estado === "pendiente" && (
          <div className="fila" style={{ gap: 4 }}>
            <button className="boton pequeno" onClick={async () => { await api(`/api/privacidad/solicitudes/${s.id}/resolver`, { cuerpo: { aprobar: true, respuesta: "Atendida según lo solicitado." } }); recargar(); }}>Atender</button>
            <button className="boton secundario pequeno" onClick={async () => { await api(`/api/privacidad/solicitudes/${s.id}/resolver`, { cuerpo: { aprobar: false, respuesta: "No procede; contáctanos para más detalle." } }); recargar(); }}>Rechazar</button>
          </div>
        ) },
      ]} />
    </Tarjeta>
  );
}

export default function Privacidad() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<"mis" | "aviso" | "politicas" | "solicitudes">("mis");
  const { datos: aviso } = useDatos<any>("/api/privacidad/aviso");
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Privacidad y mis datos" subtitulo="Transparencia sobre qué datos personales trata Nexo, para qué, por cuánto tiempo y cómo ejercer tus derechos. Los datos estadísticos se protegen con el secreto estadístico." />
      <Pestanas opciones={[{ id: "mis", etiqueta: "Mis datos" }, { id: "aviso", etiqueta: "Aviso y tratamientos" }, { id: "politicas", etiqueta: "Retención" },
        ...(puede("privacidad:administrar") ? [{ id: "solicitudes" as const, etiqueta: "Solicitudes" }] : [])]} activa={pestana} onCambio={setPestana} />
      {pestana === "mis" && <MisDatos />}
      {pestana === "aviso" && (!aviso ? <Esqueleto /> : (
        <div className="rejilla">
          <div className="c5"><Tarjeta titulo={`Aviso de privacidad · versión ${aviso.aviso.version}`}>
            <div className="columna pequeno">
              <p><b>Responsable:</b> {aviso.aviso.responsable}</p><p><b>Finalidad:</b> {aviso.aviso.finalidad}</p>
              <p><b>Datos:</b> {aviso.aviso.datos.join(", ")}.</p><p><b>No recopilamos:</b> {aviso.aviso.no_recopilamos.join(", ")}.</p>
              <p><b>Cookies:</b> {aviso.aviso.cookies}</p><p><b>Derechos:</b> {aviso.aviso.derechos}</p>
              <p><b>Marco:</b> {aviso.aviso.marco.join(" · ")}</p>
            </div>
          </Tarjeta></div>
          <div className="c7"><Tarjeta titulo="Registro de actividades de tratamiento">
            <Tabla filas={aviso.tratamientos} columnas={[
              { id: "a", titulo: "Actividad", valor: (t: any) => t.actividad }, { id: "d", titulo: "Datos", valor: (t: any) => t.datos },
              { id: "f", titulo: "Finalidad y base", valor: (t: any) => t.finalidad, celda: (t: any) => <span className="pequeno">{t.finalidad}<br /><span className="suave">{t.base}</span></span> },
              { id: "c", titulo: "Conservación", valor: (t: any) => t.conservacion, celda: (t: any) => <span className="pequeno">{t.conservacion}</span> },
            ]} />
          </Tarjeta></div>
        </div>
      ))}
      {pestana === "politicas" && <Politicas />}
      {pestana === "solicitudes" && <Solicitudes />}
    </div>
  );
}
