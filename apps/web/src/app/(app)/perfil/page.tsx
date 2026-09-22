"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  resolveActiveRole,
  setActiveRole,
  useActiveRole,
  type AppRole,
} from "@/lib/active-role";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { OnboardingRunner, type TourStep } from "@/components/onboarding/OnboardingRunner";

type Me = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  instagram?: string | null;
  roles: string[];
  roleStates?: { role: string; status: string }[];
};

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

export default function PerfilPage() {
  const t = useTranslations("profile");
  const tg = useTranslations("gamification");
  const tc = useTranslations("common");
  const tt = useTranslations("tours.perfil");

  const [state, setState] = useState<PageState>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  // Gamificación es one-shot y solo para lentes no-ADMIN: si el usuario
  // cambia de ADMIN a otra lente sin recargar, se trae perezosamente.
  const [gamifFetched, setGamifFetched] = useState(false);
  const activeRole = useActiveRole(me?.roles);
  // Override local para feedback inmediato al cambiar de lente; el hook
  // converge al mismo valor cuando el evento de rol se propaga.
  const [picked, setPicked] = useState<AppRole | null>(null);
  // Edición del handle de Instagram (PATCH /me).
  const [igInput, setIgInput] = useState("");
  const [igDirty, setIgDirty] = useState(false);
  const [igState, setIgState] = useState<"idle" | "saving" | "saved" | "err">(
    "idle",
  );

  function roleLabel(role: string): string {
    return t.has(`roleLabels.${role}`) ? t(`roleLabels.${role}`) : role;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const meRes = await apiFetch("/me");
        if (cancelled) return;
        if (meRes.status === 401) {
          setState("unauth");
          return;
        }
        if (!meRes.ok) {
          setState("error");
          return;
        }
        const meJson = (await meRes.json()) as Me;
        setMe(meJson);
        setIgInput(meJson.instagram ?? "");
        setState("ready");
        // Con lente ADMIN no hay gamificación: ni fetch ni cards. Se
        // resuelve con los roles reales de /me — el activeRole del primer
        // render puede ser el default DANCER antes de conocer me.roles.
        if (resolveActiveRole(meJson.roles) === "ADMIN") return;
      } catch {
        if (!cancelled) setState("error");
        return;
      }

      await loadGamification();
    }

    async function loadGamification() {
      // Gamificación en paralelo — fallos no bloquean
      try {
        const [streakRes, badgesRes] = await Promise.all([
          apiFetch("/gamification/me/streak"),
          apiFetch("/gamification/me/badges"),
        ]);
        setGamifFetched(true);
        if (cancelled) return;
        if (streakRes.ok) setStreak((await streakRes.json()) as Streak);
        if (badgesRes.ok) {
          const json: unknown = await badgesRes.json();
          setBadges(Array.isArray(json) ? (json as BadgeItem[]) : []);
        }
      } catch {
        // Silencioso: widgets muestran valores por defecto
        setGamifFetched(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cambio de lente ADMIN → otra sin recargar: trae la gamificación
  // que el load inicial omitió (one-shot por gamifFetched).
  const currentLens = picked ?? activeRole;
  useEffect(() => {
    if (!me || gamifFetched || currentLens === "ADMIN") return;
    let stale = false;
    void Promise.all([
      apiFetch("/gamification/me/streak"),
      apiFetch("/gamification/me/badges"),
    ])
      .then(async ([streakRes, badgesRes]) => {
        setGamifFetched(true);
        if (stale) return;
        if (streakRes.ok) setStreak((await streakRes.json()) as Streak);
        if (badgesRes.ok) {
          const json: unknown = await badgesRes.json();
          setBadges(Array.isArray(json) ? (json as BadgeItem[]) : []);
        }
      })
      .catch(() => setGamifFetched(true));
    return () => {
      stale = true;
    };
  }, [me, gamifFetched, currentLens]);

  async function saveInstagram() {
    setIgState("saving");
    try {
      const res = await apiFetch("/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagram: igInput }),
      });
      if (!res.ok) {
        setIgState("err");
        return;
      }
      const clean = igInput.trim().replace(/^@+/, "");
      setMe((m) => (m ? { ...m, instagram: clean || null } : m));
      setIgInput(clean);
      setIgDirty(false);
      setIgState("saved");
      setTimeout(() => setIgState("idle"), 2500);
    } catch {
      setIgState("err");
    }
  }

  async function logout() {
    try {
      const res = await apiFetch("/auth/logout", { method: "POST" });
      if (res.status === 404) {
        // Endpoint aún no existe — limpieza client-side de cookies
        for (const c of document.cookie.split(";")) {
          const name = c.split("=")[0].trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          }
        }
      }
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

  if (state === "loading" || state === "error" || !me) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        {state === "error" ? (
          <p role="alert" className="text-white/50">
            {tc("error")}
          </p>
        ) : (
          <PageLoading />
        )}
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      {/* Identidad */}
      <Card data-tour="perfil-identity" className="flex items-center gap-4">
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
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{me.name}</p>
          <p className="truncate text-sm text-white/50">{me.email}</p>
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
      </Card>

      {/* Instagram — handle público que ven tus amigos en tu perfil */}
      <Card>
        <h2
          id="ig-title"
          className="text-sm font-semibold uppercase tracking-wide text-white/50"
        >
          {t("instagram")}
        </h2>
        <p className="mt-1 text-xs text-white/40">{t("instagramHint")}</p>
        <div className="mt-3 flex items-center gap-3">
          <label htmlFor="ig-input" className="sr-only">
            {t("instagram")}
          </label>
          <input
            id="ig-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={igInput}
            onChange={(e) => {
              setIgInput(e.target.value);
              setIgDirty(true);
              setIgState("idle");
            }}
            placeholder={t("instagramPlaceholder")}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-night-700 bg-night-900 px-4 text-white placeholder:text-white/40 focus:border-neon focus:outline-none"
          />
          {igDirty && (
            <Button
              size="sm"
              disabled={igState === "saving"}
              onClick={() => void saveInstagram()}
            >
              {tc("save")}
            </Button>
          )}
        </div>
        {igState === "saved" && (
          <p role="status" className="mt-2 text-xs text-neon">
            {t("instagramSaved")}
          </p>
        )}
        {igState === "err" && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {t("instagramError")}
          </p>
        )}
      </Card>

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
      {currentActAs !== "ADMIN" && (
        <>
          {/* Racha — orgullo, grande */}
          <Card data-tour="perfil-gamif">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {tg("streak")}
            </h2>
            <p className="mt-2 text-6xl font-bold leading-none text-neon">
              {streak?.currentWeeks ?? 0}
            </p>
            <p className="mt-2 text-sm text-white/50">
              {tg("streakBest")}: {streak?.bestWeeks ?? 0}
            </p>
          </Card>

          {/* Insignias */}
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {tg("badges")}
            </h2>
            {badges.length === 0 ? (
              <p className="mt-3 text-sm text-white/60">{tg("badgesEmpty")}</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {badges.map((b) => (
                  <li
                    key={b.badge.key}
                    className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-800/50 p-3"
                  >
                    <span className="font-medium leading-tight">
                      {b.badge.name}
                    </span>
                    <Badge variant="muted" className="w-fit">
                      {b.badge.category}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

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
