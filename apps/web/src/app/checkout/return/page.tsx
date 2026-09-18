"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag } from "@/components/ui";

type PaymentStatus = "PENDING" | "PAID" | "FAILED";
type Phase =
  | { kind: "verifying" }
  | { kind: "paid"; orderType: string; amount: number }
  | { kind: "failed" }
  | { kind: "stillPending" }
  | { kind: "unauth" }
  | { kind: "error" };

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s — el webhook confirma en paralelo

/**
 * Retorno del gateway de pago (Flow urlReturn → /checkout/return?paymentId=).
 * La confirmación real llega por webhook — aquí solo sondeamos el estado.
 */
function CheckoutReturn() {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const tw = useTranslations("wallet");
  const paymentId = useSearchParams().get("paymentId");
  const [phase, setPhase] = useState<Phase>({ kind: "verifying" });

  useEffect(() => {
    if (!paymentId) {
      setPhase({ kind: "error" });
      return;
    }
    let attempts = 0;
    let stopped = false;

    const tick = async () => {
      try {
        const res = await apiFetch(`/payments/${paymentId}`);
        if (stopped) return;
        if (res.status === 401) {
          setPhase({ kind: "unauth" });
          return;
        }
        if (!res.ok) {
          setPhase({ kind: "error" });
          return;
        }
        const payment = (await res.json()) as {
          status: PaymentStatus;
          orderType: string;
          amount: number;
        };
        if (payment.status === "PAID") {
          setPhase({
            kind: "paid",
            orderType: payment.orderType,
            amount: payment.amount,
          });
          return;
        }
        if (payment.status === "FAILED") {
          setPhase({ kind: "failed" });
          return;
        }
        attempts += 1;
        if (attempts >= POLL_MAX_ATTEMPTS) {
          setPhase({ kind: "stillPending" });
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (!stopped) setPhase({ kind: "error" });
      }
    };

    void tick();
    return () => {
      stopped = true;
    };
  }, [paymentId]);

  return (
    <main
      aria-live="polite"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 p-6 text-center"
    >
      {phase.kind === "verifying" && (
        <>
          <p
            aria-hidden
            className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-neon motion-reduce:animate-none"
          />
          <h1 className="text-xl font-bold">{t("returnVerifying")}</h1>
          <p className="text-sm text-white/60">{t("pending")}</p>
        </>
      )}

      {phase.kind === "paid" && (
        <>
          <Badge variant="neon">{t("success")}</Badge>
          <h1 className="text-2xl font-bold">{t("returnPaidTitle")}</h1>
          <PriceTag amount={phase.amount} className="text-lg" />
          <Button href="/entradas" size="lg" className="w-full">
            {tw("title")}
          </Button>
          <Link
            href="/eventos"
            className="min-h-11 text-sm text-white/60 underline-offset-4 hover:underline"
          >
            {t("returnToEvents")}
          </Link>
        </>
      )}

      {phase.kind === "failed" && (
        <>
          <Badge variant="live">{t("failed")}</Badge>
          <h1 className="text-2xl font-bold">{t("returnFailedTitle")}</h1>
          <p className="text-sm text-white/60">{t("returnFailedDesc")}</p>
          <Button href="/eventos" size="lg" className="w-full">
            {t("returnToEvents")}
          </Button>
        </>
      )}

      {phase.kind === "stillPending" && (
        <>
          <Badge variant="muted">{t("pending")}</Badge>
          <h1 className="text-xl font-bold">{t("returnPendingTitle")}</h1>
          <p className="text-sm text-white/60">{t("returnPendingDesc")}</p>
          <Button href="/entradas" size="lg" className="w-full">
            {tw("title")}
          </Button>
        </>
      )}

      {phase.kind === "unauth" && (
        <Card className="flex w-full flex-col items-center gap-4">
          <p className="text-white/70">{t("loginRequired")}</p>
          <Button href="/login" size="lg" className="w-full">
            {tc("login")}
          </Button>
        </Card>
      )}

      {phase.kind === "error" && (
        <>
          <Badge variant="live">{tc("error")}</Badge>
          <h1 className="text-xl font-bold">{t("returnErrorTitle")}</h1>
          <Button href="/eventos" size="lg" className="w-full">
            {t("returnToEvents")}
          </Button>
        </>
      )}
    </main>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense>
      <CheckoutReturn />
    </Suspense>
  );
}
