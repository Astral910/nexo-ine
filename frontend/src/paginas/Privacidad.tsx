// Privacidad: aviso, registro de tratamientos, políticas de retención, «Mis datos» y solicitudes de titulares.
// Vista Resumen: lo que Nexo sabe de usted en palabras sencillas, sus tres acciones y lo que Nexo promete.
import { useState } from "react";
import { Download, MonitorSmartphone, Play, ScrollText, Trash2, UserRoundCheck } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, EsqueletoKpis, EsqueletoTabla, Insignia, Kpi, Modal, Pestanas, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "Qué datos personales trata Nexo, para qué, por cuánto tiempo y cómo ejercer sus derechos: ver, descargar, corregir o pedir que se borren sus datos.",
  datos: "Su propia cuenta y la bitácora de sus acciones. El aviso de privacidad y el registro de actividades de tratamiento describen cada uso de datos personales y su plazo de conservación. Los datos estadísticos se protegen aparte, con el secreto estadístico.",
  pasos: [
    "Revise lo que Nexo guarda de usted.",
    "Descargue sus datos en un archivo cuando quiera.",
    "Si algo está mal, pida una rectificación; si ya no usará Nexo, pida la eliminación de su cuenta.",
    "Consulte en «Retención» cuánto tiempo se guarda cada tipo de dato.",
  ],
  resumen: "Lo que Nexo sabe de usted, sus tres acciones y lo que Nexo promete no recopilar.",
  completa: "Su actividad registrada, el aviso completo, el registro de tratamientos, las políticas de retención y, para el responsable, las solicitudes de los titulares.",
  terminos: [
    ["Dato personal", "Cualquier dato que identifica a una persona, como su nombre o su correo."],
    ["Retención", "Tiempo máximo que se conserva un dato antes de borrarlo o anonimizarlo."],
    ["Anonimizar", "Quitar lo que identifica a una persona y dejar solo datos que no la señalan."],
    ["Titular", "La persona a quien se refieren los datos; en «Mis datos», usted."],
    ["LAIP", "Ley de Acceso a la Información Pública (Decreto 57-2008). Protege los datos personales y fija plazos para responder solicitudes."],
    ["Cookie de sesión", "Pequeño archivo que mantiene su sesión abierta. Nexo usa solo las estrictamente necesarias."],
    ["CSRF", "Protección contra páginas maliciosas que intentan actuar en su nombre sin que usted lo sepa."],
  ],
};

/** Une una lista en español: «a, b y c». */
function unir(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
const minuscula = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

function ModalSolicitud({ tipo, onCerrar }: { tipo: "eliminar" | "rectificar"; onCerrar: () => void }) {
  const [detalle, setDetalle] = useState("");
  return (
    <Modal titulo={tipo === "eliminar" ? "Pedir la eliminación de su cuenta" : "Pedir rectificación de sus datos"} onCerrar={onCerrar}>
      <div className="columna">
        {tipo === "eliminar" && <Aviso tono="alerta">Se borrarán sus datos personales. La bitácora conserva solo su identificador numérico por rendición de cuentas.</Aviso>}
        <Campo etiqueta="Detalle"><textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} /></Campo>
        <button className="boton" onClick={async () => { await api("/api/privacidad/solicitudes", { cuerpo: { tipo, detalle } }); avisar("Solicitud enviada al responsable de privacidad."); onCerrar(); }}>Enviar solicitud</button>
      </div>
    </Modal>
  );
}

function AccionesDatos({ onSolicitud }: { onSolicitud: (t: "eliminar" | "rectificar") => void }) {
  return (
    <div className="fila">
      <a className="boton" href="/api/privacidad/mis-datos/exportar"><Download /> Descargar mis datos (JSON)</a>
      <button className="boton secundario" onClick={() => onSolicitud("rectificar")}>Pedir rectificación</button>
      <button className="boton fantasma" onClick={() => onSolicitud("eliminar")}><Trash2 /> Pedir eliminación de mi cuenta</button>
    </div>
  );
}

