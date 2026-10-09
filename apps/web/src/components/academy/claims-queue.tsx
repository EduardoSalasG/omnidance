"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { EntityDef, QueryFilters } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Card, Pager, SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { filterQuery } from "./shared";

// Los claims no son una entidad del catálogo ACADEMY_OWNER: EntityDef
// local con las mismas claves del contrato (spec analytics/query-console)
// - status por whitelist de ClaimStatus y from/to sobre createdAt.
const CLAIMS_ENTITY: EntityDef = {
  entity: "claims",
  filters: [
    {
      key: "status",
      type: "enum",
      options: ["PENDING", "AWAITING", "APPROVED", "REJECTED"],
    },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ],
  columns: [],
};

export type QueueClaim = {
  id: string;
  amount: number;
  methodType: string;
  methodLabel: string;
  status: "AWAITING" | "PENDING" | "APPROVED" | "REJECTED";
  receiptKey: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  person: { id: string; name: string };
  plan: { id: string; name: string; type: string } | null;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
export const claimDateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const PAGE_SIZE = 20;

/**
 * Cola "Pagos por validar" del owner (spec academy-payment-claims).
 * Cada card abre la página de detalle del comprobante, donde viven
 * aprobar/rechazar - la cola ya no muta inline.
 *
 * Paginación: sin filtro de status la cola es accionable completa
 * (PENDING + AWAITING enteras, pageSize=100 cada una - cola de trabajo
 * acotada); con un status elegido se pagina ese listado.
 */
export function ClaimsQueue({ academyId }: { academyId: string }) {
  const t = useTranslations("academyPay");

  const [claims, setClaims] = useState<QueueClaim[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<QueryFilters>({});

  const load = useCallback(async () => {
    const fetchStatus = async (status: string) => {
      const qs = filterQuery({ ...filters, status });
      const res = await apiFetch(
        `/academies/${academyId}/claims${qs}${qs ? "&" : "?"}page=1&pageSize=100`,
      ).catch(() => null);
      return res?.ok
        ? ((await res.json()) as { items: QueueClaim[]; total: number })
        : { items: [], total: 0 };
    };
    if (filters.status) {
      // Filtro de status explícito: un solo listado paginado real.
      const qs = filterQuery(filters);
      const res = await apiFetch(
        `/academies/${academyId}/claims${qs}&page=${page}&pageSize=${PAGE_SIZE}`,
      ).catch(() => null);
      const data = res?.ok
        ? ((await res.json()) as { items: QueueClaim[]; total: number })
        : { items: [], total: 0 };
      setClaims(data.items);
      setTotal(data.total);
      return;
    }
    const [pen, awa] = await Promise.all([
      fetchStatus("PENDING"),
      fetchStatus("AWAITING"),
    ]);
    setClaims([...pen.items, ...awa.items]);
    setTotal(pen.total + awa.total);
  }, [academyId, filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (claims === null) return <SkeletonList />;
  // Cola colapsa a nada cuando no hay claims NI filtros activos (default
  // histórico); con un filtro puesto la barra queda visible aunque el
  // resultado llegue vacío - si no, no habría cómo limpiarlo.
  if (claims.length === 0 && Object.keys(filters).length === 0) return null;

  const filtered = Boolean(filters.status);
  const pending = filtered ? claims : claims.filter((c) => c.status === "PENDING");
  // Intentos declarados en el checkout que aún no traen comprobante:
  // seguimiento, no accionables.
  const awaiting = filtered ? [] : claims.filter((c) => c.status === "AWAITING");

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        entity={CLAIMS_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{}}
      />
      {filtered && claims.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {claims.map((c) => (
            <li key={c.id}>
              <Link
                href={`/academia/cobros/claim/${c.id}`}
                className="block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
              >
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/40">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{c.person.name}</span>
                    <span className="text-ink/60">
                      {c.plan?.name ?? c.methodLabel} · {clp.format(c.amount)}
                    </span>
                    <span className="ml-auto text-xs text-ink/40">
                      {claimDateFmt.format(new Date(c.createdAt))}
                    </span>
                  </div>
                  {c.note && (
                    <p className="text-xs italic text-ink/50">“{c.note}”</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && !filtered && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("queueTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{t("queueDesc")}</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pending.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/academia/cobros/claim/${c.id}`}
                  className="block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]"
                >
                  <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/40">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{c.person.name}</span>
                      <span className="text-ink/60">
                        {c.plan?.name ?? c.methodLabel} · {clp.format(c.amount)}
                      </span>
                      <span className="ml-auto text-xs text-ink/40">
                        {claimDateFmt.format(new Date(c.createdAt))}
                      </span>
                    </div>
                    {c.note && (
                      <p className="text-xs italic text-ink/50">“{c.note}”</p>
                    )}
                    <p className="text-xs text-ink/40">
                      {c.methodLabel}
                      {c.receiptKey ? ` · ${t("viewReceipt")}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {awaiting.length > 0 && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("awaitingTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{t("awaitingDesc")}</p>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {awaiting.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
              >
                <span className="font-semibold">{c.person.name}</span>
                <span className="text-ink/60">
                  {c.plan?.name ?? c.methodLabel} · {clp.format(c.amount)}
                </span>
                <span className="ml-auto text-xs text-ink/40">
                  {claimDateFmt.format(new Date(c.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {filtered && (
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
