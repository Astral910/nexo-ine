// Usuarios y roles: aprobación de cuentas, asignación de roles con segregación de funciones y bloqueos.
// Vista Resumen: las cuentas que esperan aprobación como tarjetas, con aprobar y rechazar, y las personas por rol.
import { useState } from "react";
import { Ban, CircleCheck, KeyRound, LockOpen, MailWarning, ShieldCheck, UserPlus, Users } from "lucide-react";
import { api, fmt } from "../api";
import { Aviso, avisar, Encabezado, Esqueleto, EsqueletoKpis, EsqueletoTabla, Insignia, Modal, Pestanas, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, PieResumen, SegunVista, useVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "Las cuentas de Nexo: quién pidió acceso, quién está activo y qué puede hacer cada rol.",
  datos: "El registro de cuentas de Nexo. Nadie entra sin verificar su correo y sin la aprobación de Informática. Los roles y sus permisos están definidos en el código, y cada cambio queda en la bitácora.",
  pasos: [
    "Revise cada solicitud: nombre, unidad, rol solicitado y motivo.",
    "Apruebe solo con el rol que la persona necesita para su trabajo.",
    "Rechace lo que no corresponda a una función del INE: la persona recibe un correo con el motivo.",
    "En la vista Completa, desactive, desbloquee o restablezca el segundo factor cuando haga falta.",
  ],
  resumen: "Las cuentas que esperan aprobación, con los botones para aprobar o rechazar, y cuántas personas tiene cada rol.",
  completa: "Todas las cuentas con su estado, segundo factor y último acceso, y la matriz completa de roles y permisos.",
  terminos: [
    ["Mínimo privilegio", "Cada persona recibe solo los permisos que necesita para su trabajo, nada más."],
    ["Segregación de funciones", "Quien administra no audita y quien pide un precio no lo calcula, para evitar conflictos de interés."],
    ["Rol privilegiado", "Rol con permisos amplios, como administrar cuentas. Exige segundo factor."],
    ["Segundo factor (MFA)", "Además de la contraseña, un código de una aplicación del teléfono."],
    ["Cuenta bloqueada", "Se bloquea por un tiempo tras varios intentos fallidos de contraseña."],
  ],
};

