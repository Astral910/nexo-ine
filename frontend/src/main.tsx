import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./estilos/tema.css";
import "./estilos/vistas-a.css";
import "./estilos/vistas-b.css";
import { App } from "./App";
import { ProveedorSesion } from "./auth";
import { ProveedorRecorrido } from "./componentes/Recorrido";
import { ProveedorVista } from "./componentes/vista";

// Preferencias de accesibilidad guardadas: tamaño de letra y movimiento reducido.
const escala = localStorage.getItem("nexo:escala");
if (escala) document.documentElement.dataset.escala = escala;
if (localStorage.getItem("nexo:sin-animacion") === "1") document.documentElement.classList.add("sin-animacion");

// Catálogo de campo instalable: el service worker solo guarda lo necesario para abrir /campo sin conexión.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin + "/assets/"));
      reg.active?.postMessage({ tipo: "precargar", urls });
    }).catch(() => { /* sin service worker la plataforma funciona igual, solo sin modo sin conexión */ });
  });
}

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        <ProveedorVista>
          <ProveedorRecorrido>
            <App />
          </ProveedorRecorrido>
        </ProveedorVista>
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>,
);
