"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Pager, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar } from "@/components/query/FilterBar";
import { ImportCard } from "@/components/academy/import-section";
import { SeriesInsights } from "@/components/academy/series-insights";
import { useAcademyAccess } from "@/components/academy/use-academy-access";
import {
  filterQuery,
  type FilterOption,
  type Series,
  type SeriesStyle,
} from "@/components/academy/shared";

// Las series no son entidad del catálogo ACADEMY_OWNER: EntityDef local
// con claves del contrato (spec analytics/query-console) - q sobre el
// nombre, status = active|inactive, styleId/levelId/typeId exactos
// (whitelist del endpoint).
const SERIES_ENTITY: EntityDef = {
  entity: "class_series",
  filters: [
    { key: "q", type: "text" },
    { key: "status", type: "enum", options: ["active", "inactive"] },
    { key: "styleId", type: "fk", source: "styles" },
    { key: "levelId", type: "fk", source: "levels" },
    { key: "typeId", type: "fk", source: "classTypes", multi: true },
  ],
  columns: [],
};

type Catalogs = {
  levels?: { id: string; name: string }[];
  types?: { id: string; name: string }[];
};

const PAGE_SIZE = 12;

/**
 * /academia/series - "Clases": listado de las series de la academia.
 * Los cards no llevan acciones - el tap abre el detalle
 * /academia/series/[id] (editar, horarios, desactivar/reactivar,
 * eliminar, próximas clases y asistencia). Por defecto solo activas;
 * las eliminadas (borrado lógico) no se listan nunca - solo analítica.
 */
export default function AcademiaSeriesPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <SeriesModule key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}

function SeriesModule({ academyId }: { academyId: string }) {
  const t = useTranslations("academySeries");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const access = useAcademyAccess(academyId);

  const [series, setSeries] = useState<Series[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState(false);
  // Default del listado: solo clases activas (spec academies/class-series).
  const [filters, setFilters] = useState<QueryFilters>({ status: "active" });
  const [importOpen, setImportOpen] = useState(false);

  // Opciones de los filtros fk - catálogos públicos.
  const [styleOptions, setStyleOptions] = useState<FilterOption[]>([]);
  const [levelOptions, setLevelOptions] = useState<FilterOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<FilterOption[]>([]);

  const clpFmt = useMemo(
    () =>
      new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }),
    [],
  );

  const reload = useCallback(async () => {
    setLoadError(false);
    try {
      const qs = filterQuery(filters);
      const res = await apiFetch(
        `/academies/${academyId}/series${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
      );
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = (await res.json()) as { items: Series[]; total: number };
      setSeries(data.items);
      setTotal(data.total);
    } catch {
      setLoadError(true);
    }
  }, [academyId, filters, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Catálogos de filtros: styles + levels + types (GET /classes/catalogs
  // es público y trae levels/types juntos).
  useEffect(() => {
    apiFetch("/styles")
      .then(async (res) =>
        res.ok ? ((await res.json()) as SeriesStyle[]) : [],
      )
      .then((styles) =>
        setStyleOptions(
          styles.map((s) => ({ value: s.id, label: s.name })),
        ),
      )
      .catch(() => setStyleOptions([]));
    apiFetch("/classes/catalogs")
      .then(async (res) => (res.ok ? ((await res.json()) as Catalogs) : {}))
      .then((c) => {
        setLevelOptions(
          (c.levels ?? []).map((l) => ({ value: l.id, label: l.name })),
        );
        setTypeOptions(
          (c.types ?? []).map((ty) => ({ value: ty.id, label: ty.name })),
        );
      })
      .catch(() => {
        setLevelOptions([]);
        setTypeOptions([]);
      });
  }, []);

  if (loadError) {
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
  if (series === null) {
    return <SkeletonList />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button href="/academia/series/nueva" size="sm">
          + {t("new")}
        </Button>
        {/* Carga masiva de clases embebida en el módulo (cap `schedule`)
            - reemplaza al antiguo "importar horarios" de /academia/horarios. */}
        {access?.caps.schedule === true && (
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={importOpen}
            onClick={() => setImportOpen((v) => !v)}
          >
            {t("importClasses")}
          </Button>
        )}
      </div>

      {/* Insights del módulo: KPIs primero, listas después (mismo
          orden que el inicio). */}
      <SeriesInsights academyId={academyId} />

      <FilterBar
        entity={SERIES_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{
          styles: styleOptions,
          levels: levelOptions,
          classTypes: typeOptions,
        }}
      />

      {importOpen && (
        <ImportCard academyId={academyId} kind="schedule" />
      )}

      {series.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink/50">{t("empty")}</p>
          <Button href="/academia/series/nueva" size="sm">
            + {t("new")}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
          {series.map((s) => (
            <li key={s.id}>
              {/* Card navegable - sin acciones visibles: editar,
                  desactivar, horarios y eliminar viven en el detalle. */}
              <Link
                href={`/academia/series/${s.id}`}
                className="block rounded-2xl transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-neon/40">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-semibold">{s.name}</p>
                    {!s.active && (
                      <Badge variant="live">{t("inactive")}</Badge>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-sm text-ink/60">{s.description}</p>
                  )}
                  {(s.style ||
                    s.level ||
                    s.types.length > 0 ||
                    s.quorum != null ||
                    s.dropInPrice != null) && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.style && (
                        <Badge variant="neon">{s.style.name}</Badge>
                      )}
                      {s.level && (
                        <Badge variant="muted">{s.level.name}</Badge>
                      )}
                      {s.quorum != null && (
                        <Badge variant="outline">
                          {t("quorumValue", { value: s.quorum })}
                        </Badge>
                      )}
                      {s.types.map((x) => (
                        <Badge key={x.type.id} variant="outline">
                          {x.type.name}
                        </Badge>
                      ))}
                      {s.dropInPrice != null && (
                        <Badge variant="outline">
                          {t("dropInValue", {
                            value: clpFmt.format(s.dropInPrice),
                          })}
                        </Badge>
                      )}
                    </div>
                  )}
                  {s.slots.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {s.slots.map((slot) => (
                        <li
                          key={slot.id}
                          className="flex items-center gap-2 text-sm text-ink/70"
                        >
                          {/* Cupos/modalidad viven en la serie (badges
                              arriba) - el slot solo muestra día y hora. */}
                          <span className="tabular-nums">
                            {ta(`weekday.${slot.weekday}`).slice(0, 3)}{" "}
                            {slot.startTime}–{slot.endTime}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {series.length > 0 && (
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
        />
      )}
    </div>
  );
}
