"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";
import { shortId } from "./shared";

const clpFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

type StudentsInsightsData = {
  topAttendance: { personId: string; name: string | null; count: number }[];
  topPayersMonth: { personId: string; name: string | null; amount: number }[];
};

/**
 * Insights del módulo Alumnos (spec academy-console-v3): top 5 por
 * asistencia histórica y top 5 por monto pagado del mes. Van después
 * del strip de KPIs - orden "métricas primero, listas después", como
 * en el inicio. Cada fila navega a la ficha del alumno.
 */
export function StudentsInsights({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const [data, setData] = useState<StudentsInsightsData | null>(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/students/insights`).catch(
      () => null,
    );
    if (!res?.ok) {
      setHidden(true);
      return;
    }
    setData((await res.json()) as StudentsInsightsData);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden || data === null) return null;
  if (data.topAttendance.length === 0 && data.topPayersMonth.length === 0) {
    return null;
  }

  const rowCls =
    "flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";
  const sectionTitleCls =
    "mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {data.topAttendance.length > 0 && (
        <section aria-label={t("studentsTopAttendanceTitle")}>
          <h3 className={sectionTitleCls}>
            {t("studentsTopAttendanceTitle")}
          </h3>
          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-line">
              {data.topAttendance.map((s) => (
                <li key={s.personId}>
                  <Link
                    href={`/academia/alumnos/${s.personId}`}
                    className={rowCls}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {s.name ?? shortId(s.personId)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink/50">
                      {t("studentsTopAttendanceCount", { count: s.count })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
      {data.topPayersMonth.length > 0 && (
        <section aria-label={t("studentsTopPayersTitle")}>
          <h3 className={sectionTitleCls}>{t("studentsTopPayersTitle")}</h3>
          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-line">
              {data.topPayersMonth.map((s) => (
                <li key={s.personId}>
                  <Link
                    href={`/academia/alumnos/${s.personId}`}
                    className={rowCls}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {s.name ?? shortId(s.personId)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink/70">
                      {clpFmt.format(s.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
