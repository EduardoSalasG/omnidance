"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card, SeeAllRow } from "@/components/ui";
import { useDateFmt } from "@/lib/intl";

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

// Preview dentro de la ficha: 3 grupos mes×serie y 3 comentarios por
// grupo; el resto queda tras "Ver todo" (patrón SeeAllRow; la ficha de
// instructor ya pide el tope del endpoint, 60 grupos).
const PREVIEW = 3;

export function CourseSurveyResults({
  academyId,
  seriesId,
  instructorId,
}: {
  academyId: string;
  seriesId?: string;
  instructorId?: string;
}) {
  const monthFmt = useDateFmt({
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
  const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return monthFmt.format(new Date(Date.UTC(y, mo - 1, 1)));
};
  const t = useTranslations("courseSurvey");
  const [groups, setGroups] = useState<SurveyGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = instructorId
      ? `/academies/${academyId}/instructors/${instructorId}/surveys?limit=60`
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
        <h3 className="flex min-h-11 items-center text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("resultsTitle")}
        </h3>
        <Card className="p-4">
          <p className="text-sm text-ink/50">{t("empty")}</p>
        </Card>
      </section>
    );
  }

  // Orden del API: mes desc → createdAt desc. El header de mes se emite
  // cuando cambia respecto al grupo visible anterior.
  const visible = expanded ? groups : groups.slice(0, PREVIEW);

  return (
    <section aria-label={t("resultsTitle")} className="flex flex-col gap-3">
      {/* min-h-11: misma altura de fila que una sección con título +
          acción (botón sm), así los títulos de columnas vecinas en el
          grid de la ficha quedan alineados. */}
      <h3 className="flex min-h-11 items-center text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("resultsTitle")}
      </h3>
      <ul className="flex flex-col gap-2">
        {visible.map((g, i) => (
          <li key={`${g.seriesId}:${g.month}`} className="flex flex-col gap-2">
            {(i === 0 || visible[i - 1].month !== g.month) && (
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                {monthLabel(g.month)}
              </h4>
            )}
            <SurveyGroupCard group={g} showSeries={!seriesId} />
          </li>
        ))}
        <SeeAllRow
          total={groups.length}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          preview={PREVIEW}
        />
      </ul>
    </section>
  );
}

function SurveyGroupCard({
  group,
  showSeries,
}: {
  group: SurveyGroup;
  showSeries: boolean;
}) {
  const t = useTranslations("courseSurvey");
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? group.comments
    : group.comments.slice(0, PREVIEW);
  // Keys estables por contenido: dos evaluaciones pueden dejar el mismo
  // texto - el sufijo es la ocurrencia, no el índice de render.
  const seen = new Map<string, number>();
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {showSeries && group.seriesName && (
          <span className="text-sm font-semibold">{group.seriesName}</span>
        )}
        <Badge variant="neon">
          {t("avgCourse")}: {group.avgCourse.toFixed(1)} ★
        </Badge>
        {group.avgInstructor !== null && (
          <Badge variant="outline">
            {t("avgInstructor")}: {group.avgInstructor.toFixed(1)} ★
          </Badge>
        )}
        <span className="text-xs text-ink/50">
          {t("responses", { count: group.count })}
        </span>
      </div>
      {group.comments.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
          {visible.map((c) => {
            const n = seen.get(c) ?? 0;
            seen.set(c, n + 1);
            return (
              <li key={`${c}#${n}`} className="text-sm text-ink/70">
                “{c}”
              </li>
            );
          })}
          <SeeAllRow
            total={group.comments.length}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            preview={PREVIEW}
          />
        </ul>
      )}
    </Card>
  );
}
