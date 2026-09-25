"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Spinner } from "@/components/ui";

type Phase =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "awaiting"; paymentId: string; paymentUrl: string }
  | { kind: "failed" };

type Notice = "loginRequired" | "unavailable" | "generic" | null;

// Fase del flujo de suscripción (independiente del pago único):
// idle → processing → needs_card (redirect a Flow) | activating
// (subscribed: el primer cobro ya fue cargado; sondeo corto a
// GET /subscriptions/:id hasta ver ACTIVE y luego router.refresh()).
type SubPhase = "idle" | "processing" | "activating";

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s — mismo criterio que checkout-client

// PlanType recurrente → suscribible vía /checkout/membership-subscription
// (espejo de INTERVAL_COUNT en subscriptions.service.ts).
const RECURRING_TYPES = new Set(["MONTHLY", "QUARTERLY", "SEMIANNUAL"]);
const SUB_POLL_MS = 1_500;
const SUB_POLL_ATTEMPTS = 3;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export type PlanPurchaseCtaProps = {
  /** MembershipPlan.id — requerido por POST /checkout/membership. */
  planId: string;
  /** Texto del CTA ("Comprar" / "Extender vigencia" si ya es el plan activo). */
  label: string;
  /** PlanType — si es recurrente se ofrece también "Suscribirme". */
  planType?: string;
  /** Monto REAL que Flow debitará cada período (precio + cargo de
      servicio) — lo resuelve el caller vía /params/public. Si no se
      puede determinar, el bloque de suscripción no se muestra (el
      aviso legal nunca debe declarar un monto incorrecto). */
  recurringAmount?: number;
};

/**
 * Compra de plan de academia: POST /checkout/membership {planId} →
 * {paymentUrl, paymentId}. Gateway real → redirect; stub:// (dev) →
 * polling + botones de simulación, mismo patrón que SeriesPassCta.
 * Al PAID el webhook ya materializó el Enrollment — router.refresh()
 * repinta la ficha con el badge "Plan activo".
 */
export function PlanPurchaseCta({
  planId,
  label,
  planType,
  recurringAmount,
}: PlanPurchaseCtaProps) {
  const tc = useTranslations("common");
  const tco = useTranslations("checkout");
  const ts = useTranslations("subscriptions");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<Notice>(null);
  const [simulating, setSimulating] = useState(false);

  // Opción suscripción (solo planes recurrentes): el bloque de
  // consentimiento se despliega con "Suscribirme" y el CTA queda
  // deshabilitado hasta marcar el checkbox.
  const isRecurring = planType != null && RECURRING_TYPES.has(planType);
  const [subOpen, setSubOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [subPhase, setSubPhase] = useState<SubPhase>("idle");
  // Error propio del flujo de suscripción (mensaje legible de la API si
  // viene como string, o la key genérica subscriptions.error) — nunca
  // reutilizar los notices de tickets ("soldOut" no aplica acá).
  const [subError, setSubError] = useState<string | null>(null);

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

  /**
   * Suscripción recurrente: POST /checkout/membership-subscription con
   * consentimiento explícito (acceptRecurring — el aviso legal ya se
   * mostró y el checkbox quedó marcado). Respuestas:
   *  - needs_card → registerUrl del disclaimer de Flow (redirect; el
   *    retorno entra por POST /payments/flow/customer-return → 303 a la
   *    ficha con ?sub=ok|error);
   *  - subscribed → Flow ya cobró el primer período; se sondea
   *    GET /subscriptions/:id unos segundos hasta ver ACTIVE y se
   *    refresca (si sigue ACTIVATING la ficha misma muestra el estado).
   * 409 (ya existe una sub viva del plan o está siendo procesada) →
   * refresh directo: la ficha repinta con SubscriptionManage.
   */
  async function subscribe() {
    if (subPhase !== "idle" || !consent) return;
    setNotice(null);
    setSubError(null);
    setSubPhase("processing");

    try {
      const res = await apiFetch("/checkout/membership-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, acceptRecurring: true }),
      });

      if (res.status === 401) {
        setNotice("loginRequired");
        setSubPhase("idle");
        return;
      }
      if (res.status === 409) {
        setSubPhase("idle");
        router.refresh();
        return;
      }
      if (!res.ok) {
        // Errores propios de suscripción (400: plan no admite cobro
        // recurrente / falta email / gateway sin soporte; 404: plan
        // inexistente; etc.). Si la API devuelve `message` legible se
        // muestra tal cual; si no, la key genérica subscriptions.error.
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
        setSubPhase("idle");
        return;
      }

      const data = (await res.json()) as
        | { kind: "needs_card"; registerUrl: string; subscriptionId: string }
        | { kind: "subscribed"; subscriptionId: string };

      if (data.kind === "needs_card") {
        window.location.href = data.registerUrl;
        return;
      }

      setSubPhase("activating");
      for (let i = 0; i < SUB_POLL_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, SUB_POLL_MS));
        const poll = await apiFetch(`/subscriptions/${data.subscriptionId}`).catch(
          () => null,
        );
        if (poll?.ok) {
          const sub = (await poll.json()) as { status: string };
          if (sub.status === "ACTIVE") break;
        }
      }
      router.refresh();
      setSubPhase("idle");
      setSubOpen(false);
      setConsent(false);
    } catch {
      setSubError(ts("error"));
      setSubPhase("idle");
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
          disabled={busy || subPhase !== "idle"}
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

      {/* Opción suscripción (planes recurrentes con monto conocido —
          el aviso legal debe declarar el total real que Flow debitará:
          precio + cargo de servicio). "Suscribirme" despliega el aviso
          de cobro automático + checkbox de consentimiento; el CTA queda
          deshabilitado hasta marcarlo. */}
      {isRecurring && recurringAmount != null && (
        <div className="flex flex-col gap-2 border-t border-night-700 pt-2">
          {!subOpen ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy || subPhase !== "idle"}
              onClick={() => {
                setSubOpen(true);
                setSubError(null);
              }}
            >
              {ts("subscribe")}
            </Button>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-white/60">
                {ts("consent", {
                  amount: clp.format(recurringAmount),
                  period: ts(`period.${planType}`),
                })}
              </p>
              <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy || subPhase !== "idle"}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-neon"
                />
                {ts("consentCheck")}
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || subPhase !== "idle"}
                  onClick={() => {
                    setSubOpen(false);
                    setConsent(false);
                  }}
                >
                  {tc("back")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={!consent || busy || subPhase !== "idle"}
                  onClick={() => void subscribe()}
                >
                  {subPhase !== "idle" && <Spinner size="sm" />}
                  {subPhase === "processing"
                    ? tco("processing")
                    : subPhase === "activating"
                      ? ts("activating")
                      : ts("subscribe")}
                </Button>
              </div>
            </>
          )}
          {subError && (
            <p role="alert" className="text-sm text-red-400">
              {subError}
            </p>
          )}
          {subPhase === "activating" && (
            <p className="animate-pulse text-sm text-white/70">
              {ts("activating")}
            </p>
          )}
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
