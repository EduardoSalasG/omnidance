"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  RefreshIcon,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { orderLabel } from "@/components/producer/claims-queue-section";

type ClaimDetail = {
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
  payment: {
    id: string;
    amount: number;
    orderType: string;
    refId: string;
    channel: string | null;
    status: string;
    createdAt: string;
    gatewayPaidAt: string | null;
  };
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
 * /productor/comprobantes/claim/[id] - ficha del comprobante de un medio
 * de cobro propio (spec producer-own-methods): datos de la orden (refId,
 * canal, estado), la evidencia y - solo en PENDING - aprobar/rechazar
 * con motivo. Aprobar liquida la orden por el mismo settle del webhook.
 */
function ClaimDetail() {
  const t = useTranslations("academyPay");
  const tp = useTranslations("producer");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/producer/claims/${id}`).catch(() => null);
    if (!res?.ok) {
      setLoadState("error");
      return;
    }
    setClaim((await res.json()) as ClaimDetail);
    setLoadState("ready");
  }, [id]);

  useEffect(() => {
    setLoadState("loading");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, nonce]);

  async function approve() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch(`/producer/claims/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setMsg(t("error"));
        return;
      }
      // Resuelto → vuelve a la cola (el claim ya no es accionable).
      router.push("/productor/comprobantes");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectNote.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch(`/producer/claims/${id}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: rejectNote.trim() }),
      });
      if (!res.ok) {
        setMsg(t("error"));
        return;
      }
      router.push("/productor/comprobantes");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (status: string) =>
    status === "APPROVED"
      ? t("statusApproved")
      : status === "REJECTED"
        ? t("statusRejected")
        : t("statusPending");

  return (
    <>
      <ConsoleHeader
        backHref="/productor/comprobantes"
        backLabel={tp("ownMethods.queueTitle")}
      />

      {loadState === "loading" && <SkeletonList items={2} />}

      {loadState === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {tp("claimDetail.notFound")}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {loadState === "ready" && claim && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                {tp("claimDetail.title")}
              </h2>
              <Badge
                variant={
                  claim.status === "APPROVED"
                    ? "neon"
                    : claim.status === "REJECTED"
                      ? "live"
                      : "muted"
                }
              >
                {statusLabel(claim.status)}
              </Badge>
            </div>
            <Card className="flex flex-col gap-3">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink/50">
                    {tp("claimDetail.buyer")}
                  </dt>
                  <dd className="font-medium">{claim.person.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {tp("claimDetail.order")}
                  </dt>
                  <dd className="font-medium">
                    {orderLabel(claim.payment.orderType, (k) =>
                      tp(`ownMethods.${k}`),
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {tp("claimDetail.amount")}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {clp.format(claim.payment.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {tp("claimDetail.method")}
                  </dt>
                  <dd className="font-medium">{claim.methodLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {tp("claimDetail.orderRef")}
                  </dt>
                  <dd className="font-mono text-xs text-ink/70">
                    {claim.payment.refId}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {tp("claimDetail.sentAt")}
                  </dt>
                  <dd className="tabular-nums text-ink/70">
                    {dayFmt.format(new Date(claim.createdAt))}
                  </dd>
                </div>
                {claim.reviewedAt && (
                  <div>
                    <dt className="text-xs text-ink/50">
                      {tp("claimDetail.reviewedAt")}
                    </dt>
                    <dd className="tabular-nums text-ink/70">
                      {dayFmt.format(new Date(claim.reviewedAt))}
                      {claim.reviewedBy ? ` · ${claim.reviewedBy.name}` : ""}
                    </dd>
                  </div>
                )}
                {claim.payment.gatewayPaidAt && (
                  <div>
                    <dt className="text-xs text-ink/50">
                      {tp("claimDetail.paidAt")}
                    </dt>
                    <dd className="tabular-nums text-ink/70">
                      {dayFmt.format(new Date(claim.payment.gatewayPaidAt))}
                    </dd>
                  </div>
                )}
              </dl>
              {claim.note && (
                <p className="text-xs italic text-ink/50">“{claim.note}”</p>
              )}
              {claim.reviewNote && (
                <p className="text-xs text-ink/60">
                  {tp("claimDetail.reviewNote")}: {claim.reviewNote}
                </p>
              )}
              <div>
                <a
                  href={`/api/producer/claims/${claim.id}/receipt`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm text-neon hover:bg-neon/10"
                >
                  {tp("claimDetail.openReceipt")}
                </a>
              </div>
            </Card>
          </section>

          {claim.status === "PENDING" && (
            <section className="flex flex-col gap-3">
              {msg && (
                <p role="alert" className="text-sm text-red-400">
                  {msg}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void approve()} disabled={busy}>
                  {busy ? <Spinner size="sm" /> : null}
                  {t("approve")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRejectOpen((v) => !v)}
                  disabled={busy}
                >
                  {t("reject")}
                </Button>
              </div>
              {rejectOpen && (
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-4">
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
                      onClick={() => void reject()}
                      disabled={!rejectNote.trim() || busy}
                    >
                      {t("confirm")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectOpen(false)}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default function ProducerClaimDetailPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <ClaimDetail />
      </ProducerGate>
    </main>
  );
}
