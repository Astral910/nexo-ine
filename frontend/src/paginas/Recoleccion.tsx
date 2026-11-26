// Recolección de precios del IPP (sector agrícola), el IPMC y el ICC: retos que propuso la DIEC.
// Vista «Resumen»: cobertura del mes en una frase, tres cifras explicadas, captura con validación inmediata y lo que
// toca revisar o recolectar. Vista «Completa»: todos los precios del mes con su variación, informantes y productos.
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Save, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { api, fmt } from "../api";
import { useSesion } from "../auth";
import { Aviso, avisar, Campo, Encabezado, EsqueletoKpis, EsqueletoTabla, FuenteCita, Insignia, Modal, Pestanas, Severidad, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, type AyudaPantalla } from "../componentes/vista";

type Indice = "IPP" | "IPMC" | "ICC";
const NOMBRES: Record<Indice, string> = {
  IPP: "IPP agrícola",
  IPMC: "Materiales de construcción (IPMC)",
  ICC: "Costos de construcción (ICC)",
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesTexto = (p?: string | null) => {
  const m = /^(\d{4})-(\d{2})/.exec(p ?? "");
  return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : "—";
};
const conSigno = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${fmt.numero(v, 1)} %`);

const AYUDA: AyudaPantalla = {
  titulo: "Cómo leer la recolección de precios",
  que: "La captura mensual de precios del Índice de Precios del Productor (sector agrícola), del índice de materiales de construcción y del índice de costos de construcción: quién informa, qué productos, cuánto falta por recolectar y qué precios conviene confirmar.",
  datos: "Los precios los captura el personal de la DIEC. En este prototipo los informantes, productos y precios son de demostración (marcados así): el INE no publica los precios individuales del IPP, el IPMC ni el ICC.",
  pasos: [
    "Elija el índice arriba.",
    "Capture el precio del mes: Nexo le dice de inmediato cuánto varió y si conviene confirmarlo.",
    "Revise los precios marcados y los pendientes de recolectar.",
  ],
  resumen: "La cobertura del mes, los precios para revisar y la captura de un precio.",
  completa: "Todos los precios del mes con su variación, y los informantes y productos de cada índice.",
  terminos: [
    ["Informante", "Empresa, finca o persona que da el precio. Su nombre es confidencial: solo lo ve la DIEC; los demás ven un código."],
    ["Cobertura", "Precios capturados este mes ÷ precios esperados (los que se recolectaron el mes anterior o ya llegaron este mes)."],
    ["Hidiroglou-Berthelot", "Método que usan los institutos de estadística para encontrar variaciones inusuales: compara cada precio con lo que cambió el mismo producto con los demás informantes, y da más peso a los precios grandes."],
    ["Regla simple", "Cuando un producto tiene menos de 5 precios en el mes, se marca si varió más de 20 % respecto a la mediana."],
  ],
};

function Captura({ indice, informantes, productos, periodo, onGuardado }: {
  indice: Indice; informantes: any[]; productos: any[]; periodo: string; onGuardado: () => void;
}) {
  const [inf, setInf] = useState<number | "">("");
  const [prod, setProd] = useState<number | "">("");
  const [mes, setMes] = useState(periodo);
  const [precio, setPrecio] = useState("");
  const [obs, setObs] = useState("");
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { setInf(""); setProd(""); setResultado(null); setError(""); }, [indice]);
  useEffect(() => { if (periodo) setMes(periodo); }, [periodo]);
  const guardar = async () => {
    setError("");
    try {
      const r = await api("/api/recoleccion/precios", { cuerpo: { informante_id: inf, producto_id: prod, periodo: mes, precio: Number(precio), observacion: obs } });
      setResultado(r);
      setPrecio(""); setObs("");
      avisar(r.atipico ? "Precio guardado y marcado para revisar" : "Precio guardado", r.atipico ? "alerta" : "exito");
      onGuardado();
    } catch (e) { setError((e as Error).message); }
  };
  const activos = informantes.filter((i) => i.activo);
  return (
    <Tarjeta titulo={<><Save size={18} style={{ verticalAlign: -3 }} /> Capturar un precio</>} ayuda="Nexo compara el precio con el del mes anterior en cuanto lo guarda.">
      <div className="columna">
        <div className="fila" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 220 }}><Campo etiqueta="Informante">
            <select value={inf} onChange={(e) => setInf(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Elija…</option>
              {activos.map((i) => <option key={i.id} value={i.id}>{i.codigo} · {i.nombre ?? i.actividad} ({i.municipio || i.departamento})</option>)}
            </select></Campo></div>
          <div style={{ flex: 2, minWidth: 220 }}><Campo etiqueta="Producto">
            <select value={prod} onChange={(e) => setProd(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Elija…</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.unidad}</option>)}
            </select></Campo></div>
          <div style={{ flex: 1, minWidth: 130 }}><Campo etiqueta="Mes"><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></Campo></div>
          <div style={{ flex: 1, minWidth: 130 }}><Campo etiqueta="Precio (Q)"><input type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Campo></div>
        </div>
        <Campo etiqueta="Observación (opcional)" ayuda="Por ejemplo: cambio de presentación, oferta, cosecha nueva."><input value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)} /></Campo>
        <div className="fila"><button className="boton" disabled={!inf || !prod || !mes || !(Number(precio) > 0)} onClick={guardar}><Save /> Guardar precio</button></div>
        {error && <Aviso tono="alerta">{error}</Aviso>}
        {resultado && <Aviso tono={resultado.atipico ? "alerta" : "exito"}>{resultado.mensaje}</Aviso>}
      </div>
    </Tarjeta>
  );
}

function NuevoRegistro({ tipo, indice, onCerrar, onCreado }: { tipo: "informante" | "producto"; indice: Indice; onCerrar: () => void; onCreado: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ nombre: "", actividad: "", departamento: "", municipio: "", unidad: "Unidad", grupo: "", especificacion: "" });
  const [error, setError] = useState("");
  const campo = (k: string, etiqueta: string, ayuda?: string) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Campo>
  );
  const crear = async () => {
    setError("");
    try {
      const cuerpo = tipo === "informante"
        ? { indice, nombre: f.nombre, actividad: f.actividad, departamento: f.departamento, municipio: f.municipio }
        : { indice, nombre: f.nombre, unidad: f.unidad, grupo: f.grupo, especificacion: f.especificacion };
      const r = await api(`/api/recoleccion/${tipo === "informante" ? "informantes" : "productos"}`, { cuerpo });
      avisar(`${tipo === "informante" ? "Informante" : "Producto"} ${r.codigo} registrado`);
      onCreado(); onCerrar();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Modal titulo={`Nuevo ${tipo} · ${NOMBRES[indice]}`} onCerrar={onCerrar}>
      <div className="columna">
        {tipo === "informante" ? (
          <>
            {campo("nombre", "Nombre del informante", "Confidencial: solo lo ve la DIEC. Los demás roles verán el código.")}
            {campo("actividad", "Actividad", "Por ejemplo: finca cafetalera, ferretería, empresa constructora.")}
            <div className="fila">{campo("departamento", "Departamento")}{campo("municipio", "Municipio")}</div>
          </>
        ) : (
          <>
            {campo("nombre", "Producto")}
            <div className="fila">{campo("unidad", "Unidad de medida")}{campo("grupo", "Grupo")}</div>
            {campo("especificacion", "Especificación", "Las características que el recolector debe verificar.")}
          </>
        )}
        {error && <Aviso tono="alerta">{error}</Aviso>}
        <div className="fila"><button className="boton" disabled={f.nombre.trim().length < 2} onClick={crear}><Plus /> Registrar</button></div>
      </div>
    </Modal>
  );
}

export default function Recoleccion() {
  const { puede } = useSesion();
  const captura = puede("indices:alertas");
  const [indice, setIndice] = useState<Indice>("IPP");
  const [nuevo, setNuevo] = useState<"informante" | "producto" | null>(null);
  const resumen = useDatos<any>("/api/recoleccion/resumen");
  const precios = useDatos<any>(`/api/recoleccion/precios?indice=${indice}`);
  const informantes = useDatos<any[]>(`/api/recoleccion/informantes?indice=${indice}`);
  const productos = useDatos<any[]>(`/api/recoleccion/productos?indice=${indice}`);
  const fila = useMemo(() => resumen.datos?.indices.find((f: any) => f.indice === indice), [resumen.datos, indice]);
  const recargar = () => { resumen.recargar(); precios.recargar(); informantes.recargar(); productos.recargar(); };
  const alertas = (precios.datos?.precios ?? []).filter((p: any) => p.atipico);
  const pendientes = precios.datos?.pendientes ?? [];
  const periodo = precios.datos?.periodo ?? "";
  const nombreInf = (p: any) => (p.nombre_informante ? `${p.informante} · ${p.nombre_informante}` : p.informante);

  const cifras = !fila ? <EsqueletoKpis n={3} /> : (
    <div className="rejilla escalonada">
      <div className="c4"><CifraClara etiqueta="Cobertura del mes" valor={fila.cobertura === null ? "—" : fmt.pct(fila.cobertura, 0)}
        detalle={`${fila.capturados} de ${fila.esperados} precios · ${mesTexto(fila.periodo)}`} significa="Precios capturados de los que se esperan este mes." /></div>
      <div className="c4"><CifraClara tono="naranja" etiqueta="Precios para revisar" valor={String(fila.alertas)}
        significa="Variaron de forma inusual frente al mes anterior. Confírmelos con el informante." /></div>
      <div className="c4"><CifraClara tono="morado" etiqueta="Informantes activos" valor={String(fila.informantes)} detalle={`${fila.productos} productos`}
        significa={resumen.datos?.ve_informantes ? "Usted ve sus nombres porque recolecta para la DIEC." : "Por secreto estadístico usted ve solo sus códigos."} /></div>
    </div>
  );

  const vistaResumen = (
    <>
      <EnPocasPalabras>
        {fila?.periodo ? (
          <>
            <p>En {mesTexto(fila.periodo)} se han capturado <b>{fila.capturados} de {fila.esperados}</b> precios del {NOMBRES[indice]}. {pendientes.length > 0 && <>Faltan <b>{pendientes.length}</b> por recolectar.</>}</p>
            <p>{fila.alertas ? <><b>{fila.alertas}</b> {fila.alertas === 1 ? "precio cambió" : "precios cambiaron"} de forma inusual y conviene confirmarlos.</> : "Ningún precio cambió de forma inusual."}</p>
          </>
        ) : "Aún no hay precios capturados para este índice."}
      </EnPocasPalabras>
      {cifras}
      {captura && informantes.datos && productos.datos && (
        <Captura indice={indice} informantes={informantes.datos} productos={productos.datos} periodo={periodo} onGuardado={recargar} />
      )}
      <div className="rejilla">
        <div className="c6"><Tarjeta titulo="Para revisar">
          <ListaSimple vacio="Nada que revisar este mes." elementos={alertas.slice(0, 6).map((a: any) => ({
            estado: a.severidad === "alta" ? "critico" : "atencion",
            titulo: <>{a.producto}: {conSigno(a.variacion)}</>,
            texto: <>{nombreInf(a)} · {a.departamento}. Antes {fmt.moneda(a.anterior)}, ahora {fmt.moneda(a.precio)}.</>,
          }))} />
        </Tarjeta></div>
        <div className="c6"><Tarjeta titulo="Pendientes de recolectar">
          <ListaSimple vacio="Todo recolectado." elementos={pendientes.slice(0, 6).map((p: any) => ({
            estado: "info", titulo: p.producto, texto: <>{nombreInf(p)} · {p.departamento}. El mes anterior: {fmt.moneda(p.precio_anterior)}.</>,
          }))} />
          {pendientes.length > 6 && <p className="pequeno suave">Y {pendientes.length - 6} más en la vista Completa.</p>}
        </Tarjeta></div>
      </div>
      <PieResumen fuente="Captura de la DIEC (prototipo con datos de demostración)">La vista Completa tiene todos los precios del mes, los informantes y los productos.</PieResumen>
    </>
  );

  const vistaCompleta = (
    <>
      {cifras}
      {captura && informantes.datos && productos.datos && (
        <Captura indice={indice} informantes={informantes.datos} productos={productos.datos} periodo={periodo} onGuardado={recargar} />
      )}
      <Tarjeta titulo={`Precios de ${mesTexto(periodo)}`} ayuda="Primero los marcados para revisar. La variación es frente al mes anterior con el mismo informante.">
        {precios.cargando && !precios.datos ? <EsqueletoTabla /> : (
          <Tabla filas={precios.datos?.precios ?? []} vacio="Sin precios este mes." columnas={[
            { id: "inf", titulo: "Informante", valor: (p: any) => p.informante, celda: (p: any) => nombreInf(p) },
            { id: "depto", titulo: "Departamento", valor: (p: any) => p.departamento },
            { id: "prod", titulo: "Producto", valor: (p: any) => p.producto, celda: (p: any) => <>{p.producto} <span className="suave pequeno">· {p.unidad}</span></> },
            { id: "ant", titulo: "Mes anterior", num: true, valor: (p: any) => p.anterior, celda: (p: any) => fmt.moneda(p.anterior) },
            { id: "precio", titulo: "Precio", num: true, valor: (p: any) => p.precio, celda: (p: any) => fmt.moneda(p.precio) },
            { id: "var", titulo: "Variación", num: true, valor: (p: any) => p.variacion, celda: (p: any) => conSigno(p.variacion) },
            { id: "estado", titulo: "Revisión", valor: (p: any) => (p.atipico ? 0 : 1), celda: (p: any) => p.atipico ? <span title={p.metodo}><Severidad valor={p.severidad} /></span> : <span className="suave pequeno">{p.variacion === null ? "sin mes anterior" : "normal"}</span> },
          ]} />
        )}
      </Tarjeta>
      {pendientes.length > 0 && (
        <Tarjeta titulo={`Pendientes de recolectar (${pendientes.length})`}>
          <Tabla filas={pendientes} columnas={[
            { id: "inf", titulo: "Informante", valor: (p: any) => p.informante, celda: (p: any) => nombreInf(p) },
            { id: "depto", titulo: "Departamento", valor: (p: any) => p.departamento },
            { id: "prod", titulo: "Producto", valor: (p: any) => p.producto },
            { id: "ant", titulo: "Precio del mes anterior", num: true, valor: (p: any) => p.precio_anterior, celda: (p: any) => fmt.moneda(p.precio_anterior) },
          ]} />
        </Tarjeta>
      )}
      <div className="rejilla">
        <div className="c6"><Tarjeta titulo="Informantes" acciones={captura ? <button className="boton secundario pequeno" onClick={() => setNuevo("informante")}><Plus size={16} /> Nuevo</button> : undefined}>
          <Tabla filas={informantes.datos ?? []} columnas={[
            { id: "cod", titulo: "Código", valor: (i: any) => i.codigo },
            { id: "nom", titulo: "Nombre", valor: (i: any) => i.nombre, celda: (i: any) => i.nombre ?? <span className="suave pequeno">confidencial</span> },
            { id: "act", titulo: "Actividad", valor: (i: any) => i.actividad },
            { id: "lug", titulo: "Lugar", valor: (i: any) => i.municipio || i.departamento },
          ]} />
        </Tarjeta></div>
        <div className="c6"><Tarjeta titulo="Productos" acciones={captura ? <button className="boton secundario pequeno" onClick={() => setNuevo("producto")}><Plus size={16} /> Nuevo</button> : undefined}>
          <Tabla filas={productos.datos ?? []} columnas={[
            { id: "cod", titulo: "Código", valor: (p: any) => p.codigo },
            { id: "nom", titulo: "Producto", valor: (p: any) => p.nombre },
            { id: "uni", titulo: "Unidad", valor: (p: any) => p.unidad },
            { id: "gru", titulo: "Grupo", valor: (p: any) => p.grupo },
          ]} />
        </Tarjeta></div>
      </div>
      <FuenteCita>Captura de la DIEC. Prototipo con informantes, productos y precios de demostración; el método de alertas es el mismo que Nexo usa con los precios recolectados del IPC.</FuenteCita>
    </>
  );

  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Recolección de precios"
        subtitulo="Informantes, productos y precios del IPP agrícola, el IPMC y el ICC, con validación al capturar y alertas de variaciones inusuales. Responde a las propuestas de la DIEC."
        acciones={<><Link className="boton secundario" to="/campo"><Smartphone /> Catálogo de campo</Link><BotonAyuda ayuda={AYUDA} /></>} />
      <Pestanas<Indice> activa={indice} onCambio={setIndice} opciones={(Object.keys(NOMBRES) as Indice[]).map((k) => ({
        id: k, etiqueta: <>{NOMBRES[k]} {resumen.datos?.indices.find((f: any) => f.indice === k)?.alertas ? <Insignia tono="alerta">{resumen.datos.indices.find((f: any) => f.indice === k).alertas}</Insignia> : null}</>,
      }))} />
      {fila?.es_demo && <Aviso tono="info"><ClipboardList size={16} style={{ verticalAlign: -3 }} /> Datos de demostración: el INE no publica los precios individuales de estos índices. El flujo y los cálculos son los reales.</Aviso>}
      {nuevo && <NuevoRegistro tipo={nuevo} indice={indice} onCerrar={() => setNuevo(null)} onCreado={recargar} />}
      <SegunVista resumen={vistaResumen} completa={vistaCompleta} />
    </div>
  );
}
