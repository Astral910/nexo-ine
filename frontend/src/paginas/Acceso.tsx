// Acceso: inicio de sesión con segundo factor, registro con verificación y aprobación, recuperación y MFA.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CircleCheck, Eye, EyeOff, Fingerprint, Globe, Info, KeyRound, Mail, PlayCircle, Smartphone } from "lucide-react";
import { api, ErrorApi } from "../api";
import { useSesion, type Usuario } from "../auth";
import { Aviso, Campo, Modal } from "../componentes/ui";

function Plantilla({ children }: { children: ReactNode }) {
  return (
    <div className="acceso">
      <section className="ilustracion">
        <img src="/marca/logo-ine-blanco.svg" alt="Instituto Nacional de Estadística" style={{ width: 210 }} />
        <div>
          <h1>Nexo</h1>
          <p style={{ marginTop: 10 }}>Los procesos del INE en una sola plataforma: precios de referencia, índices, territorio y calidad de datos.</p>
        </div>
        <div className="pequeno" style={{ color: "#bcd7f5" }}>
          Prototipo del Datatón INE 2026 · Categoría 2. Fuente de los datos: Instituto Nacional de Estadística.
        </div>
      </section>
      <section className="formulario">
        <div className="caja">{children}</div>
        <nav className="accesos-rapidos" aria-label="Sin cuenta">
          <Link to="/abierto"><Globe size={16} /> Datos públicos sin cuenta</Link>
          <Link to="/campo"><Smartphone size={16} /> Catálogo para el teléfono</Link>
        </nav>
        <div className="pequeno suave" style={{ textAlign: "center", maxWidth: 440 }}><Info size={13} style={{ verticalAlign: "-2px" }} /> Prototipo del Datatón INE 2026. No es un sistema oficial del Gobierno de Guatemala.</div>
      </section>
    </div>
  );
}

/** Contraseña con botón para mostrarla u ocultarla (útil para quien escribe despacio o con letra grande). */
function CampoClave({ valor, onCambio, autocompletar, id }: { valor: string; onCambio: (v: string) => void; autocompletar: string; id?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="clave-campo">
      <input id={id} type={visible ? "text" : "password"} autoComplete={autocompletar} required value={valor} onChange={(e) => onCambio(e.target.value)} />
      <button type="button" className="boton fantasma pequeno icono" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible}>
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}

/** Correo de verificación en modo demostración (sin servidor de correo): se muestra aquí mismo con su botón. */
function CorreoDemo({ clave }: { clave: string }) {
  const [correo, setCorreo] = useState<any>(null);
  useEffect(() => { api(`/api/auth/buzon?clave=${encodeURIComponent(clave)}`).then(setCorreo).catch(() => undefined); }, [clave]);
  if (!correo) return null;
  const enlace = correo.enlace ? new URL(correo.enlace) : null;
  return (
    <div className="columna" style={{ gap: 10 }}>
      <Aviso tono="alerta"><b>Modo demostración:</b> esta instalación no tiene servidor de correo, así que el mensaje que le enviaríamos aparece aquí.</Aviso>
      <div className="tarjeta">
        <div className="pequeno suave"><Mail size={14} /> Para: {correo.para}</div>
        <h3 style={{ margin: "6px 0" }}>{correo.asunto}</h3>
        <p className="pequeno">{correo.cuerpo}</p>
        {enlace && <a className="boton" style={{ marginTop: 10 }} href={enlace.pathname + enlace.search}><CircleCheck /> Verificar mi correo</a>}
      </div>
    </div>
  );
}

