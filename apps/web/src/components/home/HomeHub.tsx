"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Me = { id: string; name: string; roles: string[] };

type Tile = { href: string; label: string; desc?: string; badge?: number };

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

// Hero por rol: la acción principal del usuario según su rol de gestión
// "más alto" (ADMIN > PRODUCER > ACADEMY > STAFF); sin rol de gestión el
// hero es el consumo de la noche (/eventos + QR).
type HeroKind = "admin" | "producer" | "academy" | "staff" | "dancer";

type Hero = {
  kind: HeroKind;
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

  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [unread, setUnread] = useState(0);

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

  const roles = new Set(me.roles);
  const isStaff = roles.has("STAFF") || roles.has("ADMIN");
  const isAcademy =
    roles.has("ACADEMY_OWNER") || roles.has("INSTRUCTOR") || roles.has("ADMIN");
  const isProducer = roles.has("PRODUCER") || roles.has("ADMIN");
  const isAdmin = roles.has("ADMIN");

  // Multi-rol: gana el rol de gestión más alto; los demás módulos quedan
  // en la sección "Gestión". El escáner de invitaciones ya no es tile —
  // vive como segmento dentro de /qr (por eso el QR apunta a /qr).
  const hero: Hero = isAdmin
    ? {
        kind: "admin",
        href: "/admin",
        title: tad("title"),
        desc: t("adminHeroDesc"),
        cta: t("adminHeroCta"),
      }
    : isProducer
      ? {
          kind: "producer",
          href: "/productor/eventos",
          title: tpr("myEvents"),
          desc: tpr("navEventsDesc"),
          cta: t("producerHeroCta"),
          // "Crear evento" es un form inline en /productor/eventos — el
          // CTA secundario apunta a la misma página donde se despliega.
          secondary: { href: "/productor/eventos", label: tpr("createEvent") },
        }
      : isAcademy
        ? {
            kind: "academy",
            href: "/academia",
            title: ta("title"),
            desc: t("academyHeroDesc"),
            cta: t("academyHeroCta"),
          }
        : isStaff
          ? {
              kind: "staff",
              href: "/staff",
              title: tst("title"),
              desc: t("staffHeroDesc"),
              cta: t("staffHeroCta"),
            }
          : {
              kind: "dancer",
              href: "/eventos",
              title: t("tonight"),
              desc: t("dancerHeroDesc"),
              cta: t("seeEvents"),
              secondary: { href: "/qr", label: tq("title") },
            };

  // /eventos solo aparece como tile cuando no es el hero (staff/productor/
  // academia/admin siguen necesitando llegar al listado público).
  const forYou: Tile[] = [
    ...(hero.kind !== "dancer"
      ? [{ href: "/eventos", label: te("title") }]
      : []),
    { href: "/qr", label: tq("title"), desc: tq("subtitle") },
    { href: "/bailes", label: ts("title") },
    { href: "/entradas", label: tw("title") },
    { href: "/practicas", label: tp("title") },
    { href: "/viajes", label: tt("title") },
    { href: "/notificaciones", label: tn("title"), badge: unread },
  ];

  // Módulos de gestión que no ganaron el hero.
  const management: Tile[] = [
    ...(isStaff && hero.kind !== "staff"
      ? [{ href: "/staff", label: tst("title") }]
      : []),
    ...(isAcademy && hero.kind !== "academy"
      ? [{ href: "/academia", label: ta("title") }]
      : []),
    ...(isProducer && hero.kind !== "producer"
      ? [{ href: "/productor", label: tpr("title") }]
      : []),
    ...(isAdmin && hero.kind !== "admin"
      ? [{ href: "/admin", label: tad("title") }]
      : []),
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 p-6">
      <header className="pt-4">
        <h1 className="text-display text-3xl font-bold">
          Omni<span className="text-neon">dance</span>
        </h1>
        <p className="mt-1 text-sm text-white/60">{t("subtitle")}</p>
        <p className="mt-3 text-lg font-medium">
          {t("hi", { name: me.name.split(" ")[0] })}
        </p>
      </header>

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

      {management.length > 0 && (
        <section aria-label={t("management")}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("management")}
          </h2>
          <ul className="grid grid-cols-2 gap-3">
            {management.map((tile) => (
              <TileLink key={tile.href} {...tile} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
