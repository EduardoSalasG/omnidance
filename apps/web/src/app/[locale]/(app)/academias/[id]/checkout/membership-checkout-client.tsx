"use client";

import { useEffect, useState } from "react";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, Segmented, Spinner } from "@/components/ui";
import { planDateFmt } from "@/components/academy/shared";
import { ManualPayPanel } from "./manual-pay-panel";
import { OwnMethodClaim } from "@/components/checkout/own-method-claim";
import type { OwnMethod } from "@/components/checkout/own-method-picker";
import { showActionNotice } from "@/components/ui/action-notice";
import type { MembershipQuote } from "./page";
import { useRouter } from "@/i18n/navigation";
import { useNumFmt } from "@/lib/intl";

type Phase =
  | { kind: "form" }
  | { kind: "processing" }
  | { kind: "awaiting"; paymentId: string; paymentUrl: string }
  // El polling se agotó sin webhook (~30s): el pago puede confirmar
  // igual - la vigencia aparece en la ficha de la academia al llegar.
  | { kind: "stillPending"; paymentId: string; paymentUrl: string }
  | { kind: "activating" }
  // Alta manual (spec subscription-manual-transfer): sub PENDING_PAYMENT
  // + orden MANUAL PENDING - el alumno transfiere y sube el comprobante.
  | {
      kind: "transfer";
      paymentId: string;
      amount: number;
      currency: string;
      methods: OwnMethod[];
    }
  | { kind: "failed" };

/** Medio de cobro de la suscripción: tarjeta Flow (cargo automático)
    o transferencia validada por la academia cada ciclo. */
type PayVia = "CARD" | "TRANSFER";

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s - mismo criterio que checkout-client
const SUB_POLL_MS = 1_500;
const SUB_POLL_ATTEMPTS = 3;

