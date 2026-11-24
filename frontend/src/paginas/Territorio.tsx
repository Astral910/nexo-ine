// Territorio: país, departamentos, ficha municipal (Censo 2018 y proyecciones) y avance de operativos de campo.
import { useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionLinea } from "../componentes/Grafica";
import { MapaGT } from "../componentes/MapaGT";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, FuenteCita, Kpi, Modal, Pestanas, Progreso, Tabla, Tarjeta, useDatos } from "../componentes/ui";

function Pais() {
  const { datos } = useDatos<any>("/api/territorio/departamentos");
  const [depto, setDepto] = useState("");
  const { datos: munis } = useDatos<any[]>(depto ? `/api/territorio/municipios?departamento=${encodeURIComponent(depto)}` : null);
  const navegar = useNavigate();
  const [buscar, setBuscar] = useState("");
  const { datos: lugares } = useDatos<any[]>(buscar.length >= 3 ? `/api/territorio/lugares?texto=${encodeURIComponent(buscar)}` : null);
  if (!datos) return <Esqueleto alto={400} />;
  const total = datos.departamentos.reduce((s: number, d: any) => s + d.poblacion_2018, 0);
  const proy = datos.departamentos.reduce((s: number, d: any) => s + d.poblacion_proyectada, 0);
  return (
    <div className="columna" style={{ gap: 16 }}>
      <div className="rejilla">
        <div className="c3"><Kpi etiqueta="Población censada 2018" valor={fmt.numero(total)} detalle="XII Censo Nacional de Población" /></div>
        <div className="c3"><Kpi tono="morado" etiqueta={`Población proyectada ${datos.anio_proyeccion}`} valor={fmt.numero(proy)} detalle="Estimaciones y proyecciones del INE" /></div>
        <div className="c3"><Kpi tono="verde" etiqueta="Lugares poblados" valor={fmt.numero(datos.departamentos.reduce((s: number, d: any) => s + d.lugares_poblados, 0))} detalle="Con centroide georreferenciado" /></div>
        <div className="c3"><Kpi tono="naranja" etiqueta="Municipios" valor={fmt.numero(datos.departamentos.reduce((s: number, d: any) => s + d.municipios, 0))} detalle="22 departamentos" /></div>
      </div>
      <div className="rejilla">
        <div className="c7"><Tarjeta titulo={depto ? `Lugares poblados de ${depto}` : "Guatemala en 20 mil lugares poblados"} acciones={depto && <button className="boton fantasma pequeno" onClick={() => setDepto("")}>Ver todo el país</button>}><MapaGT departamento={depto || undefined} /></Tarjeta></div>
        <div className="c5">
          <Tarjeta titulo="Buscar un lugar poblado">
            <input className="entrada" placeholder="Nombre de aldea, caserío, colonia…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            {lugares && <div style={{ marginTop: 10 }}><Tabla maximo={10} filas={lugares} onFila={(l: any) => navegar(`/territorio/municipio/${l.cod_municipio}`)} columnas={[
              { id: "n", titulo: "Lugar", valor: (l: any) => l.nombre, celda: (l: any) => <span>{l.nombre}<br /><span className="pequeno suave">{l.municipio}, {l.departamento}</span></span> },
              { id: "p", titulo: "Población", num: true, valor: (l: any) => l.poblacion, celda: (l: any) => fmt.numero(l.poblacion) },
            ]} /></div>}
          </Tarjeta>
          <div style={{ height: 16 }} />
          <Tarjeta titulo="Departamentos" ayuda="Toca uno para ver sus municipios">
            <Tabla filas={datos.departamentos} onFila={(d: any) => setDepto(d.departamento)} columnas={[
              { id: "d", titulo: "Departamento", valor: (d: any) => d.departamento },
              { id: "p", titulo: "2018", num: true, valor: (d: any) => d.poblacion_2018, celda: (d: any) => fmt.numero(d.poblacion_2018) },
              { id: "x", titulo: String(datos.anio_proyeccion), num: true, valor: (d: any) => d.poblacion_proyectada, celda: (d: any) => fmt.numero(d.poblacion_proyectada) },
              { id: "m", titulo: "Mujeres", num: true, valor: (d: any) => d.mujeres_pct, celda: (d: any) => fmt.pct(d.mujeres_pct) },
            ]} />
          </Tarjeta>
        </div>
      </div>
      {munis && (
        <Tarjeta titulo={`Municipios de ${depto}`}>
          <Tabla filas={munis} onFila={(m: any) => navegar(`/territorio/municipio/${m.codigo}`)} columnas={[
            { id: "c", titulo: "Código", valor: (m: any) => m.codigo, celda: (m: any) => <span className="mono">{m.codigo}</span> },
            { id: "m", titulo: "Municipio", valor: (m: any) => m.municipio },
            { id: "p", titulo: "Población 2018", num: true, valor: (m: any) => m.poblacion_2018, celda: (m: any) => fmt.numero(m.poblacion_2018) },
            { id: "l", titulo: "Lugares poblados", num: true, valor: (m: any) => m.lugares_poblados },
          ]} />
        </Tarjeta>
      )}
    </div>
  );
}

