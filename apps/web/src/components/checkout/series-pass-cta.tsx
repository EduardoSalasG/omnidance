"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import consumer from "@/i18n/parts/consumer.json";

const sp = consumer.seriesPass;

type Phase =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "awaiting"; paymentId: string; paymentUrl: string }
  | { kind: "success" }
  | { kind: "failed" };

type Notice = "loginRequired" | "alreadyOwned" | "unavailable" | "generic" | null;

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s — mismo criterio que checkout-client

export type SeriesPassCtaProps = {
  /** EventSeries.id — requerido por POST /checkout/series-pass. */
  seriesId: string;
  /** Mes de vigencia del pase, formato "YYYY-MM" (mes del evento). */
  month: string;
  /** Nombre de la serie para el copy ("Entrada a todos los eventos de X"). */
  seriesName: string;
};

/**
 * CTA discreto del pase mensual de serie (spec flows.md "Pase de serie").
 * POST /checkout/series-pass {seriesId, month} → {paymentUrl, paymentId}:
 * gateway real → redirect; stub:// (dev) → polling + botones de simulación,
 * mismo patrón que el checkout de ticket. El precio (series_pass.price_clp)
 * no está en /params/public → no se muestra antes de la orden.
 */
export function SeriesPassCta({
  seriesId,
  month,
  seriesName,
}: SeriesPassCtaProps) {
  const tc = useTranslations("common");
  const tco = useTranslations("checkout");

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<Notice>(null);
  const [simulating, setSimulating] = useState(false);

  const isStub =
    phase.kind === "awaiting" && phase.paymentUrl.startsWith("stub://");
  const busy = phase.kind === "processing" || phase.kind === "awaiting";

  // Polling del pago mientras esperamos confirmación (stub o retorno gateway)
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
          if (payment.status === "PAID") setPhase({ kind: "success" });
          else if (payment.status === "FAILED") setPhase({ kind: "failed" });
        })
        .catch(() => undefined);
      if (attempts >= POLL_MAX_ATTEMPTS) clearInterval(interval);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase]);

  async function buy() {
    if (busy) return;
    setNotice(null);
    setPhase({ kind: "processing" });

    try {
      const res = await apiFetch("/checkout/series-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, month }),
      });

      // Mapa de errores del controller: 404 not found / 400 inactive /
      // 409 already owned / 401 sin sesión.
      if (res.status === 401) {
        setNotice("loginRequired");
        setPhase({ kind: "idle" });
        return;
      }
      if (res.status === 409) {
        setNotice("alreadyOwned");
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
        // Dev: gateway stub — el pago se simula con el webhook desde acá
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
      // El webhook resuelve el pago por refId (= order ref embebido en stub://pay/<refId>)
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

  if (phase.kind === "success") {
    return (
      <Card className="flex flex-col items-start gap-2">
        <p className="font-semibold text-neon">{tco("success")}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{sp.title}</p>
          <p className="mt-0.5 text-sm text-white/60">
            {sp.desc.replace("{series}", seriesName)}
          </p>
        </div>
        {phase.kind === "failed" ? (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => setPhase({ kind: "idle" })}
          >
            {tc("retry")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={busy || notice === "alreadyOwned"}
            onClick={() => void buy()}
          >
            {phase.kind === "processing" ? tco("processing") : sp.cta}
          </Button>
        )}
      </div>

      {/* Errores/avisos del contrato */}
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
        <p className="text-sm text-white/60">{sp.unavailable}</p>
      )}
      {notice === "alreadyOwned" && (
        <p className="text-sm text-white/60">{sp.alreadyOwned}</p>
      )}
      {notice === "loginRequired" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/70">{tco("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </div>
      )}

      {/* Esperando confirmación + simulación dev (solo stub://) */}
      {phase.kind === "awaiting" && (
        <div className="flex flex-col gap-3 border-t border-night-700 pt-3">
          <p className="animate-pulse text-sm text-white/70">
            {tco("pending")}
          </p>
          {isStub && (
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wide text-white/50">
                {tco("devSimTitle")}
              </p>
              <div className="flex gap-3">
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
    </Card>
  );
}
