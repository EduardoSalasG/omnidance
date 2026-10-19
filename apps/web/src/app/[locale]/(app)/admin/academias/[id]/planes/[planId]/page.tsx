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
import { Link } from "@/i18n/navigation";

const fmtDate = (iso: string | Date, locale: string) =>
  getDateFmt(locale, { dateStyle: "medium" }).format(new Date(iso));

type PlanDetail = {
  plan: {
    id: string;
    name: string;
    type: string;
    price: number;
    classCount: number | null;
    weeklyClasses: number | null;
    periodDays: number | null;
    description: string[];
    active: boolean;
    flowPlanId: string | null;
    enrollmentTotal: number;
  };
  academy: { id: string; name: string };
  enrollments: {
    personId: string;
    name: string | null;
    status: string;
    startedAt: string;
  }[];
  recentPayments: { amount: number; createdAt: string }[];
};

const ENROLL_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "neon",
  TRIAL: "outline",
  PAUSED: "muted",
  FROZEN: "muted",
  ONLINE: "neon",
};

export default function AdminPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = use(params);
  return (
    <AdminGate>
      <Panel academyId={id} planId={planId} />
    </AdminGate>
  );
}

function Panel({ academyId, planId }: { academyId: string; planId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tax = useTranslations("academy");
  const locale = useLocale();
  const clp = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  const [d, setD] = useState<PlanDetail | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/admin/academies/${academyId}/planes/${planId}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setD(await res.json());
    } catch {
      setError(true);
    }
  }, [academyId, planId]);

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

  const { plan: p } = d;
  const typeLabel = tax.has(`planTypes.${p.type}`)
    ? tax(`planTypes.${p.type}`)
    : p.type;

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
        backLabel={d.academy.name}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {p.name}
        </h1>
        <Badge variant="outline">{typeLabel}</Badge>
        <Badge variant={p.active ? "neon" : "muted"}>
          {p.active
            ? t("academies.detail.active")
            : t("academies.detail.inactive")}
        </Badge>
      </div>

      {/* Datos del plan */}
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("academies.plan.data")}</h2>
        <Card className="p-4">
          <dl className="divide-y divide-line">
            {infoRow(t("academies.plan.type"), typeLabel)}
            {infoRow(t("academies.plan.price"), clp.format(p.price))}
            {infoRow(
              t("academies.plan.classCount"),
              p.classCount != null ? String(p.classCount) : null,
            )}
            {infoRow(
              t("academies.plan.weeklyClasses"),
              p.weeklyClasses != null ? String(p.weeklyClasses) : null,
            )}
            {infoRow(
              t("academies.plan.periodDays"),
              p.periodDays != null
                ? t("academies.plan.days", { count: p.periodDays })
                : null,
            )}
            {infoRow(
              t("academies.plan.enrollments"),
              String(p.enrollmentTotal),
            )}
            {infoRow(t("academies.plan.flowSync"), p.flowPlanId)}
          </dl>
          {p.description.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 border-t border-line pl-5 pt-3 text-sm text-ink/70">
              {p.description.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Alumnos inscritos */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("academies.plan.enrolled")}
        </h2>
        {d.enrollments.length === 0 ? (
          <p className="text-sm text-ink/50">
            {t("academies.plan.noEnrollments")}
          </p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {d.enrollments.map((e) => (
              <Link
                key={e.personId}
                href={`/admin/usuarios/${e.personId}`}
                className="flex min-h-11 items-center gap-2 px-4 hover:bg-elevated"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {e.name ?? e.personId}
                </span>
                <Badge variant={ENROLL_VARIANT[e.status] ?? "muted"}>
                  {t(`academies.plan.statuses.${e.status}`)}
                </Badge>
                <span className="flex items-center gap-1 text-xs text-ink/50">
                  <ClockIcon className="h-3 w-3" />
                  {fmtDate(e.startedAt, locale)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* Pagos recientes del plan */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("academies.detail.recentPayments")}
        </h2>
        {d.recentPayments.length === 0 ? (
          <p className="text-sm text-ink/50">
            {t("academies.detail.noPayments")}
          </p>
        ) : (
          <Card className="divide-y divide-line p-0">
            {d.recentPayments.map((pay, i) => (
              <div key={i} className="flex min-h-11 items-center gap-3 px-4">
                <span className="flex flex-1 items-center gap-1 text-xs text-ink/50">
                  <ClockIcon className="h-3 w-3" />
                  {fmtDate(pay.createdAt, locale)}
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {clp.format(pay.amount)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </main>
  );
}
