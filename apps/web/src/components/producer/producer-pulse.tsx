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
  /** "upcoming" = eventos vivos/próximos; "last30d" = fallback cuando no
   * hay ninguno - agrega eventos cerrados de los últimos 30 días. */
  scope: "upcoming" | "last30d";
  events: number;
  sold: number;
  grossClp: number;
  checkins: number;
};

const LAST_30D_MS = 30 * 24 * 3600 * 1000;

/**
 * KPIs del hub /productor: agrega los stats de los eventos próximos o
 * en vivo (PUBLISHED|LIVE con endsAt a futuro) de GET /events/mine.
 * Sin eventos activos → cae a "últimos 30 días" sobre eventos cerrados
 * (productor inactivo ve su histórico reciente en vez de ceros).
 * Error → se omite la sección: el hub es navegación y cada módulo
 * reporta sus propios errores.
 */
export function ProducerPulse() {
  const t = useTranslations("producer");
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // El pulso agrega los stats del universo visible - pageSize al tope
    // (los más recientes primero por startsAt desc).
    apiFetch("/events/mine?pageSize=100")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const events = ((await res.json()) as { items: EventListItem[] })
          .items;
        const now = Date.now();
        const upcoming = events.filter(
          (e) =>
            (e.status === "PUBLISHED" || e.status === "LIVE") &&
            new Date(e.endsAt).getTime() >= now,
        );
        // Sin eventos activos el pulso miraría a futuro vacío - cae a
        // "últimos 30 días" sobre los eventos ya cerrados.
        const pool =
          upcoming.length > 0
            ? upcoming
            : events.filter((e) => {
                const end = new Date(e.endsAt).getTime();
                return end < now && end >= now - LAST_30D_MS;
              });
        setPulse({
          scope: upcoming.length > 0 ? "upcoming" : "last30d",
          events: pool.length,
          sold: pool.reduce((s, e) => s + (e.stats?.sold ?? 0), 0),
          grossClp: pool.reduce((s, e) => s + (e.stats?.grossClp ?? 0), 0),
          checkins: pool.reduce((s, e) => s + (e.stats?.checkins ?? 0), 0),
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
            className="h-[74px] animate-pulse rounded-xl bg-elevated"
          />
        ))}
      </div>
    );
  }

  const isLast30d = pulse.scope === "last30d";

  return (
    <section aria-label={t("kpi.title")}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("kpi.title")}
        {isLast30d && (
          <span className="ml-2 font-normal normal-case tracking-normal text-ink/40">
            · {t("kpi.periodLast30d")}
          </span>
        )}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            [
              t(isLast30d ? "kpi.events" : "kpi.upcoming"),
              num.format(pulse.events),
            ],
            [t("kpi.sold"), num.format(pulse.sold)],
            [t("kpi.gross"), clp.format(pulse.grossClp)],
            [t("kpi.checkins"), num.format(pulse.checkins)],
          ] as const
        ).map(([label, value]) => (
          <li
            key={label}
            className="rounded-xl border border-line bg-elevated/60 px-4 py-3"
          >
            <span className="block text-2xl font-bold tabular-nums text-neon">
              {value}
            </span>
            <span className="text-xs text-ink/50">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
