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
