"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Spinner } from "@/components/ui";
import { readError } from "./shared";

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s - mismo criterio que checkout-client

/**
 * Compra de clase particular (spec private-lesson-product): POST
 * /checkout/private-class crea la orden PRIVATE y redirige a la pasarela;
 * el settle materializa la PrivateLesson "por asignar" al PAID (el owner
 * de la academia define fecha e instructor después del pago). Con gateway
 * stub no hay a dónde saltar: la orden queda PENDING con botones de
 * simulación y al resolverse se navega a /checkout/return (mismo patrón
 * que membership-checkout-client).
 */
export function BuyPrivateClass({
  academyId,
  disabled = false,
}: {
  academyId: string;
  /** Academia bloqueada por mora SaaS (S3): el POST ya rechaza con
      academy.unavailable - el botón disabled lo anticipa honestamente. */
  disabled?: boolean;
}) {
  const t = useTranslations("academy.profile");
  const tc = useTranslations("common");
  const tco = useTranslations("checkout");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState<{
    paymentId: string;
    paymentUrl: string;
  } | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Al terminal (pagado/fallido) o si el polling se agota, el retorno
  // del checkout renderiza el estado real - misma pantalla que llega
  // desde la pasarela.
  function startPolling(paymentId: string) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      void apiFetch(`/payments/${paymentId}`)
        .then(async (res) => {
          if (!res.ok) return;
          const payment = (await res.json()) as { status: string };
          if (payment.status !== "PENDING") {
            clearInterval(interval);
            router.push(`/checkout/return?paymentId=${paymentId}`);
          }
        })
        .catch(() => undefined);
      if (attempts >= POLL_MAX_ATTEMPTS) {
        clearInterval(interval);
        router.push(`/checkout/return?paymentId=${paymentId}`);
      }
    }, POLL_INTERVAL_MS);
  }

  // Dev: el webhook resuelve el pago por refId (stub://pay/<refId>).
  async function simulate(status: "PAID" | "FAILED") {
    if (!awaiting) return;
    setSimulating(true);
    try {
      const refId = awaiting.paymentUrl.replace(/^stub:\/\/pay\//, "");
      await apiFetch("/payments/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refId, status }),
      });
    } catch {
      // El polling refleja el resultado real del pago
    } finally {
      setSimulating(false);
    }
  }

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/checkout/private-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? tc("error"));
        return;
      }
      const order = (await res.json()) as {
        paymentUrl?: string;
        paymentId?: string;
      };
      if (!order.paymentUrl || !order.paymentId) {
        setError(tc("error"));
        return;
      }
      if (order.paymentUrl.startsWith("stub://")) {
        const pending = {
          paymentId: order.paymentId,
          paymentUrl: order.paymentUrl,
        };
        setAwaiting(pending);
        startPolling(pending.paymentId);
        return;
      }
      window.location.assign(order.paymentUrl);
    } catch {
      setError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {awaiting ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <p role="status" className="text-sm text-white/70">
              {tco("pending")}
            </p>
          </div>
          <p className="text-xs uppercase tracking-wide text-white/50">
            {tco("devSimTitle")}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={simulating}
              onClick={() => void simulate("PAID")}
            >
              {tco("devSimApprove")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={simulating}
              onClick={() => void simulate("FAILED")}
            >
              {tco("devSimFail")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className="w-full"
          disabled={busy || disabled}
          onClick={() => void buy()}
        >
          {busy && <Spinner size="sm" />}
          {t("buyPrivate")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
