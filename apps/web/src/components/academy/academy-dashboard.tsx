"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon, Skeleton } from "@/components/ui";
import {
  birthdayFmt,
  planDateFmt,
  shortId,
  type Academy,
  type AcademyDashboard as AcademyDashboardData,
} from "./shared";

// Claves de academy.stats.* en el orden del contrato del dashboard.
const STAT_KEYS = ["active", "trial", "paused", "frozen", "online"] as const;

/**
 * Resumen de la academia seleccionada (hub /academia): nombre + conteos
 * (alumnos, planes, asistencia 30d) y KPIs por estado de enrollment.
 * GET /academies/:id/dashboard → AcademyDashboard.
 */
export function AcademyDashboard({ academy }: { academy: Academy }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");

  const [dashboard, setDashboard] = useState<AcademyDashboardData | null>(
    null,
  );
  const [dashError, setDashError] = useState(false);

  const refresh = useCallback(async () => {
    setDashError(false);
    try {
      const res = await apiFetch(`/academies/${academy.id}/dashboard`);
      if (res.ok) {
        setDashboard((await res.json()) as AcademyDashboardData);
      } else {
        setDashError(true);
      }
    } catch {
      // Fetch rechazado = red caída o API apagada.
      setDashError(true);
    }
  }, [academy.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{academy.name}</h2>
        {dashboard === null ? (
          !dashError && (
            <Skeleton className="page-loading h-4 w-56 self-center" />
          )
        ) : (
          <p className="text-sm text-white/50">
            {t("students")} {dashboard.totalStudents} · {t("plans")}{" "}
            {dashboard.plansCount} · {t("attendance")}{" "}
            {dashboard.attendanceLast30d}
          </p>
        )}
      </header>

      {/* KPIs por estado de enrollment (academy.stats.*) */}
      <section aria-label={t("dashboard")}>
        {dashError ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-white/60">
              {tc("error")}
            </p>
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        ) : dashboard === null ? (
          /* KPIs en vuelo → skeleton con la misma grilla; nunca "-"
             como placeholder de un conteo real. */
          <ul
            aria-hidden="true"
            className="page-loading grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {STAT_KEYS.map((k) => (
              <li key={k}>
                <Card className="flex h-full flex-col gap-1 p-4">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-8 w-12" />
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {STAT_KEYS.map((k) => (
              <li key={k}>
                <Card className="flex h-full flex-col gap-1 p-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                    {t(`stats.${k}`)}
                  </span>
                  <span className="text-3xl font-bold leading-none text-neon">
                    {dashboard.studentsByStatus[k]}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Hoy - clases del día + asistencia marcada (spec §13). */}
      {dashboard && dashboard.todayClasses.length > 0 && (
        <section aria-label={t("today.title")}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t("today.title")}
            </h3>
            <p className="text-xs tabular-nums text-white/50">
              {t("today.attendance", { count: dashboard.attendanceToday })}
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {dashboard.todayClasses.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-900 px-4 py-3"
              >
                <span className="shrink-0 text-sm font-semibold tabular-nums text-neon">
                  {c.startTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.seriesName ?? t("today.unnamed")}
                  </span>
                  {c.instructorName && (
                    <span className="block truncate text-xs text-white/50">
                      {c.instructorName}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-white/50">
                  {c.capacity != null
                    ? t("today.bookedOf", {
                        booked: c.bookedCount,
                        capacity: c.capacity,
                      })
                    : t("today.booked", { count: c.bookedCount })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Insights de retención (spec academies/owner-insights): planes
          por vencer y cumpleaños próximos - render condicional, cada
          fila lleva a la ficha del alumno. */}
      {dashboard && dashboard.expiringEnrollments.length > 0 && (
        <section aria-label={t("insights.expiringTitle")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("insights.expiringTitle")}
          </h3>
          <ul className="flex flex-col gap-2">
            {dashboard.expiringEnrollments.map((e) => (
              <li key={e.personId}>
                <Link
                  href={`/academia/alumnos/${e.personId}`}
                  className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-900 px-4 py-3 transition-colors hover:border-neon/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {e.personName ?? shortId(e.personId)}
                    </span>
                    <span className="block truncate text-xs text-white/50">
                      {e.planName ?? t("insights.noPlan")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-amber-300">
                    {t("insights.expiringUntil", {
                      date: planDateFmt.format(new Date(e.endsAt)),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dashboard && dashboard.upcomingBirthdays.length > 0 && (
        <section aria-label={t("insights.birthdaysTitle")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("insights.birthdaysTitle")}
          </h3>
          <ul className="flex flex-col gap-2">
            {dashboard.upcomingBirthdays.map((b) => (
              <li key={b.personId}>
                <Link
                  href={`/academia/alumnos/${b.personId}`}
                  className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-900 px-4 py-3 transition-colors hover:border-neon/40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {b.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-neon">
                    {birthdayFmt.format(new Date(b.date))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
