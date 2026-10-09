"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Badge, Card, SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { filterQuery } from "./shared";
import type { AcademyCap } from "./use-academy-access";

// El equipo no es entidad del catálogo ACADEMY_OWNER: EntityDef local
// con la clave del contrato (spec analytics/query-console) - q sobre
// nombre/email del colaborador.
const STAFF_ENTITY: EntityDef = {
  entity: "academy_staff",
  filters: [{ key: "q", type: "text" }],
  columns: [],
};

export type Caps = Record<AcademyCap, boolean>;

export type StaffRow = {
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

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

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
export function StaffSection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyStaff");

  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [filters, setFilters] = useState<QueryFilters>({});

  const load = useCallback(async () => {
    const res = await apiFetch(
      `/academies/${academyId}/staff${filterQuery(filters)}`,
    ).catch(() => null);
    setRows(res?.ok ? await res.json() : []);
  }, [academyId, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows === null) return <SkeletonList />;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("listTitle")}
        </h2>
        <p className="mt-1 text-xs text-ink/50">{t("desc")}</p>
      </div>
      <FilterBar
        entity={STAFF_ENTITY}
        filters={filters}
        onChange={setFilters}
        options={{}}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const active = CAPS.filter((c) => r.caps[c]);
            return (
              <li key={r.person.id}>
                <Link
                  href={`/academia/equipo/${r.person.id}`}
                  className="block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
                >
                  <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/40">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">
                        {r.person.name ?? r.person.email}
                      </span>
                      <span className="ml-auto text-xs text-ink/40">
                        {t("since", {
                          date: dayFmt.format(new Date(r.createdAt)),
                        })}
                      </span>
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
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
