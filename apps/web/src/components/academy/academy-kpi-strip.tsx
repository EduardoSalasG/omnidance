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
}: {
  data: AcademyDashboard | null;
  error?: boolean;
  onRetry?: () => void;
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
    // delta; `prev` undefined = el KPI no lleva comparativa.
    valueNum: number | null;
    prev?: number | null;
    hint: string;
  }[] = data
    ? [
        {
          key: "activeStudents",
          href: "/academia/alumnos",
          value: String(data.kpis.activeStudentsMonth),
          valueNum: data.kpis.activeStudentsMonth,
          hint: t("kpis.activeStudentsHint"),
        },
        {
          key: "purchasablePlans",
          href: "/academia/planes",
          value: String(data.kpis.purchasablePlans),
          valueNum: data.kpis.purchasablePlans,
          hint: t("kpis.purchasablePlansHint"),
        },
        {
          key: "weeklyClasses",
          href: "/academia/horarios",
          value: String(data.kpis.weeklyClasses),
          valueNum: data.kpis.weeklyClasses,
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
          hint: t("kpis.avgAttendanceHint"),
        },
        {
          key: "billedMonth",
          href: "/academia/cobros",
          value: clpFmt.format(data.kpis.billedMonth),
          valueNum: data.kpis.billedMonth,
          prev: data.kpis.billedMonthPrev,
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
          hint: t("kpis.avgTicketHint"),
        },
      ]
    : [];

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
          {items.map((k) => {
            const label = t(`kpis.${k.key}`);
            // Delta % vs el mismo tramo MTD del mes anterior. Sin base
            // (prev null/0 o valor null) no se muestra - "+∞%" sería
            // ruido deshonesto.
            const deltaPct =
              k.prev != null && k.prev > 0 && k.valueNum != null
                ? Math.round(((k.valueNum - k.prev) / k.prev) * 100)
                : null;
            return (
              <li key={k.key}>
                <Link
                  href={k.href}
                  title={k.hint}
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
                    {deltaPct !== null && (
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 text-xs font-medium tabular-nums ${
                          deltaPct > 0
                            ? "text-neon/80"
                            : deltaPct < 0
                              ? "text-amber-300"
                              : "text-ink/40"
                        }`}
                      >
                        {deltaPct > 0 ? "+" : ""}
                        {deltaPct}% {t("kpis.vsPrevMonth")}
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

/**
 * Versión autocontenida para las páginas de módulo: si recibe
 * `academyId` lo usa directo; si no, resuelve `/academies/mine`
 * respetando la selección persistida (páginas sin AcademyGate como
 * /academia/clases). Sin academia o sin acceso → no renderiza nada
 * (el dashboard responde 403 para quien no es del equipo).
 */
export function AcademyKpiStrip({ academyId }: { academyId?: string }) {
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
  return <AcademyKpiCards data={data} />;
}
