"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import type {
  Academy,
  AcademyDashboard as AcademyDashboardData,
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
        {dashboard && (
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
              ↻ {tc("retry")}
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {STAT_KEYS.map((k) => (
              <li key={k}>
                <Card className="flex h-full flex-col gap-1 p-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                    {t(`stats.${k}`)}
                  </span>
                  <span className="text-3xl font-bold leading-none text-neon">
                    {dashboard ? dashboard.studentsByStatus[k] : "—"}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
