"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type CobrosKpis = {
  billedMonth: number;
  billedMonthPrev: number;
  avgTicketMonth: number | null;
  avgTicketMonthPrev: number | null;
  topMethods: { label: string; amount: number; amountPrev: number }[];
};

/**
 * KPIs del módulo de cobros (spec academy-console-v3): facturación MTD,
 * ticket promedio y top 3 medios de pago, todos con delta absoluto vs
 * el tramo equivalente del mes anterior.
 */
export function CobrosKpiStrip({ academyId }: { academyId: string }) {
  const t = useTranslations("academyPay");
  const [data, setData] = useState<CobrosKpis | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/cobros/kpis`).catch(
      () => null,
    );
    if (!res?.ok) {
      setHidden(true);
      return;
    }
    setData((await res.json()) as CobrosKpis);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden) return null;

  const delta = (cur: number | null, prev: number | null) => {
    if (cur === null || prev === null) return null;
    const d = cur - prev;
    return d === 0 ? "=" : `${d > 0 ? "+" : "−"}${clp.format(Math.abs(d))}`;
  };
  const deltaCls = (cur: number | null, prev: number | null) =>
    cur === null || prev === null || cur - prev === 0
      ? "text-ink/40"
      : cur - prev > 0
        ? "text-neon/80"
        : "text-warn";

  return (
    <section aria-label={t("kpiBilled")}>
      {data === null ? (
        <ul
          aria-hidden="true"
          className="page-loading grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Card className="flex h-full flex-col gap-1 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <li>
            <Card className="flex h-full flex-col gap-1 p-4">
              <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                {t("kpiBilled")}
              </span>
              <span className="text-3xl font-bold leading-none text-neon">
                {clp.format(data.billedMonth)}
              </span>
              <span
                className={`mt-0.5 text-xs font-medium tabular-nums ${deltaCls(data.billedMonth, data.billedMonthPrev)}`}
              >
                {delta(data.billedMonth, data.billedMonthPrev)}{" "}
                {t("kpiVsPrev")}
              </span>
            </Card>
          </li>
          <li>
            <Card className="flex h-full flex-col gap-1 p-4">
              <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                {t("kpiTicket")}
              </span>
              <span className="text-3xl font-bold leading-none text-neon">
                {data.avgTicketMonth === null
                  ? "—"
                  : clp.format(data.avgTicketMonth)}
              </span>
              {data.avgTicketMonth !== null && (
                <span
                  className={`mt-0.5 text-xs font-medium tabular-nums ${deltaCls(data.avgTicketMonth, data.avgTicketMonthPrev)}`}
                >
                  {delta(data.avgTicketMonth, data.avgTicketMonthPrev)}{" "}
                  {t("kpiVsPrev")}
                </span>
              )}
            </Card>
          </li>
          <li className="col-span-2 sm:col-span-1">
            <Card className="flex h-full flex-col gap-1 p-4">
              <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                {t("kpiTopMethods")}
              </span>
              {data.topMethods.length === 0 ? (
                <span className="text-3xl font-bold leading-none text-neon">
                  —
                </span>
              ) : (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {data.topMethods.map((m) => {
                    const d = delta(m.amount, m.amountPrev);
                    return (
                      <li
                        key={m.label}
                        className="flex items-baseline justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 truncate font-medium">
                          {m.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-ink/60">
                          {clp.format(m.amount)}
                          {d !== null && (
                            <span
                              className={
                                m.amount - m.amountPrev > 0
                                  ? "text-neon/80"
                                  : m.amount - m.amountPrev < 0
                                    ? "text-warn"
                                    : "text-ink/40"
                              }
                            >
                              {" "}
                              {d}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </li>
        </ul>
      )}
    </section>
  );
}
