"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { shortId, type PlanDetail } from "@/components/academy/shared";

/**
 * /academia/planes/[id] - detalle del plan: datos, CTA de edición
 * (/academia/planes/nueva?edit=<id>) y alumnos con el plan vigente
 * (inicio/fin). El listado solo navega hasta acá.
 */
export default function PlanDetailPage() {
  const t = useTranslations("academy");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/planes" backLabel={t("plans")} />
      <AcademyGate>
        {({ academy }) => (
          <PlanDetail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            planId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function PlanDetail({
  academyId,
  planId,
}: {
  academyId: string;
  planId: string;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loadError, setLoadError] = useState<number | null>(null);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [],
  );

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/plans/${planId}`);
      if (!res.ok) {
        setLoadError(res.status);
        return;
      }
      setPlan((await res.json()) as PlanDetail);
    } catch {
      setLoadError(0);
    }
  }, [academyId, planId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loadError !== null) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {loadError === 404 ? t("plansEmpty") : tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!plan) return <SkeletonList />;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">{plan.name}</h2>
          <Badge variant="outline">
            {t.has(`planTypes.${plan.type}`)
              ? t(`planTypes.${plan.type}`)
              : plan.type}
          </Badge>
          {!plan.active && (
            <Badge variant="live">{t("planInactive")}</Badge>
          )}
          <PriceTag amount={plan.price} />
        </div>
        {plan.classCount != null && (
          <p className="text-sm text-ink/60">
            {t("planClasses")}: {plan.classCount}
          </p>
        )}
        {plan.weeklyClasses != null && (
          <p className="text-sm text-ink/60">
            {t("planWeeklyCount", { count: plan.weeklyClasses })}
          </p>
        )}
        {plan.description.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink/60">
            {plan.description.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
        <div>
          <Button
            size="sm"
            variant="secondary"
            href={`/academia/planes/nueva?edit=${plan.id}`}
          >
            {t("editPlan")}
          </Button>
        </div>
      </section>

      {/* Alumnos con el plan vigente (enrollment ACTIVE): inicio y fin. */}
      <section
        aria-label={t("planStudentsTitle")}
        className="flex flex-col gap-3"
      >
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("planStudentsTitle")} ({plan.students.length})
        </h3>
        <Card padded={false}>
          {plan.students.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink/50">
              {t("planStudentsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {plan.students.map((s) => (
                <li
                  key={s.personId}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {s.name ?? shortId(s.personId)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink/50">
                    {t("planFrom")}{" "}
                    {dateFmt.format(new Date(s.startedAt))}
                    {s.endsAt &&
                      ` · ${t("planUntil")} ${dateFmt.format(new Date(s.endsAt))}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
