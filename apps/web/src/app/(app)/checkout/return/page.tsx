"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, Spinner } from "@/components/ui";

type PaymentStatus = "PENDING" | "PAID" | "FAILED";
type Phase =
  | { kind: "verifying" }
  | { kind: "paid"; orderType: string; amount: number }
  | { kind: "failed" }
  | { kind: "stillPending" }
  | { kind: "unauth" }
  | { kind: "subOk" }
  | { kind: "subError" }
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
  const ts = useTranslations("subscriptions");
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("paymentId");
  // `sub` llega si el retorno de suscripción cae acá en vez de la ficha
  // (el redirect real de customer-return va a /academias/:id?sub=…).
  const sub = searchParams.get("sub");
  const [phase, setPhase] = useState<Phase>({ kind: "verifying" });
  // orderType llega con el primer poll aunque siga PENDING — los CTAs
  // de failed/stillPending/error lo usan para mandar al destino correcto
  // (MEMBERSHIP → academias, no a eventos).
  const [orderType, setOrderType] = useState<string | null>(null);
  // TICKET: el id del evento — habilita "intentar de nuevo" → checkout.
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (sub === "ok") {
      setPhase({ kind: "subOk" });
      return;
    }
    if (sub === "error") {
      setPhase({ kind: "subError" });
      return;
    }
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
          eventId: string | null;
        };
        setOrderType(payment.orderType);
        setEventId(payment.eventId ?? null);
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
  }, [paymentId, sub]);

  return (
    <main
      aria-live="polite"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6 text-center"
    >
      {phase.kind === "verifying" && (
        <>
          <Spinner size="lg" />
          <h1 className="text-xl font-bold">{t("returnVerifying")}</h1>
          <p className="text-sm text-white/60">{t("pending")}</p>
        </>
      )}

      {phase.kind === "paid" && (
        <>
          <Badge variant="neon">{t("success")}</Badge>
          <h1 className="text-2xl font-bold">{t("returnPaidTitle")}</h1>
          <PriceTag amount={phase.amount} className="text-lg" />
          {/* MEMBERSHIP → Mis academias (la vigencia nueva); WORKSHOP →
              Mis clases (ahí aparece la reserva del asiento comprado);
              PRIVATE → reservadas de /clases (la particular queda "por
              agendar" hasta que el owner asigne fecha e instructor). */}
          <Button
            href={
              phase.orderType === "MEMBERSHIP"
                ? "/academias"
                : phase.orderType === "WORKSHOP"
                  ? "/clases"
                  : phase.orderType === "PRIVATE"
                    ? "/clases?scope=reservadas"
                    : "/eventos?view=mios"
            }
            size="lg"
            className="w-full"
          >
            {phase.orderType === "MEMBERSHIP"
              ? t("returnToAcademies")
              : phase.orderType === "WORKSHOP"
                ? t("returnToClasses")
                : phase.orderType === "PRIVATE"
                  ? t("returnToPrivate")
                  : tw("title")}
          </Button>
          <Link
            href="/eventos"
            className="inline-flex min-h-11 items-center text-sm text-white/60 underline-offset-4 hover:underline"
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
          {/* TICKET: reintento directo al checkout del evento — la orden
              fallida no cobró ni reservó cupo. */}
          {orderType === "TICKET" && eventId && (
            <Button
              href={`/eventos/${eventId}/checkout`}
              size="lg"
              className="w-full"
            >
              {t("tryAgain")}
            </Button>
          )}
          <Button
            href={
              orderType === "MEMBERSHIP"
                ? "/academias"
                : orderType === "WORKSHOP"
                  ? "/clases"
                  : orderType === "PRIVATE"
                    ? "/clases?scope=reservadas"
                    : "/eventos"
            }
            variant={
              orderType === "TICKET" && eventId ? "secondary" : "primary"
            }
            size="lg"
            className="w-full"
          >
            {orderType === "MEMBERSHIP"
              ? t("returnToAcademies")
              : orderType === "WORKSHOP"
                ? t("returnToClasses")
                : orderType === "PRIVATE"
                  ? t("returnToPrivate")
                  : t("returnToEvents")}
          </Button>
        </>
      )}

      {/* Retorno del disclaimer de tarjeta de Flow: la suscripción ya
          quedó creada — el primer cobro se procesa/reconcilia en la API. */}
      {phase.kind === "subOk" && (
        <>
          <Badge variant="neon">{ts("activated")}</Badge>
          <h1 className="text-xl font-bold">{ts("subOk")}</h1>
          <Button href="/academias" size="lg" className="w-full">
            {ts("returnToAcademies")}
          </Button>
        </>
      )}

      {phase.kind === "subError" && (
        <>
          <Badge variant="live">{tc("error")}</Badge>
          <h1 className="text-xl font-bold">{ts("subError")}</h1>
          <Button href="/academias" size="lg" className="w-full">
            {ts("returnToAcademies")}
          </Button>
        </>
      )}

      {phase.kind === "stillPending" && (
        <>
          <Badge variant="muted">{t("pending")}</Badge>
          <h1 className="text-xl font-bold">{t("returnPendingTitle")}</h1>
          <p className="text-sm text-white/60">{t("returnPendingDesc")}</p>
          <Button
            href={
              orderType === "MEMBERSHIP"
                ? "/academias"
                : orderType === "WORKSHOP"
                  ? "/clases"
                  : orderType === "PRIVATE"
                    ? "/clases?scope=reservadas"
                    : "/eventos?view=mios"
            }
            size="lg"
            className="w-full"
          >
            {orderType === "MEMBERSHIP"
              ? t("returnToAcademies")
              : orderType === "WORKSHOP"
                ? t("returnToClasses")
                : orderType === "PRIVATE"
                  ? t("returnToPrivate")
                  : tw("title")}
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
          <Button
            href={
              orderType === "MEMBERSHIP"
                ? "/academias"
                : orderType === "WORKSHOP"
                  ? "/clases"
                  : orderType === "PRIVATE"
                    ? "/clases?scope=reservadas"
                    : "/eventos"
            }
            size="lg"
            className="w-full"
          >
            {orderType === "MEMBERSHIP"
              ? t("returnToAcademies")
              : orderType === "WORKSHOP"
                ? t("returnToClasses")
                : orderType === "PRIVATE"
                  ? t("returnToPrivate")
                  : t("returnToEvents")}
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
