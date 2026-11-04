"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";

import { Badge, Button, Card, ChevronRightIcon, PriceTag, RefreshIcon, Spinner } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { shortId, type PlanDetail } from "@/components/academy/shared";
import { Link } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";

/**
 * /academia/planes/[id] - detalle del plan: el card de entidad navega a
 * editar (/academia/planes/nueva?edit=<id>), activar/desactivar queda
 * como acción propia debajo y alumnos con el plan vigente (inicio/fin).
 * El listado solo navega hasta acá.
 */
export default function PlanDetailPage() {
  const t = useTranslations("academy");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  const dateFmt = useDateFmt({
        day: "numeric",
        month: "short",
        year: "numeric",
      });

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

  // PATCH /plans/:id {active} - activar/desactivar el plan desde la
  // ficha (la edición de datos vive en /planes/nueva?edit=<id>).
  async function toggleActive(): Promise<void> {
    if (!plan) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/plans/${plan.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !plan.active }),
        },
      );
      if (!res.ok) {
        setNotice({ text: tc("error"), error: true });
        return;
      }
      setNotice({ text: t("planSaved") });
      await reload();
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (loadError !== null) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {loadError === 404 ? t("planNotFound") : tc("error")}
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
        {/* Header de entidad desnudo (estándar industria: identidad de
            la página sobre el canvas, las cajas son para secciones) -
            el bloque navega a editar: chevron + nombre/chevron neon en
            hover + focus ring en el Link. */}
        <Link
          href={`/academia/planes/nueva?edit=${plan.id}`}
          className="group block rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <h2 className="truncate text-lg font-semibold transition-colors group-hover:text-neon">
                  {plan.name}
                </h2>
                {!plan.active && (
                  <Badge variant="outline">{t("planInactive")}</Badge>
                )}
              </div>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40 transition-colors group-hover:text-neon" />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant="outline">
                {t.has(`planTypes.${plan.type}`)
                  ? t(`planTypes.${plan.type}`)
                  : plan.type}
              </Badge>
              <PriceTag amount={plan.price} currency={plan.currency} />
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
          </div>
        </Link>
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
                <li key={s.personId}>
                  <Link
                    href={`/academia/alumnos/${s.personId}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
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
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Mutación de estado al pie (console-patterns §3/§4): centrada
          y separada por border-t, igual que el toggle de promos/[id]. */}
      <div className="flex justify-center border-t border-line pt-6">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void toggleActive()}
        >
          {busy ? <Spinner size="sm" /> : null}
          {plan.active ? t("planDeactivate") : t("planReactivate")}
        </Button>
      </div>

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
