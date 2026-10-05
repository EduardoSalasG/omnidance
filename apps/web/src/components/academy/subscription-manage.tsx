"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Spinner } from "@/components/ui";
import { planDateFmt } from "./shared";

// Shape público de la suscripción del viewer — GET
// /academies/:id/profile (`mySubscription`: id, planId, status,
// nextInvoiceAt, canceledAt) y /academies/enrolled (`subscription`).
export type SubscriptionInfo = {
  id: string;
  /** MembershipPlan.id — permite re-disparar subscribe() al retomar
      un registro de tarjeta abandonado (PENDING_CARD). */
  planId: string;
  status: string;
  nextInvoiceAt: string | null;
  canceledAt: string | null;
};

export type SubscriptionManageProps = {
  subscription: SubscriptionInfo;
  /** "Vigente hasta": enrollment.endsAt del viewer — en CANCEL_PENDING
      es la fecha real de fin del acceso; si no hay, se usa nextInvoiceAt. */
  accessUntil?: string | null;
  /** Monto real del próximo cobro (plan.price + cargo de servicio) —
      lo resuelve el caller desde los planes de la academia + params. */
  nextAmount?: number;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Gestión de la suscripción del viewer en la ficha de la academia:
 *  - ACTIVE → badge + próximo cobro (fecha + monto) + "Cancelar
 *    suscripción" (confirm inline de 2 pasos) → POST /:id/cancel;
 *  - CANCEL_PENDING → "Se cancela el {fecha}" sin acciones;
 *  - PENDING_CARD → "te falta registrar tu tarjeta" + botón que
 *    re-dispara subscribe() (el backend reutiliza la fila fresca o
 *    reemplaza la expirada) → redirect al disclaimer de Flow;
 *  - ACTIVATING → estado transitorio con spinner;
 *  - CANCELED → no renderiza nada (la vigencia ya la muestra el plan).
 */
export function SubscriptionManage({
  subscription,
  accessUntil,
  nextAmount,
}: SubscriptionManageProps) {
  const ts = useTranslations("subscriptions");
  const tc = useTranslations("common");
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await apiFetch(`/subscriptions/${subscription.id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      // at_period_end: la ficha repinta con CANCEL_PENDING.
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Retoma el registro de tarjeta de una PENDING_CARD (el usuario salió
   * del disclaimer de Flow sin terminar o falló): subscribe() sobre el
   * mismo plan devuelve needs_card + registerUrl nueva — el backend
   * reutiliza la fila fresca o reemplaza la expirada, sin duplicar.
   */
  async function resumeCardRegistration() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await apiFetch("/checkout/membership-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: subscription.planId,
          acceptRecurring: true,
        }),
      });
      if (!res.ok) {
        setFailed(true);
        setBusy(false);
        return;
      }
      const data = (await res.json()) as
        | { kind: "needs_card"; registerUrl: string }
        | { kind: "subscribed"; subscriptionId: string };
      if (data.kind === "needs_card") {
        window.location.href = data.registerUrl;
        return;
      }
      router.refresh();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  if (subscription.status === "CANCELED") return null;

  if (subscription.status === "PENDING_CARD" || subscription.status === "FAILED_CARD") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-night-700 p-4">
        <p className="text-sm text-white/70">
          {subscription.status === "FAILED_CARD"
            ? ts("failedCard")
            : ts("pendingCard")}
        </p>
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => void resumeCardRegistration()}
        >
          {busy && <Spinner size="sm" />}
          {ts("resumeCard")}
        </Button>
        {failed && (
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
        )}
      </div>
    );
  }

  if (subscription.status === "ACTIVATING") {
    return (
      <p className="flex items-center gap-2 text-sm text-white/60">
        <Spinner size="sm" label={ts("activating")} />
        <span className="animate-pulse">{ts("activating")}</span>
      </p>
    );
  }

  if (subscription.status === "CANCEL_PENDING") {
    const end = accessUntil ?? subscription.nextInvoiceAt;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="normal-case tracking-normal">
          {end
            ? ts("cancelPending", {
                date: planDateFmt.format(new Date(end)),
              })
            : ts("cancelPendingNoDate")}
        </Badge>
      </div>
    );
  }

  if (subscription.status !== "ACTIVE") return null;

  const nextCharge = subscription.nextInvoiceAt
    ? planDateFmt.format(new Date(subscription.nextInvoiceAt))
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-night-700 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neon" className="normal-case tracking-normal">
          {ts("activeBadge")}
        </Badge>
        {nextCharge && (
          <p className="text-sm text-white/60">
            {nextAmount != null
              ? ts("nextChargeAmount", {
                  date: nextCharge,
                  amount: clp.format(nextAmount),
                })
              : ts("nextCharge", { date: nextCharge })}
          </p>
        )}
      </div>

      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-white/70">{ts("cancelConfirm")}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {busy && <Spinner size="sm" />}
              {ts("cancelYes")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {ts("cancelKeep")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setConfirming(true)}
        >
          {ts("cancel")}
        </Button>
      )}

      {failed && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}
    </div>
  );
}
