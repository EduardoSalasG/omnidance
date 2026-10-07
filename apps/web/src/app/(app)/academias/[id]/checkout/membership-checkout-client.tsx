"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, Segmented, Spinner } from "@/components/ui";
import { planDateFmt } from "@/components/academy/shared";
import { ManualPayPanel } from "./manual-pay-panel";
import type { MembershipQuote } from "./page";

type Phase =
  | { kind: "form" }
  | { kind: "processing" }
  | { kind: "awaiting"; paymentId: string; paymentUrl: string }
  // El polling se agotó sin webhook (~30s): el pago puede confirmar
  // igual - la vigencia aparece en la ficha de la academia al llegar.
  | { kind: "stillPending"; paymentId: string; paymentUrl: string }
  // needs_card: el usuario aún no salta a Flow - ve el interstitial que
  // explica que la tarjeta se registra en la página oficial de Flow.
  | { kind: "card_redirect"; registerUrl: string }
  | { kind: "activating" }
  | { kind: "failed" };

type Notice = "loginRequired" | "unavailable" | "generic" | null;

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s - mismo criterio que checkout-client
const SUB_POLL_MS = 1_500;
const SUB_POLL_ATTEMPTS = 3;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Checkout de membresía - paso de revisión antes del cobro (mismo
 * patrón que /eventos/[id]/checkout): qué plan, academia, vigencia
 * resultante y total real que Flow debita (modelo SaaS: la academia
 * paga solo la pasarela; el comprador paga el precio exacto del plan),
 * y elección pago único vs suscripción cuando el plan es recurrente.
 * Nunca se muestra un monto distinto al que se cobra.
 */
