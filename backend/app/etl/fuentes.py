"""Registro de fuentes de datos que usa Nexo.

Fuente principal: portal de datos abiertos del Instituto Nacional de Estadística (INE).
Complemento: Guatecompras en formato OCDS (Open Contracting Partnership, CC BY 4.0).
"""

from __future__ import annotations

from dataclasses import dataclass

CKAN = "https://datos.ine.gob.gt"
INE = "Instituto Nacional de Estadística (INE), Guatemala"
LICENCIA_INE = "Según el portal de datos abiertos del INE (ver data/manifiesto.json)"


@dataclass(frozen=True)
class Fuente:
    id: str
    titulo: str
    conjunto: str
    url: str
    archivo: str
    usado_en: str
    periodicidad: str = ""
    publicador: str = INE
    licencia: str = LICENCIA_INE
    pesada: bool = False

    @property
    def formato(self) -> str:
        return self.archivo.rsplit(".", 1)[-1].upper().replace("GZ", "TAR.GZ")

    @property
    def pagina(self) -> str:
        if self.publicador == INE:
            return f"{CKAN}/dataset/{self.conjunto}"
        return "https://data.open-contracting.org/en/publication/142"


def _r(dataset_id: str, recurso: str, nombre: str) -> str:
    return f"{CKAN}/dataset/{dataset_id}/resource/{recurso}/download/{nombre}"


