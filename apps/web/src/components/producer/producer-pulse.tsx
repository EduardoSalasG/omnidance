"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import type { EventListItem } from "./shared";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");

type Pulse = {
  upcoming: number;
  sold: number;
  grossClp: number;
  checkins: number;
};

/**
 * KPIs del hub /productor: agrega los stats de los eventos próximos o
 * en vivo (PUBLISHED|LIVE con endsAt a futuro) de GET /events/mine.
 * Error → se omite la sección: el hub es navegación y cada módulo
 * reporta sus propios errores.
 */
export function ProducerPulse() {
  const t = useTranslations("producer");
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/events/mine")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const events = (await res.json()) as EventListItem[];
        const now = Date.now();
        const upcoming = events.filter(
          (e) =>
            (e.status === "PUBLISHED" || e.status === "LIVE") &&
            new Date(e.endsAt).getTime() >= now,
        );
        setPulse({
          upcoming: upcoming.length,
          sold: upcoming.reduce((s, e) => s + (e.stats?.sold ?? 0), 0),
          grossClp: upcoming.reduce(
            (s, e) => s + (e.stats?.grossClp ?? 0),
            0,
          ),
          checkins: upcoming.reduce(
            (s, e) => s + (e.stats?.checkins ?? 0),
            0,
          ),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  if (!pulse) {
    return (
      <div
        className="page-loading grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-hidden
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[74px] animate-pulse rounded-xl bg-night-800"
          />
        ))}
      </div>
    );
  }

  return (
    <section aria-label={t("kpi.title")}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("kpi.title")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            [t("kpi.upcoming"), num.format(pulse.upcoming)],
            [t("kpi.sold"), num.format(pulse.sold)],
            [t("kpi.gross"), clp.format(pulse.grossClp)],
            [t("kpi.checkins"), num.format(pulse.checkins)],
          ] as const
        ).map(([label, value]) => (
          <li
            key={label}
            className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3"
          >
            <span className="block text-2xl font-bold tabular-nums text-neon">
              {value}
            </span>
            <span className="text-xs text-white/50">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
