"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Pager, SkeletonList, Spinner } from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import { CLAIM_STATUSES, filtersParams } from "./shared";
import type { EntityDef, QueryFilters } from "@omnidance/shared";

type QueueClaim = {
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
 * "Comprobantes por validar" del productor (spec producer-own-methods):
 * el comprador sube el comprobante de su orden MANUAL; al aprobar, la
 * orden se liquida por el mismo settle del webhook (ticket/pase +
 * ledger + notificación). El comprobante se abre en pestaña nueva por
 * el endpoint autenticado (evidencia privada).
 */
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

export function ProducerClaimsQueue() {
  const t = useTranslations("academyPay");
  const tp = useTranslations("producer.ownMethods");
  const tq = useTranslations("query");

  const [claims, setClaims] = useState<QueueClaim[] | null>(null);
  const [filters, setFilters] = useState<QueryFilters>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

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
            claims: QueueClaim[];
            total: number;
          })
        : { claims: [], total: 0 };
      setClaims(data.claims);
      setTotal(data.total);
      return;
    }
    const get = (status: string, size: number) =>
      apiFetch(
        `/producer/claims?status=${status}&pageSize=${size}`,
      )
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ claims: QueueClaim[] }>)
            : { claims: [] },
        )
        .catch(() => ({ claims: [] }));
    const [pending, approved, rejected] = await Promise.all([
      get("PENDING", 100),
      get("APPROVED", 50),
      get("REJECTED", 50),
    ]);
    setClaims([
      ...pending.claims,
      ...approved.claims,
      ...rejected.claims,
    ]);
    setTotal(0);
  }, []);

  useEffect(() => {
    void load(filters, page);
  }, [load, filters, page]);

  async function approve(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await apiFetch(`/producer/claims/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setMsg(res.ok ? t("approvedMsg") : t("error"));
      await load(filters, page);
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!rejectNote.trim()) return;
    setBusyId(id);
    setMsg(null);
    try {
      const res = await apiFetch(`/producer/claims/${id}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: rejectNote.trim() }),
      });
      setMsg(res.ok ? t("rejectedMsg") : t("error"));
      setRejectId(null);
      setRejectNote("");
      await load(filters, page);
    } finally {
      setBusyId(null);
    }
  }

  const orderLabel = (orderType: string) =>
    orderType === "SERIES_PASS" ? tp("orderSeriesPass") : tp("orderTicket");

  if (claims === null) return <SkeletonList items={2} />;
  // Sin claims ni filtros → la sección no renderiza nada (comportamiento
  // previo); con filtros activos la barra queda para poder limpiarlos.
  const hasFilters = Object.keys(filters).length > 0;
  if (claims.length === 0 && !hasFilters) return null;

  const pending = claims.filter((c) => c.status === "PENDING");
  const resolved = claims
    .filter((c) => c.status !== "PENDING" && c.reviewedAt)
    .sort(
      (a, b) =>
        new Date(b.reviewedAt!).getTime() - new Date(a.reviewedAt!).getTime(),
    )
    .slice(0, 20);

  return (
    <>
      <FilterBar
        entity={CLAIMS_ENTITY}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        options={{}}
      />

      {claims.length === 0 && (
        <p role="status" className="text-sm text-ink/50">
          {tq("empty")}
        </p>
      )}

      {pending.length > 0 && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {tp("queueTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{tp("queueDesc")}</p>
          </div>
          {msg && (
            <p role="status" className="text-sm text-neon">
              {msg}
            </p>
          )}
          <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
            {pending.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{c.person.name}</span>
                  <span className="text-ink/60">
                    {orderLabel(c.payment.orderType)} · {c.methodLabel} ·{" "}
                    {clp.format(c.payment.amount)}
                  </span>
                  <span className="ml-auto text-xs text-ink/40">
                    {dayFmt.format(new Date(c.createdAt))}
                  </span>
                </div>
                {c.note && (
                  <p className="text-xs italic text-ink/50">“{c.note}”</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/producer/claims/${c.id}/receipt`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs text-neon hover:bg-neon/10"
                  >
                    {t("viewReceipt")}
                  </a>
                  <span className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void approve(c.id)}
                      disabled={busyId === c.id}
                    >
                      {busyId === c.id ? <Spinner size="sm" /> : null}
                      {t("approve")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setRejectId(rejectId === c.id ? null : c.id)
                      }
                    >
                      {t("reject")}
                    </Button>
                  </span>
                </div>
                {rejectId === c.id && (
                  <div className="flex flex-col gap-2 border-t border-line pt-3">
                    <label className="flex flex-col gap-1 text-xs text-ink/60">
                      {t("rejectPrompt")}
                      <input
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        maxLength={500}
                        className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void reject(c.id)}
                        disabled={!rejectNote.trim() || busyId === c.id}
                      >
                        {t("confirm")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRejectId(null)}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {resolved.length > 0 && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("historyTitle")}
            </h2>
            <p className="mt-1 text-xs text-ink/50">{t("historyDesc")}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {resolved.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
              >
                <span className="font-semibold">{c.person.name}</span>
                <span className="text-ink/60">
                  {orderLabel(c.payment.orderType)} · {c.methodLabel} ·{" "}
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
              </li>
            ))}
          </ul>
        </Card>
      )}

      {typeof filters.status === "string" && total > 0 && (
        <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
      )}
    </>
  );
}