function Municipio() {
  const { codigo } = useParams();
  const { datos } = useDatos<any>(`/api/territorio/municipios/${codigo}`);
  const proy = useMemo(() => datos ? opcionLinea([{ nombre: "Población proyectada", puntos: datos.proyeccion.map((p: any) => [String(p.anio), p.poblacion]) }], (v) => fmt.numero(v)) : null, [datos]);
  if (!datos) return <Esqueleto alto={400} />;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado migas={<><Link to="/territorio">Territorio</Link> › {datos.departamento} ›</>} titulo={datos.municipio} subtitulo={`Ficha municipal con datos del Censo 2018 y proyecciones del INE. Código ${datos.codigo}.`} />
      <div className="rejilla">
        <div className="c3"><Kpi etiqueta="Población 2018" valor={fmt.numero(datos.poblacion_2018)} detalle={`${fmt.numero(datos.mujeres)} mujeres · ${fmt.numero(datos.hombres)} hombres`} /></div>
        <div className="c3"><Kpi tono="verde" etiqueta="Población urbana" valor={fmt.pct(datos.urbana_pct)} detalle="Según área del lugar poblado" /></div>
        <div className="c3"><Kpi tono="morado" etiqueta="Lugares poblados" valor={fmt.numero(datos.lugares_poblados)} /></div>
        <div className="c3"><Kpi tono="naranja" etiqueta="Proyección 2030" valor={fmt.numero(datos.proyeccion.find((p: any) => p.anio === 2030)?.poblacion)} /></div>
      </div>
      <div className="rejilla">
        <div className="c6"><Tarjeta titulo="Lugares poblados del municipio"><MapaGT puntos={datos.puntos.map((p: number[]) => [...p, 3])} alto={360} /></Tarjeta></div>
        <div className="c6"><Tarjeta titulo="Población proyectada 2015-2030">{proy && <Grafica opcion={proy} />}<FuenteCita>{datos.fuente}</FuenteCita></Tarjeta></div>
      </div>
      <Tarjeta titulo="Lugares poblados con más población">
        <Tabla filas={datos.principales} columnas={[
          { id: "n", titulo: "Lugar poblado", valor: (l: any) => l.nombre },
          { id: "a", titulo: "Área", valor: (l: any) => l.area },
          { id: "p", titulo: "Población 2018", num: true, valor: (l: any) => l.poblacion, celda: (l: any) => fmt.numero(l.poblacion) },
          { id: "c", titulo: "Código", valor: (l: any) => l.codigo, celda: (l: any) => <span className="mono">{l.codigo}</span> },
        ]} />
      </Tarjeta>
    </div>
  );
}

