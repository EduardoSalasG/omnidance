"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";

type Phase =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "awaiting"; paymentId: string; paymentUrl: string }
  | { kind: "failed" };

type Notice = "loginRequired" | "unavailable" | "generic" | null;

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s — mismo criterio que checkout-client

export type PlanPurchaseCtaProps = {
  /** MembershipPlan.id — requerido por POST /checkout/membership. */
  planId: string;
  /** Texto del CTA ("Comprar" / "Extender vigencia" si ya es el plan activo). */
  label: string;
};

/**
 * Compra de plan de academia: POST /checkout/membership {planId} →
 * {paymentUrl, paymentId}. Gateway real → redirect; stub:// (dev) →
 * polling + botones de simulación, mismo patrón que SeriesPassCta.
 * Al PAID el webhook ya materializó el Enrollment — router.refresh()
 * repinta la ficha con el badge "Plan activo".
 */
export function PlanPurchaseCta({ planId, label }: PlanPurchaseCtaProps) {
  const tc = useTranslations("common");
  const tco = useTranslations("checkout");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<Notice>(null);
  const [simulating, setSimulating] = useState(false);

  const isStub =
    phase.kind === "awaiting" && phase.paymentUrl.startsWith("stub://");
  const busy = phase.kind === "processing" || phase.kind === "awaiting";

  useEffect(() => {
    if (phase.kind !== "awaiting") return;
    const paymentId = phase.paymentId;
    let attempts = 0;

    const interval = setInterval(() => {
      attempts += 1;
      void apiFetch(`/payments/${paymentId}`)
        .then(async (res) => {
          if (!res.ok) return;
          const payment = (await res.json()) as { status: string };
          if (payment.status === "PAID") {
            setPhase({ kind: "idle" });
            router.refresh();
          } else if (payment.status === "FAILED") {
            setPhase({ kind: "failed" });
          }
        })
        .catch(() => undefined);
      if (attempts >= POLL_MAX_ATTEMPTS) clearInterval(interval);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase, router]);

  async function buy() {
    if (busy) return;
    setNotice(null);
    setPhase({ kind: "processing" });

    try {
      const res = await apiFetch("/checkout/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (res.status === 401) {
        setNotice("loginRequired");
        setPhase({ kind: "idle" });
        return;
      }
      if (res.status === 400 || res.status === 404) {
        setNotice("unavailable");
        setPhase({ kind: "idle" });
        return;
      }
      if (!res.ok) {
        setNotice("generic");
        setPhase({ kind: "idle" });
        return;
      }

      const data = (await res.json()) as {
        paymentUrl: string;
        paymentId: string;
      };
      if (data.paymentUrl.startsWith("stub://")) {
        setPhase({
          kind: "awaiting",
          paymentId: data.paymentId,
          paymentUrl: data.paymentUrl,
        });
      } else {
        window.location.href = data.paymentUrl;
      }
    } catch {
      setNotice("generic");
      setPhase({ kind: "idle" });
    }
  }

  async function simulate(status: "PAID" | "FAILED") {
    if (phase.kind !== "awaiting") return;
    setSimulating(true);
    try {
      const refId = phase.paymentUrl.replace(/^stub:\/\/pay\//, "");
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

  return (
    <div className="flex flex-col gap-2">
      {phase.kind === "failed" ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setPhase({ kind: "idle" })}
        >
          {tc("retry")}
        </Button>
      ) : (
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => void buy()}
        >
          {phase.kind === "processing" ? tco("processing") : label}
        </Button>
      )}

      {phase.kind === "failed" && (
        <p role="alert" className="text-sm text-red-400">
          {tco("failed")}
        </p>
      )}
      {notice === "generic" && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}
      {notice === "unavailable" && (
        <p className="text-sm text-white/60">{tco("soldOut")}</p>
      )}
      {notice === "loginRequired" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">{tco("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </div>
      )}

      {phase.kind === "awaiting" && (
        <div className="flex flex-col gap-2 border-t border-night-700 pt-2">
          <p className="animate-pulse text-sm text-white/70">
            {tco("pending")}
          </p>
          {isStub && (
            <div className="flex flex-col gap-2">
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
          )}
        </div>
      )}
    </div>
  );
}
