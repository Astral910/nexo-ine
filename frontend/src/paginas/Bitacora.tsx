// Bitácora con evidencia de manipulación: consulta, verificación de la cadena y exportación.
// Vista Resumen: un botón grande para verificar, el resultado en palabras y las últimas acciones como frases.
import { useState } from "react";
import { Ban, Download, ScrollText, ShieldCheck } from "lucide-react";
import { api, fmt } from "../api";
import { Aviso, Encabezado, Esqueleto, EsqueletoKpis, EsqueletoTabla, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, useVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "El registro de todo lo que pasa en Nexo: quién hizo qué, cuándo y con qué resultado. Está protegido para que nadie pueda alterarlo sin que se note.",
  datos: "Cada acción de la plataforma: inicios de sesión, cambios, aprobaciones, validaciones, consultas y tareas automáticas. Cada registro guarda la huella del anterior y forma una cadena; una automatización la verifica cada hora.",
  pasos: [
    "Pulse «Verificar integridad» para comprobar que ningún registro fue alterado ni borrado.",
    "Lea las últimas acciones para saber qué pasó recientemente.",
    "En la vista Completa, filtre por módulo, resultado o tipo de acción.",
    "Exporte a CSV lo que necesite para una auditoría.",
  ],
  resumen: "La verificación en un botón, el resultado en palabras y las últimas acciones como frases.",
  completa: "Todos los eventos con filtros, su eslabón de la cadena y la exportación a CSV.",
  terminos: [
    ["Cadena de hashes", "Cada registro incluye la huella del anterior. Cambiar uno rompe todos los que siguen, como un sello en cadena."],
    ["HMAC-SHA256", "Huella calculada con una llave secreta del servidor: sin la llave, nadie puede rehacer la cadena después de alterarla."],
    ["Ancla", "Copia de la última huella guardada fuera de la base de datos, para detectar si alguien borró registros del final."],
    ["Eslabón", "La huella de un registro dentro de la cadena."],
    ["Denegado", "Alguien intentó hacer algo sin permiso. No se hizo, pero queda registrado."],
  ],
};

function frase(verificacion: any) {
  if (verificacion.integra) {
    return <>La bitácora está <b>íntegra</b>: se comprobaron {fmt.numero(verificacion.registros)} registros y ninguno fue alterado ni borrado
      {verificacion.ancla?.ts ? `. La última huella se ancló ${fmt.relativo(verificacion.ancla.ts)}` : ""}.</>;
  }
  return <>La cadena <b>se rompe en el registro {verificacion.roto_en}</b> ({verificacion.motivo}). Trátelo como un incidente de seguridad y avise al oficial de seguridad.</>;
}

function ResumenBitacora({ verificacion, verificar, verificando }: { verificacion: any; verificar: () => void; verificando: boolean }) {
  const { datos } = useDatos<any>("/api/bitacora");
  const { datos: denegados } = useDatos<any>("/api/bitacora?resultado=denegado");
  return (
    <>
      <EnPocasPalabras>
        {verificacion ? frase(verificacion)
          : <>Cada acción en Nexo queda registrada y encadenada con la anterior: si alguien altera o borra un registro, la verificación lo detecta.
            {datos ? <> Hay <b>{fmt.numero(datos.total)} eventos</b> registrados.</> : null}</>}
      </EnPocasPalabras>
      <div className="rejilla">
        <div className="c6">
          <div className="tarjeta verificar-integridad" style={{ height: "100%" }}>
            <h3>Comprobar que nadie alteró la bitácora</h3>
            <p>Nexo recalcula la cadena completa y la compara con la última huella guardada fuera de la base de datos. Una automatización lo hace sola cada hora.</p>
            <button type="button" className="boton grande" onClick={verificar} disabled={verificando}><ShieldCheck /> {verificando ? "Verificando…" : "Verificar integridad"}</button>
            {verificacion && <Aviso tono={verificacion.integra ? "exito" : "critico"}>{frase(verificacion)}</Aviso>}
          </div>
        </div>
        <div className="c6">
          {!datos ? <EsqueletoKpis n={2} /> : (
            <div className="rejilla escalonada">
              <div className="c6"><CifraClara etiqueta="Eventos registrados" icono={<ScrollText />} numero={datos.total} formato={(v) => fmt.numero(v)}
                significa="Inicios de sesión, cambios, aprobaciones y tareas automáticas; cada uno con fecha, persona y resultado." /></div>
              <div className="c6"><CifraClara tono="naranja" etiqueta="Acciones denegadas" icono={<Ban />} numero={denegados?.total ?? null} formato={(v) => fmt.numero(v)}
                significa="Intentos de hacer algo sin permiso. No se realizaron, pero quedan registrados para revisarlos." /></div>
            </div>
          )}
        </div>
      </div>
      <Tarjeta titulo="Lo último que pasó en Nexo" ayuda="Las acciones más recientes, escritas como frases.">
        {!datos ? <EsqueletoTabla filas={6} /> : (
          <ListaSimple vacio="Aún no hay eventos." elementos={datos.eventos.slice(0, 8).map((e: any) => ({
            estado: e.resultado === "ok" ? "info" : e.resultado === "denegado" ? "atencion" : "critico",
            titulo: e.texto,
            texto: `${fmt.fechaHora(e.ts)} · ${e.usuario} · módulo ${e.modulo}${e.resultado === "ok" ? "" : ` · ${e.resultado}`}`,
          }))} />
        )}
      </Tarjeta>
      <PieResumen fuente="bitácora de auditoría de Nexo, encadenada con HMAC-SHA256 y anclas fuera de la base de datos" />
    </>
  );
}