FUENTES: list[Fuente] = [
    Fuente("pr_2022", "Base de datos Precios de Referencia - Junio 2022", "precios-de-referencia",
           _r("b247b9ac-e95f-4c32-acd3-fc4bdfb6185a", "aec255ce-11f0-4d6c-90d2-af41b1a49870",
              "base-de-datos-pr-actualizados-hasta-junio-2022.csv"),
           "pr-2022.csv", "Precios de Referencia", "Histórico"),
    Fuente("pr_2023", "Precios de Referencia - Septiembre 2023", "precios-de-referencia",
           _r("b247b9ac-e95f-4c32-acd3-fc4bdfb6185a", "d2c5d27a-a4e1-4263-9f3a-10b344884d28",
              "precios-de-referencia-al-02102023.xlsx"),
           "pr-2023.xlsx", "Precios de Referencia", "Histórico"),
    Fuente("precios_recolectados_2022_07", "Precios recolectados - IPC - Julio 2022",
           "precios-recolectados-indice-de-precios-al-consumidor",
           _r("65ef0ddc-3cdc-4e42-8c09-f2d8ab12605a", "99de9adc-d602-48a0-ad90-28d98041abbb",
              "base-de-datos-precios-recolectados-julio-2022.csv"),
           "precios-recolectados-2022-07.csv", "Índices: alertas de precios", "Mensual"),
    Fuente("precios_recolectados_2023", "Precios recolectados 2023", "precios-recolectados-indice-de-precios-al-consumidor",
           _r("65ef0ddc-3cdc-4e42-8c09-f2d8ab12605a", "c5942f26-de9e-4b08-8232-df9dcafa819d", "2023.xlsx"),
           "precios-recolectados-2023.xlsx", "Índices: alertas de precios", "Anual (meses)", pesada=True),
    Fuente("ipc_republica", "Empalme del IPC por República Base Anual 2024=100.00", "ipc-por-producto-ano-2024-100-0",
           _r("4243818d-b479-4bc1-aae6-2735e2b51265", "6b2cb40a-188c-47c9-9288-ba11c40b5910", "ipc_emprepu_es25.xlsx"),
           "ipc-republica.xlsx", "Índices; actualización de precios de referencia", "Mensual"),
    Fuente("ipc_region", "Empalme del IPC por Región Base Anual 2024=100.00", "ipc-por-producto-ano-2024-100-0",
           _r("4243818d-b479-4bc1-aae6-2735e2b51265", "8558a6a1-64ba-486d-9a69-4e3002f9c8b3", "ipc_empreg_es25.xlsx"),
           "ipc-region.xlsx", "Índices", "Mensual"),
    Fuente("ipc_division", "Empalme del IPC por División Base Anual 2024=100.00", "ipc-por-producto-ano-2024-100-0",
           _r("4243818d-b479-4bc1-aae6-2735e2b51265", "61d01ce9-af4a-4112-a28a-44df46ac8be3", "ipc_empdiv_es25.xlsx"),
           "ipc-division.xlsx", "Índices", "Mensual"),
    Fuente("ipmc_2025", "Índice de Precios de Materiales de Construcción - Año 2025",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "01216a18-c54d-42cb-a40c-a9472ceabc18", "ipmc-ano-2025.xlsx"),
           "ipmc-2025.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_09", "Índice de Precios de Materiales de Construcción - Septiembre 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "7a374e7a-5635-4785-a6e0-3384ddb5cc24", "ipmc-septiembre-2026.xlsx"),
           "ipmc-2026-09.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_01", "Índice de Precios de Materiales de Construcción - Enero 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "c70c8d5d-f6fc-452e-b2e5-a34555b96175", "ipmc-enero-2026.xlsx"),
           "ipmc-2026-01.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_02", "Índice de Precios de Materiales de Construcción - Febrero 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "b566603a-4f34-4da2-8020-f4e338eac3a0", "ipmc-febrero-2026.xlsx"),
           "ipmc-2026-02.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_03", "Índice de Precios de Materiales de Construcción - Marzo 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "8d4a1fc1-a41b-4b6f-a859-2ae225a89dd3", "ipmc-marzo-2026.xlsx"),
           "ipmc-2026-03.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_04", "Índice de Precios de Materiales de Construcción - Abril 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "1a4e3023-96de-4149-9255-95755b8f6b77", "ipmc-abril-2026.xlsx"),
           "ipmc-2026-04.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_05", "Índice de Precios de Materiales de Construcción - Mayo 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "0aace706-64cf-4ab6-9bd5-807d0ffe337f", "ipmc-mayo-2026.xlsx"),
           "ipmc-2026-05.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_06", "Índice de Precios de Materiales de Construcción - Junio 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "aab5c33b-ae06-42da-bbb2-c8c4ebf26b9c", "ipmc-junio-2026.xlsx"),
           "ipmc-2026-06.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_07", "Índice de Precios de Materiales de Construcción - Julio 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "11a60a31-96d1-4d3c-af79-791558b85740", "ipmc-julio-2026.xlsx"),
           "ipmc-2026-07.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipmc_2026_08", "Índice de Precios de Materiales de Construcción - Agosto 2026",
           "indice-de-precios-de-materiales-de-construccion-ipmc",
           _r("b45673c0-6227-4469-ad7a-c956392fd058", "07f3d98f-95e3-47d8-bc84-5e5383b30418", "ipmc-agosto-2026.xlsx"),
           "ipmc-2026-08.xlsx", "Índices: IPMC", "Mensual"),
    Fuente("ipc_division_nombres", "IPC por División de Gasto 2025 - 2026", "ipc-por-producto-ano-2024-100-0",
           _r("4243818d-b479-4bc1-aae6-2735e2b51265", "8ad4f22d-8929-4f2e-9c82-98e41192c3c8", "ipc_divgasto_25.xlsx"),
           "ipc-division-2025.xlsx", "Índices: nombres de divisiones de gasto", "Mensual"),
    Fuente("cba_urbana", "Costo per cápita de la CBA Urbana 2024-2026", "costos-de-la-cba-urbana-y-rural",
           _r("0317e7b9-9563-4a9c-800f-c74473103063", "6721d034-7af0-4622-ae34-be10f0f2ac89", "costo-cba-percapita_u.xlsx"),
           "cba-urbana.xlsx", "Índices: canasta básica", "Mensual"),
    Fuente("cba_rural", "Costo per cápita de la CBA Rural 2024-2026", "costos-de-la-cba-urbana-y-rural",
           _r("0317e7b9-9563-4a9c-800f-c74473103063", "69abf503-56da-4de5-9017-875009394843", "costo-cba-percapita_r.xlsx"),
           "cba-rural.xlsx", "Índices: canasta básica", "Mensual"),
    Fuente("hba_2024", "Hoja de Balance de Alimentos 2024", "hoja-de-balance-de-alimentos-hba-actualizacion-2024",
           _r("20b48931-576e-42cf-acb1-cf6c4de436d8", "8104bda6-6908-4964-aea2-45b2769f620b", "hba-2024.xlsx"),
           "hba-2024.xlsx", "Calculadora HBA", "Anual"),
    Fuente("hba_cus_2024", "Cuentas de Utilización y Suministro CUS HBA 2024",
           "hoja-de-balance-de-alimentos-hba-actualizacion-2024",
           _r("20b48931-576e-42cf-acb1-cf6c4de436d8", "6334cbd0-3d63-497e-9972-3aa8b4f398bd",
              "cuentas-de-utilizacion-y-suministro-cus-hba-2024.xlsx"),
           "hba-cus-2024.xlsx", "Calculadora HBA", "Anual"),
    Fuente("lugares_poblados", "Listado de lugares poblados (centroides) - Censo 2018", "censo-2018-lugares-poblados",
           _r("78019333-d80b-45e8-b694-fb3b8d65e19e", "053dfa99-b3f9-4b1f-a99f-fc933ef00da4",
              "centroides-de-lugares-poblados-de-la-republica-de-guatemala.-censo-2018.xlsx"),
           "lugares-poblados.xlsx", "Territorio", "Censal (2018)"),
    Fuente("censo_a1", "Cuadro A1 - Población total censada por sexo, grupos quinquenales de edad y área",
           "censo-2018-lugares-poblados",
           _r("78019333-d80b-45e8-b694-fb3b8d65e19e", "4b9c7220-ca0c-41a9-a121-348f533b070e",
              "cuadro-a1-poblacion-total-censada-por-sexo-grupos-quinquenales-de-edad-y-area.xlsx"),
           "censo-a1.xlsx", "Territorio", "Censal (2018)"),
    Fuente("proyecciones", "Estimaciones y proyecciones de población por municipio 2015-2030",
           "proyecciones-de-poblacion-2015-2030",
           _r("23bbe8f8-ec9b-49c9-bcca-de78bec4efc0", "56b97bc0-5624-408d-a136-3931dd05610a",
              "estimaciones-y-proyecciones-de-la-poblacion-total-por-municipio-segun-sexo-y-edad.-2015-2030.xlsx"),
           "proyecciones.xlsx", "Territorio", "Anual"),
    Fuente("guatecompras_2025", "Guatecompras OCDS - publicaciones 2025 (CSV)", "guatecompras-ocds",
           "https://data.open-contracting.org/en/publication/142/download?name=2025.csv.tar.gz",
           "guatecompras-2025.csv.tar.gz", "Precios de Referencia: investigación de mercado", "Diaria",
           publicador="Guatecompras (Ministerio de Finanzas Públicas) vía Open Contracting Partnership",
           licencia="CC BY 4.0", pesada=True),
]

POR_ID = {f.id: f for f in FUENTES}
