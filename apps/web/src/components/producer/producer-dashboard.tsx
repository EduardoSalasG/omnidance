"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon } from "@/components/ui";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");
const fullDayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});

const listCls = "flex flex-col divide-y divide-line";
const rowLinkCls =
  "flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";
const sectionTitleCls =
  "text-sm font-semibold uppercase tracking-wide text-ink/50";

type Dash = {
  kpis: {
    upcoming: number;
    sold: number;
    grossMonth: number;
    pendingClaims: number;
  };
  topRevenue: { id: string; name: string; startsAt: string; grossClp: number }[];
  topAttendance: {
    id: string;
    name: string;
    startsAt: string;
    checkins: number;
  }[];
  pendingClaims: {
    count: number;
    amount: number;
    items: {
      id: string;
      personName: string;
      methodLabel: string;
      amount: number;
      createdAt: string;
    }[];
  };
};

/**
 * Home del productor (spec events/producer-console): mismo formato del
 * dashboard del owner - KPIs del mes, cola operativa (comprobantes por
 * validar) y tops de eventos. GET /producer/dashboard.
 */
export function ProducerDashboard() {
  const t = useTranslations("producer");
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch("/producer/dashboard");
      if (res.ok) {
        setDash((await res.json()) as Dash);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error) {
    return (
      <Card className="flex items-center justify-between gap-3" role="alert">
        <p className="text-sm text-ink/70">{t("dash.error")}</p>
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>
          <RefreshIcon /> {t("dash.retry")}
        </Button>
      </Card>
    );
  }

  if (!dash) {
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

  const kpis: [string, string][] = [
    ["upcoming", num.format(dash.kpis.upcoming)],
    ["sold", num.format(dash.kpis.sold)],
    ["grossMonth", clp.format(dash.kpis.grossMonth)],
    ["pendingClaims", num.format(dash.kpis.pendingClaims)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs capitalize text-ink/50">
        {fullDayFmt.format(new Date())}
      </p>

      {/* KPIs (mismo bloque visual del pulso/dashboards de consola) */}
      <section aria-label={t("dash.title")} data-tour="producer-kpis">
        <h2 className={`mb-3 ${sectionTitleCls}`}>{t("dash.title")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map(([key, value]) => (
            <li
              key={key}
              className="rounded-xl border border-line bg-elevated/60 px-4 py-3"
            >
              <span className="block text-2xl font-bold tabular-nums text-neon">
                {value}
              </span>
              <span className="mt-0.5 block text-xs text-ink/60">
                {t(`dash.kpi.${key}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Productor sin eventos: el dashboard apunta a crear el primero
          en vez de mostrar ceros sueltos. */}
      {dash.kpis.upcoming === 0 &&
        dash.topRevenue.length === 0 &&
        dash.topAttendance.length === 0 && (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-ink/70">{t("dash.empty")}</p>
            <Button href="/productor/eventos/nuevo">
              {t("emptyEventsCta")}
            </Button>
          </Card>
        )}

      {/* Cobros por revisar: comprobantes manuales (transferencia,
          link, efectivo) esperando aprobación - la cola es
          /productor/comprobantes. */}
      {dash.pendingClaims.count > 0 && (
        <section
          aria-label={t("dash.pendingClaimsTitle")}
          data-tour="producer-claims"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className={sectionTitleCls}>{t("dash.pendingClaimsTitle")}</h3>
            <p className="text-xs tabular-nums text-ink/50">
              {t("dash.pendingClaimsSummary", {
                count: dash.pendingClaims.count,
                amount: clp.format(dash.pendingClaims.amount),
              })}
            </p>
          </div>
          <Card padded={false}>
            <ul className={listCls}>
              {dash.pendingClaims.items.map((c) => (
                <li key={c.id}>
                  <Link href="/productor/comprobantes" className={rowLinkCls}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {c.personName}
                      </span>
                      <span className="block truncate text-xs text-ink/50">
                        {c.methodLabel} ·{" "}
                        {dayFmt.format(new Date(c.createdAt))}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-warn">
                      {clp.format(c.amount)}
                    </span>
                  </Link>
                </li>
              ))}
              {dash.pendingClaims.count > dash.pendingClaims.items.length && (
                <li>
                  <Link
                    href="/productor/comprobantes"
                    className={`${rowLinkCls} justify-center text-sm font-semibold text-neon`}
                  >
                    {t("dash.seeAll", {
                      count: dash.pendingClaims.count,
                    })}
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        </section>
      )}

      {/* Tops en la misma fila: facturación a la izquierda, asistencia
          a la derecha (en móvil apilan en ese orden). */}
      <div className="grid gap-6 lg:grid-cols-2" data-tour="producer-tops">
        {dash.topRevenue.length > 0 && (
          <section aria-label={t("dash.topRevenue")} className="min-w-0">
            <h3 className={`mb-3 ${sectionTitleCls}`}>{t("dash.topRevenue")}</h3>
            <Card padded={false}>
              <ul className={listCls}>
                {dash.topRevenue.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/productor/eventos/${e.id}`}
                      className={rowLinkCls}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {e.name}
                        </span>
                        <span className="block text-xs text-ink/50">
                          {dayFmt.format(new Date(e.startsAt))}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-neon">
                        {clp.format(e.grossClp)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {dash.topAttendance.length > 0 && (
          <section aria-label={t("dash.topAttendance")} className="min-w-0">
            <h3 className={`mb-3 ${sectionTitleCls}`}>
              {t("dash.topAttendance")}
            </h3>
            <Card padded={false}>
              <ul className={listCls}>
                {dash.topAttendance.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/productor/eventos/${e.id}`}
                      className={rowLinkCls}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {e.name}
                        </span>
                        <span className="block text-xs text-ink/50">
                          {dayFmt.format(new Date(e.startsAt))}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink/70">
                        {t("dash.checkins", { count: e.checkins })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
