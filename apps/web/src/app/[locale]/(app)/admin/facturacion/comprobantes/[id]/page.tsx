"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  RefreshIcon,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useRouter } from "@/i18n/navigation";
import { formatMoney, useDateFmt } from "@/lib/intl";

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

;

/**
 * /admin/facturacion/comprobantes/[id] - ficha del comprobante de una
 * suscripción de plataforma por transferencia (spec
 * subscription-manual-transfer, TicketClaim domain=PLATFORM): datos
 * del pagador y de la orden, la evidencia y - solo en PENDING -
 * aprobar/rechazar con motivo. Aprobar liquida la orden por el mismo
 * settle del webhook y la suscripción queda ACTIVE.
 */
export default function AdminClaimDetailPage() {
  const t = useTranslations("admin.claims");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader
        backHref="/admin/facturacion/comprobantes"
        backLabel={t("title")}
      />
      <AdminGate>
        <ClaimDetail />
      </AdminGate>
    </main>
  );
}

function ClaimDetail() {
  const locale = useLocale();
  const dayFmt = useDateFmt({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const t = useTranslations("admin.claims");
  const ta = useTranslations("academyPay");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  // Aprobar activa la suscripción de plataforma con un solo click -
  // confirmación previa (bottom-sheet compartido).
  const [confirmApprove, setConfirmApprove] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/admin/payment-claims/${id}`).catch(
      () => null,
    );
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
  }, [load]);

  async function approve() {
    setBusy(true);
    try {
      const res = await apiFetch(`/admin/payment-claims/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        showActionNotice({ text: tc("error"), error: true });
        setConfirmApprove(false);
        return;
      }
      setConfirmApprove(false);
      showActionNotice({ text: t("approvedMsg") });
      router.push("/admin/facturacion/comprobantes");
    } catch {
      showActionNotice({ text: tc("error"), error: true });
      setConfirmApprove(false);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectNote.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/admin/payment-claims/${id}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: rejectNote.trim() }),
      });
      if (!res.ok) {
        showActionNotice({ text: tc("error"), error: true });
        return;
      }
      showActionNotice({ text: t("rejectedMsg") });
      router.push("/admin/facturacion/comprobantes");
    } catch {
      // El form de rechazo queda abierto para reintentar.
      showActionNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (status: string) =>
    status === "APPROVED"
      ? ta("statusApproved")
      : status === "REJECTED"
        ? ta("statusRejected")
        : ta("statusPending");

  return (
    <>
      {loadState === "loading" && <SkeletonList items={2} />}

      {loadState === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("notFound")}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {loadState === "ready" && claim && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{t("detailTitle")}</h2>
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
            {/* Datos del pagador y del comprobante → masking de
                Clarity (audit M5). */}
            <Card data-clarity-mask="true" className="flex flex-col gap-3">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink/50">{t("fieldPayer")}</dt>
                  <dd className="font-medium">{claim.person.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("fieldOrder")}</dt>
                  <dd className="font-medium">{t("orderPlatformSub")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("fieldAmount")}</dt>
                  <dd className="font-medium tabular-nums">
                    {formatMoney(claim.payment.amount, undefined, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("fieldMethod")}</dt>
                  <dd className="font-medium">{claim.methodLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("fieldOrderRef")}</dt>
                  <dd className="font-mono text-xs text-ink/70">
                    {claim.payment.refId}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">{t("fieldSentAt")}</dt>
                  <dd className="tabular-nums text-ink/70">
                    {dayFmt.format(new Date(claim.createdAt))}
                  </dd>
                </div>
                {claim.reviewedAt && (
                  <div>
                    <dt className="text-xs text-ink/50">
                      {t("fieldReviewedAt")}
                    </dt>
                    <dd className="tabular-nums text-ink/70">
                      {dayFmt.format(new Date(claim.reviewedAt))}
                      {claim.reviewedBy ? ` · ${claim.reviewedBy.name}` : ""}
                    </dd>
                  </div>
                )}
                {claim.payment.gatewayPaidAt && (
                  <div>
                    <dt className="text-xs text-ink/50">{t("fieldPaidAt")}</dt>
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
                  {t("fieldReviewNote")}: {claim.reviewNote}
                </p>
              )}
              <div>
                <a
                  href={`/api/admin/payment-claims/${claim.id}/receipt`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm text-neon hover:bg-neon/10"
                >
                  {ta("openReceipt")}
                </a>
              </div>
            </Card>
          </section>

          {claim.status === "PENDING" && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setConfirmApprove(true)}
                  disabled={busy}
                >
                  {busy ? <Spinner size="sm" /> : null}
                  {ta("approve")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRejectOpen((v) => !v)}
                  disabled={busy}
                >
                  {ta("reject")}
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
                      {ta("confirm")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRejectOpen(false)}
                    >
                      {ta("cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Aprobar activa la suscripción de plataforma con un solo click -
          confirmación previa (mismo patrón que el productor). */}
      <ConfirmSheet
        open={confirmApprove}
        title={t("approveTitle")}
        description={t("approveDesc")}
        confirmLabel={ta("approve")}
        confirmVariant="primary"
        busy={busy}
        onConfirm={() => void approve()}
        onClose={() => setConfirmApprove(false)}
      />
    </>
  );
}
