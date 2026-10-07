"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, SkeletonList, Spinner } from "@/components/ui";

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
export function ProducerClaimsQueue() {
  const t = useTranslations("academyPay");
  const tp = useTranslations("producer.ownMethods");

  const [claims, setClaims] = useState<QueueClaim[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/producer/claims").catch(() => null);
    setClaims(res?.ok ? ((await res.json()) as { claims: QueueClaim[] }).claims : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
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
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const orderLabel = (orderType: string) =>
    orderType === "SERIES_PASS" ? tp("orderSeriesPass") : tp("orderTicket");

  if (claims === null) return <SkeletonList items={2} />;
  if (claims.length === 0) return null;

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
      {pending.length > 0 && (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {tp("queueTitle")}
            </h2>
            <p className="mt-1 text-xs text-white/50">{tp("queueDesc")}</p>
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
                className="flex flex-col gap-2 rounded-xl border border-night-700 bg-night-800 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{c.person.name}</span>
                  <span className="text-white/60">
                    {orderLabel(c.payment.orderType)} · {c.methodLabel} ·{" "}
                    {clp.format(c.payment.amount)}
                  </span>
                  <span className="ml-auto text-xs text-white/40">
                    {dayFmt.format(new Date(c.createdAt))}
                  </span>
                </div>
                {c.note && (
                  <p className="text-xs italic text-white/50">“{c.note}”</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/producer/claims/${c.id}/receipt`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center rounded-lg border border-night-600 px-3 text-xs text-neon hover:bg-neon/10"
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
                  <div className="flex flex-col gap-2 border-t border-night-700 pt-3">
                    <label className="flex flex-col gap-1 text-xs text-white/60">
                      {t("rejectPrompt")}
                      <input
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        maxLength={500}
                        className="min-h-11 rounded-xl border border-night-700 bg-night-900 px-3 text-sm"
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t("historyTitle")}
            </h2>
            <p className="mt-1 text-xs text-white/50">{t("historyDesc")}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {resolved.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
              >
                <span className="font-semibold">{c.person.name}</span>
                <span className="text-white/60">
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
    </>
  );
}
