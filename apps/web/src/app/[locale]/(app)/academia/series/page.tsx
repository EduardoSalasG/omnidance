"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ChevronRightIcon, Pager, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { academyHasFeature } from "@/lib/academy-features";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar } from "@/components/query/FilterBar";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";
import { SeriesInsights } from "@/components/academy/series-insights";
import {
  filterQuery,
  type FilterOption,
  type NamedRef,
  type Series,
} from "@/components/academy/shared";
import { Link } from "@/i18n/navigation";
import { useDateFmt, useNumFmt } from "@/lib/intl";

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
  const ts = useTranslations("academySeries");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <AcademyGate>
        {({ academy }) => (
          <>
            {/* El CTA de crear respeta el tier (spec
                academy-console-cta-gating): fuera del paywall no se
                ofrece acción que el propio tier bloquea. */}
            <ConsoleHeader
              backHref="/academia"
              backLabel={t("title")}
              actions={
                academyHasFeature(academy, "classes") ? (
                  <span data-tour="academy-series-new" className="inline-block">
                    <Button href="/academia/series/nueva" size="sm">
                      + {ts("new")}
                    </Button>
                  </span>
                ) : undefined
              }
            />
            <AcademyTierGate academy={academy} feature="classes"><SeriesModule key={academy.id} academyId={academy.id} tier={academy.tier} /></AcademyTierGate>
          </>
        )}
      </AcademyGate>
    </main>
  );
}

