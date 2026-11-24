// Salud de TI: métricas del sistema, agente de TI e inventario de componentes de terceros con su licencia.
// Vista Resumen: el puntaje explicado, lo que hay que atender y tres medidas sencillas.
import { useState } from "react";
import { DatabaseZap, HardDrive, Play, Workflow } from "lucide-react";
import { api, fmt } from "../api";
import { Aviso, avisar, Encabezado, Esqueleto, EsqueletoKpis, Kpi, Medidor, Tabla, Tarjeta, useDatos } from "../componentes/ui";
import { BotonAyuda, CifraClara, EnPocasPalabras, PieResumen, SegunVista, type AyudaPantalla } from "../componentes/vista";
import { Hallazgos, HallazgosSimples, REGLA_PUNTAJE } from "./Seguridad";

const AYUDA: AyudaPantalla = {
  que: "Si la plataforma funciona bien: qué tan rápido responde la base de datos, si el motor de automatizaciones está activo, cuánto espacio queda, si hay respaldos y si los datos están al día.",
  datos: "Mediciones del propio servidor y un agente de TI que cada 30 minutos revisa reglas verificables, por ejemplo que existan respaldos recientes y que las automatizaciones no fallen. El inventario de componentes sale de las dependencias fijadas del proyecto.",
  pasos: [
    "Mire el puntaje y los puntos por atender.",
    "Pulse «Revisar ahora» para medir de nuevo en este momento.",
    "Atienda los hallazgos: cada uno dice qué hacer.",
    "En la vista Completa, revise los componentes de terceros y su licencia.",
  ],
  resumen: "El puntaje explicado, los tres puntos más importantes por atender y tres medidas del servidor.",
  completa: "Todas las métricas, todos los hallazgos del agente de TI y el inventario de componentes con su licencia.",
  terminos: [
    ["Latencia", "El tiempo que tarda la base de datos en responder. Una décima de segundo (100 ms) o menos se percibe como inmediato."],
    ["Motor de automatizaciones", "El programa que ejecuta solas las tareas programadas: revisiones, respaldos y recordatorios."],
    ["Respaldo", "Copia de seguridad de la base de datos para recuperarla si algo falla."],
    ["Frescura de los datos", "Qué tan recientes son los archivos oficiales cargados frente a su periodicidad de publicación."],
    ["Licencia de código abierto", "Permiso para usar, estudiar y modificar un componente sin pagar licencias."],
    ["Dependencia fijada", "Cada componente se instala en una versión exacta y se comprueba su huella, para evitar cambios inesperados."],
  ],
};

function ResumenTi({ datos, comp }: { datos: any; comp: any }) {
  const { datos: abiertos } = useDatos<any[]>("/api/seguridad/hallazgos?agente=ti&estado=abierto");
  const m = datos?.metricas;
  if (!m) return <><Esqueleto alto={90} /><Esqueleto alto={160} /><EsqueletoKpis n={3} /></>;
  const principal = abiertos?.[0];
  return (
    <>
      <EnPocasPalabras>
        La salud de TI es <b>{datos.puntaje} de 100</b>.{" "}
        {abiertos && (abiertos.length === 0 ? "No hay problemas abiertos. "
          : <>Hay {fmt.numero(abiertos.length)} punto{abiertos.length === 1 ? "" : "s"} por atender; el principal: «{principal.titulo}». </>)}
        La base de datos responde en {fmt.numero(m.latencia_bd_ms, 1)} ms y el motor de automatizaciones está {m.programador_activo ? "activo" : "detenido"}.
      </EnPocasPalabras>
      <div className="tarjeta medidor-explicado">
        <Medidor valor={datos.puntaje} etiqueta="Salud TI" />
        <div className="texto">
          <h3>Puntaje de salud de TI: {datos.puntaje} de 100</h3>
          <p>{REGLA_PUNTAJE} El agente de TI revisa cada 30 minutos; estas medidas se tomaron {fmt.relativo(m.medido_en)}.</p>
        </div>
      </div>
      <Tarjeta titulo="Lo que hay que atender" ayuda="Los hallazgos abiertos del agente de TI, con lo que hay que hacer.">
        <HallazgosSimples hallazgos={abiertos} />
      </Tarjeta>
      <div className="rejilla escalonada">
        <div className="c4"><CifraClara etiqueta="Respuesta de la base de datos" icono={<DatabaseZap />} valor={`${fmt.numero(m.latencia_bd_ms, 1)} ms`}
          detalle={`Motor: ${m.motor_bd}${m.tamano_bd_bytes ? ` · ${fmt.numero(m.tamano_bd_bytes / 1048576, 0)} MB` : ""}`}
          significa="Lo que tarda una consulta sencilla. Una décima de segundo (100 ms) o menos se percibe como inmediato." /></div>
        <div className="c4"><CifraClara tono={m.programador_activo ? "verde" : "naranja"} etiqueta="Motor de automatizaciones" icono={<Workflow />}
          valor={m.programador_activo ? "Activo" : "Detenido"}
          significa={m.programador_activo ? "Ejecuta solas las tareas programadas, como revisiones y respaldos." : "Las tareas programadas no correrán hasta que se active de nuevo."} /></div>
        <div className="c4"><CifraClara tono="morado" etiqueta="Disco libre" icono={<HardDrive />} valor={fmt.pct(m.disco_libre_pct)}
          significa="Espacio disponible para la base de datos y los respaldos." /></div>
      </div>
      {comp && (
        <Aviso tono="info">
          Nexo usa {fmt.numero(comp.python?.length ?? 0)} componentes de Python y {fmt.numero(comp.javascript?.length ?? 0)} de JavaScript, cada uno con su licencia
          (detalle en la vista Completa). Sin servicios de pago ni en la nube: funciona en un servidor del INE con software libre.
        </Aviso>
      )}
      <PieResumen fuente="agente de TI de Nexo y mediciones del servidor" />
    </>
  );
}

