// Perfil: datos de la cuenta, cambio de contraseña, segundo factor, sesiones abiertas y preferencias de lectura.
// Vista Resumen: una revisión de seguridad de la cuenta en lenguaje sencillo, las preferencias y los recorridos guiados.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LogOut, Route, ShieldCheck } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { ESCALAS } from "../componentes/Marco";
import { RECORRIDOS, useRecorrido } from "../componentes/Recorrido";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, EsqueletoTabla, Insignia, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, useVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "Su cuenta: roles, segundo factor, contraseña, sesiones abiertas y cómo prefiere leer Nexo.",
  datos: "Su propia cuenta en Nexo. Las preferencias de lectura (tamaño de letra, animaciones y vista) se guardan solo en este navegador.",
  pasos: [
    "Active el segundo factor si aún no lo tiene.",
    "Cierre las sesiones que no reconozca y cambie su contraseña.",
    "Elija el tamaño de letra y la vista con la que prefiere abrir las pantallas.",
    "Repita el recorrido guiado cuando quiera.",
  ],
  resumen: "Una revisión de seguridad de su cuenta, sus preferencias de lectura y los recorridos guiados.",
  completa: "El cambio de contraseña y la lista de sesiones abiertas, con la opción de cerrarlas.",
  terminos: [
    ["Segundo factor (MFA)", "Además de la contraseña, un código de seis dígitos de una aplicación del teléfono."],
    ["Sesión", "Cada equipo o navegador donde usted entró a Nexo y sigue conectado."],
    ["Contraseña larga", "Nexo pide al menos 15 caracteres: una frase es más fácil de recordar y más difícil de adivinar."],
    ["Vista predeterminada", "La vista con la que se abren las pantallas: «Resumen» para lo esencial o «Completa» para todo el detalle."],
  ],
};

