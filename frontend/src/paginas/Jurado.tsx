// Modo Jurado: la rúbrica oficial con evidencia en vivo, el cumplimiento de los lineamientos y los recorridos guiados.
// Vista Resumen: los 6 criterios con su peso y su evidencia principal, el cumplimiento y los recorridos en un clic.
import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck, CircleX, Database, Globe, ListChecks, Route, ScrollText, ShieldCheck } from "lucide-react";
import { fmt } from "../api";
import { RECORRIDOS, useRecorrido } from "../componentes/Recorrido";
import { Encabezado, Esqueleto, EsqueletoKpis, EsqueletoTabla, Insignia, Kpi, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, ListaSimple, PieResumen, SegunVista, type AyudaPantalla } from "../componentes/vista";

const AYUDA: AyudaPantalla = {
  que: "Cómo responde Nexo a cada criterio de la rúbrica del Datatón INE 2026 (Categoría 2), con evidencia viva y enlaces a la pantalla donde comprobarla.",
  datos: "La rúbrica y los lineamientos de la Nota Conceptual del Datatón. Las cifras (fuentes, puntajes, eventos, pruebas y commits) se calculan en el momento desde la plataforma y el repositorio.",
  pasos: [
    "Inicie el recorrido guiado de 3 minutos para ver lo esencial.",
    "Revise cada criterio y pulse «Comprobar» para abrir la pantalla con la evidencia.",
    "Mire el cumplimiento de los lineamientos de la Categoría 2.",
    "Pruebe Nexo Abierto, la parte pública que se usa sin cuenta.",
  ],
  resumen: "Los 6 criterios con su peso y su evidencia principal, el cumplimiento de los lineamientos y los recorridos guiados.",
  completa: "Toda la evidencia de cada criterio, el detalle del cumplimiento y la ruta sugerida de 7 minutos.",
  terminos: [
    ["Rúbrica", "Los 6 criterios con su peso: funcionalidad 25 %, aplicabilidad institucional 20 %, calidad técnica 20 %, innovación 15 %, rigor en el uso de los datos 10 % y presentación y usabilidad 10 %."],
    ["Aplicabilidad institucional", "Que responda a una necesidad real del INE o de sus usuarios y que sea viable adoptarla, mantenerla y escalarla. En caso de empate, decide este criterio."],
    ["Evidencia viva", "Cifras que se calculan al abrir la pantalla, no textos escritos a mano."],
    ["Lineamientos", "Reglas obligatorias de la Categoría 2: base pública del INE como fuente principal, repositorio desde el día 1, secreto estadístico, uso de IA declarado, entre otras."],
    ["Nexo Abierto", "La parte pública de Nexo: precios del Estado, fichas municipales y preguntas a los datos, sin crear una cuenta."],
  ],
};

const RECORRIDO = [
  ["Centro de mando", "Súper resumen de toda la plataforma y espacio de trabajo por rol.", "/"],
  ["Precios de Referencia", "Abra una solicitud, investigue el mercado en un clic y genere el informe técnico.", "/precios"],
  ["Tablero generativo", "Escriba «IPC de Quetzaltenango» o «precio de cemento gris por mes en 2025».", "/tableros?q=IPC%20de%20Quetzaltenango"],
  ["Alertas de precios", "Hidiroglou-Berthelot sobre los precios recolectados del IPC.", "/indices/alertas?periodo=2022-07"],
  ["Territorio", "El país dibujado con 20 mil lugares poblados y fichas municipales.", "/territorio"],
  ["Validador", "Suba un CSV y observe cómo detecta datos personales y códigos 98/99.", "/calidad"],
  ["Ciberseguridad", "Agente, riesgos, incidentes y 22 controles con su evidencia en el código.", "/seguridad"],
  ["Bitácora", "Verifique la integridad de la cadena HMAC.", "/bitacora"],
];

function BotonesRecorrido() {
  const { iniciar } = useRecorrido();
  return (
    <section className="vidrio recorridos-jurado" aria-label="Recorridos guiados">
      <div>
        <b>{RECORRIDOS.general.titulo}</b>
        <p>{RECORRIDOS.general.descripcion}</p>
        <button type="button" className="boton grande" onClick={() => iniciar("general")}><Route /> Iniciar el recorrido guiado (3 min)</button>
      </div>
      <div>
        <b>{RECORRIDOS.abierto.titulo}</b>
        <p>{RECORRIDOS.abierto.descripcion}</p>
        <button type="button" className="boton secundario grande" onClick={() => iniciar("abierto")}><Globe /> Recorrido de Nexo Abierto (1 min)</button>
      </div>
    </section>
  );
}