function ResumenPrivacidad({ aviso }: { aviso: any }) {
  const { datos } = useDatos<any>("/api/privacidad/mis-datos");
  const [solicitud, setSolicitud] = useState<"eliminar" | "rectificar" | null>(null);
  const a = aviso?.aviso;
  if (!datos) return <><Esqueleto alto={90} /><EsqueletoKpis n={3} /><div className="tarjeta"><EsqueletoTabla filas={4} /></div></>;
  const p = datos.perfil;
  return (
    <>
      <EnPocasPalabras titulo="Lo que Nexo sabe de usted">
        {a ? <>Nexo guarda solo lo necesario para darle acceso y para auditar lo que se hace: {unir(a.datos.map(minuscula))}. No recopila {unir(a.no_recopilamos.map(minuscula))}.</>
          : "Nexo guarda solo lo necesario para darle acceso y para auditar lo que se hace en la plataforma."}
      </EnPocasPalabras>
      <div className="rejilla">
        <div className="c5">
          <Tarjeta titulo="Su cuenta" ayuda="Así aparece usted en Nexo.">
            <dl className="datos-cuenta">
              <dt>Nombre</dt><dd>{p.nombre}</dd>
              <dt>Correo</dt><dd>{p.email}</dd>
              <dt>Unidad</dt><dd>{p.unidad || "—"}</dd>
              <dt>Roles</dt><dd>{p.roles.join(", ") || "—"}</dd>
              <dt>Cuenta creada</dt><dd>{fmt.fecha(p.creado_en)}</dd>
              <dt>Consentimiento</dt><dd>{p.consentimiento.version ? `Versión ${p.consentimiento.version}, aceptado el ${fmt.fecha(p.consentimiento.fecha)}` : "—"}</dd>
            </dl>
          </Tarjeta>
        </div>
        <div className="c7">
          <div className="rejilla escalonada">
            <div className="c6"><CifraClara etiqueta="Acciones suyas registradas" icono={<ScrollText />} numero={datos.actividad.length} formato={(v) => fmt.numero(v)}
              detalle="Se muestran hasta 200, las más recientes"
              significa="La bitácora guarda lo que usted hace en Nexo, por rendición de cuentas. El plazo está en «Retención»." /></div>
            <div className="c6"><CifraClara tono="morado" etiqueta="Sesiones abiertas" icono={<MonitorSmartphone />} numero={datos.sesiones_activas} formato={(v) => fmt.numero(v)}
              significa="Equipos donde su sesión sigue activa. Puede cerrarlas desde «Mi perfil»." ir={{ texto: "Ir a Mi perfil", ruta: "/perfil" }} /></div>
            <div className="c12"><CifraClara tono="verde" etiqueta="Lo que usted creó" icono={<UserRoundCheck />}
              valor={`${fmt.numero(datos.tableros_propios)} tablero${datos.tableros_propios === 1 ? "" : "s"} · ${fmt.numero(datos.automatizaciones)} automatizaci${datos.automatizaciones === 1 ? "ón" : "ones"} · ${fmt.numero(datos.validaciones)} validaci${datos.validaciones === 1 ? "ón" : "ones"}`}
              significa="Todo se incluye cuando descarga sus datos." /></div>
          </div>
        </div>
      </div>
      <Tarjeta titulo="Sus derechos, en un clic" ayuda={a?.derechos}>
        <AccionesDatos onSolicitud={setSolicitud} />
        {datos.solicitudes.length > 0 && (
          <p className="pequeno suave" style={{ marginTop: 10 }}>
            Tiene {fmt.numero(datos.solicitudes.length)} solicitud{datos.solicitudes.length === 1 ? "" : "es"}: {datos.solicitudes.map((s: any) => `${s.tipo} (${s.estado.replace(/_/g, " ")})`).join(", ")}.
          </p>
        )}
      </Tarjeta>
      {a && (
        <Tarjeta titulo="Lo que Nexo promete" ayuda={`Del aviso de privacidad, versión ${a.version}.`}>
          <ListaSimple elementos={[
            ...a.no_recopilamos.map((x: string) => ({ estado: "ok" as const, titulo: `Nexo no recopila ${minuscula(x)}.` })),
            { estado: "ok" as const, titulo: "Cookies", texto: a.cookies },
            { estado: "info" as const, titulo: "Cuánto tiempo se guardan sus datos", texto: a.conservacion },
          ]} />
        </Tarjeta>
      )}
      <PieResumen fuente={`aviso de privacidad${a ? ` versión ${a.version}` : ""} y registro de actividades de tratamiento de Nexo`} />
      {solicitud && <ModalSolicitud tipo={solicitud} onCerrar={() => setSolicitud(null)} />}
    </>
  );
}