function EditorRoles({ u, roles, onCerrar, aprobar }: { u: any; roles: any[]; onCerrar: () => void; aprobar: boolean }) {
  const [sel, setSel] = useState<string[]>(u.roles.length ? u.roles.map((r: any) => r.codigo) : [u.rol_solicitado].filter(Boolean));
  const [error, setError] = useState("");
  const guardar = async () => {
    try {
      await api(aprobar ? `/api/admin/usuarios/${u.id}/aprobar` : `/api/admin/usuarios/${u.id}/roles`, { metodo: aprobar ? "POST" : "PUT", cuerpo: { roles: sel } });
      avisar(aprobar ? "Cuenta aprobada y notificada." : "Roles actualizados."); onCerrar();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Modal titulo={`${aprobar ? "Aprobar" : "Roles de"} ${u.nombre}`} onCerrar={onCerrar}>
      <div className="columna">
        {u.motivo && <Aviso tono="info"><b>Motivo de la solicitud:</b> {u.motivo}</Aviso>}
        {error && <Aviso tono="critico">{error}</Aviso>}
        {roles.map((r) => (
          <label key={r.codigo} className="casilla">
            <input type="checkbox" checked={sel.includes(r.codigo)} onChange={(e) => setSel(e.target.checked ? [...sel, r.codigo] : sel.filter((x) => x !== r.codigo))} />
            <span><b>{r.nombre}</b> {r.privilegiado && <Insignia tono="alerta">privilegiado · MFA obligatorio</Insignia>}<br /><span className="pequeno suave">{r.descripcion}</span></span>
          </label>
        ))}
        <button className="boton" onClick={guardar} disabled={!sel.length}><CircleCheck /> {aprobar ? "Aprobar con estos roles" : "Guardar roles"}</button>
      </div>
    </Modal>
  );
}

const MOTIVO_RECHAZO = "La solicitud no corresponde a una función del INE.";

function ResumenAdmin({ pendientes, roles, aprobar, rechazar }: {
  pendientes: any; roles: any; aprobar: (u: any) => void; rechazar: (u: any) => void;
}) {
  if (!pendientes) return <><Esqueleto alto={90} /><EsqueletoKpis n={3} /><div className="rejilla">{[0, 1].map((i) => <div key={i} className="c6 tarjeta"><EsqueletoTabla filas={3} /></div>)}</div></>;
  const conteo: Record<string, number> = pendientes.conteo ?? {};
  const lista: any[] = pendientes.usuarios ?? [];
  const nombreRol = (codigo: string) => roles?.roles?.find((r: any) => r.codigo === codigo)?.nombre ?? codigo;
  return (
    <>
      <EnPocasPalabras>
        {lista.length > 0
          ? <><b>{fmt.numero(lista.length)} cuenta{lista.length === 1 ? " espera" : "s esperan"} su aprobación.</b> Confirme quién es cada persona y asígnele solo el rol que necesita para su trabajo.</>
          : <>No hay cuentas por aprobar. Hay {fmt.numero(conteo.activo ?? 0)} cuentas activas.</>}
      </EnPocasPalabras>
      <div className="rejilla escalonada">
        <div className="c4"><CifraClara tono="naranja" etiqueta="Por aprobar" icono={<UserPlus />} numero={conteo.pendiente_aprobacion ?? 0} formato={(v) => fmt.numero(v)}
          significa="Personas que ya verificaron su correo y esperan que Informática les asigne un rol." /></div>
        <div className="c4"><CifraClara tono="verde" etiqueta="Cuentas activas" icono={<Users />} numero={conteo.activo ?? 0} formato={(v) => fmt.numero(v)}
          significa="Pueden entrar a Nexo con los permisos de sus roles." /></div>
        <div className="c4"><CifraClara tono="morado" etiqueta="Esperan verificar su correo" icono={<MailWarning />} numero={conteo.pendiente_verificacion ?? 0} formato={(v) => fmt.numero(v)}
          significa="Se registraron pero aún no confirman su correo; hasta entonces no llegan a la lista por aprobar." /></div>
      </div>
      {lista.length > 0 && (
        <section className="columna" style={{ gap: 10 }} aria-label="Cuentas por aprobar">
          <div><div className="sobretitulo">Por aprobar</div><h2 style={{ marginTop: 4 }}>Solicitudes de acceso</h2></div>
          <div className="rejilla escalonada">
            {lista.map((u) => (
              <article key={u.id} className="c4 tarjeta cuenta-pendiente">
                <div><b>{u.nombre}</b> {u.es_demo && <Insignia tono="demo">demo</Insignia>}</div>
                <div className="pequeno suave">{u.email} · {u.unidad || "sin unidad"}</div>
                <div className="pequeno">Solicita el rol <b>{u.rol_solicitado ? nombreRol(u.rol_solicitado) : "sin indicar"}</b> · {fmt.relativo(u.creado_en)}</div>
                {u.motivo && <div className="motivo">«{u.motivo}»</div>}
                <div className="fila">
                  <button type="button" className="boton pequeno" onClick={() => aprobar(u)}><CircleCheck /> Aprobar</button>
                  <button type="button" className="boton secundario pequeno" onClick={() => rechazar(u)}>Rechazar</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <Tarjeta titulo="Personas por rol" ayuda="Cuántas personas tienen cada rol. Los privilegiados exigen segundo factor.">
        {!roles ? <EsqueletoTabla filas={5} /> : (
          <ul className="personas-rol">
            {roles.roles.map((r: any) => (
              <li key={r.codigo}>
                <span><b>{r.nombre}</b> <span className="suave">· {r.area}</span>{r.privilegiado && <> <Insignia tono="alerta">privilegiado</Insignia></>}</span>
                <span className="cifra">{fmt.numero(r.usuarios)} {r.usuarios === 1 ? "persona" : "personas"}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <PieResumen fuente="registro de cuentas de Nexo; los roles y permisos están definidos en el código y cada cambio queda en la bitácora" />
    </>
  );
}

export default function Admin() {
  const { esResumen } = useVista();
  const [pestana, setPestana] = useState<"pendientes" | "activos" | "todos" | "roles">("pendientes");
  const estado = pestana === "pendientes" ? "pendiente_aprobacion" : pestana === "activos" ? "activo" : undefined;
  const { datos, recargar } = useDatos<any>(pestana === "roles" || esResumen ? null : `/api/admin/usuarios${estado ? `?estado=${estado}` : ""}`);
  const { datos: pendientes, recargar: recargarPendientes } = useDatos<any>(esResumen ? "/api/admin/usuarios?estado=pendiente_aprobacion" : null);
  const { datos: roles, recargar: recargarRoles } = useDatos<any>("/api/admin/roles");
  const [editar, setEditar] = useState<{ u: any; aprobar: boolean } | null>(null);
  const [rechazo, setRechazo] = useState<any>(null);
  const recargarTodo = () => { if (esResumen) recargarPendientes(); else recargar(); recargarRoles(); };
  const accion = async (u: any, ruta: string, cuerpo?: any) => {
    try { await api(`/api/admin/usuarios/${u.id}/${ruta}`, { cuerpo: cuerpo ?? {} }); avisar("Hecho."); recargarTodo(); }
    catch (e) { avisar((e as Error).message, "critico"); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Usuarios y roles" subtitulo="Nadie entra sin verificar su correo y sin aprobación. Los roles aplican mínimo privilegio y segregación de funciones: quien administra no audita, y quien pide un precio no lo calcula."
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista
        resumen={<ResumenAdmin pendientes={pendientes} roles={roles} aprobar={(u) => setEditar({ u, aprobar: true })} rechazar={setRechazo} />}
        completa={<>
          <Pestanas opciones={[
            { id: "pendientes", etiqueta: <>Por aprobar {datos?.conteo?.pendiente_aprobacion ? <Insignia tono="alerta">{datos.conteo.pendiente_aprobacion}</Insignia> : null}</> },
            { id: "activos", etiqueta: "Activos" }, { id: "todos", etiqueta: "Todos" }, { id: "roles", etiqueta: "Roles y permisos" }]} activa={pestana} onCambio={setPestana} />
          {pestana !== "roles" && (!datos ? <Esqueleto alto={300} /> : (
            <Tarjeta>
              <Tabla filas={datos.usuarios} vacio={pestana === "pendientes" ? "No hay solicitudes pendientes." : "Sin usuarios."} columnas={[
                { id: "n", titulo: "Persona", valor: (u: any) => u.nombre, celda: (u: any) => <span><b>{u.nombre}</b> {u.es_demo && <Insignia tono="demo">demo</Insignia>}<br /><span className="pequeno suave">{u.email} · {u.unidad}</span></span> },
                { id: "r", titulo: "Roles", valor: (u: any) => u.roles.map((r: any) => r.nombre).join(", "), celda: (u: any) => (u.roles.length ? u.roles.map((r: any) => <Insignia key={r.codigo} tono="info">{r.nombre}</Insignia>) : <span className="pequeno suave">Solicita: {u.rol_solicitado}</span>) },
                { id: "e", titulo: "Estado", valor: (u: any) => u.estado, celda: (u: any) => <><Severidad valor={u.estado} /> {u.bloqueado && <Insignia tono="critico">bloqueada</Insignia>}</> },
                { id: "m", titulo: "MFA", valor: (u: any) => u.mfa_activo, celda: (u: any) => (u.mfa_activo ? <Insignia tono="exito"><ShieldCheck size={12} /> activo</Insignia> : <Insignia>no</Insignia>) },
                { id: "a", titulo: "Último acceso", valor: (u: any) => u.ultimo_acceso, celda: (u: any) => fmt.relativo(u.ultimo_acceso) },
                { id: "x", titulo: "", celda: (u: any) => (
                  <div className="fila" style={{ gap: 4, justifyContent: "flex-end" }}>
                    {u.estado === "pendiente_aprobacion" && <button className="boton pequeno" onClick={() => setEditar({ u, aprobar: true })}>Aprobar</button>}
                    {u.estado === "pendiente_aprobacion" && <button className="boton secundario pequeno" onClick={() => accion(u, "rechazar", { motivo: MOTIVO_RECHAZO })}>Rechazar</button>}
                    {u.estado === "activo" && <button className="boton secundario pequeno" onClick={() => setEditar({ u, aprobar: false })}>Roles</button>}
                    {u.bloqueado && <button className="boton fantasma pequeno" onClick={() => accion(u, "desbloquear")} aria-label="Desbloquear"><LockOpen /></button>}
                    {u.mfa_activo && <button className="boton fantasma pequeno" onClick={() => accion(u, "restablecer-mfa")} aria-label="Restablecer MFA"><KeyRound /></button>}
                    {u.estado === "activo" && <button className="boton fantasma pequeno" onClick={() => accion(u, "desactivar")} aria-label="Desactivar"><Ban /></button>}
                    {u.estado === "desactivado" && <button className="boton fantasma pequeno" onClick={() => accion(u, "reactivar")}>Reactivar</button>}
                  </div>
                ) },
              ]} />
            </Tarjeta>
          ))}
          {pestana === "roles" && (!roles ? <Esqueleto /> : (
            <Tarjeta titulo="Matriz de roles y permisos" ayuda="Definida en el código y auditada: cualquier cambio de roles queda en la bitácora.">
              <Tabla filas={roles.roles} columnas={[
                { id: "n", titulo: "Rol", valor: (r: any) => r.nombre, celda: (r: any) => <span><b>{r.nombre}</b> {r.privilegiado && <Insignia tono="alerta">privilegiado</Insignia>}<br /><span className="pequeno suave">{r.descripcion}</span></span> },
                { id: "a", titulo: "Área", valor: (r: any) => r.area },
                { id: "u", titulo: "Personas", num: true, valor: (r: any) => r.usuarios },
                { id: "p", titulo: "Permisos", celda: (r: any) => <div className="fila" style={{ gap: 4 }}>{r.permisos.map((p: string) => <span key={p} className="insignia mono" style={{ fontSize: "0.68rem" }}>{p}</span>)}</div> },
              ]} />
            </Tarjeta>
          ))}
        </>}
      />
      {editar && roles && <EditorRoles u={editar.u} aprobar={editar.aprobar} roles={roles.roles} onCerrar={() => { setEditar(null); recargarTodo(); }} />}
      {rechazo && (
        <Modal titulo={`¿Rechazar la solicitud de ${rechazo.nombre}?`} onCerrar={() => setRechazo(null)}>
          <div className="columna">
            <p>La persona recibirá un correo con este motivo: «{MOTIVO_RECHAZO}» La decisión queda en la bitácora.</p>
            <div className="fila" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="boton secundario" onClick={() => setRechazo(null)}>Cancelar</button>
              <button type="button" className="boton peligro" onClick={() => { accion(rechazo, "rechazar", { motivo: MOTIVO_RECHAZO }); setRechazo(null); }}>Rechazar solicitud</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
