// Bitácora con evidencia de manipulación: consulta, verificación de la cadena y exportación.
import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { api, fmt } from "../api";
import { Aviso, Encabezado, Esqueleto, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";

export default function Bitacora() {
  const [modulo, setModulo] = useState("");
  const [resultado, setResultado] = useState("");
  const [accion, setAccion] = useState("");
  const [pagina, setPagina] = useState(1);
  const q = new URLSearchParams({ ...(modulo && { modulo }), ...(resultado && { resultado }), ...(accion && { accion }), pagina: String(pagina) });
  const { datos } = useDatos<any>(`/api/bitacora?${q}`);
  const [verificacion, setVerificacion] = useState<any>(null);
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Bitácora de auditoría" subtitulo="Cada acción queda encadenada con HMAC-SHA256 y una llave del servidor, y la verificación periódica deja anclas fuera de la base de datos. Si alguien altera, recalcula o borra registros, la verificación lo detecta."
        acciones={<>
          <button className="boton" onClick={async () => setVerificacion(await api("/api/bitacora/verificar"))}><ShieldCheck /> Verificar integridad</button>
          <a className="boton secundario" href={`/api/bitacora/exportar.csv?${q}`}><Download /> Exportar CSV</a>
        </>} />
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
    </div>
  );
}
