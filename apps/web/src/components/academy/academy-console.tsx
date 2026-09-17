"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { AttendanceSection } from "./attendance-section";
import { PlansSection } from "./plans-section";
import { SlotsSection } from "./slots-section";
import { StudentsSection } from "./students-section";
import type {
  Academy,
  AcademyDashboard,
  ClassSlot,
  MembershipPlan,
} from "./shared";

type Tab = "plans" | "students" | "slots" | "attendance";
const TABS: Tab[] = ["plans", "students", "slots", "attendance"];

// Claves de academy.stats.* en el orden del contrato del dashboard.
const STAT_KEYS = ["active", "trial", "paused", "frozen", "online"] as const;

export function AcademyConsole({ academy }: { academy: Academy }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<Tab>("plans");
  const [dashboard, setDashboard] = useState<AcademyDashboard | null>(null);
  const [dashError, setDashError] = useState(false);
  // planes/slots viven acá: los necesitan los selects de alumnos y asistencia.
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [slots, setSlots] = useState<ClassSlot[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState(false);

  const refresh = useCallback(async () => {
    setDashError(false);
    setListsError(false);
    try {
      const [dashRes, plansRes, slotsRes] = await Promise.all([
        apiFetch(`/academies/${academy.id}/dashboard`),
        apiFetch(`/academies/${academy.id}/plans`),
        apiFetch(`/academies/${academy.id}/slots`),
      ]);
      if (dashRes.ok) {
        setDashboard((await dashRes.json()) as AcademyDashboard);
      } else {
        setDashError(true);
      }
      if (plansRes.ok && slotsRes.ok) {
        setPlans((await plansRes.json()) as MembershipPlan[]);
        setSlots((await slotsRes.json()) as ClassSlot[]);
      } else {
        setListsError(true);
      }
    } catch {
      // Fetch rechazado = red caída o API apagada.
      setDashError(true);
      setListsError(true);
    } finally {
      setListsLoading(false);
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
            <p className="text-sm text-white/60">{tc("error")}</p>
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

      {/* Tabs de operación diaria */}
      <div
        role="tablist"
        aria-label={t("title")}
        className="flex gap-1 overflow-x-auto rounded-2xl border border-night-700 bg-night-900 p-1"
      >
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
              tab === key
                ? "bg-neon text-night-950"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {listsLoading ? (
        <p className="text-sm text-white/60">{tc("loading")}</p>
      ) : listsError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-white/60">{tc("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      ) : (
        <>
          {tab === "plans" && (
            <PlansSection
              academyId={academy.id}
              plans={plans}
              onChanged={refresh}
            />
          )}
          {tab === "students" && (
            <StudentsSection
              academyId={academy.id}
              plans={plans}
              onChanged={refresh}
            />
          )}
          {tab === "slots" && (
            <SlotsSection
              academyId={academy.id}
              slots={slots}
              onChanged={refresh}
            />
          )}
          {tab === "attendance" && (
            <AttendanceSection
              academyId={academy.id}
              slots={slots}
              onChanged={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}
