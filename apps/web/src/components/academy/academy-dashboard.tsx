"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui";
import { AcademyKpiCards } from "./academy-kpi-strip";
import {
  birthdayFmt,
  planDateFmt,
  shortId,
  type Academy,
  type AcademyDashboard as AcademyDashboardData,
} from "./shared";

/**
 * Resumen de la academia seleccionada (inicio del owner): nombre + KPIs
 * del mes, clases de hoy e insights de retención.
 * GET /academies/:id/dashboard → AcademyDashboard.
 */
export function AcademyDashboard({ academy }: { academy: Academy }) {
  const t = useTranslations("academy");

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
      </header>

      {/* KPIs del mes (spec consola owner): alumnos activos con plan
          vigente, planes comprables, asistencia/clase y ticket/alumno.
          Mismo strip que encabeza alumnos/clases/planes. */}
      <AcademyKpiCards
        data={dashboard}
        error={dashError}
        onRetry={() => void refresh()}
      />

      {/* Hoy - clases del día + asistencia marcada (spec §13). */}
      {dashboard && dashboard.todayClasses.length > 0 && (
        <section aria-label={t("today.title")}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("today.title")}
            </h3>
            <p className="text-xs tabular-nums text-ink/50">
              {t("today.attendance", { count: dashboard.attendanceToday })}
            </p>
          </div>
          {/* Lista dividida como planes/cumpleaños: las clases del día
              escalan mejor en filas que en una grilla de cards. */}
          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-line">
              {dashboard.todayClasses.map((c) => (
                <li
                  key={c.id}
                  className="flex min-h-11 items-center gap-3 px-4 py-2.5"
                >
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-neon">
                    {c.startTime}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {c.seriesName ?? t("today.unnamed")}
                    </span>
                    {c.instructorName && (
                      <span className="block truncate text-xs text-ink/50">
                        {c.instructorName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink/50">
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
          </Card>
        </section>
      )}

      {/* Insights de retención (spec academies/owner-insights): planes
          por vencer y cumpleaños próximos - render condicional, cada
          fila lleva a la ficha del alumno. */}
      {dashboard && dashboard.expiringEnrollments.length > 0 && (
        <section aria-label={t("insights.expiringTitle")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("insights.expiringTitle")}
          </h3>
          {/* Lista dividida: con muchas filas la grilla de cards era ruidosa
              y desigual; una lista lee mejor y escala. */}
          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-line">
              {dashboard.expiringEnrollments.map((e) => (
                <li key={e.personId}>
                  <Link
                    href={`/academia/alumnos/${e.personId}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {e.personName ?? shortId(e.personId)}
                      </span>
                      {/* En móvil el plan va apilado bajo el nombre; en
                          sm+ pasa a su propia columna (ver abajo). */}
                      <span className="block truncate text-xs text-ink/50 sm:hidden">
                        {e.planName ?? t("insights.noPlan")}
                      </span>
                    </span>
                    <span className="hidden min-w-0 truncate text-sm text-ink/70 sm:block">
                      {e.planName ?? t("insights.noPlan")}
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
          </Card>
        </section>
      )}

      {dashboard && dashboard.upcomingBirthdays.length > 0 && (
        <section aria-label={t("insights.birthdaysTitle")}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("insights.birthdaysTitle")}
          </h3>
          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-line">
              {dashboard.upcomingBirthdays.map((b) => (
                <li key={b.personId}>
                  <Link
                    href={`/academia/alumnos/${b.personId}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
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
          </Card>
        </section>
      )}
    </div>
  );
}
