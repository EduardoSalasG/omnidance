"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useActiveRole } from "@/lib/active-role";
import { useViewMode, setViewMode, type ViewMode } from "@/lib/view-mode";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Me = {
  id: string;
  name: string;
  roles: string[];
  roleStates?: { role: string; status: string }[];
};

type Tile = { href: string; label: string; desc?: string; badge?: number };

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

function TileLink({ href, label, desc, badge }: Tile) {
  return (
    <li>
      <Link
        href={href}
        className="relative flex min-h-11 flex-col justify-center gap-0.5 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3 transition-colors transition-transform hover:border-neon/50 active:scale-[0.98]"
      >
        <span className="font-medium leading-tight">
          {label}
          {badge != null && badge > 0 && (
            <span
              aria-label={`${badge}`}
              className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-neon px-1.5 py-0.5 text-[11px] font-bold leading-none text-night-950"
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        {desc && <span className="text-xs text-white/50">{desc}</span>}
      </Link>
    </li>
  );
}

// Switch Social/Academia del lens consumer — radiogroup nativo (mismo
// patrón APG del hub QR): un tab stop, flechas cambian opción, indicador
// deslizante con transform puro y reduced-motion instantáneo.
function ModeToggle() {
  const t = useTranslations("home");
  const mode = useViewMode();
  const options: { value: ViewMode; label: string }[] = [
    { value: "social", label: t("modeSocial") },
    { value: "academy", label: t("modeAcademy") },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("modeLabel")}
      className="relative grid grid-cols-2 rounded-full border border-night-700 bg-night-800 p-1"
    >
      <span
        aria-hidden
        className={`absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-neon transition-transform duration-200 ease-out motion-reduce:transition-none ${
          mode === "academy" ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {options.map((opt) => (
        <label
          key={opt.value}
          className="relative z-10 cursor-pointer"
        >
          <input
            type="radio"
            name="view-mode"
            value={opt.value}
            checked={mode === opt.value}
            onChange={() => setViewMode(opt.value)}
            className="peer sr-only"
          />
          <span
            className={`flex min-h-9 items-center justify-center rounded-full text-sm font-medium transition-colors peer-checked:text-night-950 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-neon ${
              mode === opt.value ? "font-semibold" : "text-white/60"
            }`}
          >
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function KpiGrid({
  kpis,
  label,
}: {
  kpis: Kpi[];
  label: string;
}) {
  const t = useTranslations("home");
  if (kpis.length === 0) return null;
  return (
    <section aria-label={label}>
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
  const ts = useTranslations("sessions");
  const tq = useTranslations("qr");
  const tw = useTranslations("wallet");
  const tp = useTranslations("practices");
  const tt = useTranslations("trips");
  const tn = useTranslations("notifications");
  const tst = useTranslations("staff");
  const ta = useTranslations("academy");
  const tpr = useTranslations("producer");
  const tad = useTranslations("admin");
  const tnav = useTranslations("nav");

  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [unread, setUnread] = useState(0);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const activeRole = useActiveRole(me?.roles);
  const viewMode = useViewMode();
  const dancerAcademy = activeRole === "DANCER" && viewMode === "academy";

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
    setStats(null);
    apiFetch(`/home/stats?role=${activeRole}&mode=${viewMode}`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setStats((await res.json()) as HomeStats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me, activeRole, viewMode]);

  // Conteo inicial de no-leídas + incremento en vivo vía CustomEvent
  // (RealTimeProvider despacha "omnidance:notification" al recibir una).
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    apiFetch("/notifications?limit=1")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { unreadCount?: number };
        setUnread(data.unreadCount ?? 0);
      })
      .catch(() => {});
    const onNotify = () => setUnread((u) => u + 1);
    window.addEventListener("omnidance:notification", onNotify);
    return () => {
      cancelled = true;
      window.removeEventListener("omnidance:notification", onNotify);
    };
  }, [me]);

  if (!checked) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-white/50">{tc("loading")}</p>
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

  const notificationsTile: Tile = {
    href: "/notificaciones",
    label: tn("title"),
    badge: unread,
  };

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
          href: `/eventos/${tonight.id}`,
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
          secondary: { href: "/productor/eventos?crear=1", label: tpr("createEvent") },
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
              title: t("tonight"),
              desc: t("dancerHeroDesc"),
              cta: t("seeEvents"),
            };
      }
    }
  })();

  // "Para ti" = atajos del rol activo (+ modo, para el bailarín).
  const forYou: Tile[] = (() => {
    switch (activeRole) {
      case "STAFF":
        return [
          { href: "/qr", label: tq("title"), desc: tq("subtitle") },
          notificationsTile,
        ];
      case "PRODUCER":
        return [
          { href: "/eventos", label: te("title") },
          { href: "/productor/pagos", label: tpr("payouts") },
          { href: "/crm", label: tpr("crm") },
          notificationsTile,
        ];
      case "ACADEMY_OWNER":
      case "INSTRUCTOR":
        return [notificationsTile];
      case "ADMIN":
        return [
          { href: "/eventos", label: te("title") },
          { href: "/crm", label: tpr("crm") },
          { href: "/staff", label: tst("title") },
          notificationsTile,
        ];
      case "DJ":
      case "VENUE_MANAGER":
        return [{ href: "/eventos", label: te("title") }, notificationsTile];
      default:
        // DANCER — los atajos siguen el modo de vista activo.
        return dancerAcademy
          ? [
              { href: "/academias", label: tnav("academies") },
              { href: "/academia", label: ta("title") },
              { href: "/practicas", label: tp("title") },
              notificationsTile,
            ]
          : [
              { href: "/qr", label: tq("title"), desc: tq("subtitle") },
              { href: "/bailes", label: ts("title") },
              { href: "/entradas", label: tw("title") },
              { href: "/viajes", label: tt("title") },
              notificationsTile,
            ];
    }
  })();

  // Multi-rol: en vez de mezclar módulos, se sugiere cambiar de lente.
  const approvedCount = (
    me.roleStates ?? me.roles.map((r) => ({ role: r, status: "APPROVED" }))
  ).filter((s) => s.status === "APPROVED").length;
  const multiRole = me.roles.length > 1 || approvedCount > 1;

  const kpiLabel = activeRole === "DANCER" ? t("insights") : t("overview");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 p-6">
      <header className="flex flex-col gap-3 pt-4">
        {/* Wordmark de marca (no es h1 — el título de sección "Inicio" lo
            lleva el large title del chrome). */}
        <p className="text-display text-3xl font-bold">
          Omni<span className="text-neon">dance</span>
        </p>
        <p className="text-sm text-white/60">{t("subtitle")}</p>
        <p className="text-lg font-medium">
          {t("hi", { name: me.name.split(" ")[0] })}
        </p>
        {activeRole === "DANCER" && <ModeToggle />}
      </header>

      {stats && stats.kpis.length > 0 && (
        <KpiGrid kpis={stats.kpis} label={kpiLabel} />
      )}

      <section aria-label={hero.title}>
        <Link
          href={hero.href}
          className="flex min-h-11 flex-col gap-1.5 rounded-2xl border border-neon/40 bg-night-800/70 p-5 transition-colors transition-transform hover:border-neon active:scale-[0.99]"
        >
          <span className="text-xl font-bold leading-tight">{hero.title}</span>
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

      <section aria-label={t("forYou")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("forYou")}
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {forYou.map((tile) => (
            <TileLink key={tile.href} {...tile} />
          ))}
        </ul>
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
    </main>
  );
}
