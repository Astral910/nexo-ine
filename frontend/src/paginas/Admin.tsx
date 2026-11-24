// Usuarios y roles: aprobación de cuentas, asignación de roles con segregación de funciones y bloqueos.
import { useState } from "react";
import { Ban, CircleCheck, KeyRound, LockOpen, ShieldCheck } from "lucide-react";
import { api, fmt } from "../api";
import { Aviso, avisar, Encabezado, Esqueleto, Insignia, Modal, Pestanas, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";

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

export default function Admin() {
  const [pestana, setPestana] = useState<"pendientes" | "activos" | "todos" | "roles">("pendientes");
  const estado = pestana === "pendientes" ? "pendiente_aprobacion" : pestana === "activos" ? "activo" : undefined;
  const { datos, recargar } = useDatos<any>(pestana === "roles" ? null : `/api/admin/usuarios${estado ? `?estado=${estado}` : ""}`);
  const { datos: roles } = useDatos<any>("/api/admin/roles");
  const [editar, setEditar] = useState<{ u: any; aprobar: boolean } | null>(null);
  const accion = async (u: any, ruta: string, cuerpo?: any) => {
    try { await api(`/api/admin/usuarios/${u.id}/${ruta}`, { cuerpo: cuerpo ?? {} }); avisar("Hecho."); recargar(); }
    catch (e) { avisar((e as Error).message, "critico"); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Usuarios y roles" subtitulo="Nadie entra sin verificar su correo y sin aprobación. Los roles aplican mínimo privilegio y segregación de funciones: quien administra no audita, y quien pide un precio no lo calcula." />
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
                {u.estado === "pendiente_aprobacion" && <button className="boton secundario pequeno" onClick={() => accion(u, "rechazar", { motivo: "La solicitud no corresponde a una función del INE." })}>Rechazar</button>}
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
      {editar && roles && <EditorRoles u={editar.u} aprobar={editar.aprobar} roles={roles.roles} onCerrar={() => { setEditar(null); recargar(); }} />}
    </div>
  );
}
