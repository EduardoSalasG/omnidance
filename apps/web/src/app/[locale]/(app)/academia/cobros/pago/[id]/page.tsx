"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  PAYMENT_STATUS_VARIANT,
  paymentDateTimeFmt,
} from "@/components/payments/shared";

type AcademyPaymentDetail = {
  id: string;
  orderType: string;
  refId: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  gateway: string;
  gatewayMedia: string | null;
  gatewayFeeClp: number | null;
  gatewayPaidAt: string | null;
  gatewayRef: string | null;
  channel: string | null;
  producerNetClp: number | null;
  createdAt: string;
  eventCount: number;
  personName: string | null;
  contextName: string | null;
};

/**
 * /academia/cobros/pago/[id] - detalle de un cobro adjudicado a la
 * academia (GET /academies/:id/payments/:paymentId). Solo lectura.
 */
export default function AcademyPaymentDetailPage() {
  const t = useTranslations("academyPay");
  const params = useParams<{ id: string }>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia/cobros" backLabel={t("detailBack")} />
      <AcademyGate>
        {({ academy }) => (
          <PaymentDetail
            key={`${academy.id}:${params.id}`}
            academyId={academy.id}
            paymentId={params.id}
          />
        )}
      </AcademyGate>
    </main>
  );
}

function PaymentDetail({
  academyId,
  paymentId,
}: {
  academyId: string;
  paymentId: string;
}) {
  const locale = useLocale();
  const t = useTranslations("academyPay");
  const tp = useTranslations("payments");
  const tc = useTranslations("common");

  const [payment, setPayment] = useState<AcademyPaymentDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    setForbidden(false);
    const res = await apiFetch(
      `/academies/${academyId}/payments/${paymentId}`,
    ).catch(() => null);
    if (res && (res.status === 401 || res.status === 403 || res.status === 404)) {
      // Sin acceso o inexistente en esta academia: estado "sin acceso"
      // con CTA de salida - no es un error reintentable.
      setForbidden(true);
      return;
    }
    if (!res?.ok) {
      setLoadError(true);
      return;
    }
    setPayment((await res.json()) as AcademyPaymentDetail);
  }, [academyId, paymentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderLabel = useMemo(
    () =>
      payment
        ? tp.has(`orderTypes.${payment.orderType}`)
          ? tp(`orderTypes.${payment.orderType}`)
          : payment.orderType
        : "",
    [payment, tp],
  );

  if (forbidden) {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-ink/70">{t("forbidden")}</p>
        <Button
          href="/academia/cobros"
          variant="secondary"
          size="sm"
        >
          {t("detailBack")}
        </Button>
      </Card>
    );
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
  if (!payment) return <SkeletonList />;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">{t("payTitle")}</h2>
        <Badge variant={PAYMENT_STATUS_VARIANT[payment.status] ?? "muted"}>
          {tp.has(`status.${payment.status}`)
            ? tp(`status.${payment.status}`)
            : payment.status}
        </Badge>
      </div>
      <Card className="flex flex-col gap-3 p-4">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {payment.personName && (
            <div>
              <dt className="text-xs text-ink/50">{t("fieldPayer")}</dt>
              <dd className="font-medium">{payment.personName}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-ink/50">{t("fieldContext")}</dt>
            <dd className="font-medium">
              {payment.contextName ?? orderLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">{t("fieldAmount")}</dt>
            <dd>
              <PriceTag amount={payment.amount} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">{t("fieldMethod")}</dt>
            <dd className="font-medium">
              {payment.gatewayMedia ?? payment.gateway}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">{t("fieldFee")}</dt>
            <dd>
              <PriceTag amount={payment.gatewayFeeClp ?? payment.fee} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">{t("fieldNet")}</dt>
            <dd>
              <PriceTag amount={payment.producerNetClp ?? payment.net} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink/50">{t("fieldPaidAt")}</dt>
            <dd className="tabular-nums text-ink/70">
              {paymentDateTimeFmt(locale).format(
                new Date(payment.gatewayPaidAt ?? payment.createdAt),
              )}
            </dd>
          </div>
          {payment.createdAt !== payment.gatewayPaidAt && (
            <div>
              <dt className="text-xs text-ink/50">{t("fieldCreated")}</dt>
              <dd className="tabular-nums text-ink/70">
                {paymentDateTimeFmt(locale).format(new Date(payment.createdAt))}
              </dd>
            </div>
          )}
          {payment.channel && (
            <div>
              <dt className="text-xs text-ink/50">{t("fieldChannel")}</dt>
              <dd className="font-medium">
                {tp.has(`channels.${payment.channel}`)
                  ? tp(`channels.${payment.channel}`)
                  : payment.channel}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-ink/50">{t("fieldRef")}</dt>
            <dd className="truncate font-mono text-xs text-ink/50">
              {payment.refId}
            </dd>
          </div>
          {payment.gatewayRef && (
            <div>
              <dt className="text-xs text-ink/50">{t("fieldTxn")}</dt>
              <dd className="truncate font-mono text-xs text-ink/50">
                {payment.gatewayRef}
              </dd>
            </div>
          )}
        </dl>
      </Card>
    </section>
  );
}
