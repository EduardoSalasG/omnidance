"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { PaymentCards } from "@/components/payments/payment-cards";
import type { PaymentAuditRow } from "@/components/payments/shared";

type Props = { academyId: string };

type Phase = "loading" | "denied" | "error" | "ready";

/**
 * Cobros MEMBERSHIP de los planes de la academia
 * (GET /payments/by-academy/:academyId — owner de la academia o admin;
 * 403/404 → mensaje "sin acceso"). Cada cobro es el Payment de una
 * invoice de suscripción o de una compra manual de plan.
 */
export function AcademyPayments({ academyId }: Props) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");

  const [phase, setPhase] = useState<Phase>("loading");
  const [payments, setPayments] = useState<PaymentAuditRow[]>([]);

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await apiFetch(`/payments/by-academy/${academyId}`);
      if (res.status === 403 || res.status === 404) {
        setPhase("denied");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      setPayments((await res.json()) as PaymentAuditRow[]);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === "loading") return <SkeletonList />;

  if (phase === "denied") {
    return (
      <p role="status" className="text-sm text-white/60">
        {t("byAcademy.noAccess")}
      </p>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-white/60">
          {tc("error")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/50">{t("byAcademy.desc")}</p>
      {payments.length === 0 ? (
        <p role="status" className="text-sm text-white/50">
          {t("byAcademy.empty")}
        </p>
      ) : (
        <PaymentCards payments={payments} />
      )}
    </div>
  );
}
