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
import { useStoredAcademyId } from "@/lib/academy-selection";

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
 * MeProvider/FeaturesProvider. Si el fetch falla quedan null/[] →
 * `resolved=false` en useActorEntitlements (selección no resoluble)
 * y el chrome no recorta (fail-open, igual que durante la carga):
 * las páginas gatean por `academy.tier`/endpoint y el 403
 * `tier.required` es la red de seguridad. Solo se pide cuando hay
 * un rol que lo consume (PRODUCER u ACADEMY_OWNER) - el bailarín
 * puro no paga el request.
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
  /** false cuando los entitlements no resuelven la selección: la
      persistida no es una academia propia (membresía instructor/staff),
      la lista propia viene vacía o el fetch falló. En todos los casos
      el caller no puede afirmar el tier y no debe recortar (fail-open;
      las páginas y el API gatean por `academy.tier` - spec
      academy-tier-gates-refine). */
  resolved: boolean;
  has: (feature: string) => boolean;
} {
  const { producer, academies, loading } = useEntitlements();
  // Selección persistida reactiva: cambios desde el switcher de la
  // nav, el gate del hub u otra pestaña re-resuelven la entrada.
  const stored = useStoredAcademyId();

  let entry: ActorEntitlement | null = null;
  let resolved = true;
  if (actorType === "PRODUCER") {
    entry = producer;
    resolved = producer != null;
  } else {
    const target = actorId ?? stored;
    if (target != null) {
      // Selección explícita/persistida: solo cuenta el match exacto -
      // caer a academies[0] gatearía con el tier de otra academia.
      entry = academies.find((a) => a.id === target) ?? null;
      resolved = entry != null;
    } else {
      entry = academies[0] ?? null;
      resolved = academies.length > 0;
    }
  }

  const features = entry?.features ?? [];
  const set = new Set(features);
  return {
    tier: entry?.tier ?? null,
    features,
    loading,
    resolved,
    has: (feature: string) => set.has(feature),
  };
}
