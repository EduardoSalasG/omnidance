"use client";


import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ChevronRightIcon, Pager, RefreshIcon, SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { filterQuery } from "./shared";
import type { AcademyCap } from "./use-academy-access";
import { Link } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";

// El equipo no es entidad del catálogo ACADEMY_OWNER: EntityDef local
// con la clave del contrato (spec analytics/query-console) - q sobre
// nombre/email del colaborador.
const STAFF_ENTITY: EntityDef = {
  entity: "academy_staff",
  filters: [{ key: "q", type: "text" }],
  columns: [],
};

export type Caps = Record<AcademyCap, boolean>;

type StaffRow = {
  person: { id: string; name: string | null; email: string | null };
  caps: Caps;
  createdAt: string;
};

export const CAPS: AcademyCap[] = [
  "students",
  "payments",
  "plans",
  "schedule",
  "profile",
  "team",
  "billing",
];

export const EMPTY_CAPS: Caps = {
  students: false,
  payments: false,
  plans: false,
  schedule: false,
  profile: false,
  team: false,
  billing: false,
};

export function CapCheckbox({
  cap,
  checked,
  disabled,
  onToggle,
}: {
  cap: AcademyCap;
  checked: boolean;
  disabled?: boolean;
  onToggle: (cap: AcademyCap, next: boolean) => void;
}) {
  const t = useTranslations("academyStaff");
  return (
    <label
      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
      title={t(`cap.${cap}Desc`)}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(cap, e.target.checked)}
        className="size-4 accent-neon"
      />
      {t(`cap.${cap}`)}
    </label>
  );
}

/**
 * Listado de colaboradores (spec academy-console-v3) - cards navegables
 * al detalle del miembro (/academia/equipo/[id]), donde viven los
 * permisos, su edición y la baja. El alta es el CTA único del header.
 * Gated por capacidad `team` en el backend.
 */
const PAGE_SIZE = 20;

export function StaffSection({ academyId }: { academyId: string }) {
  const dayFmt = useDateFmt({
  day: "numeric",
  month: "short",
  year: "numeric",
});
  const t = useTranslations("academyStaff");
  const tq = useTranslations("query");
  const tc = useTranslations("common");

  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<QueryFilters>({});
  const [failed, setFailed] = useState(false);
  // 401/403/404 = staff sin la capacidad `team` (o academia ajena):
  // estado "sin acceso" explícito, nunca el empty "Sin colaboradores".
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const qs = filterQuery(filters);
    const res = await apiFetch(
      `/academies/${academyId}/staff${qs}${qs ? "&" : "?"}page=${page}&pageSize=${PAGE_SIZE}`,
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
    const data = (await res.json()) as { items: StaffRow[]; total: number };
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
          {t("listTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("desc")}</p>
      </div>
      {denied ? (
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
      ) : (
        <>
          <FilterBar
            entity={STAFF_ENTITY}
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
                {hasFilters ? tq("empty") : t("empty")}
              </p>
              {!hasFilters && (
                <div>
                  <Button href="/academia/equipo/nuevo" size="sm">
                    + {t("addTitle")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map((r) => {
                const active = CAPS.filter((c) => r.caps[c]);
                return (
                  <li key={r.person.id}>
                    <Link
                      href={`/academia/equipo/${r.person.id}`}
                      className="block rounded-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
                    >
                      <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:border-neon/60">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {r.person.name ?? r.person.email}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-ink/40">
                            {t("since", {
                              date: dayFmt.format(new Date(r.createdAt)),
                            })}
                          </span>
                          <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40" />
                        </div>
                        {r.person.email && (
                          <span className="truncate text-xs text-ink/50">
                            {r.person.email}
                          </span>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {active.length === 0 ? (
                            <span className="text-xs text-ink/40">
                              {t("capsNone")}
                            </span>
                          ) : (
                            active.map((cap) => (
                              <Badge key={cap} variant="muted">
                                {t(`cap.${cap}`)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
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
