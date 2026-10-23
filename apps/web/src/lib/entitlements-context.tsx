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

// Entitlements unificados por actor (spec unified-actor-entitlements) -
// espejo de GET /me/entitlements: una fuente para el productor y las
// academias del owner. La nav del owner filtra por feature como hace
// con los flags de useFeatures; las páginas bloqueadas muestran el
// TierPaywall con CTA a la suscripción del actor.
export type EntitlementActorType = "PRODUCER" | "ACADEMY";

export type ActorEntitlement = {
  tier: string | null;
  features: string[];
};

export type AcademyEntitlement = ActorEntitlement & {
  id: string;
};

type EntitlementsContextValue = {
  /** Entitlement del productor propio (null si no es PRODUCER). */
  producer: ActorEntitlement | null;
  /** Una entrada por academia del owner ([] para otros roles). */
  academies: AcademyEntitlement[];
  /** true solo durante el primer fetch de la sesión. */
  loading: boolean;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(
  null,
);

/**
 * Mapa unificado de entitlements de la sesión: un solo fetch de
 * /me/entitlements por sesión de (app), montado junto a
 * MeProvider/FeaturesProvider. Si el fetch falla quedan null/[] → las
 * superficies gated se ocultan (fail-closed, mismo criterio que los
 * flags). Solo se pide cuando hay un rol que lo consume (PRODUCER u
 * ACADEMY_OWNER) - el bailarín puro no paga el request.
 */
export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { me, loading: meLoading } = useMe();
  const needsEntitlements =
    (me?.roles.includes("ACADEMY_OWNER") ?? false) ||
    (me?.roles.includes("PRODUCER") ?? false);
  const [producer, setProducer] = useState<ActorEntitlement | null>(null);
  const [academies, setAcademies] = useState<AcademyEntitlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sin sesión o sin rol con entitlements no hay nada que resolver.
    if (meLoading) return;
    if (!me || !needsEntitlements) {
      setProducer(null);
      setAcademies([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch("/me/entitlements");
        if (res.ok && !cancelled) {
          const body = (await res.json()) as {
            producer?: ActorEntitlement | null;
            academies?: AcademyEntitlement[];
          };
          setProducer(body.producer ?? null);
          setAcademies(body.academies ?? []);
        }
      } catch {
        // Red/proxy caído: null/[] - fail-closed.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meLoading, me, needsEntitlements]);

  return (
    <EntitlementsContext.Provider value={{ producer, academies, loading }}>
      {children}
    </EntitlementsContext.Provider>
  );
}

/**
 * Mapa completo de entitlements de la sesión. Para el check por feature
 * usar `useActorEntitlements` - este hook es para vistas que listan o
 * comparan actores.
 */
export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error(
      "useEntitlements debe usarse dentro de <EntitlementsProvider> ((app)/layout)",
    );
  }
  return ctx;
}

const STORAGE_KEY = "omnidance:academy-id";

/**
 * Entitlements de un actor concreto (spec unified-actor-entitlements):
 * - "PRODUCER" → el entitlement propio (el endpoint solo expone el del
 *   caller; actorId se ignora).
 * - "ACADEMY" → por id explícito, si no por la selección persistida de
 *   la consola (misma key que AcademyGate), si no la primera.
 * `has(feature)` es el check de gateo client-side; mientras `loading`
 * conviene no bloquear (el 403 tier.required del API es el fallback).
 */
export function useActorEntitlements(
  actorType: EntitlementActorType,
  actorId?: string | null,
): {
  tier: string | null;
  features: string[];
  loading: boolean;
  has: (feature: string) => boolean;
} {
  const { producer, academies, loading } = useEntitlements();

  let entry: ActorEntitlement | null = null;
  if (actorType === "PRODUCER") {
    entry = producer;
  } else {
    let stored: string | null = null;
    if (actorId == null && typeof window !== "undefined") {
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // Sin storage - cae a la primera academia.
      }
    }
    const target = actorId ?? stored;
    entry =
      (target ? academies.find((a) => a.id === target) : null) ??
      academies[0] ??
      null;
  }

  const features = entry?.features ?? [];
  const set = new Set(features);
  return {
    tier: entry?.tier ?? null,
    features,
    loading,
    has: (feature: string) => set.has(feature),
  };
}
