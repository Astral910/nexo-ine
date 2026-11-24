// Acceso: inicio de sesión con segundo factor, registro con verificación y aprobación, recuperación y MFA.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CircleCheck, Fingerprint, KeyRound, Mail, ShieldCheck, Smartphone, Sparkles, Workflow } from "lucide-react";
import { api, ErrorApi } from "../api";
import { useSesion, type Usuario } from "../auth";
import { Aviso, Campo, Modal } from "../componentes/ui";

function Plantilla({ children }: { children: ReactNode }) {
  return (
    <div className="acceso">
      <section className="ilustracion" aria-hidden="false">
        <img src="/marca/logo-ine-blanco.svg" alt="Instituto Nacional de Estadística" style={{ width: 220 }} />
        <div>
          <h1>Nexo</h1>
          <p style={{ marginTop: 10 }}>Una sola plataforma para los procesos del INE: precios de referencia, índices, territorio y calidad de datos, con automatizaciones, tableros por rol y seguridad desde el diseño.</p>
        </div>
        <div className="puntos">
          <div><Sparkles size={18} /> Tableros que se arman escribiendo lo que quieres ver, con datos oficiales.</div>
          <div><Workflow size={18} /> Automatizaciones que cada persona controla, con historial completo.</div>
          <div><ShieldCheck size={18} /> Segundo factor, roles, bitácora a prueba de manipulación y secreto estadístico.</div>
        </div>
        <img className="dibujo" src="/marca/ilustracion-campo.svg" alt="" />
        <div className="pequeno" style={{ marginTop: "auto", color: "#bcd7f5", maxWidth: "50%" }}>
          Prototipo del Datatón INE 2026 · Categoría Tecnológica y ciencia de datos. No es un sistema oficial del INE. Fuente de los datos: Instituto Nacional de Estadística.
        </div>
      </section>
      <section className="formulario"><div className="caja">{children}</div></section>
    </div>
  );
}

function MedidorClave({ clave, email, nombre }: { clave: string; email?: string; nombre?: string }) {
  const [problemas, setProblemas] = useState<string[]>([]);
  useEffect(() => {
    if (!clave) { setProblemas([]); return; }
    const t = setTimeout(() => api<{ problemas: string[] }>("/api/auth/password/evaluar", { cuerpo: { password: clave, email: email ?? "", nombre: nombre ?? "" } })
      .then((r) => setProblemas(r.problemas)).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [clave, email, nombre]);
  const fuerza = !clave ? 0 : problemas.length ? Math.min(60, clave.length * 3) : Math.min(100, 60 + clave.length * 2);
  const color = fuerza >= 90 ? "#2f8f2f" : fuerza >= 60 ? "#0080FF" : "#FF5500";
  return (
    <div className="columna" style={{ gap: 6 }}>
      <div className="medidor-clave"><div style={{ width: `${fuerza}%`, background: color }} /></div>
      {problemas.map((p) => <span key={p} className="pequeno" style={{ color: "#b33c00" }}>{p}</span>)}
      {clave && !problemas.length && <span className="pequeno" style={{ color: "#2f6b0a" }}>Contraseña aceptable. Guárdala en un gestor de contraseñas.</span>}
    </div>
  );
}

export function Acceso() {
  const { establecer, usuario } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation() as { state?: { desde?: string } };
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [paso, setPaso] = useState<"credenciales" | "mfa">(usuario?.mfa_por_verificar ? "mfa" : "credenciales");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const continuar = (u: Usuario) => {
    establecer(u);
    if (u.mfa_por_verificar) { setPaso("mfa"); return; }
    if (u.mfa_por_configurar) { navegar("/configurar-mfa"); return; }
    navegar(ubicacion.state?.desde ?? "/", { replace: true });
  };
  const entrar = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setEnviando(true);
    try { continuar(await api<Usuario>("/api/auth/login", { cuerpo: { email, password: clave } })); }
    catch (err) { setError((err as ErrorApi).message); }
    finally { setEnviando(false); }
  };
  const verificar = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setEnviando(true);
    try { continuar(await api<Usuario>("/api/auth/mfa/verificar", { cuerpo: { codigo } })); }
    catch (err) { setError((err as ErrorApi).message); }
    finally { setEnviando(false); }
  };
  return (
    <Plantilla>
      <div>
        <img src="/marca/dataton.png" alt="Datatón INE 2026: Innova, Comunica, Impacta" style={{ width: 150, marginBottom: 10 }} />
        <h1>{paso === "mfa" ? "Verifica que eres tú" : "Inicia sesión"}</h1>
        <p className="suave" style={{ marginTop: 6 }}>
          {paso === "mfa" ? "Escribe el código de 6 dígitos de tu aplicación de autenticación, o uno de tus códigos de recuperación." : "Usa tu correo institucional y tu contraseña."}
        </p>
      </div>
      {error && <Aviso tono="critico">{error}</Aviso>}
      {paso === "credenciales" ? (
        <form className="columna" onSubmit={entrar}>
          <Campo etiqueta="Correo institucional"><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@ine.gob.gt" /></Campo>
          <Campo etiqueta="Contraseña"><input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
          <button className="boton" disabled={enviando}><KeyRound /> {enviando ? "Verificando…" : "Entrar"}</button>
          <div className="fila espaciado pequeno">
            <Link to="/olvide">¿Olvidaste tu contraseña?</Link>
            <Link to="/registro">Solicitar acceso</Link>
          </div>
        </form>
      ) : (
        <form className="columna" onSubmit={verificar}>
          <Campo etiqueta="Código de verificación"><input inputMode="numeric" autoComplete="one-time-code" autoFocus required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="123456" /></Campo>
          <button className="boton" disabled={enviando}><Fingerprint /> {enviando ? "Verificando…" : "Verificar y entrar"}</button>
        </form>
      )}
      <Aviso tono="info">Solo usamos cookies necesarias para tu sesión y tu seguridad. Cada acceso queda en la bitácora de auditoría.</Aviso>
    </Plantilla>
  );
}