export default function Bitacora() {
  const { esResumen } = useVista();
  const [modulo, setModulo] = useState("");
  const [resultado, setResultado] = useState("");
  const [accion, setAccion] = useState("");
  const [pagina, setPagina] = useState(1);
  const q = new URLSearchParams({ ...(modulo && { modulo }), ...(resultado && { resultado }), ...(accion && { accion }), pagina: String(pagina) });
  const { datos } = useDatos<any>(esResumen ? null : `/api/bitacora?${q}`);
  const [verificacion, setVerificacion] = useState<any>(null);
  const [verificando, setVerificando] = useState(false);
  const verificar = async () => {
    setVerificando(true);
    try { setVerificacion(await api("/api/bitacora/verificar")); }
    finally { setVerificando(false); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Bitácora de auditoría" subtitulo="Cada acción queda encadenada con HMAC-SHA256 y una llave del servidor, y la verificación periódica deja anclas fuera de la base de datos. Si alguien altera, recalcula o borra registros, la verificación lo detecta."
        acciones={<>
          <BotonAyuda ayuda={AYUDA} />
          {!esResumen && <button className="boton" onClick={verificar} disabled={verificando}><ShieldCheck /> {verificando ? "Verificando…" : "Verificar integridad"}</button>}
          <a className="boton secundario" href={`/api/bitacora/exportar.csv?${q}`}><Download /> Exportar CSV</a>
        </>} />
      <SegunVista
        resumen={<ResumenBitacora verificacion={verificacion} verificar={verificar} verificando={verificando} />}
        completa={<>
          {verificacion && (verificacion.integra
            ? <Aviso tono="exito">Cadena íntegra: {fmt.numero(verificacion.registros)} registros verificados. Último hash {verificacion.ultimo_hash?.slice(0, 16)}… anclado {fmt.relativo(verificacion.ancla?.ts)}.</Aviso>
            : <Aviso tono="critico">La cadena se rompe en el registro {verificacion.roto_en}: {verificacion.motivo}. Trátelo como incidente de seguridad.</Aviso>)}
          <Tarjeta>
            <div className="fila" style={{ marginBottom: 10 }}>
              <select className="entrada" style={{ width: 180 }} value={modulo} onChange={(e) => { setModulo(e.target.value); setPagina(1); }} aria-label="Módulo">
                <option value="">Todos los módulos</option>{(datos?.modulos ?? []).map((m: string) => <option key={m}>{m}</option>)}
              </select>
              <select className="entrada" style={{ width: 160 }} value={resultado} onChange={(e) => { setResultado(e.target.value); setPagina(1); }} aria-label="Resultado">
                <option value="">Todo resultado</option><option value="ok">ok</option><option value="denegado">denegado</option><option value="error">error</option>
              </select>
              <input className="entrada" style={{ width: 220 }} placeholder="Acción (p. ej. auth.)" value={accion} onChange={(e) => { setAccion(e.target.value); setPagina(1); }} />
            </div>
            {!datos ? <Esqueleto alto={300} /> : (
              <>
                <Tabla filas={datos.eventos} columnas={[
                  { id: "i", titulo: "#", num: true, valor: (e: any) => e.id },
                  { id: "t", titulo: "Fecha", valor: (e: any) => e.ts, celda: (e: any) => fmt.fechaHora(e.ts) },
                  { id: "x", titulo: "Evento", valor: (e: any) => e.texto, celda: (e: any) => <span>{e.texto}<br /><span className="pequeno suave mono">{e.accion} {e.objeto}</span></span> },
                  { id: "m", titulo: "Módulo", valor: (e: any) => e.modulo },
                  { id: "r", titulo: "Resultado", valor: (e: any) => e.resultado, celda: (e: any) => <Severidad valor={e.resultado} /> },
                  { id: "h", titulo: "Eslabón", celda: (e: any) => <span className="mono" title={`previo ${e.hash_previo}\nhash ${e.hash}`}>{e.hash.slice(0, 10)}…</span> },
                ]} />
                <div className="fila espaciado pequeno" style={{ marginTop: 10 }}>
                  <span className="suave">{fmt.numero(datos.total)} eventos</span>
                  <div className="fila"><button className="boton secundario pequeno" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button><button className="boton secundario pequeno" disabled={pagina * 50 >= datos.total} onClick={() => setPagina(pagina + 1)}>Siguiente</button></div>
                </div>
              </>
            )}
          </Tarjeta>
        </>}
      />
    </div>
  );
}
