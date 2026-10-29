"use client";

import { useCallback, useEffect, useState, use } from "react";

import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { KpiCard } from "@/components/admin/kpi-card";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { getDateFmt, useNumFmt } from "@/lib/intl";
import { Link } from "@/i18n/navigation";

const fmtDate = (iso: string | Date, locale: string) =>
  getDateFmt(locale, { dateStyle: "medium" }).format(new Date(iso));

type Detail = {
  academy: {
    id: string;
    name: string;
    active: boolean;
    createdAt: string;
    address: string | null;
    description: string | null;
    instagram: string | null;
    whatsapp: string | null;
    website: string | null;
    tier: string | null;
    billingCycle: string | null;
    trialEndsAt: string | null;
    billingGraceUntil: string | null;
    billingBlockedAt: string | null;
    defaultQuorum: number | null;
    ownerName: string | null;
    instructorCount: number;
    staffCount: number;
  };
  kpis: {
    studentCount: number;
    avgScore: number;
    computedAt: string | null;
    segments: Record<string, number>;
    enrolledCount: number;
    enrolledPrev: number;
    planCount: number;
    activeNow: number;
    activePrev: number;
    billingMonthClp: number;
    billingPrevMonthClp: number;
    classSlotCount: number;
    planTotal: number;
  };
  upcoming: {
    id: string;
    date: string;
    startTime: string;
    capacity: number | null;
    bookedCount: number;
    title: string;
    types: string[];
  }[];
  topStudents: {
    personId: string;
    name: string | null;
    score: number;
    segment: string | null;
  }[];
  plans: {
    id: string;
    name: string;
    type: string;
    price: number;
    classCount: number | null;
    weeklyClasses: number | null;
    periodDays: number | null;
    active: boolean;
    enrollments: number;
  }[];
  team: {
    instructors: {
      personId: string;
      name: string | null;
      payType: string | null;
      payAmount: number | null;
      payClasses: number | null;
      commissionPct: number | null;
    }[];
    staff: { personId: string; name: string | null; perms: string[] }[];
  };
};

const SEGMENT_VARIANT: Record<string, BadgeVariant> = {
  NEW: "neon",
  AT_RISK: "live",
  BRINGS_PEOPLE: "neon",
  CORE: "muted",
  NONE: "outline",
};

export default function AdminAcademyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AdminGate>
      <DetailPanel id={id} />
    </AdminGate>
  );
}

