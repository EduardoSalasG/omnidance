"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Me = { id: string; name: string; roles: string[] };

type Tile = { href: string; label: string; desc?: string };

function TileLink({ href, label, desc }: Tile) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 flex-col justify-center gap-0.5 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3 transition-colors transition-transform hover:border-neon/50 active:scale-[0.98]"
      >
        <span className="font-medium leading-tight">{label}</span>
        {desc && <span className="text-xs text-white/50">{desc}</span>}
      </Link>
    </li>
  );
}

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

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-white/50">{tc("loading")}</p>
      </main>
    );
  }

  // Cookie presente pero sesión expirada — CTA de re-login.
  if (!me) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 p-6">
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

  const tonight: Tile[] = [
    { href: "/eventos", label: te("title") },
    { href: "/qr", label: tq("title"), desc: tq("subtitle") },
    { href: "/escanear", label: ts("scanToInvite") },
    { href: "/bailes", label: ts("title") },
    { href: "/entradas", label: tw("title") },
  ];

  const social: Tile[] = [
    { href: "/practicas", label: tp("title") },
    { href: "/viajes", label: tt("title") },
    { href: "/notificaciones", label: tn("title") },
  ];

  const management: Tile[] = [
    ...(isStaff ? [{ href: "/staff", label: tst("title") }] : []),
    ...(isAcademy ? [{ href: "/academia", label: ta("title") }] : []),
    ...(isProducer ? [{ href: "/productor", label: tpr("title") }] : []),
    ...(isAdmin ? [{ href: "/admin", label: tad("title") }] : []),
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 p-6">
      <header className="pt-4">
        <h1 className="text-display text-3xl font-bold">
          Omni<span className="text-neon">dance</span>
        </h1>
        <p className="mt-1 text-sm text-white/60">{t("subtitle")}</p>
        <p className="mt-3 text-lg font-medium">
          {t("hi", { name: me.name.split(" ")[0] })}
        </p>
      </header>

      <section aria-label={t("tonight")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("tonight")}
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {tonight.map((tile) => (
            <TileLink key={tile.href} {...tile} />
          ))}
        </ul>
      </section>

      <section aria-label={t("social")}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("social")}
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {social.map((tile) => (
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
