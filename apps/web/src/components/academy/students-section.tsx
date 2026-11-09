"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale, useTranslations } from "next-intl";
import type { QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { academyTierHas } from "@/lib/academy-features";
import { Badge, type BadgeVariant, Button, Card, ChevronRightIcon, ClockIcon, Pager, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { useConsolePageSize } from "@/lib/console-page-size";
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
  /** Cap `students` sin ser owner/ADMIN (staff): puede invitar aunque
     el alta de enrollments siga restringida (spec
     academies/student-invites). */
  canInvite?: boolean;
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

// Regla transversal de paginación de consola (spec
// academies/console-lists): 20 por página en desktop (≥lg) y 10 en
// mobile, resuelta por el hook compartido useConsolePageSize.

const STATUS_VARIANT: Record<EnrollmentStatus, BadgeVariant> = {
  ACTIVE: "neon",
  INACTIVE: "muted",
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
  canInvite = false,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tq = useTranslations("query");
  const tcrm = useTranslations("crm");

  // pageSize responsivo 20/10 (hook compartido). Al cruzar el
  // breakpoint la página vuelve a 1: una página alta del modo anterior
  // podría quedar fuera de rango en el nuevo.
  const pageSize = useConsolePageSize();

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
        `/academies/${academyId}/students${qs}${qs ? "&" : "?"}page=${page}&pageSize=${pageSize}`,
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
  }, [academyId, filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cambio de breakpoint → repaginar desde el inicio.
  useEffect(() => {
    setPage(1);
  }, [pageSize]);

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
      {(!readOnly || canInvite) && (
        <div data-tour="academy-alumnos-new" className="flex justify-end gap-2">
          {canInvite && (
            <Button href="/academia/alumnos/invitar" size="sm" variant="secondary">
              {t("invites.cta")}
            </Button>
          )}
          {!readOnly && (
            <Button href="/academia/alumnos/nuevo" size="sm">
              + {t("newEnrollment")}
            </Button>
          )}
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
        // Con filtros activos el vacío es del filtro (el FilterBar se
        // conserva para limpiar); sin filtros es la cartera vacía.
        <p role="status" className="text-sm text-ink/50">
          {filterQuery(filters) !== "" ? tq("empty") : t("studentsEmpty")}
        </p>
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
                <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-neon/60">
                  {/* Nombre: primera sección de la card y a fila
                      completa; nunca compite por ancho con badges ni
                      score, así que el truncate siempre deja leerlo. */}
                  <span className="flex items-center justify-between gap-2 font-medium">
                    <span className="min-w-0 truncate">
                      {s.person.name ?? s.person.email ?? s.person.id}
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
                        title={s.plan.name}
                      >
                        {s.plan.name}
                      </Badge>
                    ) : (
                      <span className="truncate">-</span>
                    )}
                    {/* Vigencia en palabras, no solo en color: la frase
                        con ícono dice qué fecha es y si ya venció
                        (spec academies/console-lists). */}
                    {s.endsAt ? (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          s.endsAt.slice(0, 10) < todayStr
                            ? "text-red-400"
                            : ""
                        }`}
                      >
                        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                        {s.endsAt.slice(0, 10) < todayStr
                          ? t("studentCard.expiredOn", {
                              date: planDateFmt(locale).format(
                                new Date(s.endsAt),
                              ),
                            })
                          : t("studentCard.paidUntil", {
                              date: planDateFmt(locale).format(
                                new Date(s.endsAt),
                              ),
                            })}
                      </span>
                    ) : s.plan ? (
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                        {t("studentCard.noExpiry")}
                      </span>
                    ) : null}
                    {s.startsAt && (
                      <span>
                        {t("studentCard.since", {
                          date: planDateFmt(locale).format(
                            new Date(s.startsAt),
                          ),
                        })}
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
          pageSize={pageSize}
          total={total}
          onPage={setPage}
        />
      )}
    </div>
  );
}