function DetailPanel({ id }: { id: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tcrm = useTranslations("crm");
  const tax = useTranslations("academy");
  const locale = useLocale();
  const clp = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [showClasses, setShowClasses] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/admin/academies/${id}/detail`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setD(await res.json());
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
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
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
        <SkeletonList items={3} lines={2} />
      </main>
    );

  const { academy: a, kpis: k } = d;
  const delta =
    k.billingPrevMonthClp > 0
      ? Math.round(
          ((k.billingMonthClp - k.billingPrevMonthClp) /
            k.billingPrevMonthClp) *
            100,
        )
      : null;

  const infoRow = (
    label: string,
    value: string | null | undefined,
    href?: string,
  ) =>
    value ? (
      <div key={label} className="flex items-baseline justify-between gap-3 py-1">
        <dt className="text-xs text-ink/50">{label}</dt>
        <dd className="truncate text-sm">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-neon hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    ) : null;

  // Filas de datos generales: las que tengan valor, primeras 5 visibles.
  const infoRows = (
    [
      [t("academies.detail.owner"), a.ownerName],
      [t("academies.detail.address"), a.address],
      [
        t("academies.detail.instagram"),
        a.instagram ? `@${a.instagram}` : null,
        a.instagram ? `https://instagram.com/${a.instagram}` : undefined,
      ],
      [
        t("academies.detail.whatsapp"),
        a.whatsapp ? `+${a.whatsapp}` : null,
        a.whatsapp ? `https://wa.me/${a.whatsapp}` : undefined,
      ],
      [t("academies.detail.website"), a.website, a.website ?? undefined],
      [t("academies.detail.created"), fmtDate(a.createdAt, locale)],
      [
        t("academies.detail.quorum"),
        a.defaultQuorum ? String(a.defaultQuorum) : null,
      ],
      [t("academies.detail.instructors"), String(a.instructorCount)],
      [t("academies.detail.staff"), String(a.staffCount)],
    ] as [string, string | null | undefined, string?][]
  ).filter((r) => r[1] != null && r[1] !== "");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/admin/academias" backLabel={t("academies.back")} />

      {/* Header: nombre + estado */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {a.name}
        </h1>
        {a.billingBlockedAt ? (
          <Badge variant="live">{t("academies.detail.blocked")}</Badge>
        ) : a.active ? (
          <Badge variant="neon">{t("academies.detail.active")}</Badge>
        ) : (
          <Badge variant="muted">{t("academies.detail.inactive")}</Badge>
        )}
        {a.tier && <Badge variant="outline">{a.tier}</Badge>}
      </div>
      {a.description && (
        <p className="text-sm text-ink/60">{a.description}</p>
      )}

      {/* Datos generales */}
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("academies.detail.general")}</h2>
        <Card className="p-4">
          <dl className="divide-y divide-line">
            {(showInfo ? infoRows : infoRows.slice(0, 5)).map((r) =>
              infoRow(r[0], r[1], r[2]),
            )}
          </dl>
        </Card>
        {infoRows.length > 5 && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 self-center"
            onClick={() => setShowInfo(!showInfo)}
          >
            {showInfo
              ? t("academies.detail.showLess")
              : t("academies.detail.showAll", { count: infoRows.length })}
          </Button>
        )}
      </section>

      {/* Suscripción SaaS: card link a su ficha (siempre visible) */}
      <section className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">
          {t("academies.detail.subscription")}
        </h2>
        <Link
          href={`/admin/academias/${a.id}/suscripcion`}
          className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
        <Card className="p-4 transition-colors hover:border-neon/50">
          <dl className="divide-y divide-line">
            {infoRow(
              t("academies.detail.billing"),
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
        </Link>
      </section>

      {/* KPIs */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("academies.detail.kpis")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label={t("academies.kpi.enrolled")} value={String(k.enrolledCount)} />
          <KpiCard label={t("academies.kpi.plan")} value={String(k.planCount)} />
          <KpiCard label={t("academies.kpi.checkin")} value={String(k.activeNow)} />
          <KpiCard label={t("academies.kpi.score")} value={String(k.avgScore)} />
          <KpiCard
            label={t("academies.kpi.billing")}
            value={clp.format(k.billingMonthClp)}
            hint={
              delta !== null
                ? `${delta > 0 ? "+" : ""}${delta}%`
                : undefined
            }
          />
          <KpiCard label={t("academies.kpi.classes")} value={String(k.classSlotCount)} />
          <KpiCard label={t("academies.kpi.plans")} value={String(k.planTotal)} />
          <KpiCard
            label={t("academies.kpi.computed")}
            value={
              k.computedAt ? fmtDate(k.computedAt, locale) : "—"
            }
          />
        </div>
      </section>

      {/* Equipo: instructores con acuerdo económico + staff con permisos */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {t("academies.detail.instructors")}
          </h2>
          <Card className="divide-y divide-line p-0">
            {d.team.instructors.length === 0 && (
              <p className="p-4 text-sm text-ink/50">
                {t("academies.detail.noInstructors")}
              </p>
            )}
            {d.team.instructors.map((i) => (
              <div
                key={i.personId}
                className="flex min-h-11 items-center gap-3 px-4"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {i.name ?? i.personId}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink/50">
                  {i.payType === "COMMISSION"
                    ? `${t("academies.detail.payTypes.COMMISSION")} ${i.commissionPct ?? 0}%`
                    : i.payType === "PER_CLASS"
                      ? `${t("academies.detail.payTypes.PER_CLASS")} · ${i.payAmount != null ? clp.format(i.payAmount) : "—"}`
                      : i.payType === "MONTHLY"
                        ? `${t("academies.detail.payTypes.MONTHLY")} · ${i.payAmount != null ? clp.format(i.payAmount) : "—"}`
                        : t("academies.detail.noAgreement")}
                </span>
              </div>
            ))}
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t("academies.detail.staff")}</h2>
          <Card className="divide-y divide-line p-0">
            {d.team.staff.length === 0 && (
              <p className="p-4 text-sm text-ink/50">
                {t("academies.detail.noStaff")}
              </p>
            )}
            {d.team.staff.map((s) => (
              <div
                key={s.personId}
                className="flex min-h-11 items-center gap-3 px-4"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {s.name ?? s.personId}
                </span>
                <span className="shrink-0 truncate text-xs text-ink/50">
                  {s.perms.map((p) => t(`academies.detail.perms.${p}`)).join(" · ")}
                </span>
              </div>
            ))}
          </Card>
        </div>
      </section>

      {/* Clases próximas: rail de decisión (arquetipo B); hora ancla
          arriba, ocupación abajo; expand tras las 5 primeras. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          {t("academies.detail.upcoming")}
        </h2>
        {d.upcoming.length === 0 ? (
          <p className="text-sm text-ink/50">{t("academies.detail.noClasses")}</p>
        ) : (
          <>
            <Card className="divide-y divide-line p-0">
              {(showClasses ? d.upcoming : d.upcoming.slice(0, 5)).map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/academias/${a.id}/clases/${c.id}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-elevated"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="truncate text-xs text-ink/50">
                      {fmtDate(c.date, locale)}
                      {c.types.length > 0 && ` · ${c.types.join(" · ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-semibold tabular-nums">
                      {c.startTime}
                    </span>
                    <span className="text-[11px] tabular-nums text-ink/50">
                      {c.bookedCount}/{c.capacity ?? "—"}
                    </span>
                  </div>
                </Link>
              ))}
            </Card>
            {d.upcoming.length > 5 && (
              <Button
                variant="secondary"
                size="sm"
                className="self-center"
                onClick={() => setShowClasses(!showClasses)}
              >
                {showClasses
                  ? t("academies.detail.showLess")
                  : t("academies.detail.showAll", {
                      count: d.upcoming.length,
                    })}
              </Button>
            )}
          </>
        )}
      </section>

      {/* Top alumnos + planes */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {t("academies.detail.topStudents")}
          </h2>
          <Card className="divide-y divide-line p-0">
            {d.topStudents.length === 0 && (
              <p className="p-4 text-sm text-ink/50">{t("academies.detail.noStudents")}</p>
            )}
            {(showStudents ? d.topStudents : d.topStudents.slice(0, 5)).map((s) => (
              <Link
                key={s.personId}
                href={`/admin/usuarios/${s.personId}`}
                className="flex min-h-11 items-center gap-2 px-4 hover:bg-elevated"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {s.name ?? s.personId}
                </span>
                {s.segment && (
                  <Badge variant={SEGMENT_VARIANT[s.segment] ?? "muted"}>
                    {tcrm(`segments.${s.segment}`)}
                  </Badge>
                )}
                <span className="text-sm font-semibold tabular-nums">
                  {s.score}
                </span>
              </Link>
            ))}
          </Card>
          {d.topStudents.length > 5 && (
            <Button
              variant="secondary"
              size="sm"
              className="self-center"
              onClick={() => setShowStudents(!showStudents)}
            >
              {showStudents
                ? t("academies.detail.showLess")
                : t("academies.detail.showAll", { count: d.topStudents.length })}
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t("academies.detail.plans")}</h2>
          <Card className="divide-y divide-line p-0">
            {d.plans.length === 0 && (
              <p className="p-4 text-sm text-ink/50">{t("academies.detail.noPlans")}</p>
            )}
            {d.plans.map((p) => (
              <Link
                key={p.id}
                href={`/admin/academias/${a.id}/planes/${p.id}`}
                className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-elevated"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-ink/50">
                    {tax.has(`planTypes.${p.type}`) ? tax(`planTypes.${p.type}`) : p.type}
                    {" · "}
                    {clp.format(p.price)}
                    {p.classCount != null && ` · ${p.classCount} clases`}
                    {p.weeklyClasses != null && ` · ${p.weeklyClasses}/sem`}
                    {p.periodDays != null && ` · ${p.periodDays} días`}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-ink/50">
                  {t("academies.enrolled", { count: p.enrollments })}
                </span>
                <Badge variant={p.active ? "neon" : "muted"}>
                  {p.active
                    ? t("academies.detail.active")
                    : t("academies.detail.inactive")}
                </Badge>
              </Link>
            ))}
          </Card>
        </div>
      </section>

    </main>
  );
}
