"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonList, Spinner } from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { claimDateFmt } from "@/components/academy/claims-queue";

type ClaimDetail = {
  id: string;
  amount: number;
  methodType: string;
  methodLabel: string;
  status: "AWAITING" | "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  receiptKey: string | null;
  reviewedBy: { id: string; name: string } | null;
  person: { id: string; name: string };
  plan: { id: string; name: string; type: string; price: number } | null;
  payment: {
    id: string;
    refId: string;
    status: string;
    channel: string | null;
    createdAt: string;
  } | null;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * /academia/cobros/claim/[id] - detalle del comprobante declarado por el
 * alumno: datos, comprobante y (solo en PENDING) aprobar/rechazar con
 * motivo. La cola solo navega hasta acá.
 */
export default function ClaimDetailPage() {
  const t = useTranslations("academyPay");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader backHref="/academia/cobros" backLabel={t("detailBack")} />
      <AcademyGate>
        {({ academy }) => (
          <ClaimDetail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            claimId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function ClaimDetail({
  academyId,
  claimId,
}: {
  academyId: string;
  claimId: string;
}) {
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");
  const router = useRouter();

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const statusLabel = useMemo(
    () => ({
      AWAITING: t("statusAwaiting"),
      PENDING: t("statusPending"),
      APPROVED: t("statusApproved"),
      REJECTED: t("statusRejected"),
    }),
    [t],
  );

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await apiFetch(
      `/academies/${academyId}/claims/${claimId}`,
    ).catch(() => null);
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setClaim((await res.json()) as ClaimDetail);
  }, [academyId, claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/claims/${claimId}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      if (!res.ok) {
        setMsg(t("error"));
        return;
      }
      // Aprobado → vuelve a la cola (el claim ya no es accionable).
      router.push("/academia/cobros");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectNote.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch(
        `/academies/${academyId}/claims/${claimId}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: rejectNote.trim() }),
        },
      );
      if (!res.ok) {
        setMsg(t("error"));
        return;
      }
      router.push("/academia/cobros");
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
          <h2 className="text-lg font-semibold">{t("claimTitle")}</h2>
          <Badge variant={variant}>{statusLabel[claim.status]}</Badge>
        </div>
        <Card className="flex flex-col gap-3 p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink/50">{t("fieldStudent")}</dt>
              <dd className="font-medium">{claim.person.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("fieldPlan")}</dt>
              <dd className="font-medium">
                {claim.plan?.name ?? t("fieldPlanOther")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("fieldAmount")}</dt>
              <dd className="font-medium tabular-nums">
                {clp.format(claim.amount)}
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
            {claim.reviewedAt && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldReviewedAt")}</dt>
                <dd className="tabular-nums text-ink/70">
                  {claimDateFmt.format(new Date(claim.reviewedAt))}
                  {claim.reviewedBy ? ` · ${claim.reviewedBy.name}` : ""}
                </dd>
              </div>
            )}
            {claim.payment && (
              <div>
                <dt className="text-xs text-ink/50">{t("fieldTxn")}</dt>
                <dd>
                  <Link
                    href={`/academia/cobros/pago/${claim.payment.id}`}
                    className="font-mono text-xs text-neon underline-offset-4 hover:underline"
                  >
                    {claim.payment.refId}
                  </Link>
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
            {claim.receiptKey ? (
              <a
                href={`/api/academies/${academyId}/claims/${claim.id}/receipt`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm text-neon hover:bg-neon/10"
              >
                {t("openReceipt")}
              </a>
            ) : (
              <p className="text-xs text-ink/50">{t("noReceipt")}</p>
            )}
          </div>
        </Card>
      </section>

      {claim.status === "PENDING" && (
        <section className="flex flex-col gap-3">
          {msg && (
            <p role="status" className="text-sm text-red-400">
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
  );
}
