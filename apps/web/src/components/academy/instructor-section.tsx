"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Button, Card, ChevronRightIcon, Pager, RefreshIcon, SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { filterQuery } from "./shared";
import { Link } from "@/i18n/navigation";
import { getNumFmt } from "@/lib/intl";

const clp = (locale: string) => getNumFmt(locale, {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

// Los profesores no son entidad del catálogo ACADEMY_OWNER: EntityDef
// local con la clave del contrato (mismo criterio que staff-section) -
// q sobre nombre/email del instructor.
const INSTRUCTOR_ENTITY: EntityDef = {
  entity: "academy_instructor",
  filters: [{ key: "q", type: "text" }],
  columns: [],
};

type InstructorRow = {
  person: { id: string; name: string | null; email: string | null };
  payType: "PER_CLASS" | "MONTHLY" | "COMMISSION" | null;
  payAmount: number | null;
  payClasses: number | null;
  commissionPct: number | null;
  createdAt: string;
};

/**
 * Listado de profesores (spec academy-console-v3) - cards navegables
 * al detalle del profesor (/academia/equipo/profesor/[id]), donde viven
 * el acuerdo económico, las métricas y la baja. Gated por capacidad
 * `team` en el backend.
 */
const PAGE_SIZE = 20;

export function InstructorSection({ academyId }: { academyId: string }) {
  const locale = useLocale();
  const t = useTranslations("academyStaff");
  const tq = useTranslations("query");
  const tc = useTranslations("common");

  const [rows, setRows] = useState<InstructorRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<QueryFilters>({});
  const [failed, setFailed] = useState(false);
  // 401/403/404 = staff sin la capacidad `team` (o academia ajena):
  // estado "sin acceso" explícito, nunca el empty "Sin profesores".
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const qs = filterQuery(filters);
    const res = await apiFetch(
      `/academies/${academyId}/instructors${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
    ).catch(() => null);
    if (!res || (!res.ok && ![401, 403, 404].includes(res.status))) {
      setFailed(true);
      setRows([]);
      return;
    }
    if (!res.ok) {
      setDenied(true);
      setRows([]);
      setTotal(0);
      return;
    }
    const data = (await res.json()) as { items: InstructorRow[]; total: number };
    setDenied(false);
    setRows(data.items);
    setTotal(data.total);
  }, [academyId, filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) return <SkeletonList />;

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("instructorsTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("instructorsDesc")}</p>
      </div>
      {denied ? (
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
      ) : (
        <>
          <FilterBar
            entity={INSTRUCTOR_ENTITY}
            filters={filters}
            onChange={(f) => {
              setFilters(f);
              setPage(1);
            }}
            options={{}}
          />
          {failed ? (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-ink/60">
                {tc("error")}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                <RefreshIcon /> {tc("retry")}
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink/60">
                {hasFilters ? tq("empty") : t("instructorsEmpty")}
              </p>
              {!hasFilters && (
                <div>
                  <Button href="/academia/equipo/nuevo" size="sm">
                    + {t("kindInstructor")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map((r) => (
                <li key={r.person.id}>
                  <Link
                    href={`/academia/equipo/profesor/${r.person.id}`}
                    className="block rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
                  >
                    <Card className="flex h-full flex-col gap-1 p-4 transition-colors hover:border-neon/60">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                        <span className="min-w-0 truncate">
                          {r.person.name ?? r.person.email}
                        </span>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                      </span>
                      {r.person.email && (
                        <span className="truncate text-xs text-ink/50">
                          {r.person.email}
                        </span>
                      )}
                      <span className="text-xs text-ink/40">
                        {r.payType === "MONTHLY" && r.payAmount != null
                          ? t("payClassesOf", {
                              amount: clp(locale).format(r.payAmount),
                              classes: r.payClasses ?? 0,
                            })
                          : r.payType === "PER_CLASS" && r.payAmount != null
                            ? t("payPerClassOf", {
                                amount: clp(locale).format(r.payAmount),
                              })
                            : r.payType === "COMMISSION" && r.commissionPct != null
                              ? t("payCommissionOf", { pct: r.commissionPct })
                              : t("agreementNone")}
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={setPage}
            />
          )}
        </>
      )}
    </Card>
  );
}
