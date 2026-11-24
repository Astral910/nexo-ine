// Índices y Estadísticas Continuas: IPC, CBA, IPMC, alertas de precios atípicos y catálogo de artículos.
import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Play } from "lucide-react";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Grafica, opcionBarras, opcionLinea } from "../componentes/Grafica";
import { Aviso, avisar, Campo, Encabezado, Esqueleto, FuenteCita, Kpi, Modal, Pestanas, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";

function Resumen() {
  const { datos: r } = useDatos<any>("/api/indices/resumen");
  const { datos: rep } = useDatos<any>("/api/indices/series?indicador=IPC&ambito=republica_var&desde_anio=2019");
  const { datos: reg } = useDatos<any>("/api/indices/series?indicador=IPC&ambito=region&desde_anio=2024");
  const { datos: cba } = useDatos<any>("/api/indices/series?indicador=CBA&desde_anio=2024");
  const serie = (d: any, filtro?: (c: string) => boolean) => (d?.series ?? []).filter((s: any) => !filtro || filtro(s.clave)).map((s: any) => ({ nombre: s.clave, puntos: s.puntos.map((p: any) => [p.x, p.valor]) }));
  if (!r) return <Esqueleto alto={300} />;
  return (
    <div className="columna" style={{ gap: 16 }}>
      <div className="rejilla">
        <div className="c3"><Kpi etiqueta="IPC República (2024=100)" valor={fmt.numero(r.ipc.indice, 2)} detalle={`Periodo ${r.ipc.periodo}`} /></div>
        <div className="c3"><Kpi tono="naranja" etiqueta="Inflación interanual" valor={fmt.pct(r.ipc.interanual, 2)} detalle={`Mensual ${fmt.pct(r.ipc.mensual, 2)}`} /></div>
        <div className="c3"><Kpi tono="verde" etiqueta="CBA urbana por persona" valor={fmt.moneda(r.cba.urbana)} detalle={`Rural ${fmt.moneda(r.cba.rural)} · ${r.cba.periodo}`} /></div>
        <div className="c3"><Kpi tono="morado" etiqueta="Alertas por revisar" valor={fmt.numero(r.alertas.nuevas)} detalle={`${fmt.numero(r.alertas.altas)} de severidad alta`} /></div>
      </div>
      <div className="rejilla">
        <div className="c6"><Tarjeta titulo="Inflación: variación interanual y mensual (%)">{rep ? <Grafica opcion={opcionLinea(serie(rep), (v) => fmt.pct(v, 1))} /> : <Esqueleto />}<FuenteCita>INE, Empalme del IPC por República, base anual 2024=100.</FuenteCita></Tarjeta></div>
        <div className="c6"><Tarjeta titulo="IPC por región (2024=100)">{reg ? <Grafica opcion={opcionLinea(serie(reg), (v) => fmt.numero(v, 1))} /> : <Esqueleto />}<FuenteCita>INE, Empalme del IPC por Región, base anual 2024=100.</FuenteCita></Tarjeta></div>
        <div className="c6"><Tarjeta titulo="Costo mensual per cápita de la canasta básica alimentaria (Q)">{cba ? <Grafica opcion={opcionLinea(serie(cba), (v) => fmt.moneda(v, 0))} /> : <Esqueleto />}<FuenteCita>INE, costo de la CBA urbana y rural 2024-2026.</FuenteCita></Tarjeta></div>
        <div className="c6">
          <Tarjeta titulo={`Índice de Precios de Materiales de Construcción · ${r.ipmc.periodo}`} ayuda="Índices por artículo tal como los publica el INE">
            <Tabla maximo={12} filas={r.ipmc.articulos} columnas={[
              { id: "a", titulo: "Artículo", valor: (x: any) => x.articulo },
              { id: "i", titulo: "Índice", num: true, valor: (x: any) => x.indice, celda: (x: any) => fmt.numero(x.indice, 2) },
            ]} />
            <FuenteCita>INE, IPMC mensual.</FuenteCita>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

function Alertas() {
  const { puede } = useSesion();
  const [params, setParams] = useSearchParams();
  const periodo = params.get("periodo") ?? "";
  const [severidad, setSeveridad] = useState("");
  const [estado, setEstado] = useState("nueva");
  const [texto, setTexto] = useState("");
  const [pagina, setPagina] = useState(1);
  const { datos: resumen } = useDatos<any>("/api/indices/alertas/resumen");
  const consulta = new URLSearchParams({ ...(periodo && { periodo }), ...(severidad && { severidad }), ...(estado && { estado }), ...(texto && { texto }), pagina: String(pagina) });
  const { datos, recargar } = useDatos<any>(`/api/indices/alertas?${consulta}`);
  const [revisar, setRevisar] = useState<any>(null);
  const [detectando, setDetectando] = useState(false);
  useEffect(() => setPagina(1), [periodo, severidad, estado, texto]);
  const detectar = async () => {
    if (!periodo) { avisar("Elija un periodo para recalcular.", "alerta"); return; }
    setDetectando(true);
    try { const r: any = await api("/api/indices/alertas/detectar", { cuerpo: { periodo, c: 4 } }); avisar(`${r.alertas} alertas (${(r.proporcion * 100).toFixed(1)} %) con ${r.metodo}.`); recargar(); }
    finally { setDetectando(false); }
  };
  return (
    <div className="columna" style={{ gap: 14 }}>
      <Aviso tono="info">
        <b>Crítica de precios.</b> En julio 2022 el archivo público trae precio anterior y actual por informante codificado: se aplica <b>Hidiroglou-Berthelot</b> a los relativos de precio. En 2023 no trae código de informante, así que se marcan precios cuyo <b>nivel</b> se aleja de la mediana del mismo artículo y mes (mediana y MAD). Un precio sin cambio nunca se marca como atípico.
      </Aviso>
      <div className="fila">
        <select className="entrada" style={{ width: 160 }} value={periodo} onChange={(e) => setParams(e.target.value ? { periodo: e.target.value } : {})} aria-label="Periodo">
          <option value="">Todos los periodos</option>
          {(resumen?.periodos_disponibles ?? []).map((p: string) => <option key={p} value={p}>{p} ({resumen?.por_periodo?.[p] ?? 0})</option>)}
        </select>
        <select className="entrada" style={{ width: 150 }} value={severidad} onChange={(e) => setSeveridad(e.target.value)} aria-label="Severidad">
          <option value="">Toda severidad</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
        </select>
        <select className="entrada" style={{ width: 160 }} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todo estado</option><option value="nueva">Nuevas</option><option value="en_revision">En revisión</option><option value="confirmada">Confirmadas</option><option value="descartada">Descartadas</option>
        </select>
        <input className="entrada" style={{ width: 200 }} placeholder="Artículo…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        {puede("indices:alertas") && <button className="boton secundario" onClick={detectar} disabled={detectando}><Play /> {detectando ? "Calculando…" : "Recalcular periodo"}</button>}
      </div>
      {!datos ? <Esqueleto alto={300} /> : (
        <>
          <Tabla filas={datos.alertas} onFila={puede("indices:alertas") ? setRevisar : undefined} vacio="Sin alertas con estos filtros." columnas={[
            { id: "p", titulo: "Periodo", valor: (a: any) => a.periodo },
            { id: "a", titulo: "Artículo", valor: (a: any) => a.articulo },
            { id: "d", titulo: "Lugar", valor: (a: any) => a.departamento, celda: (a: any) => <span className="pequeno">{a.departamento}<br /><span className="suave">{a.municipio}</span></span> },
            { id: "i", titulo: "Informante", valor: (a: any) => a.informante, celda: (a: any) => <span className="mono">{a.informante}</span> },
            { id: "pa", titulo: "Antes", num: true, valor: (a: any) => a.precio_anterior, celda: (a: any) => fmt.moneda(a.precio_anterior) },
            { id: "pc", titulo: "Ahora", num: true, valor: (a: any) => a.precio_actual, celda: (a: any) => fmt.moneda(a.precio_actual) },
            { id: "r", titulo: "Relativo", num: true, valor: (a: any) => a.relativo, celda: (a: any) => `${fmt.numero(a.relativo, 2)} (med. ${fmt.numero(a.mediana_grupo, 2)})` },
            { id: "s", titulo: "Severidad", valor: (a: any) => a.orden, celda: (a: any) => <Severidad valor={a.severidad} /> },
            { id: "e", titulo: "Estado", valor: (a: any) => a.estado, celda: (a: any) => <Severidad valor={a.estado} /> },
          ]} />
          <div className="fila espaciado pequeno">
            <span className="suave">{fmt.numero(datos.total)} alertas · página {datos.pagina}</span>
            <div className="fila"><button className="boton secundario pequeno" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button><button className="boton secundario pequeno" disabled={pagina * 50 >= datos.total} onClick={() => setPagina(pagina + 1)}>Siguiente</button></div>
          </div>
          <FuenteCita>INE, precios recolectados del IPC (julio 2022 y año 2023). Cálculo de alertas: Nexo.</FuenteCita>
        </>
      )}
      {revisar && <RevisarAlerta alerta={revisar} onCerrar={() => { setRevisar(null); recargar(); }} />}
    </div>
  );
}

function RevisarAlerta({ alerta, onCerrar }: { alerta: any; onCerrar: () => void }) {
  const [estado, setEstado] = useState(alerta.estado === "nueva" ? "confirmada" : alerta.estado);
  const [comentario, setComentario] = useState(alerta.comentario ?? "");
  const [error, setError] = useState("");
  return (
    <Modal titulo={`Revisar alerta · ${alerta.articulo}`} onCerrar={onCerrar}>
      <div className="columna">
        <p className="pequeno">{alerta.departamento}, {alerta.municipio} · informante <span className="mono">{alerta.informante}</span> · {alerta.periodo}</p>
        <div className="rejilla">
          <div className="c4"><Kpi etiqueta="Precio anterior" valor={fmt.moneda(alerta.precio_anterior)} /></div>
          <div className="c4"><Kpi tono="naranja" etiqueta="Precio actual" valor={fmt.moneda(alerta.precio_actual)} /></div>
          <div className="c4"><Kpi tono="morado" etiqueta="Relativo / mediana" valor={`${fmt.numero(alerta.relativo, 2)} / ${fmt.numero(alerta.mediana_grupo, 2)}`} detalle={`n = ${alerta.n_grupo} · ${alerta.metodo}`} /></div>
        </div>
        {error && <Aviso tono="critico">{error}</Aviso>}
        <Campo etiqueta="Decisión"><select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="confirmada">Confirmar: el precio es correcto (cambio real)</option>
          <option value="descartada">Descartar: error de captura (corregir con la fuente)</option>
          <option value="en_revision">En revisión con el recolector</option>
        </select></Campo>
        <Campo etiqueta="Comentario (obligatorio para confirmar o descartar; queda en la bitácora)"><textarea value={comentario} onChange={(e) => setComentario(e.target.value)} /></Campo>
        <button className="boton" onClick={async () => {
          try { await api(`/api/indices/alertas/${alerta.id}`, { metodo: "PATCH", cuerpo: { estado, comentario } }); avisar("Alerta revisada."); onCerrar(); }
          catch (e) { setError((e as Error).message); }
        }}>Guardar revisión</button>
      </div>
    </Modal>
  );
}

function Catalogo() {
  const [texto, setTexto] = useState("");
  const { datos } = useDatos<any[]>(`/api/indices/articulos${texto.length >= 2 ? `?texto=${encodeURIComponent(texto)}` : ""}`);
  const navegar = useNavigate();
  return (
    <div className="columna">
      <Aviso tono="info">Catálogo digital de artículos del IPC con su cobertura: base para el «Manual de Características» en dispositivos móviles que propuso la DIEC.</Aviso>
      <input className="entrada" placeholder="Busque un artículo: frijol, gas propano, cuaderno…" value={texto} onChange={(e) => setTexto(e.target.value)} />
      {!datos ? <Esqueleto alto={300} /> : (
        <Tabla maximo={150} filas={datos} onFila={(a: any) => navegar(`/indices/articulo/${a.codigo}`)} columnas={[
          { id: "c", titulo: "Código", valor: (a: any) => a.codigo, celda: (a: any) => <span className="mono">{a.codigo}</span> },
          { id: "a", titulo: "Artículo", valor: (a: any) => a.articulo },
          { id: "o", titulo: "Observaciones", num: true, valor: (a: any) => a.observaciones, celda: (a: any) => fmt.numero(a.observaciones) },
          { id: "d", titulo: "Departamentos", num: true, valor: (a: any) => a.departamentos },
          { id: "u", titulo: "Último periodo", valor: (a: any) => a.ultimo_periodo },
        ]} />
      )}
    </div>
  );
}

function Articulo() {
  const { codigo } = useParams();
  const { datos } = useDatos<any>(`/api/indices/articulos/${codigo}`);
  const linea = useMemo(() => datos ? opcionLinea([{ nombre: "Precio unitario mediano", puntos: datos.por_mes.map((p: any) => [p.x, p.mediana]) }], (v) => fmt.moneda(v)) : null, [datos]);
  if (!datos) return <Esqueleto alto={300} />;
  const deptos = datos.por_departamento.filter((d: any) => !d.suprimido).slice(0, 22);
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado migas={<><Link to="/indices">Índices</Link> › <Link to="/indices/catalogo">Catálogo</Link> ›</>} titulo={datos.articulo} subtitulo={<>Código {datos.codigo}. {datos.nota}</>} />
      <div className="rejilla">
        <div className="c6"><Tarjeta titulo="Precio unitario mediano por mes">{linea && <Grafica opcion={linea} />}</Tarjeta></div>
        <div className="c6"><Tarjeta titulo="Precio unitario mediano por departamento"><Grafica opcion={opcionBarras(deptos.map((d: any) => d.x), deptos.map((d: any) => d.mediana), true, (v) => fmt.moneda(v))} alto={Math.max(260, deptos.length * 24)} /></Tarjeta></div>
      </div>
      <FuenteCita>INE, precios recolectados del IPC. Supresión por secreto estadístico aplicada.</FuenteCita>
    </div>
  );
}

export default function Indices() {
  const navegar = useNavigate();
  const params = useParams();
  const sub = (params["*"] ?? "").split("/")[0] || "resumen";
  return (
    <div className="columna" style={{ gap: 16 }}>
      {!sub.startsWith("articulo") && <Encabezado titulo="Índices y Estadísticas Continuas" subtitulo="IPC base 2024, canasta básica, materiales de construcción y la crítica automática de los precios recolectados." />}
      {!sub.startsWith("articulo") && <Pestanas opciones={[{ id: "resumen", etiqueta: "Resumen" }, { id: "alertas", etiqueta: "Alertas de precios" }, { id: "catalogo", etiqueta: "Catálogo de artículos" }]} activa={sub as any} onCambio={(id) => navegar(`/indices/${id === "resumen" ? "" : id}`)} />}
      <Routes>
        <Route index element={<Resumen />} />
        <Route path="alertas" element={<Alertas />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="articulo/:codigo" element={<Articulo />} />
      </Routes>
    </div>
  );
}
