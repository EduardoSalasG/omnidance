"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PlansSection } from "@/components/academy/plans-section";
import { FilterBar } from "@/components/query/FilterBar";
import { ConsoleHeader } from "@/components/console/console-header";
import { filterQuery, type MembershipPlan } from "@/components/academy/shared";

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

/**
 * /academia/planes - membresías de la academia seleccionada.
 * La página fetchea GET /academies/:id/plans; crear/editar vive en
 * /academia/planes/nueva (?edit=<planId>) detrás del CTA del header.
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
  const tc = useTranslations("common");
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});

  const reload = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/plans${filterQuery(filters)}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setPlans((await res.json()) as MembershipPlan[]);
    } catch {
      setError(true);
    }
  }, [academyId, filters]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      <FilterBar
        entity={PLANS_ENTITY}
        filters={filters}
        onChange={setFilters}
        options={{}}
      />
      {plans === null ? <SkeletonList /> : <PlansSection plans={plans} />}
    </div>
  );
}
