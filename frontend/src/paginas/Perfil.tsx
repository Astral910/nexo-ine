// Perfil: datos de la cuenta, cambio de contraseña, segundo factor y sesiones abiertas.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LogOut, ShieldCheck } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, Insignia, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { ESCALAS } from "../componentes/Marco";

/** Preferencias de lectura: se guardan en este navegador y se aplican al instante (main.tsx las lee al abrir Nexo). */
function PreferenciasLectura() {
  const raiz = document.documentElement;
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
        <label className="casilla">
          <input type="checkbox" checked={sinAnimacion} onChange={(e) => alternarAnimacion(e.target.checked)} />
          <span>Reducir animaciones<br /><span className="pequeno suave">Quita los movimientos de entrada, de carga y de las gráficas. Nexo también respeta la preferencia de su sistema operativo.</span></span>
        </label>
      </div>
    </Tarjeta>
  );
}

export default function Perfil() {
  const { usuario } = useSesion();
  const { datos: sesiones, recargar } = useDatos<any[]>("/api/auth/sesiones");
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const cambiar = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    try { const r: any = await api("/api/auth/password/cambiar", { cuerpo: { actual, nueva } }); avisar(`${r.mensaje} Se cerraron ${r.sesiones_cerradas} sesiones en otros equipos.`); setActual(""); setNueva(""); recargar(); }
    catch (err) { setError((err as Error).message); }
  };
  if (!usuario) return <Esqueleto />;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Mi perfil y seguridad" subtitulo={`${usuario.email} · ${usuario.unidad}`} />
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
            <form className="columna" onSubmit={cambiar}>
              {error && <Aviso tono="critico">{error}</Aviso>}
              <Campo etiqueta="Contraseña actual"><input type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required /></Campo>
              <Campo etiqueta="Contraseña nueva"><input type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required /></Campo>
              <button className="boton">Actualizar contraseña</button>
            </form>
          </Tarjeta>
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
    </div>
  );
}
