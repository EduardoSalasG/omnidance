"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { useRouter } from "@/i18n/navigation";
import { formatMoney, useDateFmt } from "@/lib/intl";

type OrderClaimDetail = {
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
 * /academia/cobros/orden/[id] - ficha del comprobante de una orden de
 * suscripción por transferencia (spec subscription-manual-transfer,
 * TicketClaim domain=ACADEMY): datos del alumno y de la orden, la
 * evidencia y - solo en PENDING - aprobar/rechazar con motivo.
 * Aprobar liquida la orden por el mismo settle del webhook y la
 * suscripción queda ACTIVE.
 */
export default function OrderClaimDetailPage() {
  const t = useTranslations("academyPay");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/cobros" backLabel={t("detailBack")} />
      <AcademyGate>
        {({ academy }) => (
          <OrderClaimDetail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            claimId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function OrderClaimDetail({
  academyId,
  claimId,
}: {
  academyId: string;
  claimId: string;
}) {
  const locale = useLocale();
  const claimDateFmt = useDateFmt({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");
  const router = useRouter();

  const [claim, setClaim] = useState<OrderClaimDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  // Aprobar activa la suscripción con un solo click - confirmación
  // previa (bottom-sheet compartido, mismo patrón del productor).
  const [confirmApprove, setConfirmApprove] = useState(false);

  const statusLabel = useMemo(
    () => ({
      PENDING: t("statusPending"),
      APPROVED: t("statusApproved"),
      REJECTED: t("statusRejected"),
    }),
    [t],
  );

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await apiFetch(
      `/academies/${academyId}/order-claims/${claimId}`,
    ).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setClaim((await res.json()) as OrderClaimDetail);
  }, [academyId, claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve() {
    setBusy(true);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/order-claims/${claimId}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) {
        showActionNotice({ text: t("error"), error: true });
        setConfirmApprove(false);
        return;
      }
      setConfirmApprove(false);
      showActionNotice({ text: t("orderApprovedMsg") });
      router.push("/academia/cobros");
    } catch {
      showActionNotice({ text: t("error"), error: true });
      setConfirmApprove(false);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectNote.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/order-claims/${claimId}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: rejectNote.trim() }),
        },
      );
      if (!res.ok) {
        showActionNotice({ text: t("error"), error: true });
        return;
      }
      showActionNotice({ text: t("rejectedMsg") });
      router.push("/academia/cobros");
    } catch {
      // El form de rechazo queda abierto para reintentar.
      showActionNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!claim) return <SkeletonList />;

  const variant =
    claim.status === "APPROVED"
      ? "neon"
      : claim.status === "REJECTED"
        ? "live"
        : "muted";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">{t("orderClaimTitle")}</h2>
          <Badge variant={variant}>{statusLabel[claim.status]}</Badge>
        </div>
        <Card className="flex flex-col gap-3 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink/50">{t("fieldStudent")}</dt>
              <dd className="font-medium">{claim.person.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("fieldOrder")}</dt>
              <dd className="font-medium">{t("orderMembership")}</dd>
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
              <dt className="text-xs text-ink/50">{t("fieldSentAt")}</dt>
              <dd className="tabular-nums text-ink/70">
                {claimDateFmt.format(new Date(claim.createdAt))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("fieldOrderRef")}</dt>
              <dd className="font-mono text-xs text-ink/70">
                {claim.payment.refId}
              </dd>
            </div>
            {claim.reviewedAt && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldReviewedAt")}</dt>
                <dd className="tabular-nums text-ink/70">
                  {claimDateFmt.format(new Date(claim.reviewedAt))}
                  {claim.reviewedBy ? ` · ${claim.reviewedBy.name}` : ""}
                </dd>
              </div>
            )}
            {claim.payment.gatewayPaidAt && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldPaidAt")}</dt>
                <dd className="tabular-nums text-ink/70">
                  {claimDateFmt.format(new Date(claim.payment.gatewayPaidAt))}
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
              href={`/api/academies/${academyId}/order-claims/${claim.id}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm text-neon hover:bg-neon/10"
            >
              {t("openReceipt")}
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

      {/* Aprobar liquida la orden y activa la suscripción con un solo
          click - confirmación previa (mismo patrón que el productor). */}
      <ConfirmSheet
        open={confirmApprove}
        title={t("orderApproveTitle")}
        description={t("orderApproveDesc")}
        confirmLabel={t("approve")}
        confirmVariant="primary"
        busy={busy}
        onConfirm={() => void approve()}
        onClose={() => setConfirmApprove(false)}
      />
    </div>
  );
}
