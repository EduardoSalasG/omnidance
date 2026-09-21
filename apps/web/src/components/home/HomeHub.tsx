"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useActiveRole } from "@/lib/active-role";
import { useViewMode } from "@/lib/view-mode";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageLoading, Spinner } from "@/components/ui/spinner";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

type Me = {
  id: string;
  name: string;
  roles: string[];
  roleStates?: { role: string; status: string }[];
};

type Kpi = { key: string; value: number; format?: "clp" };
type NextItem = { id: string; name: string; when: string; place: string | null };
type HomeStats = {
  kpis: Kpi[];
  tonight?: {
    id: string;
    name: string;
    startsAt: string;
    venueName: string | null;
    presalePrice: number | null;
    hasTicket: boolean;
  } | null;
  nextClass?: NextItem | null;
  nextGig?: NextItem | null;
  nextShift?: NextItem | null;
  needsAcademy?: boolean;
};

// KPIs que representan trabajo pendiente — se destacan con borde de
// acento para que el dashboard "grite" lo accionable.
const ATTENTION_KEYS = new Set(["pendingRoles", "pendingPayouts"]);

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const timeFmt = new Intl.DateTimeFormat("es-CL", {
  hour: "numeric",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function KpiGrid({ kpis, label }: { kpis: Kpi[]; label: string }) {
  const t = useTranslations("home");
  if (kpis.length === 0) return null;
  return (
    <section aria-label={label} data-tour="home-stats">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
        {label}
      </h2>
      <ul className="grid grid-cols-2 gap-3">
        {kpis.map((k) => (
          <li
            key={k.key}
            className={`rounded-xl border bg-night-800/60 px-4 py-3 ${
              ATTENTION_KEYS.has(k.key) && k.value > 0
                ? "border-neon/60"
                : "border-night-700"
            }`}
          >
            <span className="block text-2xl font-bold tabular-nums">
              {k.format === "clp" ? clp.format(k.value) : k.value}
            </span>
            <span className="text-xs text-white/50">{t(`kpi.${k.key}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Hero = {
  href: string;
  title: string;
  desc: string;
  cta: string;
  secondary?: { href: string; label: string };
};

export function HomeHub() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const te = useTranslations("events");
  const tq = useTranslations("qr");
  const tst = useTranslations("staff");
  const ta = useTranslations("academy");
  const tpr = useTranslations("producer");
  const tad = useTranslations("admin");
  const tt = useTranslations("tours.home");

  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  // Stats versionados por lente: {key: "ROLE:mode"} — al cambiar de
  // lente el slot viejo no se muestra nunca (cero flash de KPIs/hero
  // ajenos); mientras resuelve el fetch de la lente actual → spinner.
  const [statsSlot, setStatsSlot] = useState<{
    key: string;
    data: HomeStats | null;
  } | null>(null);
  const activeRole = useActiveRole(me?.roles);
  const viewMode = useViewMode();
  const dancerAcademy = activeRole === "DANCER" && viewMode === "academy";
  const lensKey = `${activeRole}:${viewMode}`;

  useEffect(() => {
    let cancelled = false;
    apiFetch("/me")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) setMe((await res.json()) as Me);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // KPIs del home: un solo request agregado por lente (+ modo consumer).
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const key = `${activeRole}:${viewMode}`;
    apiFetch(`/home/stats?role=${activeRole}&mode=${viewMode}`)
      .then(async (res) => {
        if (cancelled) return;
        // Error de red/500 → data null: la lente queda "resuelta" con
        // fallback (no spinner eterno).
        setStatsSlot({
          key,
          data: res.ok ? ((await res.json()) as HomeStats) : null,
        });
      })
      .catch(() => {
        if (!cancelled) setStatsSlot({ key, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [me, activeRole, viewMode]);

  // null hasta que el fetch de ESTA lente resuelva — los heroes que
  // dependen de stats (dancer/staff/dj/venue) nunca ven datos ajenos.
  const stats = statsSlot?.key === lensKey ? statsSlot.data : null;
  const statsPending =
    me !== null &&
    statsSlot?.key !== lensKey &&
    (activeRole === "DANCER" ||
      activeRole === "STAFF" ||
      activeRole === "DJ" ||
      activeRole === "VENUE_MANAGER");

  if (!checked) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner size="lg" className="page-loading" />
      </main>
    );
  }

  // Cookie presente pero sesión expirada — CTA de re-login.
  if (!me) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 p-6">
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <Button href="/login" size="lg" className="w-full">
            {tc("login")}
          </Button>
        </Card>
      </main>
    );
  }

  // Hero = acción principal. DANCER: "Esta noche" real (stats.tonight) o
  // próxima clase en modo Academia; management: su consola. DJ/VENUE
  // comparten el hero de consumo sin el QR personal.
  const hero: Hero = (() => {
    if (activeRole === "DANCER") {
      if (dancerAcademy) {
        if (stats?.needsAcademy || stats?.kpis.length === 0) {
          return {
            href: "/academias",
            title: t("modeAcademy"),
            desc: t("academyEmpty"),
            cta: t("findAcademy"),
          };
        }
        const nc = stats?.nextClass;
        return nc
          ? {
              href: "/academia",
              title: nc.name,
              desc: `${t("nextClass")} — ${dayFmt.format(new Date(nc.when))}${nc.place ? ` · ${nc.place}` : ""}`,
              cta: t("academyHeroCta"),
            }
          : {
              href: "/academias",
              title: t("modeAcademy"),
              desc: t("academyHeroDesc"),
              cta: t("findAcademy"),
            };
      }
      const tonight = stats?.tonight;
      if (tonight) {
        return {
          href: tonight.hasTicket ? "/qr" : `/eventos/${tonight.id}`,
          title: tonight.name,
          desc: `${t("tonight")} · ${timeFmt.format(new Date(tonight.startsAt))}${tonight.venueName ? ` · ${tonight.venueName}` : ""}${tonight.hasTicket ? ` — ${t("hasTicketTonight")}` : ""}`,
          cta: tonight.hasTicket ? t("myQr") : t("buyPresale"),
          secondary: tonight.hasTicket
            ? { href: `/eventos/${tonight.id}`, label: t("viewEvent") }
            : undefined,
        };
      }
      return {
        href: "/eventos",
        title: t("tonight"),
        desc: stats ? t("noEventTonight") : t("dancerHeroDesc"),
        cta: t("seeEvents"),
        secondary: { href: "/qr", label: tq("title") },
      };
    }
    switch (activeRole) {
      case "ADMIN":
        return {
          href: "/admin",
          title: tad("title"),
          desc: t("adminHeroDesc"),
          cta: t("adminHeroCta"),
        };
      case "PRODUCER":
        return {
          href: "/productor/eventos",
          title: tpr("myEvents"),
          desc: tpr("navEventsDesc"),
          cta: t("producerHeroCta"),
          secondary: {
            href: "/productor/eventos?crear=1",
            label: tpr("createEvent"),
          },
        };
      case "ACADEMY_OWNER":
      case "INSTRUCTOR":
        return {
          href: "/academia",
          title: ta("title"),
          desc: t("academyHeroDesc"),
          cta: t("academyHeroCta"),
        };
      case "STAFF": {
        const shift = stats?.nextShift;
        return {
          href: shift ? `/staff/${shift.id}` : "/staff",
          title: shift ? shift.name : tst("title"),
          desc: shift
            ? `${t("nextShift")} — ${dayFmt.format(new Date(shift.when))}${shift.place ? ` · ${shift.place}` : ""}`
            : t("staffHeroDesc"),
          cta: t("staffHeroCta"),
        };
      }
      default: {
        // DJ | VENUE_MANAGER
        const gig = stats?.nextGig;
        return gig
          ? {
              href: `/eventos/${gig.id}`,
              title: gig.name,
              desc: `${t("nextGig")} — ${dayFmt.format(new Date(gig.when))}${gig.place ? ` · ${gig.place}` : ""}`,
              cta: t("viewEvent"),
            }
          : {
              href: "/eventos",
              title: te("title"),
              desc: t("dancerHeroDesc"),
              cta: t("seeEvents"),
            };
      }
    }
  })();

  // Multi-rol: en vez de mezclar módulos, se sugiere cambiar de lente.
  const approvedCount = (
    me.roleStates ?? me.roles.map((r) => ({ role: r, status: "APPROVED" }))
  ).filter((s) => s.status === "APPROVED").length;
  const multiRole = me.roles.length > 1 || approvedCount > 1;

  const kpiLabel = activeRole === "DANCER" ? t("insights") : t("overview");

  // Mientras los stats de la lente no resuelven, el hub entero espera:
  // pintar "Hola" primero y el resto después produce carga a pedazos —
  // la regla es UI final o spinner, nunca progresiva.
  if (statsPending) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col p-6">
        <PageLoading />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 p-6">
      <header className="flex flex-col gap-3 pt-4">
        <h2 className="text-lg font-medium">
          {t("hi", { name: me.name.split(" ")[0] })}
        </h2>
      </header>

      {stats && stats.kpis.length > 0 && (
        <KpiGrid kpis={stats.kpis} label={kpiLabel} />
      )}

      <section aria-label={hero.title}>
        <Link
          href={hero.href}
          className="flex min-h-11 flex-col gap-1.5 rounded-2xl border border-neon/40 bg-night-800/70 p-5 transition-colors transition-transform hover:border-neon active:scale-[0.99]"
        >
          <span className="text-xl font-bold leading-tight">
            {hero.title}
          </span>
          <span className="text-sm text-white/60">{hero.desc}</span>
          <span className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-neon">
            {hero.cta}
            <span aria-hidden>→</span>
          </span>
        </Link>
        {hero.secondary && (
          <Button
            href={hero.secondary.href}
            variant="secondary"
            className="mt-3 w-full"
          >
            {hero.secondary.label}
          </Button>
        )}
      </section>

      {multiRole && (
        <Link
          href="/perfil"
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-night-700 bg-night-900 px-4 py-3 text-sm text-white/55 transition-colors hover:border-neon/40 hover:text-white/80"
        >
          <span>{t("switchRoleHint")}</span>
          <span aria-hidden className="text-neon">
            →
          </span>
        </Link>
      )}

      {/* Tour de primera visita — solo lente bailarín social (los tabs
          del nav referenciados son los de esa lente). */}
      {activeRole === "DANCER" && !dancerAcademy && (
        <OnboardingRunner
          tour="home"
          steps={[
            {
              element: "[data-tour='home-stats']",
              title: tt("s1.title"),
              description: tt("s1.desc"),
            },
            {
              element: "[data-tour='nav-events']",
              title: tt("s2.title"),
              description: tt("s2.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-more']",
              title: tt("s3.title"),
              description: tt("s3.desc"),
              side: "top",
            },
            {
              element: "[data-tour='nav-profile']",
              title: tt("s4.title"),
              description: tt("s4.desc"),
              side: "top",
            },
          ] satisfies TourStep[]}
        />
      )}
    </main>
  );
}