function AvisoPrivacidad({ onCerrar }: { onCerrar: () => void }) {
  const [datos, setDatos] = useState<any>(null);
  useEffect(() => { api("/api/privacidad/aviso").then(setDatos).catch(() => undefined); }, []);
  return (
    <Modal titulo="Aviso de privacidad" onCerrar={onCerrar}>
      {!datos ? "Cargando…" : (
        <div className="columna pequeno">
          <p><b>Finalidad:</b> {datos.aviso.finalidad}</p>
          <p><b>Datos que tratamos:</b> {datos.aviso.datos.join(", ")}.</p>
          <p><b>No recopilamos:</b> {datos.aviso.no_recopilamos.join(", ")}.</p>
          <p><b>Cookies:</b> {datos.aviso.cookies}</p>
          <p><b>Conservación:</b> {datos.aviso.conservacion}</p>
          <p><b>Tus derechos:</b> {datos.aviso.derechos}</p>
          <p><b>Marco:</b> {datos.aviso.marco.join(" · ")}</p>
          <p className="suave">Versión {datos.aviso.version}</p>
        </div>
      )}
    </Modal>
  );
}

export function Registro() {
  const [config, setConfig] = useState<any>(null);
  const [f, setF] = useState({ nombre: "", email: "", unidad: "", rol_solicitado: "", motivo: "", password: "", confirmar: "", acepta_privacidad: false });
  const [error, setError] = useState("");
  const [listo, setListo] = useState<{ mensaje: string; clave_buzon?: string } | null>(null);
  const [correo, setCorreo] = useState<any>(null);
  const [aviso, setAviso] = useState(false);
  useEffect(() => { api("/api/auth/config").then((c) => { setConfig(c); setF((x) => ({ ...x, rol_solicitado: c.roles[0]?.codigo ?? "" })); }); }, []);
  const cambiar = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (f.password !== f.confirmar) { setError("Las contraseñas no coinciden."); return; }
    try {
      const { confirmar: _c, ...datos } = f;
      setListo(await api("/api/auth/registro", { cuerpo: datos }));
    } catch (err) { setError((err as ErrorApi).message); }
  };
  if (listo) {
    return (
      <Plantilla>
        <CircleCheck size={44} color="#2f8f2f" />
        <h1>Revisa tu correo</h1>
        <p className="suave">{listo.mensaje} Después de verificarlo, Informática revisará tu solicitud y te avisará cuando tu cuenta esté activa.</p>
        <ol className="pequeno" style={{ paddingLeft: 18 }}>
          <li>Verificas tu correo con el enlace.</li><li>Informática aprueba tu solicitud y asigna tu rol.</li><li>Inicias sesión; si tu rol lo exige, configuras tu segundo factor.</li>
        </ol>
        {listo.clave_buzon && (
          <Aviso tono="alerta">
            <b>Modo demostración:</b> esta instalación no envía correos reales.{" "}
            <button className="boton secundario pequeno" onClick={() => api(`/api/auth/buzon?clave=${encodeURIComponent(listo.clave_buzon!)}`).then(setCorreo)}><Mail /> Ver el correo de verificación</button>
          </Aviso>
        )}
        {correo && (
          <div className="tarjeta">
            <div className="pequeno suave">Para: {correo.para}</div>
            <h3 style={{ margin: "6px 0" }}>{correo.asunto}</h3>
            <p className="pequeno">{correo.cuerpo}</p>
            {correo.enlace && <a className="boton" style={{ marginTop: 10 }} href={new URL(correo.enlace).pathname + new URL(correo.enlace).search}>Verificar mi correo</a>}
          </div>
        )}
        <Link to="/login">Volver al inicio de sesión</Link>
      </Plantilla>
    );
  }
  const rol = config?.roles.find((r: any) => r.codigo === f.rol_solicitado);
  return (
    <Plantilla>
      <div>
        <h1>Solicitar acceso</h1>
        <p className="suave" style={{ marginTop: 6 }}>Tu solicitud la revisa Informática. Los roles de administración y seguridad no se piden aquí.</p>
      </div>
      {error && <Aviso tono="critico">{error}</Aviso>}
      <form className="columna" onSubmit={enviar}>
        <Campo etiqueta="Nombre completo"><input required minLength={3} value={f.nombre} onChange={(e) => cambiar("nombre", e.target.value)} /></Campo>
        <Campo etiqueta="Correo institucional" ayuda={config?.dominios_permitidos?.length ? `Dominios permitidos: ${config.dominios_permitidos.join(", ")}` : undefined}>
          <input type="email" required value={f.email} onChange={(e) => cambiar("email", e.target.value)} autoComplete="email" />
        </Campo>
        <Campo etiqueta="Unidad o institución"><input value={f.unidad} onChange={(e) => cambiar("unidad", e.target.value)} placeholder="Dirección de Precios e Índices de Referencia" /></Campo>
        <Campo etiqueta="Rol que solicitas" ayuda={rol?.descripcion}>
          <select value={f.rol_solicitado} onChange={(e) => cambiar("rol_solicitado", e.target.value)}>
            {config?.roles.map((r: any) => <option key={r.codigo} value={r.codigo}>{r.nombre} · {r.area}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="¿Para qué necesitas el acceso? (opcional)"><textarea value={f.motivo} onChange={(e) => cambiar("motivo", e.target.value)} maxLength={500} /></Campo>
        <Campo etiqueta="Contraseña" ayuda={`Mínimo ${config?.password_minimo ?? 15} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.`}>
          <input type="password" autoComplete="new-password" required value={f.password} onChange={(e) => cambiar("password", e.target.value)} />
        </Campo>
        <MedidorClave clave={f.password} email={f.email} nombre={f.nombre} />
        <Campo etiqueta="Confirma la contraseña"><input type="password" autoComplete="new-password" required value={f.confirmar} onChange={(e) => cambiar("confirmar", e.target.value)} /></Campo>
        <label className="casilla">
          <input type="checkbox" checked={f.acepta_privacidad} onChange={(e) => cambiar("acepta_privacidad", e.target.checked)} required />
          <span>Leí y acepto el <button type="button" className="boton fantasma pequeno" style={{ padding: 0 }} onClick={() => setAviso(true)}>aviso de privacidad</button>.</span>
        </label>
        <button className="boton"><Smartphone /> Enviar solicitud</button>
        <Link className="pequeno" to="/login">Ya tengo cuenta</Link>
      </form>
      {aviso && <AvisoPrivacidad onCerrar={() => setAviso(false)} />}
    </Plantilla>
  );
}

export function Verificar() {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setEstado({ ok: false, texto: "Falta el enlace de verificación." }); return; }
    api("/api/auth/verificar-correo", { cuerpo: { token } })
      .then((r: any) => setEstado({ ok: true, texto: r.mensaje }))
      .catch((e) => setEstado({ ok: false, texto: e.message }));
  }, [params]);
  return (
    <Plantilla>
      <h1>Verificación de correo</h1>
      {!estado ? <p>Verificando…</p> : <Aviso tono={estado.ok ? "exito" : "critico"}>{estado.texto}</Aviso>}
      <Link to="/login">Ir al inicio de sesión</Link>
    </Plantilla>
  );
}