function Operativos() {
  const { puede } = useSesion();
  const { datos: lista } = useDatos<any[]>("/api/territorio/operativos");
  const nombre = lista?.[0]?.operativo;
  const { datos, recargar } = useDatos<any>(nombre ? `/api/territorio/operativos/${encodeURIComponent(nombre)}` : null);
  const [depto, setDepto] = useState("");
  const [editando, setEditando] = useState<any>(null);
  const [valor, setValor] = useState("");
  if (!lista) return <Esqueleto alto={300} />;
  if (!lista.length) return <Aviso tono="info">No hay operativos registrados.</Aviso>;
  if (!datos) return <Esqueleto alto={300} />;
  const guardar = async () => {
    if (!editando) return;
    await api(`/api/territorio/operativos/${encodeURIComponent(nombre)}/${editando.codigo}`, { metodo: "PATCH", cuerpo: { completados: Number(valor) } });
    avisar("Avance actualizado."); setEditando(null); recargar();
  };
  const actualizar = (m: any) => { setEditando(m); setValor(String(m.completados)); };
  return (
    <div className="columna" style={{ gap: 16 }}>
      {datos.es_demo && <Aviso tono="alerta">{datos.nota}</Aviso>}
      <div className="rejilla">
        {datos.departamentos.map((d: any) => (
          <button key={d.departamento} className="c3 tarjeta" style={{ textAlign: "left", cursor: "pointer", border: depto === d.departamento ? "2px solid var(--ine-celeste)" : undefined }} onClick={() => setDepto(depto === d.departamento ? "" : d.departamento)}>
            <div className="fila espaciado"><b>{d.departamento}</b><span className="pequeno">{fmt.pct(d.avance_pct)}</span></div>
            <Progreso valor={d.avance_pct} color={d.avance_pct < 50 ? "#FF5500" : d.avance_pct < 80 ? "#0080FF" : "#2f8f2f"} />
            <div className="pequeno suave" style={{ marginTop: 4 }}>{fmt.numero(d.completados)} de {fmt.numero(d.meta)} lugares · {d.municipios} municipios</div>
          </button>
        ))}
      </div>
      <Tarjeta titulo={depto ? `Municipios de ${depto}` : "Municipios más rezagados"} ayuda={puede("territorio:gestionar") ? "Toca un municipio para registrar su avance." : undefined}>
        <Tabla maximo={60} filas={datos.municipios.filter((m: any) => !depto || m.departamento === depto).sort((a: any, b: any) => a.avance_pct - b.avance_pct)}
          onFila={puede("territorio:gestionar") ? actualizar : undefined} columnas={[
            { id: "m", titulo: "Municipio", valor: (m: any) => m.municipio, celda: (m: any) => <span>{m.municipio}<br /><span className="pequeno suave">{m.departamento}</span></span> },
            { id: "d", titulo: "Delegación", valor: (m: any) => m.delegacion },
            { id: "a", titulo: "Avance", valor: (m: any) => m.avance_pct, celda: (m: any) => <div style={{ minWidth: 140 }}><Progreso valor={m.avance_pct} /><span className="pequeno">{fmt.pct(m.avance_pct)}</span></div> },
            { id: "c", titulo: "Completados / meta", num: true, valor: (m: any) => m.completados, celda: (m: any) => `${fmt.numero(m.completados)} / ${fmt.numero(m.meta)}` },
          ]} />
      </Tarjeta>
      {editando && (
        <Modal titulo={`Avance en ${editando.municipio}`} onCerrar={() => setEditando(null)}>
          <div className="columna">
            <Campo etiqueta={`Lugares poblados completados (meta ${fmt.numero(editando.meta)})`}>
              <input type="number" min={0} max={editando.meta} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            </Campo>
            <button className="boton" onClick={guardar}>Guardar avance</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Territorio() {
  const navegar = useNavigate();
  const params = useParams();
  const sub = (params["*"] ?? "").split("/")[0] || "pais";
  const { puede } = useSesion();
  return (
    <div className="columna" style={{ gap: 16 }}>
      {sub !== "municipio" && <Encabezado titulo="Territorio y operativos" subtitulo="Consultas por departamento, municipio y lugar poblado con el Censo 2018 y las proyecciones del INE, y seguimiento del avance de campo por delegación." />}
      {sub !== "municipio" && <Pestanas opciones={[{ id: "pais", etiqueta: "País y municipios" }, ...(puede("territorio:ver") ? [{ id: "operativos", etiqueta: "Avance de operativos" }] : [])]} activa={sub as any} onCambio={(id) => navegar(id === "pais" ? "/territorio" : `/territorio/${id}`)} />}
      <Routes>
        <Route index element={<Pais />} />
        <Route path="operativos" element={<Operativos />} />
        <Route path="municipio/:codigo" element={<Municipio />} />
      </Routes>
    </div>
  );
}