function ResumenJurado({ datos }: { datos: any }) {
  if (!datos) return <><Esqueleto alto={90} /><Esqueleto alto={150} /><EsqueletoKpis n={4} /><div className="tarjeta"><EsqueletoTabla filas={6} /></div></>;
  const total = datos.cumplimiento.length;
  const cumplidos = datos.cumplimiento.filter((r: any) => r.cumple).length;
  const pendientes = datos.cumplimiento.filter((r: any) => !r.cumple);
  return (
    <>
      <EnPocasPalabras>
        Nexo responde a los <b>{datos.criterios.length} criterios</b> de la rúbrica de la Categoría 2 con evidencia que se calcula en vivo, y cumple
        <b> {cumplidos} de {total}</b> lineamientos que se pueden comprobar desde la plataforma.
      </EnPocasPalabras>
      <BotonesRecorrido />
      <div className="rejilla escalonada">
        <div className="c3"><CifraClara etiqueta="Lineamientos cumplidos" icono={<ListChecks />} valor={`${cumplidos} de ${total}`}
          significa="Reglas de la Categoría 2 verificables desde la plataforma; el detalle está en la vista Completa." /></div>
        <div className="c3"><CifraClara tono="morado" etiqueta="Fuentes analíticas" icono={<Database />} numero={datos.cifras.fuentes_semanticas} formato={(v) => fmt.numero(v)}
          significa="Fuentes de datos que la capa semántica sabe consultar, cada una con su cita." /></div>
        <div className="c3"><CifraClara tono="verde" etiqueta="Postura de seguridad" icono={<ShieldCheck />} valor={`${datos.cifras.puntaje_seguridad} de 100`}
          detalle={`Salud de TI: ${datos.cifras.puntaje_ti} de 100`}
          significa="Calculada por los agentes automáticos según los hallazgos abiertos." ir={{ texto: "Ver Ciberseguridad", ruta: "/seguridad" }} /></div>
        <div className="c3"><CifraClara tono="naranja" etiqueta="Eventos en la bitácora" icono={<ScrollText />} numero={datos.cifras.eventos_bitacora} formato={(v) => fmt.numero(v)}
          significa="Acciones registradas y encadenadas con HMAC: si alguien altera una, se detecta." ir={{ texto: "Verificar la bitácora", ruta: "/bitacora" }} /></div>
      </div>
      <Tarjeta titulo="La rúbrica, criterio por criterio" ayuda="Peso de cada criterio y su evidencia principal. Pulse «Comprobar» para abrir la pantalla.">
        <ol className="criterios-resumen">
          {datos.criterios.map((c: any) => (
            <li key={c.criterio}>
              <span className="peso">{c.peso} %</span>
              <div className="texto"><b>{c.criterio}</b><p className="pequeno suave">{c.evidencia[0]}</p></div>
              {c.rutas?.[0] && <Link className="boton secundario pequeno" to={c.rutas[0]}>Comprobar <ArrowRight /></Link>}
            </li>
          ))}
        </ol>
      </Tarjeta>
      {pendientes.length > 0 && (
        <Tarjeta titulo="Lineamientos por completar">
          <ListaSimple elementos={pendientes.map((r: any) => ({ estado: "atencion" as const, titulo: r.regla }))} />
        </Tarjeta>
      )}
      <PieResumen fuente="evidencia calculada en vivo desde la plataforma; rúbrica y lineamientos de la Nota Conceptual del Datatón INE 2026" />
    </>
  );
}

export default function Jurado() {
  const { datos } = useDatos<any>("/api/jurado/evidencia");
  const { iniciar } = useRecorrido();
  return (
    <div className="columna" style={{ gap: 18 }}>
      <Encabezado titulo="Modo Jurado" subtitulo="Cómo Nexo responde a cada criterio de la rúbrica del Datatón INE 2026 (Categoría 2), con evidencia que se calcula en vivo desde la plataforma."
        acciones={<BotonAyuda ayuda={AYUDA} />} />
      <SegunVista
        resumen={<ResumenJurado datos={datos} />}
        completa={!datos ? <Esqueleto alto={400} /> : <>
          <div className="rejilla">
            <div className="c3"><Kpi etiqueta="Fuentes analíticas" valor={datos.cifras.fuentes_semanticas} detalle="en la capa semántica" /></div>
            <div className="c3"><Kpi tono="verde" etiqueta="Postura de seguridad" valor={`${datos.cifras.puntaje_seguridad}/100`} detalle={`Salud de TI ${datos.cifras.puntaje_ti}/100`} /></div>
            <div className="c3"><Kpi tono="morado" etiqueta="Riesgos gestionados" valor={datos.cifras.riesgos} detalle="con referencias ISO y NIST" /></div>
            <div className="c3"><Kpi tono="naranja" etiqueta="Eventos en la bitácora" valor={fmt.numero(datos.cifras.eventos_bitacora)} detalle="encadenados con HMAC" /></div>
          </div>
          <div className="rejilla">
            {datos.criterios.map((c: any) => (
              <div key={c.criterio} className="c6 tarjeta">
                <div className="fila espaciado"><h2>{c.criterio}</h2><Insignia tono="info">{c.peso} %</Insignia></div>
                <ul style={{ paddingLeft: 18 }}>{c.evidencia.map((e: string, i: number) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}</ul>
                <div className="fila">{c.rutas.map((r: string) => <Link key={r} className="chip" to={r}>Ver {r} <ArrowRight size={13} /></Link>)}</div>
              </div>
            ))}
          </div>
          <div className="rejilla">
            <div className="c6">
              <Tarjeta titulo="Cumplimiento de los lineamientos de la Categoría 2">
                <ul className="actividad">
                  {datos.cumplimiento.map((r: any) => (
                    <li key={r.regla}>{r.cumple ? <CircleCheck color="#2f8f2f" size={18} /> : <CircleX color="#b42318" size={18} />}<span>{r.regla} {r.ruta && <Link to={r.ruta} className="pequeno">ver</Link>}</span></li>
                  ))}
                </ul>
              </Tarjeta>
            </div>
            <div className="c6">
              <Tarjeta titulo="Recorrido sugerido (7 minutos)" acciones={<button type="button" className="boton secundario pequeno" onClick={() => iniciar("general")}><Route /> Recorrido guiado</button>}>
                <ol style={{ paddingLeft: 18, margin: 0 }}>
                  {RECORRIDO.map(([t, d, r]) => <li key={t} style={{ marginBottom: 8 }}><Link to={r}><b>{t}</b></Link><br /><span className="pequeno suave">{d}</span></li>)}
                </ol>
              </Tarjeta>
            </div>
          </div>
        </>}
      />
    </div>
  );
}