export function Olvide() {
  const [email, setEmail] = useState("");
  const [mensaje, setMensaje] = useState("");
  return (
    <Plantilla>
      <h1>Restablecer contraseña</h1>
      <p className="suave">Te enviaremos un enlace válido por 30 minutos. Por seguridad, la respuesta es la misma exista o no la cuenta.</p>
      {mensaje ? <Aviso tono="exito">{mensaje}</Aviso> : (
        <form className="columna" onSubmit={async (e) => { e.preventDefault(); const r: any = await api("/api/auth/password/olvide", { cuerpo: { email } }); setMensaje(r.mensaje); }}>
          <Campo etiqueta="Correo institucional"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          <button className="boton"><Mail /> Enviar enlace</button>
        </form>
      )}
      <Link to="/login">Volver</Link>
    </Plantilla>
  );
}

export function Restablecer() {
  const [params] = useSearchParams();
  const [clave, setClave] = useState("");
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <Plantilla>
      <h1>Nueva contraseña</h1>
      {estado && <Aviso tono={estado.ok ? "exito" : "critico"}>{estado.texto}</Aviso>}
      {!estado?.ok && (
        <form className="columna" onSubmit={async (e) => {
          e.preventDefault();
          try { const r: any = await api("/api/auth/password/restablecer", { cuerpo: { token: params.get("token"), password: clave } }); setEstado({ ok: true, texto: r.mensaje }); }
          catch (err) { setEstado({ ok: false, texto: (err as Error).message }); }
        }}>
          <Campo etiqueta="Contraseña nueva"><input type="password" autoComplete="new-password" required value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
          <MedidorClave clave={clave} />
          <button className="boton">Guardar contraseña</button>
        </form>
      )}
      <Link to="/login">Ir al inicio de sesión</Link>
    </Plantilla>
  );
}