;

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
  const clp = useNumFmt({
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
  const locale = useLocale();
  const t = useTranslations("membershipCheckout");
  const tco = useTranslations("checkout");
  const ts = useTranslations("subscriptions");
  const tp = useTranslations("academy.planTypes");
  const tc = useTranslations("common");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [consent, setConsent] = useState(false);
  const [simulating, setSimulating] = useState(false);
  // El panel manual toma el control cuando el alumno elige un método
  // propio de la academia o tiene un intento AWAITING/PENDING vivo.
  const [manualActive, setManualActive] = useState(false);
  // Vía de cobro de la suscripción (spec subscription-manual-transfer):
  // tarjeta (Flow) o transferencia. Los métodos TRANSFER de la academia
  // se traen solo en modo sub - sin ellos la vía manual no se ofrece.
  const [payVia, setPayVia] = useState<PayVia>("CARD");
  const [transferMethods, setTransferMethods] = useState<OwnMethod[] | null>(
    null,
  );
  // Cuenta destino elegida cuando la academia publica más de una.
  const [methodId, setMethodId] = useState<string | null>(null);

  const isSub = mode === "sub";
  const busy =
    phase.kind === "processing" ||
    phase.kind === "awaiting" ||
    phase.kind === "stillPending" ||
    phase.kind === "activating";
  const isStub =
    phase.kind === "awaiting" && phase.paymentUrl.startsWith("stub://");

  // BYO (spec academy-byo-collections): el pago único por pasarela
  // existe solo si la academia trajo su cuenta y no está en bloqueo de
  // cobranza - sin él el checkout online es solo claim manual. Las
  // subs CARD siguen en our-Flow interim (no dependen del BYO).
  const gatewayAvailable = quote.gatewayAvailable !== false;
  const gatewayNote = quote.collectionsBlocked
    ? tco("academyCollectionsBlocked")
    : tco("academyNoGateway");

  const academyHref = `/academias/${quote.academy.id}`;
  const checkoutHref = `${academyHref}/checkout?plan=${quote.plan.id}`;

  // Métodos TRANSFER de la academia para la vía manual de la
  // suscripción (spec subscription-manual-transfer): mismo endpoint
  // que el ManualPayPanel del pago único. Fallo de red = sin opción
  // transferencia (la tarjeta sigue disponible).
  useEffect(() => {
    if (!isSub) return;
    let cancelled = false;
    void apiFetch(`/academies/${quote.academy.id}/payment-methods`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const rows = (await res.json()) as {
          id: string;
          type: string;
          label: string;
          details: Record<string, string>;
        }[];
        const transfers = rows
          .filter((m) => m.type === "TRANSFER")
          .map((m) => ({
            id: m.id,
            type: "TRANSFER",
            label: m.label,
            details: m.details,
          }));
        setTransferMethods(transfers);
        setMethodId(transfers.length === 1 ? transfers[0].id : null);
      })
      .catch(() => {
        if (!cancelled) setTransferMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSub, quote.academy.id]);

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
    setPhase({ kind: "processing" });
    try {
      const res = await apiFetch("/checkout/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: quote.plan.id }),
      });
      if (res.status === 401) {
        // Mismo aviso con CTA que private-checkout (patrón unificado).
        showActionNotice({
          text: tco("loginRequired"),
          error: true,
          action: { href: "/login", label: tc("login") },
        });
        setPhase({ kind: "form" });
        return;
      }
      if (res.status === 400 || res.status === 404) {
        // BYO: código estable en `error` (spec academy-byo-collections)
        // - copy honesto según si es "sin pasarela" o "cobranza en
        // pausa"; el resto de 400/404 sigue en planUnavailable.
        const body = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        const code = typeof body?.error === "string" ? body.error : "";
        showActionNotice({
          text:
            code === "academy.no_gateway"
              ? tco("academyNoGateway")
              : code === "academy.collections_blocked"
                ? tco("academyCollectionsBlocked")
                : t("planUnavailable"),
          error: true,
        });
        setPhase({ kind: "form" });
        return;
      }
      if (!res.ok) {
        showActionNotice({ text: tc("error"), error: true });
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
      showActionNotice({ text: tc("error"), error: true });
      setPhase({ kind: "form" });
    }
  }

  async function subscribe() {
    if (busy || !consent) return;
    setPhase({ kind: "processing" });
    try {
      const res = await apiFetch("/checkout/membership-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: quote.plan.id,
          acceptRecurring: true,
          paymentMethod: payVia,
          // Solo la vía manual: el label del método elegido queda
          // snapshot en la orden (mismo dato que ve la academia).
          ...(payVia === "TRANSFER" && methodId ? { methodId } : {}),
        }),
      });
      if (res.status === 401) {
        showActionNotice({
          text: tco("loginRequired"),
          error: true,
          action: { href: "/login", label: tc("login") },
        });
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
        showActionNotice({ text: msg ?? ts("error"), error: true });
        setPhase({ kind: "form" });
        return;
      }
      const data = (await res.json()) as
        | { kind: "needs_card"; registerUrl: string }
        | { kind: "subscribed"; subscriptionId: string }
        | {
            // Alta manual por transferencia (spec
            // subscription-manual-transfer): orden MANUAL PENDING +
            // métodos TRANSFER activos de la academia.
            kind: "pending_payment";
            paymentId: string;
            amount: number;
            currency: string;
            transfer: { methods: OwnMethod[] };
          };

      if (data.kind === "pending_payment") {
        setPhase({
          kind: "transfer",
          paymentId: data.paymentId,
          amount: data.amount,
          currency: data.currency,
          methods: data.transfer.methods,
        });
        return;
      }

      if (data.kind === "needs_card") {
        // Salto directo al disclaimer de Flow (spec
        // sub-checkout-direct-redirect) - mismo patrón que
        // SubscriptionManage.resumeCardRegistration.
        window.location.href = data.registerUrl;
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
      showActionNotice({ text: ts("error"), error: true });
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6">
      <h1 className="text-2xl font-bold">
        {quote.plan.type === "SINGLE" ? t("titleSingle") : t("title")}
      </h1>

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
                  date: planDateFmt(locale).format(new Date(quote.vigenciaEndsAt)),
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
                date: planDateFmt(locale).format(new Date(quote.currentEndsAt)),
              })}
            </p>
          )}
        </div>
      </Card>

      {/* Elección pago único vs suscripción - solo planes recurrentes
          cuando el provider de la moneda del plan tiene motor de
          suscripciones (spec multipais-currency: la quote lo resuelve
          por currency, no por name). */}
      {quote.recurring && quote.supportsSubscription && (
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

      {/* Vía de cobro de la suscripción (spec subscription-manual-
          transfer): tarjeta con cargo automático (Flow) o transferencia
          que la academia valida por comprobante cada ciclo. Solo se
          ofrece cuando la academia publica métodos TRANSFER. */}
      {isSub &&
        phase.kind !== "transfer" &&
        (transferMethods?.length ?? 0) > 0 && (
          <Card>
            <h2 className="text-base font-semibold">{t("payViaTitle")}</h2>
            <div
              role="radiogroup"
              aria-label={t("payViaTitle")}
              className="mt-3 flex flex-col gap-2"
            >
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm ${
                  payVia === "CARD"
                    ? "border-neon/60 bg-neon/10"
                    : "border-line bg-elevated"
                }`}
              >
                <input
                  type="radio"
                  name="subPayVia"
                  checked={payVia === "CARD"}
                  disabled={busy}
                  onChange={() => setPayVia("CARD")}
                  className="h-4 w-4 accent-neon"
                />
                {t("payViaCard")}
              </label>
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm ${
                  payVia === "TRANSFER"
                    ? "border-neon/60 bg-neon/10"
                    : "border-line bg-elevated"
                }`}
              >
                <input
                  type="radio"
                  name="subPayVia"
                  checked={payVia === "TRANSFER"}
                  disabled={busy}
                  onChange={() => setPayVia("TRANSFER")}
                  className="h-4 w-4 accent-neon"
                />
                {t("payViaTransfer")}
              </label>
            </div>
            {payVia === "TRANSFER" && (
              <p className="mt-3 text-xs leading-relaxed text-ink/50">
                {t("payViaTransferHint", {
                  period: ts(`period.${quote.plan.type}`),
                })}
              </p>
            )}
          </Card>
        )}

      {/* Promo de la academia vigente (spec member-promos): el descuento
          se ve antes del breakdown - precio tachado + oferta + expiración. */}
      {quote.promo && (
        <Card>
          <div className="flex flex-col gap-1">
            <Badge variant="neon">
              {t("promoBadge", { name: quote.promo.name })}
            </Badge>
            <p className="text-sm text-ink/70">
              {quote.promo.discountType === "PERCENT"
                ? t("promoOff", { pct: quote.promo.percentOff ?? 0 })
                : t("promoOffFixed", {
                    amount: clp.format(quote.promo.amountOffClp ?? 0),
                  })}
              {" · "}
              {t("promoUntil", {
                date: planDateFmt(locale).format(new Date(quote.promo.validUntil)),
              })}
            </p>
            {quote.promo.cyclesLeft != null && (
              <p className="text-xs text-ink/50">
                {t("promoCyclesLeft", { count: quote.promo.cyclesLeft })}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Breakdown - el total mostrado es EXACTAMENTE lo que se cobra. */}
      <Card>
        <dl className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <dt className="text-ink/70">{t("plan")}</dt>
            <dd>
              <PriceTag
                amount={quote.plan.price}
              currency={quote.currency}
                className={quote.promo ? "opacity-60 line-through" : undefined}
              />
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <dt className="text-base font-semibold">{tco("total")}</dt>
            <dd>
              <PriceTag amount={quote.totalClp} currency={quote.currency} className="text-2xl" />
            </dd>
          </div>
        </dl>
      </Card>

      {/* Consentimiento: con tarjeta es el aviso de cargo automático
          recurrente; con transferencia es el compromiso de pagar cada
          ciclo y subir el comprobante (spec subscription-manual-transfer). */}
      {isSub && phase.kind !== "transfer" && (
        <Card>
          <p className="text-xs leading-relaxed text-ink/60">
            {payVia === "TRANSFER"
              ? ts("consentTransfer", {
                  amount: formatMoney(quote.totalClp, quote.currency, locale),
                  period: ts(`period.${quote.plan.type}`),
                })
              : ts("consent", {
                  amount: formatMoney(quote.totalClp, quote.currency, locale),
                  period: ts(`period.${quote.plan.type}`),
                })}
          </p>
          {payVia === "CARD" && (
            <p className="mt-2 text-xs leading-relaxed text-ink/50">
              {t("cardNext")}
            </p>
          )}
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-neon"
            />
            {payVia === "TRANSFER"
              ? ts("consentCheckTransfer")
              : ts("consentCheck")}
          </label>
        </Card>
      )}

      {/* Alta manual: la orden quedó creada - datos bancarios + upload
          del comprobante (mismo OwnMethodClaim del checkout manual; la
          academia lo valida en su cola de order-claims). */}
      {phase.kind === "transfer" && (
        <>
          {phase.methods.length > 1 && (
            <Card>
              <h2 className="text-base font-semibold">
                {t("transferPickAccount")}
              </h2>
              <div
                role="radiogroup"
                aria-label={t("transferPickAccount")}
                className="mt-3 flex flex-col gap-2"
              >
                {phase.methods.map((m) => (
                  <label
                    key={m.id}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm ${
                      (methodId ?? phase.methods[0].id) === m.id
                        ? "border-neon/60 bg-neon/10"
                        : "border-line bg-elevated"
                    }`}
                  >
                    <input
                      type="radio"
                      name="transferAccount"
                      checked={(methodId ?? phase.methods[0].id) === m.id}
                      onChange={() => setMethodId(m.id)}
                      className="h-4 w-4 accent-neon"
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </Card>
          )}
          {/* La academia pudo haber quitado sus métodos entre el
              checkout y el alta: método sintético sin datos (el claim
              va sin methodId y la academia confirma los datos). */}
          <OwnMethodClaim
            paymentId={phase.paymentId}
            method={
              phase.methods.find(
                (m) => m.id === (methodId ?? phase.methods[0]?.id),
              ) ??
              phase.methods[0] ?? {
                id: "",
                type: "TRANSFER",
                label: t("payViaTransfer"),
                details: {},
              }
            }
            variant="academy"
            onPaid={() => {
              showActionNotice({ text: ts("activated") });
              router.push(academyHref);
            }}
            returnHref={academyHref}
          />
        </>
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

      {/* Medio de pago: pasarela o método propio de la academia
          (spec academy-checkout-manual-pay). Solo pago único - la
          suscripción necesita la recurrencia de la pasarela. Va al
          FINAL del checkout: su CTA (continuar/enviar comprobante) es
          el botón de acción y debe quedar en la posición del pagar,
          no a media página. Sin cuenta BYO la opción tarjeta no se
          ofrece y el método propio es la única vía. */}
      {!isSub && (
        <ManualPayPanel
          academyId={quote.academy.id}
          planId={quote.plan.id}
          planPrice={quote.totalClp}
          onBlockingChange={setManualActive}
          returnHref={academyHref}
          gatewayAvailable={gatewayAvailable}
          gatewayNote={gatewayNote}
        />
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
        !manualActive &&
        // Sin pasarela BYO el pago único por tarjeta no existe: el
        // CTA queda oculto y el panel manual es la única acción (la
        // suscripción CARD sigue disponible - no depende del BYO).
        (isSub || gatewayAvailable) ? (
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
                ? payVia === "TRANSFER"
                  ? `${t("payViaTransfer")} · ${formatMoney(quote.totalClp, quote.currency, locale)}/${ts(`period.${quote.plan.type}`)}`
                  : `${ts("subscribe")} · ${formatMoney(quote.totalClp, quote.currency, locale)}/${ts(`period.${quote.plan.type}`)}`
                : t("payTotal", { total: formatMoney(quote.totalClp, quote.currency, locale) })}
          </Button>
          <p className="text-center text-xs text-ink/40">
            {isSub && payVia === "TRANSFER"
              ? t("trustTransfer")
              : t("trustFlow")}
          </p>
        </div>
      ) : null}

      {phase.kind === "failed" && (
        <p role="alert" className="text-sm text-red-400">
          {tco("failed")}
        </p>
      )}
    </main>
  );
}
