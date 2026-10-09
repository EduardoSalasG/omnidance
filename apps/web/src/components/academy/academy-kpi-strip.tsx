"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, Skeleton } from "@/components/ui";
import type { Academy, AcademyDashboard } from "./shared";

const clpFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

// Academia seleccionada persiste en localStorage (misma key que
// AcademyGate) - el strip autocontenido la respeta al auto-resolver.
const STORAGE_KEY = "omnidance:academy-id";

/**
 * Strip de KPIs del mes de la academia (spec: consola del owner) -
 * 4 cards enlazables a su módulo. Usado en el dashboard del inicio
 * (data ya fetcheada → `AcademyKpiCards`) y como primera sección de
 * alumnos/clases/planes (`AcademyKpiStrip` se auto-resuelve).
 */
export function AcademyKpiCards({
  data,
  error,
  onRetry,
  keys,
}: {
  data: AcademyDashboard | null;
  error?: boolean;
  onRetry?: () => void;
  /** Subset de cards por página (módulo alumnos solo muestra 3); sin
   *  `keys` se muestran todas en el orden del dashboard. */
  keys?: string[];
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");

  if (error) {
    return onRetry ? (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    ) : null;
  }

  const items: {
    key: string;
    href: string;
    value: string | null;
    // valor numérico + base del mes anterior (mismo tramo MTD) para el
    // delta absoluto; `prev` undefined = el KPI no lleva comparativa.
    valueNum: number | null;
    prev?: number | null;
    // deltaKind: formato del delta absoluto (count +3 / money +$300.000 /
    // avg +0.8 con un decimal / pts +4 pts para cards de porcentaje).
    deltaKind: "count" | "money" | "avg" | "pts";
    hint: string;
  }[] = data
    ? [
        {
          key: "activeStudents",
          href: "/academia/alumnos",
          value: String(data.kpis.activeStudentsMonth),
          valueNum: data.kpis.activeStudentsMonth,
          prev: data.kpis.activeStudentsMonthPrev,
          deltaKind: "count",
          hint: t("kpis.activeStudentsHint"),
        },
        {
          key: "pctMen",
          href: "/academia/alumnos",
          value:
            data.kpis.pctMenMonth === null
              ? null
              : `${data.kpis.pctMenMonth}%`,
          valueNum: data.kpis.pctMenMonth,
          prev: data.kpis.pctMenMonthPrev,
          deltaKind: "pts",
          hint: t("kpis.pctMenHint"),
        },
        {
          key: "pctWomen",
          href: "/academia/alumnos",
          value:
            data.kpis.pctWomenMonth === null
              ? null
              : `${data.kpis.pctWomenMonth}%`,
          valueNum: data.kpis.pctWomenMonth,
          prev: data.kpis.pctWomenMonthPrev,
          deltaKind: "pts",
          hint: t("kpis.pctWomenHint"),
        },
        {
          key: "purchasablePlans",
          href: "/academia/planes",
          value: String(data.kpis.purchasablePlans),
          valueNum: data.kpis.purchasablePlans,
          deltaKind: "count",
          hint: t("kpis.purchasablePlansHint"),
        },
        {
          key: "weeklyClasses",
          href: "/academia/horarios",
          value: String(data.kpis.weeklyClasses),
          valueNum: data.kpis.weeklyClasses,
          deltaKind: "count",
          hint: t("kpis.weeklyClassesHint"),
        },
        {
          key: "avgAttendance",
          href: "/academia/asistencia",
          value:
            data.kpis.avgAttendancePerClassMonth === null
              ? null
              : String(data.kpis.avgAttendancePerClassMonth),
          valueNum: data.kpis.avgAttendancePerClassMonth,
          prev: data.kpis.avgAttendancePerClassMonthPrev,
          deltaKind: "avg",
          hint: t("kpis.avgAttendanceHint"),
        },
        {
          key: "billedMonth",
          href: "/academia/cobros",
          value: clpFmt.format(data.kpis.billedMonth),
          valueNum: data.kpis.billedMonth,
          prev: data.kpis.billedMonthPrev,
          deltaKind: "money",
          hint: t("kpis.billedMonthHint"),
        },
        {
          key: "avgTicket",
          href: "/academia/cobros",
          value:
            data.kpis.avgTicketMonth === null
              ? null
              : clpFmt.format(data.kpis.avgTicketMonth),
          valueNum: data.kpis.avgTicketMonth,
          prev: data.kpis.avgTicketMonthPrev,
          deltaKind: "money",
          hint: t("kpis.avgTicketHint"),
        },
      ]
    : [];

  const visible = keys ? items.filter((k) => keys.includes(k.key)) : items;

  return (
    <section aria-label={t("kpis.title")}>
      {data === null ? (
        <ul
          aria-hidden="true"
          className="page-loading grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <Card className="flex h-full flex-col gap-1 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((k) => {
            const label = t(`kpis.${k.key}`);
            // Delta absoluto vs el mismo tramo MTD del mes anterior:
            // "+N"/"-N"/"=" ("+$N" monedas, "+N pts" porcentajes). Se
            // muestra siempre que haya base (`prev` no null) - con
            // prev=0 el absoluto sigue siendo honesto.
            const delta =
              k.prev != null && k.valueNum != null
                ? k.valueNum - k.prev
                : null;
            const deltaText =
              delta === null
                ? null
                : delta === 0
                  ? "="
                  : delta > 0
                    ? `+${formatDelta(delta, k.deltaKind, t)}`
                    : `-${formatDelta(-delta, k.deltaKind, t)}`;
            return (
              <li key={k.key}>
                <Link
                  href={k.href}
                  title={k.hint}
                  data-tour={`academy-kpi-${k.key}`}
                  // El hint también vive en title (visual); el aria-label
                  // lo expone a teclado/táctil y lectores de pantalla.
                  aria-label={`${label}: ${k.value ?? t("kpis.noData")} — ${k.hint}`}
                  className="block h-full rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.98]"
                >
                  <Card className="flex h-full flex-col gap-1 p-4 transition-colors hover:border-neon/40">
                    <span className="truncate text-xs font-medium uppercase tracking-wide text-ink/50">
                      {label}
                    </span>
                    <span className="text-3xl font-bold leading-none text-neon">
                      {k.value ?? "—"}
                    </span>
                    {deltaText !== null && (
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 text-xs font-medium tabular-nums ${
                          delta! > 0
                            ? "text-neon/80"
                            : delta! < 0
                              ? "text-amber-300"
                              : "text-ink/40"
                        }`}
                      >
                        {deltaText} {t("kpis.vsPrevMonth")}
                      </span>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Formatea la magnitud del delta absoluto según el tipo de KPI. */
function formatDelta(
  n: number,
  kind: "count" | "money" | "avg" | "pts",
  t: ReturnType<typeof useTranslations>,
): string {
  switch (kind) {
    case "money":
      return clpFmt.format(Math.round(n));
    case "avg":
      return String(Math.round(n * 10) / 10);
    case "pts":
      return `${Math.round(n)} ${t("kpis.pts")}`;
    default:
      return String(Math.round(n));
  }
}

/**
 * Versión autocontenida para las páginas de módulo: si recibe
 * `academyId` lo usa directo; si no, resuelve `/academies/mine`
 * respetando la selección persistida (páginas sin AcademyGate como
 * /academia/clases). Sin academia o sin acceso → no renderiza nada
 * (el dashboard responde 403 para quien no es del equipo).
 */
export function AcademyKpiStrip({
  academyId,
  keys,
}: {
  academyId?: string;
  /** Subset de cards por página (p.ej. alumnos muestra solo 3). */
  keys?: string[];
}) {
  const [resolvedId, setResolvedId] = useState<string | null>(
    academyId ?? null,
  );
  const [data, setData] = useState<AcademyDashboard | null>(null);
  const [hidden, setHidden] = useState(false);

  // Auto-resolución de academia cuando la página no tiene AcademyGate.
  useEffect(() => {
    if (academyId) {
      setResolvedId(academyId);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await apiFetch("/academies/mine").catch(() => null);
      if (cancelled) return;
      if (!res?.ok) {
        setHidden(true);
        return;
      }
      const list = (await res.json()) as Academy[];
      if (!list.length) {
        setHidden(true);
        return;
      }
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // Sin storage (modo privado) - primera academia.
      }
      setResolvedId(
        stored && list.some((a) => a.id === stored) ? stored : list[0].id,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  const load = useCallback(async () => {
    if (!resolvedId) return;
    setData(null);
    setHidden(false);
    const res = await apiFetch(`/academies/${resolvedId}/dashboard`).catch(
      () => null,
    );
    if (!res?.ok) {
      setHidden(true);
      return;
    }
    setData((await res.json()) as AcademyDashboard);
  }, [resolvedId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden) return null;
  if (!resolvedId) return null;
  return <AcademyKpiCards data={data} keys={keys} />;
}
