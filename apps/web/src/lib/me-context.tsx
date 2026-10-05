"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

// Respuesta de GET /me — subset que consumen las superficies de (app).
// El endpoint devuelve más campos (styleRoles, enrollments, onboarding…);
// las páginas que los necesitan (p.ej. /perfil/datos) siguen fetcheando
// su propio contrato — este contexto solo deduplica el /me "común"
// (identidad, roles/lente y consentimiento).
export type MeContextData = {
  id: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  instagram?: string | null;
  roles: string[];
  roleStates?: { role: string; status: string }[];
  consentAcceptedAt?: string | null;
  consentVersion?: string | null;
};

export type MeContextValue = {
  /** null tras resolver = sin sesión (401) — no confundir con loading. */
  me: MeContextData | null;
  /** true solo durante el primer fetch (o un refresh sin me previo). */
  loading: boolean;
  /** true cuando el último fetch falló por red/5xx (no por 401). */
  error: boolean;
  /** Refetch de /me — tras mutaciones propias (PATCH /me, consent) o
      retry de error. No bloquea: con `me` previo la UI sigue pintada. */
  refresh: () => Promise<void>;
};

const MeContext = createContext<MeContextValue | null>(null);

/**
 * /me compartido de la app autenticada: un solo fetch por sesión de
 * (app) en vez de uno por página/componente. Se monta en el layout del
 * grupo — NO bloquea children: cada consumidor gatea con `loading` lo
 * que depende del dato (skeleton o no-render). No reemplaza guards:
 * AcademyGate/AdminGate/etc. siguen resolviendo su propia autorización.
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Espejo de `me` para que refresh decida sin depender del closure.
  const meRef = useRef<MeContextData | null>(null);
  meRef.current = me;
  // Deduplica refreshes concurrentes (p.ej. varios consumidores tras
  // una mutación) — todos esperan el mismo fetch en vuelo.
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current ??= (async () => {
      // Sin me previo el consumidor depende de `loading` para no
      // pintar contenido por defecto — se reactiva durante el refetch.
      // Con me resuelto el refresh es silencioso (post-mutación).
      if (!meRef.current) setLoading(true);
      setError(false);
      try {
        const res = await apiFetch("/me");
        if (res.status === 401) {
          setMe(null);
          return;
        }
        if (!res.ok) {
          setError(true);
          return;
        }
        setMe((await res.json()) as MeContextData);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <MeContext.Provider value={{ me, loading, error, refresh }}>
      {children}
    </MeContext.Provider>
  );
}

/**
 * Lee el /me compartido. Solo usar dentro de (app) — fuera del provider
 * no hay sesión resuelta y lanza error (cada superficie fuera del grupo
 * mantiene su propio fetch).
 */
export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error("useMe debe usarse dentro de <MeProvider> ((app)/layout)");
  }
  return ctx;
}
