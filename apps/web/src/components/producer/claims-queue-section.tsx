"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card, Pager, SkeletonList } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { CLAIM_STATUSES, filtersParams } from "./shared";
import type { EntityDef, QueryFilters } from "@omnidance/shared";

export type ProducerQueueClaim = {
  id: string;
  methodType: string;
  methodLabel: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  person: { id: string; name: string };
  payment: { id: string; amount: number; orderType: string; refId: string };
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Filtros de /productor/comprobantes - contrato compartido (spec
 * analytics/query-console): status del claim (whitelist PENDING|
 * APPROVED|REJECTED en UI; la API además acepta AWAITING) y from/to
 * sobre createdAt. GET /producer/claims los acepta.
 */
const CLAIMS_ENTITY: EntityDef = {
  entity: "claims",
  filters: [
    { key: "status", type: "enum", options: CLAIM_STATUSES },
    { key: "from", type: "date" },
    { key: "to", type: "date" },
  ],
  columns: [],
};

const PAGE_SIZE = 20;

export const orderLabel = (
  orderType: string,
  tp: (key: string) => string,
) =>
  orderType === "SERIES_PASS" ? tp("orderSeriesPass") : tp("orderTicket");

const claimCardCls =
  "block rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.99]";
const claimCardInnerCls =
  "flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4 transition-colors hover:border-neon/40";

/**
 * Cola de comprobantes del productor (spec producer-own-methods) - misma
 * forma que "Pagos por validar" del owner: la cola PENDING completa
 * primero (vista masiva accionable), luego historial resuelto y los
 * filtros. Cada card abre la ficha /productor/comprobantes/claim/[id]
 * donde viven el comprobante y aprobar/rechazar - la cola no muta
 * inline.
 */
export function ProducerClaimsQueue() {
  const t = useTranslations("academyPay");
  const tp = useTranslations("producer.ownMethods");
  const tq = useTranslations("query");

  const [claims, setClaims] = useState<ProducerQueueClaim[] | null>(null);
  const [filters, setFilters] = useState<QueryFilters>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (f: QueryFilters, p: number) => {
    // Con filtro de estado explícito la vista es un listado paginado.
    // Sin filtro la cola operativa trae PENDING (acotado) + historial
    // resuelto (acotado) en requests separadas - la API solo acepta un
    // status por request.
    if (typeof f.status === "string") {
      const params = filtersParams(f);
      const sep = params ? "&" : "?";
      const res = await apiFetch(
        `/producer/claims${params}${sep}page=${p}&pageSize=${PAGE_SIZE}`,
      ).catch(() => null);
      const data = res?.ok
        ? ((await res.json()) as {
            claims: ProducerQueueClaim[];
            total: number;
          })
        : { claims: [], total: 0 };
      setClaims(data.claims);
      setTotal(data.total);
      return;
    }
    const get = (status: string, size: number) =>
      apiFetch(`/producer/claims?status=${status}&pageSize=${size}`)
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ claims: ProducerQueueClaim[] }>)
            : { claims: [] },
        )
        .catch(() => ({ claims: [] }));
    const [pending, approved, rejected] = await Promise.all([
      get("PENDING", 100),
      get("APPROVED", 50),
      get("REJECTED", 50),
    ]);
    setClaims([...pending.claims, ...approved.claims, ...rejected.claims]);
    setTotal(0);
  }, []);

  useEffect(() => {
    void load(filters, page);
  }, [load, filters, page]);

  if (claims === null) return <SkeletonList items={2} />;

  const filtered = typeof filters.status === "string";
  const pending = filtered
    ? claims
    : claims.filter((c) => c.status === "PENDING");
  const resolved = filtered
    ? []
    : claims
        .filter((c) => c.status !== "PENDING" && c.reviewedAt)
        .sort(
          (a, b) =>
            new Date(b.reviewedAt!).getTime() -
            new Date(a.reviewedAt!).getTime(),
        )
        .slice(0, 20);

  const claimLine = (c: ProducerQueueClaim) => (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{c.person.name}</span>
        <span className="text-ink/60">
          {orderLabel(c.payment.orderType, tp)} · {c.methodLabel} ·{" "}
          {clp.format(c.payment.amount)}
        </span>
        <span className="ml-auto text-xs text-ink/40">
          {dayFmt.format(new Date(c.createdAt))}
        </span>
      </div>
      {c.note && <p className="text-xs italic text-ink/50">“{c.note}”</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Cola accionable primero (mismo orden que cobros del owner):
          todos los pendientes, masivos. */}
      {pending.length > 0 && !filtered && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {tp("queueTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{tp("queueDesc")}</p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pending.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/productor/comprobantes/claim/${c.id}`}
                  className={claimCardCls}
                >
                  <div className={claimCardInnerCls}>{claimLine(c)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* La cola vacía también se comunica: sin pendientes ni filtros la
          página sigue diciendo algo, no queda en blanco. */}
      {claims.length === 0 && !filtered && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <p role="status" className="text-ink/70">
            {tp("queueEmpty")}
          </p>
          <p className="text-xs text-ink/50">{tp("queueEmptyDesc")}</p>
        </Card>
      )}

      {resolved.length > 0 && !filtered && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("historyTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{t("historyDesc")}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {resolved.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/productor/comprobantes/claim/${c.id}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 text-sm transition-colors hover:bg-neon/5"
                >
                  <span className="font-semibold">{c.person.name}</span>
                  <span className="text-ink/60">
                    {orderLabel(c.payment.orderType, tp)} · {c.methodLabel} ·{" "}
                    {clp.format(c.payment.amount)}
                  </span>
                  <span
                    className={`ml-auto text-xs ${
                      c.status === "APPROVED" ? "text-neon" : "text-red-400"
                    }`}
                  >
                    {c.reviewedBy
                      ? t(
                          c.status === "APPROVED"
                            ? "reviewedByApproved"
                            : "reviewedByRejected",
                          { name: c.reviewedBy.name },
                        )
                      : t(
                          c.status === "APPROVED"
                            ? "statusApproved"
                            : "statusRejected",
                        )}
                    {" · "}
                    {dayFmt.format(new Date(c.reviewedAt!))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FilterBar
        entity={CLAIMS_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{}}
      />

      {filtered && claims.length === 0 && (
        <p role="status" className="text-sm text-ink/50">
          {tq("empty")}
        </p>
      )}
      {filtered && claims.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {claims.map((c) => (
            <li key={c.id}>
              <Link
                href={`/productor/comprobantes/claim/${c.id}`}
                className={claimCardCls}
              >
                <div className={claimCardInnerCls}>{claimLine(c)}</div>
              </Link>
            </li>
          ))}
        </ul>
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