function MisDatos() {
  const { datos } = useDatos<any>("/api/privacidad/mis-datos");
  const [solicitud, setSolicitud] = useState<"eliminar" | "rectificar" | null>(null);
  if (!datos) return <Esqueleto alto={300} />;
  const p = datos.perfil;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <div className="rejilla">
        <div className="c4"><Kpi etiqueta="Su cuenta" valor={<span style={{ fontSize: "1.1rem" }}>{p.nombre}</span>} detalle={`${p.email} · ${p.roles.join(", ")}`} /></div>
        <div className="c4"><Kpi tono="verde" etiqueta="Consentimiento" valor={<span style={{ fontSize: "1.1rem" }}>Versión {p.consentimiento.version ?? "—"}</span>} detalle={`Aceptado ${fmt.fecha(p.consentimiento.fecha)}`} /></div>
        <div className="c4"><Kpi tono="morado" etiqueta="Lo que guardamos de usted" valor={fmt.numero(datos.actividad.length)} detalle={`eventos recientes · ${datos.sesiones_activas} sesiones · ${datos.tableros_propios} tableros · ${datos.automatizaciones} automatizaciones`} /></div>
      </div>
      <AccionesDatos onSolicitud={setSolicitud} />
      {datos.solicitudes.length > 0 && <Tarjeta titulo="Mis solicitudes"><Tabla filas={datos.solicitudes} columnas={[
        { id: "t", titulo: "Tipo", valor: (s: any) => s.tipo }, { id: "e", titulo: "Estado", valor: (s: any) => s.estado, celda: (s: any) => <Severidad valor={s.estado} /> },
        { id: "f", titulo: "Fecha", valor: (s: any) => s.creada_en, celda: (s: any) => fmt.fecha(s.creada_en) }, { id: "r", titulo: "Respuesta", valor: (s: any) => s.respuesta },
      ]} /></Tarjeta>}
      <Tarjeta titulo="Su actividad registrada" ayuda="Lo que la bitácora guarda de sus acciones (últimos 200 eventos).">
        <Tabla maximo={60} filas={datos.actividad} columnas={[
          { id: "f", titulo: "Fecha", valor: (a: any) => a.ts, celda: (a: any) => fmt.fechaHora(a.ts) },
          { id: "a", titulo: "Acción", valor: (a: any) => a.accion, celda: (a: any) => <span className="mono">{a.accion}</span> },
          { id: "m", titulo: "Módulo", valor: (a: any) => a.modulo },
          { id: "r", titulo: "Resultado", valor: (a: any) => a.resultado, celda: (a: any) => <Severidad valor={a.resultado} /> },
        ]} />
      </Tarjeta>
      {solicitud && <ModalSolicitud tipo={solicitud} onCerrar={() => setSolicitud(null)} />}
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
            <button className="boton secundario pequeno" onClick={async () => { await api(`/api/privacidad/solicitudes/${s.id}/resolver`, { cuerpo: { aprobar: false, respuesta: "No procede; contáctenos para más detalle." } }); recargar(); }}>Rechazar</button>
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
      <Encabezado titulo="Privacidad y mis datos" subtitulo="Transparencia sobre qué datos personales trata Nexo, para qué, por cuánto tiempo y cómo ejercer sus derechos. Los datos estadísticos se protegen con el secreto estadístico."
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista
        resumen={<ResumenPrivacidad aviso={aviso} />}
        completa={<>
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
        </>}
      />
    </div>
  );
}
