"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale, useTranslations } from "next-intl";
import type { QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { academyTierHas } from "@/lib/academy-features";
import { Badge, Button, Card, EventDate, Pager, type BadgeVariant, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import {
  academyEntity,
  dedupeOptions,
  filterQuery,
  mergeOptions,
  planDateFmt,
  type EnrollmentStatus,
  type FilterOption,
  type MembershipPlan,
  type Student,
} from "./shared";
import { Link } from "@/i18n/navigation";

type Props = {
  academyId: string;
  /** Tier de la academia (viene en /academies/mine) - gatea los campos
      de CRM del card según la matriz de entitlements. */
  tier?: string | null;
  /** Instructor: ve la lista y fichas, pero no crea enrollments ni cambia status. */
  readOnly?: boolean;
};

// Entidad `students` del catálogo sin el scope (la página ya fija la
// academia) - q, status, planId con semántica idéntica al query engine
// (spec analytics/query-console). Los filtros de fecha (from/to) salen:
// la cartera de alumnos es vigente, no un reporte temporal - no aportan
// a ninguna lente en esta vista (spec academies/console-lists).
const STUDENTS_ENTITY_BASE = academyEntity("students");
const STUDENTS_ENTITY = {
  ...STUDENTS_ENTITY_BASE,
  filters: STUDENTS_ENTITY_BASE.filters.filter(
    (f) => f.key !== "from" && f.key !== "to",
  ),
};

const PAGE_SIZE = 24;

const STATUS_VARIANT: Record<EnrollmentStatus, BadgeVariant> = {
  ACTIVE: "neon",
  ONLINE: "neon",
  TRIAL: "outline",
  PAUSED: "muted",
  FROZEN: "muted",
};

// Mismo mapeo que people-table del CRM (segmentos compartidos).
const SEGMENT_VARIANT: Record<string, BadgeVariant> = {
  NEW: "neon",
  AT_RISK: "live",
  BRINGS_PEOPLE: "outline",
  CORE: "muted",
};

/**
 * Alumnos (enrollments) - solo listado navegable: el card completo abre
 * la ficha /academia/alumnos/[personId] (la edición de estado y "pagado
 * hasta" vive ahí). El alta vive en /academia/alumnos/nuevo detrás del
 * CTA (solo si !readOnly).
 */
export function StudentsSection({
  academyId,
  tier,
  readOnly = false,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("practices");
  const tcrm = useTranslations("crm");

  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});
  // Opciones del filtro planId: GET plans (cap "plans") + cosecha del
  // listado como fallback cuando el rol no alcanza ese endpoint.
  const [planOptions, setPlanOptions] = useState<FilterOption[]>([]);

  // Gating fino por tier (spec academy-tier-v2): score y clasificación
  // CRM del card son feature PRO (`crm`) - COBROS/STUDIO no los ven.
  const canCrm = academyTierHas(tier, "crm");

  // Corte "al día/moroso" del chip de plan: endsAt ("pagado hasta") por
  // debajo de hoy = vigencia vencida. Se compara por día (YYYY-MM-DD).
  const todayStr = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = filterQuery(filters);
      const res = await apiFetch(
        `/academies/${academyId}/students${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as {
        items: Student[];
        total: number;
      };
      setStudents(data.items);
      setTotal(data.total);
      setPlanOptions((prev) =>
        mergeOptions(
          prev,
          data.items.flatMap((s) =>
            s.plan ? [{ value: s.plan.id, label: s.plan.name }] : [],
          ),
        ),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [academyId, filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/academies/${academyId}/plans?pageSize=100`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as { items: MembershipPlan[] }).items : [],
      )
      .then((plans) => {
        if (cancelled) return;
        setPlanOptions((prev) =>
          mergeOptions(
            plans.map((p) => ({ value: p.id, label: p.name })),
            prev,
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <div data-tour="academy-alumnos-new">
          <Button href="/academia/alumnos/nuevo" size="sm">
            + {t("newEnrollment")}
          </Button>
        </div>
      )}

      <div data-tour="academy-alumnos-filters">
        <FilterBar
          entity={STUDENTS_ENTITY}
          filters={filters}
          onChange={(f) => {
            setFilters(f);
            setPage(1);
          }}
          options={{ academyPlans: dedupeOptions(planOptions) }}
        />
      </div>

      {loading ? (
        <SkeletonList items={3} lines={1} />
      ) : error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tc("error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p role="status" className="text-sm text-ink/50">
            {t("studentsEmpty")}
          </p>
          {!readOnly && (
            <Button href="/academia/alumnos/nuevo" size="sm">
              + {t("newEnrollment")}
            </Button>
          )}
        </div>
      ) : (
        <ul
          data-tour="academy-alumnos-list"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {students.map((s) => (
            <li key={s.id}>
              {/* Card completo navegable - la edición vive en la ficha. */}
              <Link
                href={`/academia/alumnos/${s.person.id}`}
                aria-label={t("studentProfile.viewProfile", {
                  name: s.person.name ?? s.person.email ?? s.person.id,
                })}
                className="block rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
              >
                <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-neon/40">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.person.name ?? s.person.email ?? s.person.id}
                    </span>
                    <Badge variant={STATUS_VARIANT[s.status]}>
                      {t(`status.${s.status}`)}
                    </Badge>
                    {/* Score + segmento CRM: solo con la feature `crm`
                        (PRO) - spec academy-tier-v2. */}
                    {canCrm && (
                      <>
                        {/* Score de relación (spec academy-score-refine):
                            privado de la academia; "—" si aún no se computó. */}
                        <span
                          className="text-xs tabular-nums text-ink/60"
                          title={t("studentProfile.score")}
                        >
                          {s.score !== null ? Math.round(s.score) : "—"}
                        </span>
                        {s.segment && (
                          <Badge variant={SEGMENT_VARIANT[s.segment] ?? "muted"}>
                            {tcrm(`segments.${s.segment}`)}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink/50">
                    {/* Chip del plan actual (spec academy-tier-v2): el
                        plan no tiene color propio en el modelo, así que
                        el color comunica el estado de pago - al día
                        (neon), moroso/vencido (live), sin vigencia
                        registrada (outline). */}
                    {s.plan ? (
                      <Badge
                        variant={
                          s.endsAt && s.endsAt.slice(0, 10) < todayStr
                            ? "live"
                            : s.endsAt
                              ? "neon"
                              : "outline"
                        }
                        title={
                          s.endsAt
                            ? `${tp("endsAt")}: ${planDateFmt(locale).format(new Date(s.endsAt))}`
                            : s.plan.name
                        }
                      >
                        {s.plan.name}
                      </Badge>
                    ) : (
                      <span className="truncate">-</span>
                    )}
                    {s.startsAt && <EventDate start={s.startsAt} />}
                    {s.endsAt && (
                      <span>
                        {tp("endsAt")}:{" "}
                        {planDateFmt(locale).format(new Date(s.endsAt))}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && students.length > 0 && (
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