export function MembershipCheckoutClient({
  quote,
  mode,
}: {
  quote: MembershipQuote;
  /** "sub" activa la rama suscripción (searchParams.mode). */
  mode: "once" | "sub";
}) {
  const t = useTranslations("membershipCheckout");
  const tco = useTranslations("checkout");
  const ts = useTranslations("subscriptions");
  const tp = useTranslations("academy.planTypes");
  const tc = useTranslations("common");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [notice, setNotice] = useState<Notice>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [simulating, setSimulating] = useState(false);
  // El panel manual toma el control cuando el alumno elige un método
  // propio de la academia o tiene un intento AWAITING/PENDING vivo.
  const [manualActive, setManualActive] = useState(false);

  const isSub = mode === "sub";
  const busy =
    phase.kind === "processing" ||
    phase.kind === "awaiting" ||
    phase.kind === "stillPending" ||
    phase.kind === "activating" ||
    phase.kind === "card_redirect";
  const isStub =
    phase.kind === "awaiting" && phase.paymentUrl.startsWith("stub://");

  const academyHref = `/academias/${quote.academy.id}`;
  const checkoutHref = `${academyHref}/checkout?plan=${quote.plan.id}`;

  // Polling del pago (stub dev): al PAID vuelve a la ficha - el webhook
  // ya materializó el Enrollment y el badge cambia solo. Si se agota
  // sin respuesta, stillPending (mismo patrón que /checkout/return):
  // la confirmación puede llegar después por webhook.
  function startPolling(paymentId: string, paymentUrl: string) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      void apiFetch(`/payments/${paymentId}`)
        .then(async (res) => {
          if (!res.ok) return;
          const payment = (await res.json()) as { status: string };
          if (payment.status === "PAID") {
            clearInterval(interval);
            router.push(academyHref);
          } else if (payment.status === "FAILED") {
            clearInterval(interval);
            setPhase({ kind: "failed" });
          }
        })
        .catch(() => undefined);
      if (attempts >= POLL_MAX_ATTEMPTS) {
        clearInterval(interval);
        setPhase({ kind: "stillPending", paymentId, paymentUrl });
      }
    }, POLL_INTERVAL_MS);
  }

  async function buy() {
    if (busy) return;
    setNotice(null);
    setPhase({ kind: "processing" });
    try {
      const res = await apiFetch("/checkout/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: quote.plan.id }),
      });
      if (res.status === 401) {
        setNotice("loginRequired");
        setPhase({ kind: "form" });
        return;
      }
      if (res.status === 400 || res.status === 404) {
        setNotice("unavailable");
        setPhase({ kind: "form" });
        return;
      }
      if (!res.ok) {
        setNotice("generic");
        setPhase({ kind: "form" });
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
        startPolling(data.paymentId, data.paymentUrl);
      } else {
        window.location.href = data.paymentUrl;
      }
    } catch {
      setNotice("generic");
      setPhase({ kind: "form" });
    }
  }

  async function subscribe() {
    if (busy || !consent) return;
    setNotice(null);
    setSubError(null);
    setPhase({ kind: "processing" });
    try {
      const res = await apiFetch("/checkout/membership-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: quote.plan.id,
          acceptRecurring: true,
        }),
      });
      if (res.status === 401) {
        setNotice("loginRequired");
        setPhase({ kind: "form" });
        return;
      }
      if (res.status === 409) {
        router.push(academyHref);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        const msg =
          res.status < 500 &&
          typeof body?.message === "string" &&
          body.message.length > 0 &&
          body.message.length <= 200
            ? body.message
            : null;
        setSubError(msg ?? ts("error"));
        setPhase({ kind: "form" });
        return;
      }
      const data = (await res.json()) as
        | { kind: "needs_card"; registerUrl: string }
        | { kind: "subscribed"; subscriptionId: string };

      if (data.kind === "needs_card") {
        // No saltamos de inmediato: el usuario lee el interstitial y
        // decide cuándo ir a la página de Flow (contexto del salto).
        setPhase({ kind: "card_redirect", registerUrl: data.registerUrl });
        return;
      }

      setPhase({ kind: "activating" });
      for (let i = 0; i < SUB_POLL_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, SUB_POLL_MS));
        const poll = await apiFetch(
          `/subscriptions/${data.subscriptionId}`,
        ).catch(() => null);
        if (poll?.ok) {
          const sub = (await poll.json()) as { status: string };
          if (sub.status === "ACTIVE") break;
        }
      }
      router.push(`${academyHref}?sub=ok`);
    } catch {
      setSubError(ts("error"));
      setPhase({ kind: "form" });
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

  // Ya hay suscripción viva a este plan → no se ofrece compra; el
  // estado lo gestiona la ficha (SubscriptionManage).
  if (
    quote.subscription &&
    (quote.subscription.status === "ACTIVE" ||
      quote.subscription.status === "CANCEL_PENDING")
  ) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-ink/60">{t("alreadySubscribed")}</p>
        <Button href={academyHref} variant="secondary">
          {t("backToAcademy")}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Resumen de la orden: qué plan, en qué academia, qué cubre. */}
      <Card>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink/50">{quote.academy.name}</p>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{quote.plan.name}</h2>
            <Badge variant="outline" className="normal-case tracking-normal">
              {tp.has(quote.plan.type) ? tp(quote.plan.type) : quote.plan.type}
            </Badge>
          </div>
          {quote.plan.description.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink/70">
              {quote.plan.description.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          <p className="text-sm font-medium text-neon">
            {quote.vigenciaEndsAt
              ? t("vigenciaUntil", {
                  date: planDateFmt.format(new Date(quote.vigenciaEndsAt)),
                })
              : quote.plan.type === "SINGLE"
                ? t("vigenciaSingle")
                : quote.plan.classCount
                  ? t("vigenciaClasses", { count: quote.plan.classCount })
                  : quote.plan.periodDays
                    ? t("vigenciaPeriod", { days: quote.plan.periodDays })
                    : null}
          </p>
          {quote.currentEndsAt && (
            <p className="text-xs text-ink/50">
              {t("vigenciaExtends", {
                date: planDateFmt.format(new Date(quote.currentEndsAt)),
              })}
            </p>
          )}
        </div>
      </Card>

      {/* Elección pago único vs suscripción - solo planes recurrentes
          con pasarela real (stub no implementa SubscriptionProvider). */}
      {quote.recurring && quote.gateway === "FLOW" && (
        <Card>
          <h2 className="text-base font-semibold">{t("modeTitle")}</h2>
          <div className="mt-3">
            <Segmented
              ariaLabel={t("modeTitle")}
              active={isSub ? "sub" : "once"}
              innerClassName="grid w-full grid-cols-2"
              items={[
                { key: "once", href: checkoutHref, children: t("modeOnce") },
                {
                  key: "sub",
                  href: `${checkoutHref}&mode=sub`,
                  children: t("modeSub"),
                },
              ]}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink/50">
            {isSub
              ? t("modeSubHint", { period: ts(`period.${quote.plan.type}`) })
              : t("modeOnceHint")}
          </p>
        </Card>
      )}

      {/* Medio de pago: pasarela o método propio de la academia
          (spec academy-checkout-manual-pay). Solo pago único - la
          suscripción necesita la recurrencia de la pasarela. */}
      {!isSub && (
        <ManualPayPanel
          academyId={quote.academy.id}
          planId={quote.plan.id}
          planPrice={quote.totalClp}
          onBlockingChange={setManualActive}
        />
      )}

      {/* Breakdown - el total mostrado es EXACTAMENTE lo que se cobra. */}
      <Card>
        <dl className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <dt className="text-ink/70">{t("plan")}</dt>
            <dd>
              <PriceTag amount={quote.plan.price} />
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <dt className="text-base font-semibold">{tco("total")}</dt>
            <dd>
              <PriceTag amount={quote.totalClp} className="text-2xl" />
            </dd>
          </div>
        </dl>
      </Card>

      {/* Consentimiento recurrente: monto real + período + aviso previo
          al cobro + anticipación del registro de tarjeta en Flow. */}
      {isSub && (
        <Card>
          <p className="text-xs leading-relaxed text-ink/60">
            {ts("consent", {
              amount: clp.format(quote.totalClp),
              period: ts(`period.${quote.plan.type}`),
            })}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink/50">
            {t("cardNext")}
          </p>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-neon"
            />
            {ts("consentCheck")}
          </label>
        </Card>
      )}

      {/* Interstitial pre-Flow: el usuario ve a dónde va ANTES del salto
          de dominio (el disclaimer de tarjeta es el momento de mayor
          desconfianza del flujo). */}
      {phase.kind === "card_redirect" && (
        <Card>
          <h2 className="text-base font-semibold">{t("cardRedirectTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            {t("cardRedirectDesc")}
          </p>
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => {
              window.location.href = phase.registerUrl;
            }}
          >
            {t("cardRedirectCta")}
          </Button>
        </Card>
      )}

      {phase.kind === "activating" && (
        <p className="animate-pulse text-sm text-ink/70">
          {ts("activating")}
        </p>
      )}

      {phase.kind === "awaiting" && (
        <Card>
          <p className="animate-pulse text-sm text-ink/70">
            {tco("pending")}
          </p>
          {isStub && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wide text-ink/50">
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
        </Card>
      )}

      {/* Polling agotado sin webhook: el cobro puede confirmar igual -
          la vigencia aparece en la ficha de la academia al llegar. */}
      {phase.kind === "stillPending" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <Badge variant="muted">{tco("stillPendingTitle")}</Badge>
          <p role="status" className="text-sm text-ink/70">
            {tco("stillPendingDesc")}
          </p>
          <Button href={academyHref} className="w-full">
            {t("backToAcademy")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              startPolling(phase.paymentId, phase.paymentUrl);
              setPhase({
                kind: "awaiting",
                paymentId: phase.paymentId,
                paymentUrl: phase.paymentUrl,
              });
            }}
          >
            {tco("stillPendingRetry")}
          </Button>
        </Card>
      )}

      {phase.kind === "failed" ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setPhase({ kind: "form" })}
        >
          {tc("retry")}
        </Button>
      ) : (phase.kind === "form" || phase.kind === "processing") &&
        !manualActive ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={busy || (isSub && !consent)}
            onClick={() => void (isSub ? subscribe() : buy())}
          >
            {phase.kind === "processing" && <Spinner size="sm" />}
            {phase.kind === "processing"
              ? tco("processing")
              : isSub
                ? `${ts("subscribe")} · ${clp.format(quote.totalClp)}/${ts(`period.${quote.plan.type}`)}`
                : t("payTotal", { total: clp.format(quote.totalClp) })}
          </Button>
          <p className="text-center text-xs text-ink/40">
            {t("trustFlow")}
          </p>
        </div>
      ) : null}

      {phase.kind === "failed" && (
        <p role="alert" className="text-sm text-red-400">
          {tco("failed")}
        </p>
      )}
      {subError && (
        <p role="alert" className="text-sm text-red-400">
          {subError}
        </p>
      )}
      {notice === "generic" && (
        <p role="alert" className="text-sm text-red-400">
          {tc("error")}
        </p>
      )}
      {notice === "unavailable" && (
        <p role="alert" className="text-sm text-ink/60">
          {t("planUnavailable")}
        </p>
      )}
      {notice === "loginRequired" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink/70">{tco("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </div>
      )}
    </main>
  );
}
