"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";

type SeriesInsightsData = {
  avgAttendancePerClass: number | null;
  avgWeeklyClassesPerStudent: number | null;
  topSeries: { seriesId: string; name: string | null; attendance: number }[];
  bottomSeries: { seriesId: string; name: string | null; attendance: number }[];
};

/**
 * Insights del módulo Clases (spec academy-console-v3): KPIs primero
 * (asistencia promedio por clase + clases semanales por alumno), listas
 * después (top/bottom 5 series por asistencia histórica) - mismo orden
 * que el inicio. Filas navegables al detalle de la serie.
 */
export function SeriesInsights({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const [data, setData] = useState<SeriesInsightsData | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/series/insights`).catch(
      () => null,
    );
    if (!res?.ok) {
      setHidden(true);
      return;
    }
    setData((await res.json()) as SeriesInsightsData);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden || data === null) return null;
  const hasKpis =
    data.avgAttendancePerClass !== null ||
    data.avgWeeklyClassesPerStudent !== null;
  const hasLists =
    data.topSeries.length > 0 || data.bottomSeries.length > 0;
  if (!hasKpis && !hasLists) return null;

  const rowCls =
    "flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";
  const sectionTitleCls =
    "mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50";

  const rankList = (
    title: string,
    items: SeriesInsightsData["topSeries"],
  ) =>
    items.length === 0 ? null : (
      <section aria-label={title}>
        <h3 className={sectionTitleCls}>{title}</h3>
        <Card padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {items.map((s) => (
              <li key={s.seriesId}>
                <Link
                  href={`/academia/series/${s.seriesId}`}
                  className={rowCls}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {s.name ?? s.seriesId}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink/50">
                    {t("studentsTopAttendanceCount", {
                      count: s.attendance,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      {hasKpis && (
        <ul className="grid grid-cols-2 gap-3">
          <li>
            <Card className="flex h-full flex-col gap-1 p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
                {t("kpis.avgAttendance")}
              </span>
              <span className="text-3xl font-bold leading-none tabular-nums text-neon">
                {data.avgAttendancePerClass ?? "—"}
              </span>
              <span className="mt-0.5 text-xs text-ink/40">
                {t("seriesAvgAttendanceHint")}
              </span>
            </Card>
          </li>
          <li>
            <Card className="flex h-full flex-col gap-1 p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
                {t("seriesWeeklyAvgTitle")}
              </span>
              <span className="text-3xl font-bold leading-none tabular-nums text-neon">
                {data.avgWeeklyClassesPerStudent ?? "—"}
              </span>
              <span className="mt-0.5 text-xs text-ink/40">
                {t("seriesWeeklyAvgHint")}
              </span>
            </Card>
          </li>
        </ul>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {rankList(t("seriesTopAttendanceTitle"), data.topSeries)}
        {rankList(t("seriesLowAttendanceTitle"), data.bottomSeries)}
      </div>
    </div>
  );
}
