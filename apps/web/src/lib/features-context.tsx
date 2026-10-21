"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

// Mapa público de GET /features (spec feature-flags-admin).
export type FeatureFlagsMap = Record<string, boolean>;

type FeaturesContextValue = {
  /** {key: enabled}. Flag ausente = false → superficie oculta
      (fail-closed, mismo criterio que el gate server-side). */
  flags: FeatureFlagsMap;
  /** true solo durante el primer fetch de la sesión. */
  loading: boolean;
};

const FeaturesContext = createContext<FeaturesContextValue | null>(null);

/**
 * Flags de funcionalidad compartidos: un solo fetch de GET /features
 * (endpoint público, cache HTTP 30s) por sesión de (app). Se monta en
 * el layout del grupo junto a MeProvider - NO bloquea children: cada
 * consumidor gatea con `flags[key]`/`loading` lo que depende del flag.
 * Si el fetch falla (red/proxy) queda {} → todo lo gated oculto.
 */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlagsMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/features");
        if (res.ok && !cancelled) {
          setFlags((await res.json()) as FeatureFlagsMap);
        }
      } catch {
        // Red/proxy caído: flags {} - fail-closed (superficies ocultas).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <FeaturesContext.Provider value={{ flags, loading }}>
      {children}
    </FeaturesContext.Provider>
  );
}

/**
 * Lee los flags compartidos. Solo usar dentro de (app) - fuera del
 * provider no hay mapa resuelto y lanza error.
 */
export function useFeatures(): FeaturesContextValue {
  const ctx = useContext(FeaturesContext);
  if (!ctx) {
    throw new Error(
      "useFeatures debe usarse dentro de <FeaturesProvider> ((app)/layout)",
    );
  }
  return ctx;
}