export function ConfigurarMfa() {
  const { usuario, establecer, refrescar } = useSesion();
  const navegar = useNavigate();
  const [qr, setQr] = useState<{ secreto: string; qr_svg: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!usuario) refrescar().then((u) => !u && navegar("/login")); }, [usuario, refrescar, navegar]);
  const generar = async () => { setError(""); try { setQr(await api("/api/auth/mfa/iniciar", { metodo: "POST" })); } catch (e) { setError((e as Error).message); } };
  const activar = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    try { const r: any = await api("/api/auth/mfa/activar", { cuerpo: { codigo } }); setCodigos(r.codigos_recuperacion); establecer(r.usuario); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <Plantilla>
      <div><ShieldCheck size={40} color="#0080FF" /><h1>Configura tu segundo factor</h1>
        <p className="suave" style={{ marginTop: 6 }}>Tu rol maneja información sensible. Además de la contraseña, pediremos un código que genera tu teléfono (Google Authenticator, Microsoft Authenticator, FreeOTP u otra app compatible).</p></div>
      {error && <Aviso tono="critico">{error}</Aviso>}
      {codigos ? (
        <div className="columna">
          <Aviso tono="exito">Segundo factor activado. Guarda estos códigos de recuperación en un lugar seguro: cada uno sirve una sola vez y no los volverás a ver.</Aviso>
          <div className="tarjeta mono" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{codigos.map((c) => <span key={c}>{c}</span>)}</div>
          <button className="boton secundario" onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([`Códigos de recuperación de Nexo\n\n${codigos.join("\n")}\n`], { type: "text/plain" }));
            a.download = "nexo-codigos-recuperacion.txt"; a.click();
          }}>Descargar códigos</button>
          <button className="boton" onClick={() => navegar("/")}>Continuar a Nexo</button>
        </div>
      ) : !qr ? (
        <button className="boton" onClick={generar}><Smartphone /> Generar código QR</button>
      ) : (
        <form className="columna" onSubmit={activar}>
          <div className="fila" style={{ alignItems: "flex-start" }}>
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qr.qr_svg)}`} alt="Código QR para tu aplicación de autenticación" style={{ width: 190, height: 190, border: "1px solid var(--borde)", borderRadius: 12 }} />
            <div className="pequeno" style={{ flex: 1 }}>
              <p>1. Escanea el código con tu aplicación.</p>
              <p style={{ marginTop: 6 }}>2. Si no puedes escanear, escribe esta clave:</p>
              <p className="mono" style={{ wordBreak: "break-all", marginTop: 4 }}>{qr.secreto}</p>
            </div>
          </div>
          <Campo etiqueta="3. Escribe el código de 6 dígitos"><input inputMode="numeric" required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="123456" /></Campo>
          <button className="boton"><Fingerprint /> Activar segundo factor</button>
        </form>
      )}
    </Plantilla>
  );
}
