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
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

// Respuesta de GET /me - contrato completo compartido por las
// superficies de (app). Los campos que solo usan páginas puntuales
// (styleRoles, enrollments…) van opcionales pero vienen siempre en el
// payload: un solo fetch sirve a todas las páginas sin waterfall.
export type MeStyleRole = {
  role: "LEADER" | "FOLLOWER" | "SWITCH";
  level: string | null;
  style: { id: string; name: string; genre: string | null };
};

export type MeEnrollment = {
  status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE";
  startedAt: string;
  academy: { id: string; name: string };
  plan: { name: string } | null;
};

export type MeContextData = {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  photoUrl: string | null;
  instagram?: string | null;
  birthDate?: string | null;
  createdAt?: string;
  verifiedAt?: string | null;
  gender?: "M" | "F" | "OTHER" | null;
  styleRoles?: MeStyleRole[];
  enrollments?: MeEnrollment[];
  roles: string[];
  roleStates?: { role: string; status: string }[];
  consentAcceptedAt?: string | null;
  consentVersion?: string | null;
  // Jurisdicción legal ("CL" | "EU") - el ConsentBanner consulta el
  // texto vigente por jurisdicción (GET /legal/consent).
  jurisdiction?: string | null;
  // Cuenta demo de lead pendiente de activación - el chrome pide
  // completar el perfil (POST /me/complete-profile la vuelve real).
  pendingProfile?: boolean;
  // La cuenta tiene contraseña (spec cambiar-password): false = solo
  // magic link → la sección Seguridad ofrece "establecer" sin pedir la
  // actual. El hash nunca viaja en /me.
  hasPassword?: boolean;
  // Los entitlements del productor/academias ya no viajan en /me: los
  // gates de tier consultan GET /me/entitlements vía
  // EntitlementsProvider (spec unified-actor-entitlements).
  // Tours de primera visita ya vistos (POST /me/onboarding los marca).
  onboarding?: Record<string, string>;
  // Idioma preferido persistido (spec i18n-multi-locale) - si difiere
  // del locale activo el provider navega al path localizado.
  language?: string;
};

type MeContextValue = {
  /** null tras resolver = sin sesión (401) - no confundir con loading. */
  me: MeContextData | null;
  /** true solo durante el primer fetch (o un refresh sin me previo). */
  loading: boolean;
  /** true cuando el último fetch falló por red/5xx (no por 401). */
  error: boolean;
  /** Refetch de /me - tras mutaciones propias (PATCH /me, consent) o
      retry de error. No bloquea: con `me` previo la UI sigue pintada. */
  refresh: () => Promise<void>;
};

const MeContext = createContext<MeContextValue | null>(null);

/**
 * /me compartido de la app autenticada: un solo fetch por sesión de
 * (app) en vez de uno por página/componente. Se monta en el layout del
 * grupo - NO bloquea children: cada consumidor gatea con `loading` lo
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
  // una mutación) - todos esperan el mismo fetch en vuelo.
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current ??= (async () => {
      // Sin me previo el consumidor depende de `loading` para no
      // pintar contenido por defecto - se reactiva durante el refetch.
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

  // Re-fetch al volver a foreground: la PWA conserva /me en memoria y
  // cambios externos (rol aprobado por admin, nueva membresía) solo se
  // veían al reabrir la app entera.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Idioma persistido vs locale activo: al primer /me resuelto con
  // language distinto, navega al path localizado (la preferencia viaja
  // entre dispositivos vía Person.language). Una sola vez por carga de
  // me - el ref evita loop si el usuario cambia de idioma después.
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const langSynced = useRef(false);
  useEffect(() => {
    if (langSynced.current || !me?.language) return;
    langSynced.current = true;
    if (me.language !== locale) {
      router.replace(pathname, { locale: me.language });
    }
  }, [me?.language, locale, pathname, router]);

  return (
    <MeContext.Provider value={{ me, loading, error, refresh }}>
      {children}
    </MeContext.Provider>
  );
}

/**
 * Lee el /me compartido. Solo usar dentro de (app) - fuera del provider
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