/** Preferencias de lectura: se guardan en este navegador y se aplican al instante (main.tsx las lee al abrir Nexo). */
function PreferenciasLectura() {
  const raiz = document.documentElement;
  const { vista, cambiar } = useVista();
  const [escala, setEscala] = useState(raiz.dataset.escala ?? "");
  const [sinAnimacion, setSinAnimacion] = useState(raiz.classList.contains("sin-animacion"));
  const elegirEscala = (id: string) => {
    if (id) raiz.dataset.escala = id; else delete raiz.dataset.escala;
    localStorage.setItem("nexo:escala", id);
    setEscala(id);
  };
  const alternarAnimacion = (activo: boolean) => {
    raiz.classList.toggle("sin-animacion", activo);
    localStorage.setItem("nexo:sin-animacion", activo ? "1" : "");
    setSinAnimacion(activo);
  };
  return (
    <Tarjeta titulo="Preferencias de lectura" ayuda="Se guardan en este navegador.">
      <div className="columna">
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Tamaño de letra</div>
          <div className="fila" style={{ gap: 6 }}>
            {ESCALAS.map((e) => <button key={e.id || "normal"} className={`boton pequeno ${escala === e.id ? "" : "secundario"}`} onClick={() => elegirEscala(e.id)} aria-pressed={escala === e.id}>{e.texto}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Vista predeterminada de las pantallas</div>
          <div className="fila" style={{ gap: 6 }}>
            <button className={`boton pequeno ${vista === "resumen" ? "" : "secundario"}`} onClick={() => cambiar("resumen")} aria-pressed={vista === "resumen"}>Resumen</button>
            <button className={`boton pequeno ${vista === "completa" ? "" : "secundario"}`} onClick={() => cambiar("completa")} aria-pressed={vista === "completa"}>Completa</button>
          </div>
          <p className="pequeno suave" style={{ marginTop: 6 }}>«Resumen» muestra lo esencial con explicaciones; «Completa», todas las tablas y filtros. También puede cambiarla arriba, en cualquier pantalla.</p>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={sinAnimacion} onChange={(e) => alternarAnimacion(e.target.checked)} />
          <span>Reducir animaciones<br /><span className="pequeno suave">Quita los movimientos de entrada, de carga y de las gráficas. Nexo también respeta la preferencia de su sistema operativo.</span></span>
        </label>
      </div>
    </Tarjeta>
  );
}

function Recorridos() {
  const { iniciar } = useRecorrido();
  return (
    <Tarjeta titulo="Recorridos guiados" ayuda="Pasos cortos que le muestran lo esencial. Puede salir cuando quiera.">
      <div className="fila">
        <button type="button" className="boton secundario" onClick={() => iniciar("general")}><Route /> {RECORRIDOS.general.titulo}</button>
        <button type="button" className="boton secundario" onClick={() => iniciar("abierto")}><Route /> {RECORRIDOS.abierto.titulo}</button>
      </div>
    </Tarjeta>
  );
}

function ResumenPerfil({ sesiones }: { sesiones: any[] | null }) {
  const { usuario } = useSesion();
  const { cambiar } = useVista();
  if (!usuario) return <Esqueleto />;
  const n = sesiones?.length;
  const irACompleta = () => { cambiar("completa"); window.scrollTo({ top: 0 }); };
  return (
    <>
      <EnPocasPalabras>
        {usuario.mfa_activo ? <>Su cuenta está <b>protegida con segundo factor</b>.</> : <>Su cuenta <b>todavía no tiene segundo factor</b>: actívelo para protegerla mejor.</>}
        {n !== undefined && <> Tiene {fmt.numero(n)} sesión{n === 1 ? "" : "es"} abierta{n === 1 ? "" : "s"}.</>}
        {usuario.ultimo_acceso && <> Su último acceso fue el {fmt.fechaHora(usuario.ultimo_acceso)}.</>}
      </EnPocasPalabras>
      <Tarjeta titulo="Revisión de seguridad de su cuenta" ayuda="Lo que conviene revisar de vez en cuando.">
        {!sesiones ? <EsqueletoTabla filas={4} /> : (
          <ListaSimple elementos={[
            usuario.mfa_activo
              ? { estado: "ok", titulo: "Segundo factor activo", texto: "Cada inicio de sesión pide un código de su aplicación." }
              : { estado: "atencion", titulo: "Segundo factor sin activar", texto: "Con él, nadie puede entrar solo con su contraseña.",
                accion: <Link className="boton pequeno" to="/configurar-mfa">Activar ahora</Link> },
            { estado: "info", titulo: `${fmt.numero(sesiones.length)} sesión${sesiones.length === 1 ? "" : "es"} abierta${sesiones.length === 1 ? "" : "s"}`,
              texto: "Si no reconoce alguna, ciérrela y cambie su contraseña.",
              accion: <button type="button" className="boton secundario pequeno" onClick={irACompleta}>Ver sesiones</button> },
            { estado: "info", titulo: "Contraseña", texto: "Mínimo 15 caracteres. Al cambiarla se cierran sus otras sesiones.",
              accion: <button type="button" className="boton secundario pequeno" onClick={irACompleta}>Cambiar contraseña</button> },
            { estado: "info", titulo: `Sus roles: ${usuario.roles.map((r) => r.nombre).join(", ") || "ninguno"}`,
              texto: "Definen lo que puede ver y hacer. Para cambiarlos, pídalo a Informática." },
          ]} />
        )}
      </Tarjeta>
      <div className="rejilla">
        <div className="c6"><PreferenciasLectura /></div>
        <div className="c6"><Recorridos /></div>
      </div>
      <PieResumen fuente="su cuenta en Nexo; las preferencias se guardan en este navegador" />
    </>
  );
}

export default function Perfil() {
  const { usuario } = useSesion();
  const { datos: sesiones, recargar } = useDatos<any[]>("/api/auth/sesiones");
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const cambiarClave = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    try { const r: any = await api("/api/auth/password/cambiar", { cuerpo: { actual, nueva } }); avisar(`${r.mensaje} Se cerraron ${r.sesiones_cerradas} sesiones en otros equipos.`); setActual(""); setNueva(""); recargar(); }
    catch (err) { setError((err as Error).message); }
  };
  if (!usuario) return <Esqueleto />;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Mi perfil y seguridad" subtitulo={`${usuario.email} · ${usuario.unidad}`} acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista
        resumen={<ResumenPerfil sesiones={sesiones} />}
        completa={<>
          <div className="rejilla">
            <div className="c6">
              <Tarjeta titulo="Mis roles">
                <div className="fila">{usuario.roles.map((r) => <Insignia key={r.codigo} tono="info">{r.nombre} · {r.area}</Insignia>)}</div>
                <p className="pequeno suave" style={{ marginTop: 10 }}>Último acceso: {fmt.fechaHora(usuario.ultimo_acceso)}. Para cambiar sus roles, pídalo a Informática.</p>
              </Tarjeta>
              <div style={{ height: 16 }} />
              <Tarjeta titulo={<><ShieldCheck size={18} style={{ verticalAlign: -3 }} /> Segundo factor</>}>
                {usuario.mfa_activo ? <Aviso tono="exito">Activo. Cada inicio de sesión pide un código de su aplicación.</Aviso>
                  : <><Aviso tono="alerta">No tiene segundo factor. Le recomendamos activarlo.</Aviso><Link className="boton" style={{ marginTop: 10 }} to="/configurar-mfa">Configurar ahora</Link></>}
              </Tarjeta>
              <div style={{ height: 16 }} />
              <PreferenciasLectura />
            </div>
            <div className="c6">
              <Tarjeta titulo="Cambiar contraseña" ayuda="Mínimo 15 caracteres. Al cambiarla se cierran sus otras sesiones.">
                <form className="columna" onSubmit={cambiarClave}>
                  {error && <Aviso tono="critico">{error}</Aviso>}
                  <Campo etiqueta="Contraseña actual"><input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required /></Campo>
                  <Campo etiqueta="Contraseña nueva"><input type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required /></Campo>
                  <button className="boton">Actualizar contraseña</button>
                </form>
              </Tarjeta>
              <div style={{ height: 16 }} />
              <Recorridos />
            </div>
          </div>
          <Tarjeta titulo="Sesiones abiertas" ayuda="Si no reconoce una sesión, ciérrela y cambie su contraseña.">
            {!sesiones ? <Esqueleto /> : <Tabla filas={sesiones} columnas={[
              { id: "a", titulo: "Navegador", valor: (s: any) => s.agente, celda: (s: any) => <span className="pequeno">{s.agente.slice(0, 90)} {s.actual && <Insignia tono="exito">esta sesión</Insignia>}</span> },
              { id: "i", titulo: "IP", valor: (s: any) => s.ip },
              { id: "c", titulo: "Inicio", valor: (s: any) => s.creada_en, celda: (s: any) => fmt.fechaHora(s.creada_en) },
              { id: "u", titulo: "Última actividad", valor: (s: any) => s.ultima_actividad, celda: (s: any) => fmt.relativo(s.ultima_actividad) },
              { id: "x", titulo: "", celda: (s: any) => !s.actual && <button className="boton fantasma pequeno" onClick={async () => { await api(`/api/auth/sesiones/${s.id}`, { metodo: "DELETE" }); avisar("Sesión cerrada."); recargar(); }}><LogOut /> Cerrar</button> },
            ]} />}
          </Tarjeta>
        </>}
      />
    </div>
  );
}
