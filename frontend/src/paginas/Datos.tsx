// Catálogo y linaje: qué datos usa Nexo, de dónde salen, cuándo se descargaron y con qué huella.
import { useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { avisar, Encabezado, Esqueleto, Insignia, Pestanas, Tabla, Tarjeta, useDatos } from "../componentes/ui";

export default function Datos() {
  const { puede } = useSesion();
  const [pestana, setPestana] = useState<"fuentes" | "catalogo">("fuentes");
  const { datos: fuentes } = useDatos<any[]>("/api/datos/fuentes");
  const [texto, setTexto] = useState("");
  const [usados, setUsados] = useState(false);
  const { datos: cat, recargar } = useDatos<any>(`/api/datos/catalogo?solo_usados=${usados}${texto.length >= 2 ? `&texto=${encodeURIComponent(texto)}` : ""}`);
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizar = async () => {
    setSincronizando(true);
    try { const r: any = await api("/api/datos/catalogo/sincronizar", { metodo: "POST" }); avisar(r.resumen); recargar(); }
    catch (e) { avisar((e as Error).message, "critico"); }
    finally { setSincronizando(false); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Catálogo y linaje de datos" subtitulo="Fuente principal: portal de datos abiertos del Instituto Nacional de Estadística. Cada archivo queda con su URL, fecha de descarga, licencia y huella SHA-256 para que cualquiera pueda reproducir las cifras." />
      <Pestanas opciones={[{ id: "fuentes", etiqueta: "Fuentes que usa Nexo" }, { id: "catalogo", etiqueta: "Catálogo del INE" }]} activa={pestana} onCambio={setPestana} />
      {pestana === "fuentes" ? (
        !fuentes ? <Esqueleto alto={300} /> : (
          <Tarjeta titulo={`${fuentes.length} archivos descargados`} ayuda="La fecha de descarga se muestra en hora de Guatemala.">
            <Tabla filas={fuentes} columnas={[
              { id: "t", titulo: "Conjunto de datos", valor: (f: any) => f.titulo, celda: (f: any) => <span><b>{f.titulo}</b><br /><span className="pequeno suave">{f.publicador}</span></span> },
              { id: "u", titulo: "Se usa en", valor: (f: any) => f.usado_en, celda: (f: any) => <span className="pequeno">{f.usado_en}</span> },
              { id: "l", titulo: "Licencia", valor: (f: any) => f.licencia, celda: (f: any) => <span className="pequeno">{f.licencia}</span> },
              { id: "d", titulo: "Descargado", valor: (f: any) => f.descargado_en, celda: (f: any) => fmt.fechaHora(f.descargado_en) },
              { id: "n", titulo: "Filas", num: true, valor: (f: any) => f.filas, celda: (f: any) => fmt.numero(f.filas) },
              { id: "h", titulo: "SHA-256", celda: (f: any) => f.sha256 && <button className="boton fantasma pequeno mono" title={f.sha256} onClick={() => { navigator.clipboard.writeText(f.sha256); avisar("Huella copiada."); }}>{f.sha256.slice(0, 10)}… <Copy size={12} /></button> },
              { id: "e", titulo: "", celda: (f: any) => <a href={f.pagina} target="_blank" rel="noreferrer noopener" aria-label="Página de origen"><ExternalLink size={15} /></a> },
            ]} />
          </Tarjeta>
        )
      ) : (
        <Tarjeta titulo={cat ? `${fmt.numero(cat.total)} conjuntos en el portal del INE` : "Catálogo del INE"}
          ayuda={cat?.sincronizado_en ? `Sincronizado ${fmt.relativo(cat.sincronizado_en)} con la API pública de datos.ine.gob.gt` : "Aún no se sincroniza."}
          acciones={puede("datos:sincronizar") && <button className="boton secundario pequeno" onClick={sincronizar} disabled={sincronizando}><RefreshCw /> {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}</button>}>
          <div className="fila" style={{ marginBottom: 10 }}>
            <input className="entrada" style={{ flex: 1 }} placeholder="Buscar: censo, IPC, educación, violencia…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <label className="casilla"><input type="checkbox" checked={usados} onChange={(e) => setUsados(e.target.checked)} /> Solo los que usa Nexo</label>
          </div>
          {!cat ? <Esqueleto /> : <Tabla maximo={150} filas={cat.conjuntos} vacio="Sin resultados. Si el catálogo está vacío, sincronícelo." columnas={[
            { id: "t", titulo: "Conjunto", valor: (c: any) => c.titulo, celda: (c: any) => <span><b>{c.titulo}</b> {c.usado_por_nexo && <Insignia tono="exito">en Nexo</Insignia>}<br /><span className="pequeno suave">{c.organizacion}</span></span> },
            { id: "r", titulo: "Recursos", num: true, valor: (c: any) => c.recursos },
            { id: "f", titulo: "Formatos", valor: (c: any) => c.formatos, celda: (c: any) => <span className="pequeno">{c.formatos}</span> },
            { id: "m", titulo: "Modificado", valor: (c: any) => c.modificado, celda: (c: any) => fmt.fecha(c.modificado) },
            { id: "e", titulo: "", celda: (c: any) => <a href={c.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir en el portal del INE"><ExternalLink size={15} /></a> },
          ]} />}
        </Tarjeta>
      )}
    </div>
  );
}
