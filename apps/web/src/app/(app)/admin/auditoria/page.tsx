"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import type { AuditRow } from "@/components/admin/types";
import { ConsoleHeader } from "@/components/console/console-header";
import { FilterBar } from "@/components/query/FilterBar";
import type { EntityDef, QueryFilters } from "@omnidance/shared";

const fmtTime = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
});

// La bitácora no es entidad del catálogo (es ledger de admin, no query
// de negocio), pero usa la misma barra compartida y los mismos params
// q/type/actor/from/to que acepta GET /admin/audit.
const AUDIT_DEF: EntityDef = {
  entity: "audit",
  filters: [
    { key: "q", type: "text" },
    { key: "type", type: "text" },
    { key: "actor", type: "text" },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ],
  columns: [],
};

export default function AuditoriaPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <AuditPanel />
      </AdminGate>
    </main>
  );
}

function AuditPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  // null = fetch en vuelo → skeleton; [] post-fetch = empty-state real.
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [actionError, setActionError] = useState(false);
  const [filters, setFilters] = useState<QueryFilters>({});

  // Auto-aplicada: cambiar un filtro recrea el loader → refetch.
  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    const res = await apiFetch(`/admin/audit?${params.toString()}`);
    if (!res.ok) throw new Error("fetch failed");
    setAudit((await res.json()) as AuditRow[]);
  }, [filters]);

  useEffect(() => {
    void load().catch(() => setActionError(true));
  }, [load]);

  return (
    <>
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <FilterBar
          entity={AUDIT_DEF}
          filters={filters}
          onChange={setFilters}
          options={{}}
        />
        {audit === null ? (
          <SkeletonList items={4} lines={1} />
        ) : audit.length === 0 ? (
          <p role="status" className="text-ink/60">
            {t("audit.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {audit.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-ink/10 bg-ink/5 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{a.action}</Badge>
                  <span className="text-ink/50">
                    {a.targetType}
                    {a.targetId ? `:${a.targetId.slice(0, 8)}` : ""}
                  </span>
                  <span className="ml-auto text-ink/50">
                    {fmtTime.format(new Date(a.createdAt))}
                  </span>
                </div>
                {a.payload != null && (
                  <pre className="mt-1 overflow-x-auto text-ink/50">
                    {JSON.stringify(a.payload)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
