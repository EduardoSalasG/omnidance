"use client";

import { useState } from "react";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, PriceTag, Spinner } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { ManualPayPanel } from "../manual-pay-panel";
import type { PrivateClassQuote } from "./page";
import { useRouter } from "@/i18n/navigation";

type Phase =
  | { kind: "form" }
  | { kind: "processing" }
  // Solo el stub se queda en "awaiting": con pasarela real ya saltamos
  // a paymentUrl y el retorno lo resuelve /checkout/return.
  | { kind: "awaiting"; paymentId: string; paymentUrl: string };

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s, mismo criterio que checkout-client

// La particular no declara moneda en la entidad: el cargo es CLP
// (mismo default que usa la API al resolver la orden PRIVATE).
const CURRENCY = "CLP";

/**
 * Checkout de clase particular (spec private-class-checkout): misma
 * revisión de orden que el checkout de membresía (qué producto, en qué
 * academia, total real que la pasarela cobra) y medio de pago
 * (pasarela o método propio de la academia con claim AWAITING +
 * comprobante). Sin vigencia, suscripción ni promo: el pago único
 * materializa la PrivateLesson "por asignar": la academia coordina
 * fecha e instructor después.
 */
export function PrivateCheckoutClient({
  quote,
}: {
  quote: PrivateClassQuote;
}) {
  const locale = useLocale();
  const t = useTranslations("privateCheckout");
  const tm = useTranslations("membershipCheckout");
  const tco = useTranslations("checkout");
  const tc = useTranslations("common");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [simulating, setSimulating] = useState(false);
  // El panel manual toma el control cuando el alumno elige un método
  // propio de la academia o tiene un intento AWAITING/PENDING vivo.
  const [manualActive, setManualActive] = useState(false);

  const busy = phase.kind === "processing" || phase.kind === "awaiting";

  const academyHref = `/academias/${quote.academy.id}`;

  // Polling del pago (stub dev): al terminal o si se agota el tiempo,
  // /checkout/return renderiza el estado real, la misma pantalla que
  // llega desde la pasarela (patrón del botón inline que reemplaza).
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

  async function buy() {
    if (busy) return;
    setPhase({ kind: "processing" });
    try {
      const res = await apiFetch("/checkout/private-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ academyId: quote.academy.id }),
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
      if (res.status === 400 || res.status === 404) {
        showActionNotice({ text: t("unavailable"), error: true });
        setPhase({ kind: "form" });
        return;
      }
      if (!res.ok) {
        showActionNotice({ text: tc("error"), error: true });
        setPhase({ kind: "form" });
        return;
      }
      const data = (await res.json()) as {
        paymentUrl?: string;
        paymentId?: string;
      };
      if (!data.paymentUrl || !data.paymentId) {
        showActionNotice({ text: tc("error"), error: true });
        setPhase({ kind: "form" });
        return;
      }
      if (data.paymentUrl.startsWith("stub://")) {
        setPhase({
          kind: "awaiting",
          paymentId: data.paymentId,
          paymentUrl: data.paymentUrl,
        });
        startPolling(data.paymentId);
      } else {
        window.location.assign(data.paymentUrl);
      }
    } catch {
      showActionNotice({ text: tc("error"), error: true });
      setPhase({ kind: "form" });
    }
  }

  // Dev: el webhook resuelve el pago por refId (stub://pay/<refId>).
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Resumen de la orden: qué producto, en qué academia. La
          "vigencia" de la particular es la coordinación post-pago:
          el instructor y la fecha los asigna la academia. */}
      <Card>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink/50">{quote.academy.name}</p>
          <h2 className="text-lg font-semibold">{t("product")}</h2>
          <p className="text-sm font-medium text-neon">
            {t("vigenciaHint")}
          </p>
        </div>
      </Card>

      {/* Breakdown: el total mostrado es EXACTAMENTE lo que se cobra. */}
      <Card>
        <dl className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <dt className="text-ink/70">{t("product")}</dt>
            <dd>
              <PriceTag amount={quote.listPrice} currency={CURRENCY} />
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <dt className="text-base font-semibold">{tco("total")}</dt>
            <dd>
              <PriceTag amount={quote.total} currency={CURRENCY} className="text-2xl" />
            </dd>
          </div>
        </dl>
      </Card>

      {phase.kind === "awaiting" && (
        <Card>
          <p className="animate-pulse text-sm text-ink/70">
            {tco("pending")}
          </p>
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
        </Card>
      )}

      {/* Medio de pago: pasarela o método propio de la academia
          (spec academy-checkout-manual-pay). Va al FINAL del checkout:
          su CTA (continuar/enviar comprobante) es el botón de acción
          y debe quedar en la posición del pagar, no a media página.
          Tras enviar el comprobante el alumno vuelve a la ficha con
          el aviso global. */}
      <ManualPayPanel
        academyId={quote.academy.id}
        privateClass
        planPrice={quote.total}
        returnHref={academyHref}
        onBlockingChange={setManualActive}
      />

      {(phase.kind === "form" || phase.kind === "processing") &&
        !manualActive && (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => void buy()}
            >
              {phase.kind === "processing" && <Spinner size="sm" />}
              {phase.kind === "processing"
                ? tco("processing")
                : tm("payTotal", {
                    total: formatMoney(quote.total, CURRENCY, locale),
                  })}
            </Button>
            <p className="text-center text-xs text-ink/40">
              {tm("trustFlow")}
            </p>
          </div>
        )}
    </main>
  );
}
