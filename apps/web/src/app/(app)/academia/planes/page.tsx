"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Button, Card, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PlansSection } from "@/components/academy/plans-section";
import { FilterBar } from "@/components/query/FilterBar";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  filterQuery,
  inputCls,
  type MembershipPlan,
  type PlansKpis,
} from "@/components/academy/shared";

// Los planes no son entidad del catálogo ACADEMY_OWNER: EntityDef local
// con claves del contrato (spec analytics/query-console) - q sobre el
// nombre y status = active|inactive (whitelist del endpoint).
const PLANS_ENTITY: EntityDef = {
  entity: "membership_plans",
  filters: [
    { key: "q", type: "text" },
    { key: "status", type: "enum", options: ["active", "inactive"] },
  ],
  columns: [],
};

type SortKey = "name" | "name-desc" | "price" | "price-desc";

/**
 * /academia/planes - membresías de la academia seleccionada.
 * KPIs propios del módulo (planes activos + top 3 por alumnos con
 * delta vs mes anterior), orden por nombre/precio y cards que abren
 * el detalle /academia/planes/[id]. Crear/editar en
 * /academia/planes/nueva (?edit=<planId>).
 */
export default function AcademiaPlanesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader
        backHref="/academia"
        backLabel={t("title")}
        actions={
          <Button href="/academia/planes/nueva" size="sm">
            + {t("newPlan")}
          </Button>
        }
      />
      <AcademyGate>
        {({ academy }) => (
          <PlansModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function PlansModule({ academyId }: { academyId: string }) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [kpis, setKpis] = useState<PlansKpis | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});
  const [sort, setSort] = useState<SortKey>("name");

  const reload = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/plans${filterQuery({ ...filters, sort })}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setPlans((await res.json()) as MembershipPlan[]);
    } catch {
      setError(true);
    }
  }, [academyId, filters, sort]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // KPIs del módulo (independientes del listado filtrado).
  useEffect(() => {
    apiFetch(`/academies/${academyId}/plans/kpis`)
      .then(async (res) =>
        res.ok ? setKpis((await res.json()) as PlansKpis) : null,
      )
      .catch(() => setKpis(null));
  }, [academyId]);

  if (error) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {kpis && <PlansKpiCards kpis={kpis} />}
      <FilterBar
        entity={PLANS_ENTITY}
        filters={filters}
        onChange={setFilters}
        options={{}}
      />
      <label className="flex items-center gap-2 self-end text-xs text-ink/50">
        {t("sortLabel")}
        <select
          className={inputCls}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="name">{t("sortNameAsc")}</option>
          <option value="name-desc">{t("sortNameDesc")}</option>
          <option value="price">{t("sortPriceAsc")}</option>
          <option value="price-desc">{t("sortPriceDesc")}</option>
        </select>
      </label>
      {plans === null ? <SkeletonList /> : <PlansSection plans={plans} />}
    </div>
  );
}

// KPIs propios del módulo: planes activos + top 3 por alumnos con su
// delta vs el tramo MTD del mes anterior (+N / −N / =).
function PlansKpiCards({ kpis }: { kpis: PlansKpis }) {
  const t = useTranslations("academy");
  return (
    <section
      aria-label={t("modules.plans")}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <Card
        className="flex flex-col gap-1 p-4"
        aria-label={`${t("planKpiActive")}: ${kpis.activePlans} — ${t("planKpiActiveHint")}`}
      >
        <span className="text-xs font-medium text-ink/50">
          {t("planKpiActive")}
        </span>
        <span className="text-2xl font-bold tabular-nums">
          {kpis.activePlans}
        </span>
      </Card>
      {kpis.topPlans.map((p) => {
        const delta = p.students - p.studentsPrev;
        const deltaLabel =
          delta === 0 ? "=" : delta > 0 ? `+${delta}` : `${delta}`;
        return (
          <Card
            key={p.planId}
            className="flex flex-col gap-1 p-4"
            aria-label={`${p.name ?? p.planId}: ${p.students} — ${t("planKpiTopHint")}`}
          >
            <span className="truncate text-xs font-medium text-ink/50">
              {p.name ?? p.planId}
            </span>
            <span className="text-2xl font-bold tabular-nums">
              {p.students}
            </span>
            <span
              className={`text-xs font-medium tabular-nums ${
                delta > 0
                  ? "text-neon"
                  : delta < 0
                    ? "text-warn"
                    : "text-ink/40"
              }`}
            >
              {deltaLabel} {t("kpis.vsPrevMonth")}
            </span>
          </Card>
        );
      })}
    </section>
  );
}
