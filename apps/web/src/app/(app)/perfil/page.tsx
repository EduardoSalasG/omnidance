"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  setActiveRole,
  useActiveRole,
  type AppRole,
} from "@/lib/active-role";
import { Badge, Button, Card } from "@/components/ui";

type Me = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  roles: string[];
  roleStates?: { role: string; status: string }[];
};

type RoleCatalogItem = { key: string; label: string };

type Streak = {
  currentWeeks: number;
  bestWeeks: number;
};

type BadgeItem = {
  badge: { key: string; name: string; category: string };
  awardedAt?: string;
};

type PageState = "loading" | "ready" | "unauth" | "error";

// El catálogo de roles solicitables vive en DB (GET /roles/catalog);
// las etiquetas i18n son fallback para keys sin label de catálogo.

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
  "ADMIN",
];

export default function PerfilPage() {
  const t = useTranslations("profile");
  const tg = useTranslations("gamification");
  const tc = useTranslations("common");

  const [state, setState] = useState<PageState>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [pendingRoles, setPendingRoles] = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<RoleCatalogItem[]>([]);
  const activeRole = useActiveRole(me?.roles);
  // Override local para feedback inmediato al cambiar de lente; el hook
  // converge al mismo valor cuando el evento de rol se propaga.
  const [picked, setPicked] = useState<AppRole | null>(null);

  function roleLabel(role: string): string {
    const fromCatalog = catalog.find((r) => r.key === role)?.label;
    if (fromCatalog) return fromCatalog;
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
        setMe((await meRes.json()) as Me);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
        return;
      }

      // Gamificación + catálogo de roles en paralelo — fallos no bloquean
      try {
        const [streakRes, badgesRes, catalogRes] = await Promise.all([
          apiFetch("/gamification/me/streak"),
          apiFetch("/gamification/me/badges"),
          apiFetch("/roles/catalog"),
        ]);
        if (cancelled) return;
        if (streakRes.ok) setStreak((await streakRes.json()) as Streak);
        if (badgesRes.ok) {
          const json: unknown = await badgesRes.json();
          setBadges(Array.isArray(json) ? (json as BadgeItem[]) : []);
        }
        if (catalogRes.ok) {
          const json: unknown = await catalogRes.json();
          setCatalog(Array.isArray(json) ? (json as RoleCatalogItem[]) : []);
        }
      } catch {
        // Silencioso: widgets muestran valores por defecto
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function requestRole(role: string) {
    setRequesting(role);
    try {
      const res = await apiFetch("/roles/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setPendingRoles((prev) => new Set(prev).add(role));
      }
    } catch {
      // Endpoint en construcción — el usuario puede reintentar
    } finally {
      setRequesting(null);
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
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  if (state === "loading" || state === "error" || !me) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p
          role={state === "error" ? "alert" : "status"}
          className="text-white/50"
        >
          {state === "error" ? tc("error") : tc("loading")}
        </p>
      </main>
    );
  }

  const heldRoles = new Set(
    me.roleStates?.map((r) => r.role) ?? me.roles,
  );
  const requestable = catalog
    .map((r) => r.key)
    .filter((r) => !heldRoles.has(r));

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
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Identidad */}
      <Card className="flex items-center gap-4">
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

      {/* Interactuar como — cambia el lente de toda la app (nav + home).
          Radiogroup nativo: un tab stop, flechas cambian de opción (mismo
          patrón que el segmented del hub /qr). Se oculta si solo hay una
          opción (DANCER puro): sin opciones no hay decisión. */}
      {actAsOptions.length > 1 && (
        <Card>
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

      {/* Racha — orgullo, grande */}
      <Card>
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
                <span className="font-medium leading-tight">{b.badge.name}</span>
                <Badge variant="muted" className="w-fit">
                  {b.badge.category}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Solicitar rol */}
      {requestable.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("requestRole")}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {requestable.map((role) => {
              const pending = pendingRoles.has(role);
              return (
                <li
                  key={role}
                  className="flex min-h-11 items-center justify-between gap-3"
                >
                  <span className="text-sm font-medium">{roleLabel(role)}</span>
                  {pending ? (
                    <Badge variant="outline">{t("rolePending")}</Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={requesting !== null}
                      onClick={() => requestRole(role)}
                    >
                      {t("requestRole")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Button variant="secondary" onClick={logout} className="w-full">
        {t("logout")}
      </Button>
    </main>
  );
}
