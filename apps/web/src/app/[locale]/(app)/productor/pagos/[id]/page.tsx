"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  ArrowUpRightIcon,
  Badge,
  Button,
  Card,
  EventDate,
  PriceTag,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { PAYOUT_STATUS_VARIANT } from "@/components/producer/shared";

type PayoutLineDetail = {
  id: string;
  type: string;
  amount: number;
  payment: {
    id: string;
    refId: string;
    orderType: string;
    channel: string | null;
    amount: number;
  } | null;
};

type PayoutDetail = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  gross: number;
  net: number;
  paidAt: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  lines: PayoutLineDetail[];
};

/**
 * /productor/pagos/[id] - ficha de la liquidación: período, bruto/neto,
 * evidencia de transferencia y el desglose por deducción con trazabilidad
 * a la orden origen (refId) - la auditoría de cada línea.
 */
function PayoutDetail() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [payout, setPayout] = useState<PayoutDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    const res = await apiFetch(`/me/payouts/${id}`).catch(() => null);
    if (!res?.ok) {
      setLoadState("error");
      return;
    }
    setPayout((await res.json()) as PayoutDetail);
    setLoadState("ready");
  }, [id]);

  useEffect(() => {
    setLoadState("loading");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, nonce]);

  const orderLabel = (orderType: string) =>
    orderType === "SERIES_PASS"
      ? t("ownMethods.orderSeriesPass")
      : t("ownMethods.orderTicket");

  return (
    <>
      <ConsoleHeader backHref="/productor/pagos" backLabel={t("payouts")} />

      {loadState === "loading" && <SkeletonList items={2} />}

      {loadState === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("payoutDetail.notFound")}
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

      {loadState === "ready" && payout && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                <EventDate start={payout.periodStart} variant="compact" />
                {" – "}
                <EventDate start={payout.periodEnd} variant="compact" />
              </h2>
              <Badge variant={PAYOUT_STATUS_VARIANT[payout.status] ?? "muted"}>
                {t.has(`payoutsPage.status.${payout.status}`)
                  ? t(`payoutsPage.status.${payout.status}`)
                  : payout.status}
              </Badge>
            </div>
            <Card className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink/50">
                    {t("payoutsPage.gross")}
                  </dt>
                  <dd>
                    <PriceTag amount={payout.gross} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink/50">
                    {t("payoutsPage.net")}
                  </dt>
                  <dd>
                    <PriceTag amount={payout.net} className="font-semibold" />
                  </dd>
                </div>
                {payout.paidAt && (
                  <div>
                    <dt className="text-xs text-ink/50">
                      {t("payoutsPage.paidAt")}
                    </dt>
                    <dd>
                      <EventDate start={payout.paidAt} />
                    </dd>
                  </div>
                )}
              </dl>
              {payout.evidenceUrl && (
                <a
                  href={payout.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg border border-line px-4 text-sm text-neon hover:bg-neon/10"
                >
                  {t("payoutsPage.evidence")}
                  <ArrowUpRightIcon className="h-3.5 w-3.5" />
                  <span className="sr-only"> {tc("newTab")}</span>
                </a>
              )}
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {t("payoutsPage.deductions")}
            </h2>
            {payout.lines.length === 0 && (
              <p role="status" className="text-sm text-ink/60">
                {t("payoutsPage.empty")}
              </p>
            )}
            {payout.lines.length > 0 && (
              <Card padded={false}>
                <ul className="flex flex-col divide-y divide-line">
                  {payout.lines.map((l) => (
                    <li
                      key={l.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 text-ink/70">
                        {t.has(`payoutsPage.lineTypes.${l.type}`)
                          ? t(`payoutsPage.lineTypes.${l.type}`)
                          : l.type}
                      </span>
                      {l.payment && (
                        <span className="flex items-center gap-2 text-xs text-ink/50">
                          <span>{orderLabel(l.payment.orderType)}</span>
                          <span className="font-mono">
                            {l.payment.refId}
                          </span>
                        </span>
                      )}
                      <span className="tabular-nums">
                        <PriceTag amount={-l.amount} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function PayoutDetailPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <PayoutDetail />
      </ProducerGate>
    </main>
  );
}
