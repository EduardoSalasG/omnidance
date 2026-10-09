"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card } from "@/components/ui";

/**
 * Resultados de las encuestas mensuales de curso (spec
 * academy-console-v3) - SOLO para la consola del owner: el endpoint
 * responde 403 a staff/instructores y los datos vienen anonimizados
 * (promedios + comentarios sin autor).
 * `seriesId` filtra a una clase (detalle de serie); `instructorId` a un
 * profe (detalle de equipo) - agrupado por mes × serie.
 */

type SurveyGroup = {
  seriesId: string;
  seriesName: string;
  month: string;
  count: number;
  avgCourse: number;
  avgInstructor: number | null;
  comments: string[];
};

const monthFmt = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return monthFmt.format(new Date(Date.UTC(y, mo - 1, 1)));
};

export function CourseSurveyResults({
  academyId,
  seriesId,
  instructorId,
}: {
  academyId: string;
  seriesId?: string;
  instructorId?: string;
}) {
  const t = useTranslations("courseSurvey");
  const [groups, setGroups] = useState<SurveyGroup[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = instructorId
      ? `/academies/${academyId}/instructors/${instructorId}/surveys`
      : `/academies/${academyId}/surveys${seriesId ? `?seriesId=${encodeURIComponent(seriesId)}` : ""}`;
    apiFetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          // 403 (staff sin ser owner) → la sección no aplica, se oculta.
          if (res.status !== 403) setFailed(true);
          return;
        }
        setGroups((await res.json()) as SurveyGroup[]);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, seriesId, instructorId]);

  // Loading: sin skeleton - sección secundaria al pie, no reserva
  // espacio (mismo criterio que las cards de encuestas del home).
  if (failed || groups === null) return null;
  if (groups.length === 0) {
    return (
      <section aria-label={t("resultsTitle")} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("resultsTitle")}
        </h3>
        <Card className="p-4">
          <p className="text-sm text-ink/50">{t("empty")}</p>
        </Card>
      </section>
    );
  }

  // Agrupado por mes (desc) → dentro, una card por serie.
  const byMonth = new Map<string, SurveyGroup[]>();
  for (const g of groups) {
    const list = byMonth.get(g.month) ?? [];
    list.push(g);
    byMonth.set(g.month, list);
  }

  return (
    <section aria-label={t("resultsTitle")} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("resultsTitle")}
      </h3>
      {[...byMonth.entries()].map(([month, items]) => (
        <div key={month} className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink/40 capitalize">
            {monthLabel(month)}
          </h4>
          {items.map((g) => (
            <Card key={`${g.seriesId}:${g.month}`} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {!seriesId && g.seriesName && (
                  <span className="text-sm font-semibold">{g.seriesName}</span>
                )}
                <Badge variant="neon">
                  {t("avgCourse")}: {g.avgCourse.toFixed(1)} ★
                </Badge>
                {g.avgInstructor !== null && (
                  <Badge variant="outline">
                    {t("avgInstructor")}: {g.avgInstructor.toFixed(1)} ★
                  </Badge>
                )}
                <span className="text-xs text-ink/50">
                  {t("responses", { count: g.count })}
                </span>
              </div>
              {g.comments.length > 0 && (
                <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
                  {g.comments.map((c, i) => (
                    <li key={i} className="text-sm text-ink/70">
                      “{c}”
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      ))}
    </section>
  );
}
