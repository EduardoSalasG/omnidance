"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";

// Entitlements por tier de academia (spec academy-tier-cobros) - espejo
// de GET /me/academy/entitlements. La nav del owner filtra por feature
// como hace con los flags de useFeatures; las páginas bloqueadas
// muestran el estado "parte del plan X" con CTA a /academia/suscripcion.
export type AcademyEntitlement = {
  id: string;
  tier: string | null;
  features: string[];
};

type EntitlementsContextValue = {
  /** Una entrada por academia del owner ([] para otros roles). */
  entitlements: AcademyEntitlement[];
  /** true solo durante el primer fetch de la sesión. */
  loading: boolean;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(
  null,
);

/**
 * Mapa de entitlements de las academias del owner: un solo fetch por
 * sesión de (app), montado junto a MeProvider/FeaturesProvider. Si el
 * fetch falla queda [] → las superficies gated se ocultan (fail-closed,
 * mismo criterio que los flags).
 */
export function AcademyEntitlementsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { me, loading: meLoading } = useMe();
  const isOwner = me?.roles.includes("ACADEMY_OWNER") ?? false;
  const [entitlements, setEntitlements] = useState<AcademyEntitlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sin sesión o sin rol owner no hay nada que resolver (y el endpoint
    // respondería 401/lista vacía).
    if (meLoading) return;
    if (!isOwner) {
      setEntitlements([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/me/academy/entitlements");
        if (res.ok && !cancelled) {
          const body = (await res.json()) as {
            academies?: AcademyEntitlement[];
          };
          setEntitlements(body.academies ?? []);
        }
      } catch {
        // Red/proxy caído: [] - fail-closed.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meLoading, isOwner]);

  return (
    <EntitlementsContext.Provider value={{ entitlements, loading }}>
      {children}
    </EntitlementsContext.Provider>
  );
}

const STORAGE_KEY = "omnidance:academy-id";

/**
 * Entitlements de una academia del owner: por id explícito, si no por
 * la selección persistida de la consola (misma key que AcademyGate), si
 * no la primera. `has(feature)` es el check de gateo client-side.
 */
export function useAcademyEntitlements(academyId?: string | null): {
  tier: string | null;
  features: string[];
  loading: boolean;
  has: (feature: string) => boolean;
} {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error(
      "useAcademyEntitlements debe usarse dentro de <AcademyEntitlementsProvider> ((app)/layout)",
    );
  }
  const { entitlements, loading } = ctx;
  let stored: string | null = null;
  if (academyId == null && typeof window !== "undefined") {
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Sin storage - cae a la primera academia.
    }
  }
  const target = academyId ?? stored;
  const entry =
    (target ? entitlements.find((a) => a.id === target) : null) ??
    entitlements[0] ??
    null;
  const features = entry?.features ?? [];
  const set = new Set(features);
  return {
    tier: entry?.tier ?? null,
    features,
    loading,
    has: (feature: string) => set.has(feature),
  };
}
