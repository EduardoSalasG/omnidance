"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { ExpiringList } from "./academy-dashboard";
import type { AcademyDashboard as AcademyDashboardData } from "./shared";

/**
 * Planes por vencer en cobros (spec academy-console-v3): la misma
 * lista que el inicio - vencen hoy + esta semana - sobre el endpoint
 * de dashboard, que ya calcula la ventana y ordena por urgencia.
 * Cada fila lleva a la ficha del alumno, donde se renueva el plan.
 */
export function CobrosExpiring({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const [items, setItems] = useState<
    AcademyDashboardData["expiringEnrollments"] | null
  >(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/academies/${academyId}/dashboard`).catch(
      () => null,
    );
    if (!res?.ok) {
      setHidden(true);
      return;
    }
    const data = (await res.json()) as AcademyDashboardData;
    setItems(data.expiringEnrollments ?? []);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sin datos aún o endpoint caído: no bloquear el resto del módulo;
  // si no hay vencimientos la sección no aporta.
  if (hidden || items === null || items.length === 0) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekStr = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const expiringToday = items.filter(
    (e) => e.endsAt.slice(0, 10) <= todayStr,
  );
  const expiringWeek = items.filter(
    (e) => e.endsAt.slice(0, 10) > todayStr && e.endsAt.slice(0, 10) <= weekStr,
  );
  const expiringLater =
    items.length - expiringToday.length - expiringWeek.length;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {expiringToday.length > 0 && (
        <ExpiringList
          title={t("insights.expiringTodayTitle")}
          items={expiringToday}
          t={t}
        />
      )}
      {(expiringWeek.length > 0 || expiringLater > 0) && (
        <ExpiringList
          title={t("insights.expiringWeekTitle")}
          items={expiringWeek}
          extraCount={expiringLater}
          t={t}
        />
      )}
    </div>
  );
}
