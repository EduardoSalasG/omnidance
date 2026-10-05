"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  getStoredActiveRole,
  setActiveRole,
  useActiveRole,
  type AppRole,
} from "@/lib/active-role";
import { useViewMode } from "@/lib/view-mode";
import { useMe } from "@/lib/me-context";
import { KpiGrid, type Kpi } from "@/components/home/kpi-grid";
import { Badge, Button, Card, RefreshIcon, Skeleton } from "@/components/ui";
import { OnboardingRunner, type TourStep } from "@/components/onboarding/OnboardingRunner";

type Streak = {
  currentWeeks: number;
  bestWeeks: number;
};

type BadgeItem = {
  badge: { key: string; name: string; category: string };
  awardedAt?: string;
};

type PageState = "loading" | "ready" | "unauth" | "error";

// Orden canónico para el switcher "Interactuar como" — DANCER primero
// (lente consumidor) y luego los roles de gestión/operación.
const ACT_AS_ORDER: AppRole[] = [
  "DANCER",
  "STAFF",
  "PRODUCER",
  "ACADEMY_OWNER",
  "INSTRUCTOR",
  "DJ",
  "VENUE_MANAGER",
  "SUPPORT",
  "ADMIN",
];

// Insignias del modo academy — espejo del catálogo sembrado
// (BADGE_CATALOG en seed-common.ts). El resto son nightlife.
const ACADEMY_BADGE_KEYS = new Set([
  "primera_clase",
  "alumno_constante",
  "racha_academia",
  "explorador_academias",
]);

/** Aviso del retorno de Flow para suscripciones de plataforma
    (platform-customer-return): cuando el disclaimer de tarjeta falla y
    no se puede resolver la academia/productor del registro, el 303
    aterriza acá con ?sub=error (fallback neutro — mismo copy que la
    ficha de academia). */
function SubReturnNotice() {
  const ts = useTranslations("subscriptions");
  if (useSearchParams().get("sub") !== "error") return null;
  return (
    <p role="alert" className="text-sm text-red-400">
      {ts("subError")}
    </p>
  );
}