function Pasos({ actual, nombres }: { actual: number; nombres: string[] }) {
  return (
    <ol className="pasos" style={{ gridTemplateColumns: `repeat(${nombres.length}, 1fr)`, margin: "4px 0 6px", padding: 0, listStyle: "none" }} aria-label="Avance">
      {nombres.map((n, i) => <li key={n} className={`paso ${i < actual ? "hecho" : i === actual ? "actual" : ""}`} aria-current={i === actual ? "step" : undefined}>{n}</li>)}
    </ol>
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
  const color = fuerza >= 90 ? "#2b6a0f" : fuerza >= 60 ? "#0b4f96" : "#c4320a";
  return (
    <div className="columna" style={{ gap: 6 }}>
      <div className="medidor-clave"><div style={{ width: `${fuerza}%`, background: color }} /></div>
      {problemas.map((p) => <span key={p} className="pequeno" style={{ color: "var(--alerta)" }}>{p}</span>)}
      {clave && !problemas.length && <span className="pequeno" style={{ color: "var(--exito)" }}>Contraseña aceptable. Le recomendamos guardarla en un gestor de contraseñas.</span>}
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
  const [reenvio, setReenvio] = useState<{ mensaje: string; clave_buzon?: string } | null>(null);
  const sinVerificar = error.startsWith("Primero verifique su correo");
  const [demo, setDemo] = useState(false);
  useEffect(() => { api<{ alta_inmediata?: boolean }>("/api/auth/config").then((c) => setDemo(!!c.alta_inmediata)).catch(() => undefined); }, []);

  const reenviar = async () => {
    setEnviando(true);
    try { setReenvio(await api("/api/auth/reenviar-verificacion", { cuerpo: { email, password: clave } })); setError(""); }
    catch (err) { setError((err as ErrorApi).message); }
    finally { setEnviando(false); }
  };
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
  const entrarDemo = async () => {
    setError(""); setEnviando(true);
    try { continuar(await api<Usuario>("/api/auth/demo", { cuerpo: {} })); }
    catch (err) { setError((err as ErrorApi).message); }
    finally { setEnviando(false); }
  };
  return (
    <Plantilla>
      <div>
        <div className="sobretitulo">Nexo · INE</div>
        <h1 style={{ marginTop: 4 }}>{paso === "mfa" ? "Confirme que es usted" : "Iniciar sesión"}</h1>
        {paso === "mfa" && <p className="suave" style={{ marginTop: 6 }}>Escriba el código de 6 dígitos de su aplicación de autenticación o uno de sus códigos de recuperación.</p>}
      </div>
      {paso === "credenciales" && demo && (
        <>
          <button type="button" className="boton grande" onClick={entrarDemo} disabled={enviando}><PlayCircle /> Entrar a la demostración</button>
          <div className="separador-o"><span>o con su cuenta</span></div>
        </>
      )}
      {error && <Aviso tono="critico">{error}</Aviso>}
      {sinVerificar && (
        <button type="button" className="boton secundario" onClick={reenviar} disabled={enviando}><Mail /> Enviarme un enlace nuevo</button>
      )}
      {reenvio && (reenvio.clave_buzon ? <CorreoDemo clave={reenvio.clave_buzon} /> : <Aviso tono="info">{reenvio.mensaje}</Aviso>)}
      {paso === "credenciales" ? (
        <form className="columna" onSubmit={entrar}>
          <Campo etiqueta="Correo"><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@ine.gob.gt" /></Campo>
          <Campo etiqueta="Contraseña"><CampoClave valor={clave} onCambio={setClave} autocompletar="current-password" /></Campo>
          <button className={`boton ${demo ? "secundario" : ""}`} disabled={enviando}><KeyRound /> {enviando ? "Verificando…" : "Entrar"}</button>
          <div className="fila espaciado pequeno">
            <Link to="/olvide">¿Olvidó su contraseña?</Link>
            <Link to="/registro">{demo ? "Crear cuenta" : "Solicitar acceso"}</Link>
          </div>
        </form>
      ) : (
        <form className="columna" onSubmit={verificar}>
          <Campo etiqueta="Código de verificación"><input inputMode="numeric" autoComplete="one-time-code" autoFocus required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="123456" /></Campo>
          <button className="boton" disabled={enviando}><Fingerprint /> {enviando ? "Verificando…" : "Verificar y entrar"}</button>
        </form>
      )}
      <p className="pequeno suave" style={{ margin: 0 }}>Solo usamos cookies necesarias. Cada acceso queda en la bitácora.</p>
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
          <p><b>Sus derechos:</b> {datos.aviso.derechos}</p>
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
  const [listo, setListo] = useState<{ mensaje: string; clave_buzon?: string; activa?: boolean } | null>(null);
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
  if (listo?.activa) {
    return (
      <Plantilla>
        <CircleCheck size={40} color="#2b6a0f" />
        <h1>Cuenta creada</h1>
        <p className="suave">{listo.mensaje} En esta demostración la cuenta queda activa al instante; en la versión institucional se verifica el correo y Informática aprueba el rol.</p>
        <Link className="boton" to="/login"><KeyRound /> Iniciar sesión</Link>
      </Plantilla>
    );
  }
  if (listo) {
    return (
      <Plantilla>
        <CircleCheck size={40} color="#2b6a0f" />
        <h1>Revise su correo</h1>
        <p className="suave">{listo.mensaje} Después de verificarlo, Informática revisará su solicitud y le avisará cuando su cuenta esté activa.</p>
        <Pasos actual={1} nombres={["Solicitud", "Verificar correo", "Aprobación", "Primer ingreso"]} />
        <ol className="pequeno" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Abra el enlace que le enviamos para verificar su correo.</li><li>Informática aprueba su solicitud y asigna su rol.</li><li>Inicie sesión; si su rol lo exige, configure el segundo factor.</li>
        </ol>
        {listo.clave_buzon && <CorreoDemo clave={listo.clave_buzon} />}
        <Link to="/login">Volver al inicio de sesión</Link>
      </Plantilla>
    );
  }
  const rol = config?.roles.find((r: any) => r.codigo === f.rol_solicitado);
  return (
    <Plantilla>
      <div>
        <div className="sobretitulo">Nueva cuenta</div>
        <h1 style={{ marginTop: 6 }}>Solicitar acceso</h1>
        <p className="suave" style={{ marginTop: 6 }}>{config?.alta_inmediata ? "En esta demostración la cuenta queda activa al crearla." : "Informática revisa cada solicitud."} Los roles de administración y de seguridad no se solicitan aquí.</p>
        <div style={{ marginTop: 14 }}><Pasos actual={0} nombres={config?.alta_inmediata ? ["Crear cuenta", "Primer ingreso"] : ["Solicitud", "Verificar correo", "Aprobación", "Primer ingreso"]} /></div>
      </div>
      {error && <Aviso tono="critico">{error}</Aviso>}
      <form className="columna" onSubmit={enviar}>
        <Campo etiqueta="Nombre completo"><input required minLength={3} value={f.nombre} onChange={(e) => cambiar("nombre", e.target.value)} /></Campo>
        <Campo etiqueta="Correo institucional" ayuda={config?.dominios_permitidos?.length ? `Dominios permitidos: ${config.dominios_permitidos.join(", ")}` : undefined}>
          <input type="email" required value={f.email} onChange={(e) => cambiar("email", e.target.value)} autoComplete="email" />
        </Campo>
        <Campo etiqueta="Unidad o institución"><input value={f.unidad} onChange={(e) => cambiar("unidad", e.target.value)} placeholder="Dirección de Precios e Índices de Referencia" /></Campo>
        <Campo etiqueta="Rol que solicita" ayuda={rol?.descripcion}>
          <select value={f.rol_solicitado} onChange={(e) => cambiar("rol_solicitado", e.target.value)}>
            {config?.roles.map((r: any) => <option key={r.codigo} value={r.codigo}>{r.nombre} · {r.area}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="¿Para qué necesita el acceso? (opcional)"><textarea value={f.motivo} onChange={(e) => cambiar("motivo", e.target.value)} maxLength={500} /></Campo>
        <Campo etiqueta="Contraseña" ayuda={`Mínimo ${config?.password_minimo ?? 15} caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.`}>
          <CampoClave valor={f.password} onCambio={(v) => cambiar("password", v)} autocompletar="new-password" />
        </Campo>
        <MedidorClave clave={f.password} email={f.email} nombre={f.nombre} />
        <Campo etiqueta="Confirme la contraseña"><CampoClave valor={f.confirmar} onCambio={(v) => cambiar("confirmar", v)} autocompletar="new-password" /></Campo>
        <label className="casilla">
          <input type="checkbox" checked={f.acepta_privacidad} onChange={(e) => cambiar("acepta_privacidad", e.target.checked)} required />
          <span>Leí y acepto el <button type="button" onClick={() => setAviso(true)} style={{ background: "none", border: 0, padding: 0, color: "var(--acento)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", font: "inherit" }}>aviso de privacidad</button>.</span>
        </label>
        <button className="boton">Enviar solicitud</button>
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
      <p className="suave">Le enviaremos un enlace válido por 30 minutos. Por seguridad, la respuesta es la misma aunque la cuenta no exista.</p>
      {mensaje ? <Aviso tono="exito">{mensaje}</Aviso> : (
        <form className="columna" onSubmit={async (e) => { e.preventDefault(); const r: any = await api("/api/auth/password/olvide", { cuerpo: { email } }); setMensaje(r.mensaje); }}>
          <Campo etiqueta="Correo institucional"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
          <button className="boton"><Mail /> Enviar enlace</button>
        </form>
      )}
      <Link to="/login">Volver al inicio de sesión</Link>
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
          <Campo etiqueta="Contraseña nueva"><CampoClave valor={clave} onCambio={setClave} autocompletar="new-password" /></Campo>
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
  const [qr, setQr] = useState<{ secreto: string; qr_data_uri: string } | null>(null);
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
      <div><div className="sobretitulo">Seguridad de la cuenta</div><h1 style={{ marginTop: 6 }}>Configure su segundo factor</h1>
        <p className="suave" style={{ marginTop: 6 }}>Su rol maneja información sensible. Además de la contraseña, le pediremos un código que genera su teléfono (Google Authenticator, Microsoft Authenticator, FreeOTP u otra aplicación compatible).</p>
        <div style={{ marginTop: 14 }}><Pasos actual={codigos ? 2 : qr ? 1 : 0} nombres={["Generar código QR", "Escanear y confirmar", "Guardar códigos"]} /></div></div>
      {error && <Aviso tono="critico">{error}</Aviso>}
      {codigos ? (
        <div className="columna">
          <Aviso tono="exito">Segundo factor activado. Guarde estos códigos de recuperación en un lugar seguro: cada uno sirve una sola vez y no se volverán a mostrar.</Aviso>
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
            <img src={qr.qr_data_uri} alt="Código QR para su aplicación de autenticación" style={{ width: 190, height: 190, border: "1px solid var(--borde)", borderRadius: 12, background: "#fff", padding: 6 }} />
            <div className="pequeno" style={{ flex: 1 }}>
              <p>1. Escanee el código con su aplicación de autenticación.</p>
              <p style={{ marginTop: 6 }}>2. Si no puede escanearlo, escriba esta clave:</p>
              <p className="mono" style={{ wordBreak: "break-all", marginTop: 4 }}>{qr.secreto}</p>
            </div>
          </div>
          <Campo etiqueta="3. Escriba el código de 6 dígitos que muestra la aplicación"><input inputMode="numeric" required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="123456" /></Campo>
          <button className="boton"><Fingerprint /> Activar segundo factor</button>
        </form>
      )}
    </Plantilla>
  );
}
