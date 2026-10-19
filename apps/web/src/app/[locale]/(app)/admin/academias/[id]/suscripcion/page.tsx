"use client";

import { useCallback, useEffect, useState, use } from "react";

import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ClockIcon,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { getDateFmt, useNumFmt } from "@/lib/intl";

const fmtDate = (iso: string | Date, locale: string) =>
  getDateFmt(locale, { dateStyle: "medium" }).format(new Date(iso));

type SubDetail = {
  academyName: string;
  academy: {
    tier: string | null;
    billingCycle: string | null;
    trialEndsAt: string | null;
    billingGraceUntil: string | null;
    billingBlockedAt: string | null;
  };
  subscription: {
    id: string;
    status: string;
    tierCode: string;
    billingCycle: string;
    pendingTierCode: string | null;
    pendingBillingCycle: string | null;
    nextInvoiceAt: string | null;
    createdAt: string;
    canceledAt: string | null;
    flowSubscriptionId: string | null;
    payerName: string | null;
  } | null;
  payments: { amount: number; createdAt: string; invoiceId: string | null }[];
  revenue: { amount: number; createdAt: string; orderType: string }[];
};

const SUB_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "neon",
  ACTIVATING: "outline",
  PENDING_CARD: "outline",
  CANCEL_PENDING: "muted",
  CANCELED: "muted",
  FAILED_CARD: "live",
};

export default function AdminSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AdminGate>
      <Panel academyId={id} />
    </AdminGate>
  );
}

function Panel({ academyId }: { academyId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tp = useTranslations("payments");
  const locale = useLocale();
  const orderLabel = (s: string) => {
    // El enum de Payment usa "PRIVATE"; el catálogo lo llama PRIVATE_LESSON.
    const k = s === "PRIVATE" ? "PRIVATE_LESSON" : s;
    return tp.has(`orderTypes.${k}`) ? tp(`orderTypes.${k}`) : s;
  };
  const clp = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  const [d, setD] = useState<SubDetail | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/admin/academies/${academyId}/suscripcion`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setD(await res.json());
    } catch {
      setError(true);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mainCls =
    "mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8";

  if (error) {
    return (
      <main className={mainCls}>
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("academies.error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      </main>
    );
  }
  if (!d)
    return (
      <main className={mainCls}>
        <SkeletonList items={3} lines={2} />
      </main>
    );

  const { subscription: s, academy: a } = d;
  const statusLabel = (st: string) =>
    t(`academies.sub.statuses.${st}`) ?? st;

  const infoRow = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex items-baseline justify-between gap-3 py-1">
        <dt className="text-xs text-ink/50">{label}</dt>
        <dd className="truncate text-sm">{value}</dd>
      </div>
    ) : null;

  return (
    <main className={mainCls}>
      <ConsoleHeader
        backHref={`/admin/academias/${academyId}`}
        backLabel={d.academyName}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {t("academies.detail.subscription")}
        </h1>
        {s ? (
          <Badge variant={SUB_VARIANT[s.status] ?? "muted"}>
            {statusLabel(s.status)}
          </Badge>
        ) : (
          <Badge variant="muted">
            {t("academies.detail.noSubscription")}
          </Badge>
        )}
        {a.billingBlockedAt && (
          <Badge variant="live">{t("academies.detail.blocked")}</Badge>
        )}
      </div>

      {/* Datos de la suscripción */}
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("academies.sub.data")}</h2>
        <Card className="p-4">
          {s ? (
            <dl className="divide-y divide-line">
              {infoRow(t("academies.sub.status"), statusLabel(s.status))}
              {infoRow(t("academies.sub.tier"), s.tierCode)}
              {infoRow(t("academies.sub.cycle"), s.billingCycle)}
              {infoRow(t("academies.sub.payer"), s.payerName)}
              {infoRow(
                t("academies.sub.pendingChange"),
                s.pendingTierCode
                  ? `${s.pendingTierCode}${s.pendingBillingCycle ? ` · ${s.pendingBillingCycle}` : ""}`
                  : null,
              )}
              {infoRow(
                t("academies.sub.nextInvoice"),
                s.nextInvoiceAt ? fmtDate(s.nextInvoiceAt, locale) : null,
              )}
              {infoRow(
                t("academies.sub.created"),
                fmtDate(s.createdAt, locale),
              )}
              {infoRow(
                t("academies.sub.canceledAt"),
                s.canceledAt ? fmtDate(s.canceledAt, locale) : null,
              )}
              {infoRow(t("academies.sub.flowId"), s.flowSubscriptionId)}
            </dl>
          ) : (
            <p className="text-sm text-ink/50">
              {t("academies.sub.none")}
            </p>
          )}
        </Card>
      </section>

      {/* Estado en la academia (fallback sin suscripción activa) */}
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("academies.sub.academy")}</h2>
        <Card className="p-4">
          <dl className="divide-y divide-line">
            {infoRow(
              t("academies.sub.tier"),
              a.tier
                ? [a.tier, a.billingCycle].filter(Boolean).join(" · ")
                : t("academies.detail.noSubscription"),
            )}
            {infoRow(
              t("academies.detail.trial"),
              a.trialEndsAt ? fmtDate(a.trialEndsAt, locale) : null,
            )}
            {infoRow(
              t("academies.detail.grace"),
              a.billingGraceUntil ? fmtDate(a.billingGraceUntil, locale) : null,
            )}
            {infoRow(
              t("academies.detail.blockedAt"),
              a.billingBlockedAt ? fmtDate(a.billingBlockedAt, locale) : null,
            )}
          </dl>
        </Card>
      </section>

      {/* Cobros */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("academies.sub.payments")}</h2>
        {d.payments.length === 0 ? (
          <p className="text-sm text-ink/50">{t("academies.sub.noPayments")}</p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {d.payments.map((p, i) => (
              <div key={i} className="flex min-h-11 items-center gap-3 px-4">
                <span className="min-w-0 flex-1 truncate text-xs text-ink/50">
                  {p.invoiceId ?? "—"}
                </span>
                <span className="flex items-center gap-1 text-xs text-ink/50">
                  <ClockIcon className="h-3 w-3" />
                  {fmtDate(p.createdAt, locale)}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {clp.format(p.amount)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Ingresos de la academia (tickets/membresías/etc.) */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("academies.sub.revenue")}
        </h2>
        {d.revenue.length === 0 ? (
          <p className="text-sm text-ink/50">
            {t("academies.sub.noRevenue")}
          </p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {d.revenue.map((p, i) => (
              <div key={i} className="flex min-h-11 items-center gap-3 px-4">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {orderLabel(p.orderType)}
                </span>
                <span className="flex items-center gap-1 text-xs text-ink/50">
                  <ClockIcon className="h-3 w-3" />
                  {fmtDate(p.createdAt, locale)}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {clp.format(p.amount)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </main>
  );
}
