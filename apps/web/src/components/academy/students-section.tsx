"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
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

type Props = {
  academyId: string;
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

/**
 * Alumnos (enrollments) - solo listado navegable: el card completo abre
 * la ficha /academia/alumnos/[personId] (la edición de estado y "pagado
 * hasta" vive ahí). El alta vive en /academia/alumnos/nuevo detrás del
 * CTA (solo si !readOnly).
 */
export function StudentsSection({
  academyId,
  readOnly = false,
}: Props) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const tp = useTranslations("practices");

  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});
  // Opciones del filtro planId: GET plans (cap "plans") + cosecha del
  // listado como fallback cuando el rol no alcanza ese endpoint.
  const [planOptions, setPlanOptions] = useState<FilterOption[]>([]);

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
        <Button
          href="/academia/alumnos/nuevo"
          size="sm"
          className="self-start"
        >
          + {t("newEnrollment")}
        </Button>
      )}

      <FilterBar
        entity={STUDENTS_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{ academyPlans: dedupeOptions(planOptions) }}
      />

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
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink/50">
                    <span className="truncate">{s.plan?.name ?? "-"}</span>
                    {s.startsAt && <EventDate start={s.startsAt} />}
                    {s.endsAt && (
                      <span>
                        {tp("endsAt")}:{" "}
                        {planDateFmt.format(new Date(s.endsAt))}
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