export default function Ti() {
  const { datos, recargar } = useDatos<any>("/api/ti/salud");
  const { datos: comp } = useDatos<any>("/api/ti/componentes");
  const [revisando, setRevisando] = useState(false);
  const [version, setVersion] = useState(0);
  const m = datos?.metricas;
  const revisar = async () => {
    setRevisando(true);
    try { const r: any = await api("/api/ti/revisar", { metodo: "POST" }); avisar(`Salud de TI: ${r.puntaje}/100.`); recargar(); setVersion((v) => v + 1); }
    finally { setRevisando(false); }
  };
  return (
    <div className="columna" style={{ gap: 16 }}>
      <Encabezado titulo="Salud de TI" subtitulo="El agente de TI revisa latencia, frescura de los datos, automatizaciones fallidas o atrasadas, espacio en disco y respaldos. Es deliberadamente exigente: reporta lo que Informática querría saber antes que nadie."
        acciones={<>
          <BotonAyuda ayuda={AYUDA} />
          <button className="boton" disabled={revisando} onClick={revisar}><Play /> {revisando ? "Revisando…" : "Revisar ahora"}</button>
        </>} />
      <SegunVista
        resumen={<ResumenTi key={version} datos={datos} comp={comp} />}
        completa={<>
          {!m ? <Esqueleto alto={200} /> : (
            <div className="rejilla">
              <div className="c3 tarjeta" style={{ display: "grid", placeItems: "center" }}><Medidor valor={datos.puntaje} etiqueta="Salud TI" /></div>
              <div className="c3"><Kpi etiqueta="Latencia de la base de datos" valor={`${m.latencia_bd_ms} ms`} detalle={`Motor: ${m.motor_bd}${m.tamano_bd_bytes ? ` · ${fmt.numero(m.tamano_bd_bytes / 1048576, 0)} MB` : ""}`} /></div>
              <div className="c3"><Kpi tono={m.programador_activo ? "verde" : "naranja"} etiqueta="Motor de automatizaciones" valor={m.programador_activo ? "Activo" : "Detenido"} detalle={`Python ${m.python} · ${m.sistema}`} /></div>
              <div className="c3"><Kpi tono="morado" etiqueta="Disco libre" valor={fmt.pct(m.disco_libre_pct)} detalle={`Medido ${fmt.relativo(m.medido_en)}`} /></div>
            </div>
          )}
          <Tarjeta titulo="Hallazgos del agente de TI"><Hallazgos key={version} agente="ti" /></Tarjeta>
          <Tarjeta titulo="Componentes de terceros y sus licencias" ayuda="Inventario generado desde las dependencias fijadas (requirements.txt con hash y package-lock.json). Todos son de código abierto.">
            {!comp ? <Esqueleto /> : (
              <div className="rejilla">
                <div className="c6"><h3 style={{ marginBottom: 8 }}>Backend (Python)</h3><Tabla filas={comp.python} columnas={[
                  { id: "n", titulo: "Paquete", valor: (c: any) => c.nombre }, { id: "v", titulo: "Versión", valor: (c: any) => c.version }, { id: "l", titulo: "Licencia", valor: (c: any) => c.licencia },
                ]} /></div>
                <div className="c6"><h3 style={{ marginBottom: 8 }}>Frontend (JavaScript)</h3><Tabla filas={comp.javascript} columnas={[
                  { id: "n", titulo: "Paquete", valor: (c: any) => c.nombre }, { id: "v", titulo: "Versión", valor: (c: any) => c.version }, { id: "l", titulo: "Licencia", valor: (c: any) => c.licencia },
                ]} vacio="Compile el frontend para ver su inventario." /></div>
              </div>
            )}
            <div style={{ marginTop: 10 }}><Aviso tono="info">Sin servicios de pago ni en la nube: Nexo funciona en un servidor del INE con software libre.</Aviso></div>
          </Tarjeta>
        </>}
      />
    </div>
  );
}