function SeriesModule({
  academyId,
  tier,
}: {
  academyId: string;
  tier?: string | null;
}) {
  const t = useTranslations("academySeries");
  const ta = useTranslations("academy");
  const tc = useTranslations("common");
  const tq = useTranslations("query");
  const tts = useTranslations("tours.academia-series");

  const [series, setSeries] = useState<Series[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // null = ok; status HTTP del fallo (0 = excepción de red) - 401/403
  // elevan a forbidden, el resto a error con retry.
  const [loadError, setLoadError] = useState<number | null>(null);
  // Default del listado: solo clases activas (spec academies/class-series).
  const [filters, setFilters] = useState<QueryFilters>({ status: "active" });

  // Opciones de los filtros fk - catálogos públicos.
  const [styleOptions, setStyleOptions] = useState<FilterOption[]>([]);
  const [levelOptions, setLevelOptions] = useState<FilterOption[]>([]);
  const [typeOptions, setTypeOptions] = useState<FilterOption[]>([]);

  const clpFmt = useNumFmt({
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      });
  // Fecha puntual del slot de taller (oneOffDate, medianoche UTC):
  // "15 nov" en vez del weekday recurrente.
  const slotDateFmt = useDateFmt({
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });

  // Secuencia de requests: solo el más reciente aplica su resultado.
  // Sin la guardia, un request viejo que falla tarde pisaba el éxito
  // de uno más nuevo y dejaba el banner "Algo salió mal" sobre una
  // lista ya cargada (bug intermitente 2026-11, visible con el doble
  // efecto de StrictMode y con cambios rápidos de filtros).
  const reqSeq = useRef(0);
  const reload = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoadError(null);
    try {
      const qs = filterQuery(filters);
      const res = await apiFetch(
        `/academies/${academyId}/series${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
      );
      if (seq !== reqSeq.current) return; // respuesta vieja: descartar
      if (!res.ok) {
        setLoadError(res.status);
        return;
      }
      const data = (await res.json()) as { items: Series[]; total: number };
      if (seq !== reqSeq.current) return;
      setSeries(data.items);
      setTotal(data.total);
    } catch {
      if (seq === reqSeq.current) setLoadError(0);
    }
  }, [academyId, filters, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Catálogos de filtros: levels/types del catálogo público
  // (GET /classes/catalogs). Los estilos NO son el catálogo global:
  // el select solo ofrece los presentes en las series de ESTA
  // academia (GET :id/series/styles) - filtrar por un estilo sin
  // series daría vacíos garantizados (review 2026-11-05).
  useEffect(() => {
    apiFetch(`/academies/${academyId}/series/styles`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as NamedRef[]) : [],
      )
      .then((styles) =>
        setStyleOptions(
          styles.map((s) => ({ value: s.id, label: s.name })),
        ),
      )
      .catch(() => setStyleOptions([]));
    apiFetch(`/classes/catalogs?academyId=${academyId}`)
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
  }, [academyId]);

  if (loadError !== null) {
    // 401/403 no son transitorios: CTA de salida, no retry (mismo
    // patrón que la ficha del horario).
    if (loadError === 401 || loadError === 403) {
      return (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-ink/60">{ta("forbidden")}</p>
          <Button variant="secondary" size="sm" href="/academia">
            {tc("back")}
          </Button>
        </div>
      );
    }
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
      {/* Insights del módulo: KPIs primero, listas después (mismo
          orden que el inicio). */}
      <SeriesInsights academyId={academyId} tier={tier} />

      <div data-tour="academy-series-filters">
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
      </div>

      {series.length === 0 ? (
        // Filtros en el default ({status:"active"}) = academia sin
        // series: empty de primera vez. Con filtros activos es "sin
        // resultados para esta consulta".
        Object.keys(filters).length === 1 && filters.status === "active" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/50">{t("empty")}</p>
          </div>
        ) : (
          <p className="text-sm text-ink/50">{tq("empty")}</p>
        )
      ) : (
        <ul
          data-tour="academy-series-list"
          className="flex flex-col gap-3 lg:grid lg:grid-cols-2"
        >
          {series.map((s) => (
            <li key={s.id}>
              {/* Card navegable - sin acciones visibles: editar,
                  desactivar, horarios y eliminar viven en el detalle.
                  Anatomía (ui-cards A): tag-row de clasificación,
                  headline identidad+estado, descripción clamp-2,
                  divider + evidencia de horarios al flujo natural. */}
              <Link
                href={`/academia/series/${s.id}`}
                className="block h-full rounded-2xl transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-neon/60">
                  {(s.style || s.level || s.types.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.style && (
                        <Badge variant="neon">{s.style.name}</Badge>
                      )}
                      {s.level && (
                        <Badge variant="muted">{s.level.name}</Badge>
                      )}
                      {s.types.map((x) => (
                        <Badge key={x.type.id} variant="outline">
                          {x.type.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">
                      {s.name}
                    </p>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {!s.active && (
                        <Badge variant="live">{t("inactive")}</Badge>
                      )}
                      <ChevronRightIcon className="h-4 w-4 text-ink/40" />
                    </span>
                  </div>
                  {s.description && (
                    <p className="line-clamp-2 text-sm text-ink/60">
                      {s.description}
                    </p>
                  )}
                  {(s.slots.length > 0 ||
                    s.quorum != null ||
                    s.dropInPrice != null) && (
                    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                      {s.slots.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {s.slots.map((slot) => (
                            <li
                              key={slot.id}
                              className="flex items-center gap-2 text-sm text-ink/70"
                            >
                              {/* Slot de taller: fecha puntual + hora +
                                  chip, no el weekday recurrente
                                  (workshop-one-off-class). */}
                              <span className="tabular-nums">
                                {slot.oneOffDate
                                  ? `${slotDateFmt.format(new Date(slot.oneOffDate))} ${slot.startTime}`
                                  : `${ta(`weekday.${slot.weekday}`).slice(0, 3)} ${slot.startTime}–${slot.endTime}`}
                              </span>
                              {slot.oneOffDate && (
                                <Badge variant="neon">
                                  {t("workshopBadge")}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(s.quorum != null || s.dropInPrice != null) && (
                        <p className="text-xs text-ink/50">
                          {[
                            s.quorum != null
                              ? t("quorumValue", { value: s.quorum })
                              : null,
                            s.dropInPrice != null
                              ? t("dropInValue", {
                                  value: clpFmt.format(s.dropInPrice),
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
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

      {/* Tour de primera visita del listado (spec class-series): la
          lista se omite sola si está vacía. */}
      <OnboardingRunner
        tour="academia-series"
        steps={
          [
            {
              element: "[data-tour='academy-series-filters']",
              title: tts("s1.title"),
              description: tts("s1.desc"),
              side: "bottom",
            },
            {
              element: "[data-tour='academy-series-list']",
              title: tts("s2.title"),
              description: tts("s2.desc"),
              side: "top",
            },
            {
              element: "[data-tour='academy-series-new']",
              title: tts("s3.title"),
              description: tts("s3.desc"),
              side: "bottom",
            },
          ] satisfies TourStep[]
        }
      />
    </div>
  );
}
