import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  unidad: string;
  roles: { codigo: string; nombre: string; area: string }[];
  permisos: string[];
  mfa_activo: boolean;
  mfa_por_verificar: boolean;
  mfa_por_configurar: boolean;
  ultimo_acceso: string | null;
  es_demo: boolean;
}

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  refrescar: () => Promise<Usuario | null>;
  establecer: (u: Usuario | null) => void;
  salir: () => Promise<void>;
  puede: (...permisos: string[]) => boolean;
}

const ContextoSesion = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const u = await api<Usuario>("/api/auth/yo");
      setUsuario(u);
      return u;
    } catch {
      setUsuario(null);
      return null;
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
    const expirada = () => setUsuario(null);
    window.addEventListener("nexo:sesion-expirada", expirada);
    return () => window.removeEventListener("nexo:sesion-expirada", expirada);
  }, [refrescar]);

  const salir = useCallback(async () => {
    try {
      await api("/api/auth/logout", { metodo: "POST" });
    } finally {
      setUsuario(null);
    }
  }, []);

  const puede = useCallback((...permisos: string[]) => !!usuario && permisos.some((p) => usuario.permisos.includes(p)), [usuario]);

  return (
    <ContextoSesion.Provider value={{ usuario, cargando, refrescar, establecer: setUsuario, salir, puede }}>
      {children}
    </ContextoSesion.Provider>
  );
}

export function useSesion(): Sesion {
  const s = useContext(ContextoSesion);
  if (!s) throw new Error("useSesion fuera de ProveedorSesion");
  return s;
}
