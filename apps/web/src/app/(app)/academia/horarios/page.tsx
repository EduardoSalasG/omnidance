"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Button, ChevronRightIcon, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { SlotsSection } from "@/components/academy/slots-section";
import { FilterBar } from "@/components/query/FilterBar";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  filterQuery,
  mergeOptions,
  type ClassSlot,
  type FilterOption,
} from "@/components/academy/shared";

// La parrilla no es entidad del catálogo ACADEMY_OWNER: EntityDef local
// con la clave del contrato (spec analytics/query-console) - seriesId
// filtra los slots por su serie.
const SLOTS_ENTITY: EntityDef = {
  entity: "class_slots",
  filters: [
    { key: "seriesId", type: "fk", source: "academyClassSeries" },
  ],
  columns: [],
};

/**
 * /academia/horarios - parrilla semanal de la academia (ClassSlot). Solo
 * lectura: los horarios se crean/editan dentro de su serie en
 * /academia/series (invariante: todo slot pertenece a una serie).
 */
export default function AcademiaHorariosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <SlotsModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function SlotsModule({ academyId }: { academyId: string }) {
  const tc = useTranslations("common");
  const ts = useTranslations("academySeries");
  const [slots, setSlots] = useState<ClassSlot[] | null>(null);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});
  // Opciones del filtro seriesId cosechadas de la parrilla (merge
  // estable: filtrar no colapsa las opciones del propio filtro).
  const [seriesOptions, setSeriesOptions] = useState<FilterOption[]>([]);

  const reload = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/slots${filterQuery(filters)}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      const rows = (await res.json()) as ClassSlot[];
      setSlots(rows);
      setSeriesOptions((prev) =>
        mergeOptions(
          prev,
          rows.map((s) => ({ value: s.series.id, label: s.series.name })),
        ),
      );
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
  if (slots === null) {
    return <SkeletonList />;
  }
  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        entity={SLOTS_ENTITY}
        filters={filters}
        onChange={setFilters}
        options={{ academyClassSeries: seriesOptions }}
      />
      <SlotsSection slots={slots} />
      <Link
        href="/academia/series"
        className="inline-flex items-center gap-1 text-sm font-medium text-neon hover:underline"
      >
        {ts("title")} <ChevronRightIcon />
      </Link>
    </div>
  );
}
