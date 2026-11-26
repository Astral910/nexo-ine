import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSesion } from "./auth";
import { Marco } from "./componentes/Marco";
import { Avisos, Esqueleto } from "./componentes/ui";
import { Acceso, ConfigurarMfa, Olvide, Registro, Restablecer, Verificar } from "./paginas/Acceso";

const Inicio = lazy(() => import("./paginas/Inicio"));
const Tableros = lazy(() => import("./paginas/Tableros"));
const Precios = lazy(() => import("./paginas/Precios"));
const Solicitud = lazy(() => import("./paginas/Solicitud"));
const Indices = lazy(() => import("./paginas/Indices"));
const Hba = lazy(() => import("./paginas/Hba"));
const Territorio = lazy(() => import("./paginas/Territorio"));
const Calidad = lazy(() => import("./paginas/Calidad"));
const Automatizaciones = lazy(() => import("./paginas/Automatizaciones"));
const Datos = lazy(() => import("./paginas/Datos"));
const Seguridad = lazy(() => import("./paginas/Seguridad"));
const Ti = lazy(() => import("./paginas/Ti"));
const Bitacora = lazy(() => import("./paginas/Bitacora"));
const Privacidad = lazy(() => import("./paginas/Privacidad"));
const Admin = lazy(() => import("./paginas/Admin"));
const Jurado = lazy(() => import("./paginas/Jurado"));
const Perfil = lazy(() => import("./paginas/Perfil"));
const Abierto = lazy(() => import("./paginas/Abierto"));
const Recoleccion = lazy(() => import("./paginas/Recoleccion"));
const Campo = lazy(() => import("./paginas/Campo"));

function Protegida({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return <div className="contenido"><Esqueleto alto={300} /></div>;
  // La puerta de entrada sin cuenta es Nexo Abierto; el personal del INE entra desde ahí o desde /login.
  if (!usuario && ubicacion.pathname === "/") return <Navigate to="/abierto" replace />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  if (usuario.mfa_por_verificar) return <Navigate to="/login" replace />;
  if (usuario.mfa_por_configurar) return <Navigate to="/configurar-mfa" replace />;
  return <>{children}</>;
}

function InicioSegunRol() {
  const { puede } = useSesion();
  if (puede("centro:ver")) return <Inicio />;
  if (puede("dpir:solicitar")) return <Navigate to="/mis-solicitudes" replace />;
  return <Navigate to="/privacidad" replace />;
}

export function App() {
  return (
    <>
      <Suspense fallback={<div className="contenido"><Esqueleto alto={300} /></div>}>
        <Routes>
          <Route path="/login" element={<Acceso />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/verificar" element={<Verificar />} />
          <Route path="/olvide" element={<Olvide />} />
          <Route path="/restablecer" element={<Restablecer />} />
          <Route path="/configurar-mfa" element={<ConfigurarMfa />} />
          <Route path="/abierto/*" element={<Abierto />} />
          <Route path="/campo" element={<Campo />} />
          <Route element={<Protegida><Marco /></Protegida>}>
            <Route path="/" element={<InicioSegunRol />} />
            <Route path="/tableros" element={<Tableros />} />
            <Route path="/tableros/:id" element={<Tableros />} />
            <Route path="/precios" element={<Precios />} />
            <Route path="/mis-solicitudes" element={<Precios />} />
            <Route path="/precios/:id" element={<Solicitud />} />
            <Route path="/indices/*" element={<Indices />} />
            <Route path="/recoleccion" element={<Recoleccion />} />
            <Route path="/hba" element={<Hba />} />
            <Route path="/territorio/*" element={<Territorio />} />
            <Route path="/calidad" element={<Calidad />} />
            <Route path="/automatizaciones" element={<Automatizaciones />} />
            <Route path="/datos" element={<Datos />} />
            <Route path="/seguridad" element={<Seguridad />} />
            <Route path="/ti" element={<Ti />} />
            <Route path="/bitacora" element={<Bitacora />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/usuarios" element={<Admin />} />
            <Route path="/jurado" element={<Jurado />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="*" element={<div className="vacio"><h2>Página no encontrada</h2></div>} />
          </Route>
        </Routes>
      </Suspense>
      <Avisos />
    </>
  );
}
