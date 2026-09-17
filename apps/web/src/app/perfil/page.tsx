"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

type Me = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  roles: string[];
};

type Streak = {
  currentWeeks: number;
  bestWeeks: number;
};

type BadgeItem = {
  key: string;
  name: string;
  category: string;
  awardedAt?: string;
};

type PageState = "loading" | "ready" | "unauth" | "error";

const REQUESTABLE_ROLES = [
  "DJ",
  "PRODUCER",
  "STAFF",
  "VENUE_MANAGER",
  "ACADEMY_OWNER",
  "INSTRUCTOR",
] as const;

// i18n: claves pendientes en el catálogo (reportadas al coordinador) —
// etiquetas legibles de roles y mensaje de insignias vacío.
const ROLE_LABELS: Record<string, string> = {
  DANCER: "Bailarín/a",
  DJ: "DJ",
  PRODUCER: "Productor/a",
  STAFF: "Staff",
  VENUE_MANAGER: "Venue Manager",
  ACADEMY_OWNER: "Dueño/a de academia",
  INSTRUCTOR: "Instructor/a",
};

const BADGES_EMPTY_FALLBACK =
  "Aún no tienes insignias — sal a bailar esta semana y gana la primera.";

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

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

      // Gamificación se construye en paralelo — fallos no bloquean el perfil
      try {
        const [streakRes, badgesRes] = await Promise.all([
          apiFetch("/gamification/me/streak"),
          apiFetch("/gamification/me/badges"),
        ]);
        if (cancelled) return;
        if (streakRes.ok) setStreak((await streakRes.json()) as Streak);
        if (badgesRes.ok) {
          const json: unknown = await badgesRes.json();
          setBadges(Array.isArray(json) ? (json as BadgeItem[]) : []);
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  if (state === "loading" || state === "error" || !me) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-white/50">
          {state === "error" ? tc("error") : tc("loading")}
        </p>
      </main>
    );
  }

  const heldRoles = new Set(me.roles);
  const requestable = REQUESTABLE_ROLES.filter((r) => !heldRoles.has(r));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Identidad */}
      <Card className="flex items-center gap-4">
        {me.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URLs externas, dominios no configurados
          <img
            src={me.photoUrl}
            alt={me.name}
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
          {me.roles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {me.roles.map((r) => (
                <Badge key={r} variant="neon">
                  {roleLabel(r)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

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
          <p className="mt-3 text-sm text-white/60">{BADGES_EMPTY_FALLBACK}</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {badges.map((b) => (
              <li
                key={b.key}
                className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-800/50 p-3"
              >
                <span className="font-medium leading-tight">{b.name}</span>
                <Badge variant="muted" className="w-fit">
                  {b.category}
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