export default function PerfilPage() {
  const t = useTranslations("profile");
  const tpay = useTranslations("payments");
  const tg = useTranslations("gamification");
  const tc = useTranslations("common");
  const th = useTranslations("home");
  const tt = useTranslations("tours.perfil");

  // /me compartido (MeProvider del layout) — un solo fetch por sesión;
  // retry del estado de error = refresh del contexto.
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const state: PageState = meLoading
    ? "loading"
    : meError
      ? "error"
      : me
        ? "ready"
        : "unauth";
  // Sesión resuelta sin usuario — los fetches especulativos se detienen.
  // Mientras /me sigue en vuelo los datos se piden en paralelo (la lente
  // viene de localStorage, no de me): sin esto KPIs/racha/insignias
  // esperaban a /me para disparar → waterfall de dos round-trips y la
  // grilla aparecía de golpe después del primer paint.
  const noSession = !meLoading && !meError && !me;
  const [streak, setStreak] = useState<Streak | null>(null);
  // Fetch de racha falló → la card se oculta (mejor que un "0" falso o
  // un skeleton perpetuo).
  const [streakFailed, setStreakFailed] = useState(false);
  const [badges, setBadges] = useState<BadgeItem[] | null>(null);
  // Gamificación es one-shot y solo para lentes no-ADMIN: si el usuario
  // cambia de ADMIN a otra lente sin recargar, se trae perezosamente.
  const [gamifFetched, setGamifFetched] = useState(false);
  const activeRole = useActiveRole(me?.roles);
  // Override local para feedback inmediato al cambiar de lente; el hook
  // converge al mismo valor cuando el evento de rol se propaga.
  const [picked, setPicked] = useState<AppRole | null>(null);

  function roleLabel(role: string): string {
    return t.has(`roleLabels.${role}`) ? t(`roleLabels.${role}`) : role;
  }

  // /me llega del contexto — no hay boot local. Con lente ADMIN no hay
  // gamificación (ni fetch ni cards); el efecto de insignias la omite.

  // Cambio de lente ADMIN → otra sin recargar: trae la gamificación
  // que el load inicial omitió (one-shot por gamifFetched).
  const currentLens = picked ?? activeRole;
  const viewMode = useViewMode();
  // Insights de la lente DANCER — todos, no el subset del home:
  // social (racha/puntos/insignias/bailes) o academia (inscripciones/
  // clases del mes) según el view-mode activo.
  const [kpis, setKpis] = useState<Kpi[] | null>(null);
  // Fetch de KPIs falló → la sección se omite (mejor que skeleton
  // perpetuo); el gate de pintura igual la espera como "settled".
  const [kpisFailed, setKpisFailed] = useState(false);
  useEffect(() => {
    if (noSession || currentLens !== "DANCER") {
      setKpis(null);
      setKpisFailed(false);
      return;
    }
    let cancelled = false;
    apiFetch(`/home/stats?role=DANCER&mode=${viewMode}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setKpisFailed(true);
          return;
        }
        const stats = (await res.json()) as { kpis?: Kpi[] };
        setKpis(stats.kpis ?? []);
      })
      .catch(() => {
        if (!cancelled) setKpisFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [noSession, currentLens, viewMode]);

  // Racha por modo: social = semanas saliendo; academy = semanas
  // asistiendo a clases. Re-fetchea al cambiar de modo — el número
  // viejo se limpia primero: mostrar el streak de social con el copy
  // de academia (o viceversa) sería un flash de dato ajeno.
  useEffect(() => {
    if (noSession || currentLens === "ADMIN") {
      setStreak(null);
      return;
    }
    let stale = false;
    setStreak(null);
    setStreakFailed(false);
    void apiFetch(`/gamification/me/streak?mode=${viewMode}`)
      .then(async (res) => {
        if (stale) return;
        if (!res.ok) {
          setStreakFailed(true);
          return;
        }
        setStreak((await res.json()) as Streak);
      })
      .catch(() => {
        if (!stale) setStreakFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [noSession, currentLens, viewMode]);

  // Insignias — ambos modos tienen catálogo propio (nightlife: sesiones/
  // check-ins; academy: asistencias/constancia). Lazy one-shot; badges
  // queda null mientras el fetch está en vuelo (→ skeleton, nunca el
  // empty-state prematuro).
  useEffect(() => {
    if (noSession || gamifFetched || currentLens === "ADMIN") {
      return;
    }
    let stale = false;
    void apiFetch("/gamification/me/badges")
      .then(async (res) => {
        if (stale) return;
        setGamifFetched(true);
        if (!res.ok) return;
        const json: unknown = await res.json();
        setBadges(Array.isArray(json) ? (json as BadgeItem[]) : []);
      })
      .catch(() => {
        if (!stale) setGamifFetched(true);
      });
    return () => {
      stale = true;
    };
  }, [noSession, gamifFetched, currentLens, viewMode]);

  const visibleBadges = (badges ?? []).filter((b) =>
    viewMode === "academy"
      ? ACADEMY_BADGE_KEYS.has(b.badge.key)
      : !ACADEMY_BADGE_KEYS.has(b.badge.key),
  );

  // Gate del primer paint: los fetches de la lente van en paralelo con
  // /me — el shell espera a que TODOS resuelvan (o fallen) para pintar
  // una sola vez con el layout final. Sin esto la grilla de KPIs se
  // insertaba entre identidad y la racha y "Semanas seguidas" bajaba
  // de golpe (el skeleton no medía lo mismo que la grilla real).
  // El latch es one-way: al cambiar de lente/mode los datos refetchean
  // con skeleton in-card — nunca se vuelve al shell de página.
  const lensSettled =
    currentLens === "ADMIN" ||
    ((streak !== null || streakFailed) &&
      gamifFetched &&
      (currentLens !== "DANCER" || kpis !== null || kpisFailed));
  const [pageSettled, setPageSettled] = useState(false);
  useEffect(() => {
    if (!pageSettled && me && lensSettled) setPageSettled(true);
  }, [pageSettled, me, lensSettled]);

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Igual redirigimos — la cookie expirará o se limpiará en el login
    }
    window.location.href = "/";
  }

  if (state === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <p role="alert" className="text-white/50">
          {tc("error")}
        </p>
        <Button variant="secondary" onClick={() => void refreshMe()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </main>
    );
  }

  if (state === "loading" || !me || !pageSettled) {
    // Shell skeleton con la forma real de la página — nunca pantalla en
    // blanco con spinner. La lente guardada (localStorage) ya decide qué
    // secciones esbozar: sin roles resueltos aún, resolveActiveRole cae
    // a DANCER y un productor vería skeletons de secciones que nunca le
    // aparecen → leer el storage directo. `pageSettled` además retiene
    // el shell hasta que KPIs/racha/insignias resuelven: sin el gate la
    // grilla se insertaba empujando la racha hacia abajo.
    const shellLens = picked ?? getStoredActiveRole() ?? "DANCER";
    return (
      <main
        aria-busy="true"
        aria-label={tc("loading")}
        className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6"
      >
        <Card className="flex items-center gap-4" aria-hidden="true">
          <Skeleton className="page-loading h-16 w-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="page-loading h-5 w-40" />
            <Skeleton className="page-loading mt-2 h-4 w-56" />
            <Skeleton className="page-loading mt-3 h-6 w-44 rounded-full" />
          </div>
        </Card>
        {shellLens === "DANCER" && (
          <section aria-hidden="true">
            <Skeleton className="page-loading mb-3 h-4 w-36" />
            <ul className="grid grid-cols-2 gap-3">
              {/* El skeleton debe medir lo mismo que la grilla real:
                  social trae 4 KPIs (racha/puntos/insignias/bailes),
                  academia solo 2 (inscripciones/clases del mes) — con 4
                  placeholders la sección encogía al asentar y la racha
                  se movía (mismo flash que el pop-in original). */}
              {Array.from(
                { length: viewMode === "academy" ? 2 : 4 },
                (_, i) => (
                  <li key={i}>
                    <Skeleton className="page-loading h-[68px] w-full rounded-xl" />
                  </li>
                ),
              )}
            </ul>
          </section>
        )}
        {shellLens !== "ADMIN" && (
          <>
            <Card aria-hidden="true">
              <Skeleton className="page-loading h-4 w-24" />
              <Skeleton className="page-loading mt-2 h-[3.75rem] w-24" />
              <Skeleton className="page-loading mt-2 h-4 w-52" />
            </Card>
            <Card aria-hidden="true">
              <Skeleton className="page-loading h-4 w-24" />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton
                    key={i}
                    className="page-loading h-[74px] w-full rounded-xl"
                  />
                ))}
              </div>
            </Card>
          </>
        )}
        <Card aria-hidden="true">
          <Skeleton className="page-loading h-4 w-24" />
        </Card>
      </main>
    );
  }

  // "Interactuar como": roles aprobados del usuario + DANCER siempre
  // (lente consumidor — no se duplica si ya viene aprobado).
  const approvedRoles = new Set(
    (
      me.roleStates ?? me.roles.map((r) => ({ role: r, status: "APPROVED" }))
    )
      .filter((r) => r.status === "APPROVED")
      .map((r) => r.role),
  );
  const actAsOptions = ACT_AS_ORDER.filter(
    (r) => r === "DANCER" || approvedRoles.has(r),
  );
  const currentActAs = picked ?? activeRole;

  return (
    // Sin min-h-dvh: el wrapper del chrome ya reserva el clearance de
    // la tab bar — forzar alto de viewport dejaba scroll muerto al pie.
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      {/* Fallback del retorno de suscripción de plataforma (?sub=error)
          — useSearchParams exige Suspense. */}
      <Suspense>
        <SubReturnNotice />
      </Suspense>
      {/* Identidad → /perfil/datos (datos personales + datos por modo;
          la edición de Instagram vive allá). */}
      <Link
        href="/perfil/datos"
        data-tour="perfil-identity"
        className="block rounded-2xl transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
      >
        <Card className="flex items-center gap-4 transition-colors hover:border-neon/40">
          {me.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URLs externas, dominios no configurados
            <img
              src={me.photoUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full border border-night-700 object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-night-700 bg-night-800 text-2xl font-bold text-neon"
            >
              {me.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{me.name}</p>
            <p className="truncate text-sm text-white/50">
              {me.email ?? "—"}
            </p>
            {(me.roleStates ?? me.roles.map((r) => ({ role: r, status: "APPROVED" })))
              .length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(me.roleStates ??
                  me.roles.map((r) => ({ role: r, status: "APPROVED" }))
                ).map((rs) => (
                  <Badge
                    key={rs.role}
                    variant={rs.status === "APPROVED" ? "neon" : "outline"}
                  >
                    {roleLabel(rs.role)}
                    {rs.status !== "APPROVED" && (
                      <span className="ml-1 text-white/50">
                        ·{" "}
                        {rs.status === "SANDBOX"
                          ? t("roleSandbox")
                          : t("rolePending")}
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 text-white/40"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Card>
      </Link>

      {/* Tu actividad — todos los insights de la lente DANCER activa
          (social o academia); el home social muestra solo 2. Mientras
          el fetch está en vuelo el slot se reserva con skeleton — sin
          el slot la grilla aparecía entre identidad y "Interactuar
          como" empujando todo hacia abajo. */}
      {currentActAs === "DANCER" &&
        (kpis === null && !kpisFailed ? (
          <section aria-hidden="true">
            <Skeleton className="page-loading mb-3 h-4 w-36" />
            <ul className="grid grid-cols-2 gap-3">
              {/* Mismo conteo por modo que el shell: academy = 2 KPIs. */}
              {Array.from(
                { length: viewMode === "academy" ? 2 : 4 },
                (_, i) => (
                  <li key={i}>
                    <Skeleton className="page-loading h-[68px] w-full rounded-xl" />
                  </li>
                ),
              )}
            </ul>
          </section>
        ) : (
          kpis !== null &&
          kpis.length > 0 && <KpiGrid kpis={kpis} label={th("insights")} />
        ))}

      {/* Interactuar como — cambia el lente de toda la app (nav + home).
          Radiogroup nativo: un tab stop, flechas cambian de opción (mismo
          patrón que el segmented del hub /qr). Se oculta si solo hay una
          opción (DANCER puro): sin opciones no hay decisión. */}
      {actAsOptions.length > 1 && (
        <Card data-tour="perfil-actas">
          <h2
            id="act-as-title"
            className="text-sm font-semibold uppercase tracking-wide text-white/50"
          >
            {t("actAs")}
          </h2>
          <div
            role="radiogroup"
            aria-labelledby="act-as-title"
            className="mt-3 flex flex-wrap gap-2"
          >
            {actAsOptions.map((role) => (
              <label key={role} className="cursor-pointer">
                <input
                  type="radio"
                  name="act-as-role"
                  value={role}
                  checked={currentActAs === role}
                  onChange={() => {
                    setPicked(role);
                    setActiveRole(role);
                  }}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 select-none items-center rounded-full border border-night-700 bg-night-800 px-4 text-sm font-semibold text-white/70 transition-colors peer-checked:border-neon peer-checked:bg-neon peer-checked:text-night-950 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white active:scale-[0.98] motion-reduce:active:scale-100">
                  {roleLabel(role)}
                </span>
              </label>
            ))}
          </div>
        </Card>
      )}

      {/* Gamificación — solo lente consumidora/operativa; la lente ADMIN
          es gestión pura (ni Racha ni Insignias, y tampoco se fetchean). */}
      {currentActAs !== "ADMIN" && !streakFailed && (
        /* Racha por modo — orgullo, grande. Social = salidas semanales;
           academy = asistencia a clases (mismo card, otra fuente).
           streak null = fetch en vuelo → skeleton; jamás "0" como
           placeholder de un dato real. */
        <Card data-tour="perfil-gamif">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {tg("streak")}
          </h2>
          {streak === null ? (
            <div className="page-loading mt-2 flex flex-col gap-2" aria-hidden="true">
              <Skeleton className="h-[3.75rem] w-24" />
              <Skeleton className="h-4 w-52" />
            </div>
          ) : (
            <>
              <p className="mt-2 text-6xl font-bold leading-none text-neon">
                {streak.currentWeeks}
              </p>
              <p className="mt-2 text-sm text-white/50">
                {tg(viewMode === "academy" ? "streakAcademy" : "streakSocial")}
                {" · "}
                {tg("streakBest")}: {streak.bestWeeks}
              </p>
            </>
          )}
        </Card>
      )}

      {/* Insignias del modo activo: academy muestra las de asistencia/
          constancia/exploración; social las de sesiones/check-ins. Las
          del otro modo se filtran — academy_score sigue privado (spec). */}
      {currentActAs !== "ADMIN" && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {tg("badges")}
          </h2>
          {!gamifFetched ? (
            /* Fetch en vuelo → skeleton con la forma de la grilla —
               el empty-state "aún no tienes insignias" solo es honesto
               cuando el fetch ya resolvió. */
            <ul
              aria-hidden="true"
              className="page-loading mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <Skeleton className="h-[74px] w-full rounded-xl" />
                </li>
              ))}
            </ul>
          ) : visibleBadges.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">
              {tg(viewMode === "academy" ? "badgesEmptyAcademy" : "badgesEmpty")}
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleBadges.map((b) => (
                <li
                  key={b.badge.key}
                  className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-800/50 p-3"
                >
                  <span className="font-medium leading-tight">
                    {b.badge.name}
                  </span>
                  <Badge variant="muted" className="w-fit">
                    {tg.has(`badgeCategory.${b.badge.category}`)
                      ? tg(`badgeCategory.${b.badge.category}`)
                      : b.badge.category}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Historial de compras/cobros del usuario → /perfil/pagos. */}
      <Link
        href="/perfil/pagos"
        className="block rounded-2xl transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
      >
        <Card className="flex items-center justify-between gap-4 transition-colors hover:border-neon/40">
          <span className="text-sm font-semibold">{tpay("title")}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 text-white/40"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Card>
      </Link>

      <Button variant="secondary" onClick={logout} className="w-full">
        {t("logout")}
      </Button>

      {/* Tour de primera visita — monta con `me` resuelto; los targets
          condicionales (act-as, gamificación) se omiten si no aplican. */}
      <OnboardingRunner
        tour="perfil"
        steps={
          [
            {
              element: "[data-tour='perfil-identity']",
              title: tt("s1.title"),
              description: tt("s1.desc"),
            },
            {
              element: "[data-tour='perfil-actas']",
              title: tt("s2.title"),
              description: tt("s2.desc"),
            },
            {
              element: "[data-tour='perfil-gamif']",
              title: tt("s3.title"),
              description: tt("s3.desc"),
            },
          ] satisfies TourStep[]
        }
      />
    </main>
  );
}
