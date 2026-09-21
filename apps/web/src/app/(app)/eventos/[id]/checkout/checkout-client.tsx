"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SERVICE_FEE } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { BackLink, Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
import type { CheckoutEvent } from "./page";

type Quote = {
  listPrice: number;
  discount: number;
  serviceFee: number;
  total: number;
};

type Phase =
  | { kind: "form" }
  | { kind: "processing" }
  | { kind: "awaiting"; paymentId: string; paymentUrl: string; quote: Quote }
  | { kind: "success" }
  | { kind: "failed" };

type FormError = "invalidCode" | "soldOut" | "loginRequired" | "generic" | null;

type FriendItem = {
  id: string;
  person: { id: string; name: string; photoUrl: string | null } | null;
};

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 15; // ~30s

export function CheckoutClient({ event }: { event: CheckoutEvent }) {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const tw = useTranslations("wallet");

  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [error, setError] = useState<FormError>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [simulating, setSimulating] = useState(false);

  // Regalo multi-entrada: amigos ACCEPTED a los que se les puede asignar
  // una entrada. La validación real (existen + amistad + sin entrada) la
  // hace el servidor; la lista solo filtra la UI.
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [giftIds, setGiftIds] = useState<Set<string>>(new Set());
  const quantity = 1 + giftIds.size;

  useEffect(() => {
    apiFetch("/friends")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data: { friends?: FriendItem[] } | null) => {
        setFriends(
          (data?.friends ?? []).filter((f) => f.person != null),
        );
      })
      .catch(() => undefined);
  }, []);

  const isStub =
    phase.kind === "awaiting" && phase.paymentUrl.startsWith("stub://");
  const busy = phase.kind === "processing" || phase.kind === "awaiting";

  // Breakdown: estimado local hasta que el POST devuelva el quote real.
  // El quote del API trae montos unitarios + total de la orden; acá cada
  // línea se multiplica por la cantidad (descuento = una vez por orden).
  const listPrice = event.presalePrice ?? event.doorPrice ?? 0;
  const quote = phase.kind === "awaiting" ? phase.quote : null;
  const unit = quote ?? {
    listPrice,
    discount: 0,
    serviceFee: listPrice > 0 ? SERVICE_FEE.PRESALE_CLP : 0,
    total: 0,
  };
  const breakdown = quote
    ? quote // el API ya devuelve el total de la orden completa
    : {
        listPrice: unit.listPrice,
        discount: 0,
        serviceFee: unit.serviceFee,
        total: (unit.listPrice + unit.serviceFee) * quantity,
      };

  // Polling del pago mientras esperamos confirmación (stub o retorno del gateway)
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setServerError(null);
    setPhase({ kind: "processing" });

    try {
      const res = await apiFetch("/checkout/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          ...(discountCode.trim() ? { discountCode: discountCode.trim() } : {}),
          ...(giftIds.size ? { recipientIds: [...giftIds] } : {}),
        }),
      });

      if (res.status === 400) {
        // 400 agrupa código inválido y errores de destinatario — el
        // mensaje del servidor distingue: los de descuento empiezan con
        // "código"; el resto se muestra tal cual (nombra a la persona).
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(body?.message)
          ? body.message.join(" ")
          : body?.message;
        if (typeof msg === "string" && msg.length && !msg.startsWith("código")) {
          setServerError(msg);
        } else {
          setError("invalidCode");
        }
        setPhase({ kind: "form" });
        return;
      }
      if (res.status === 401) {
        setError("loginRequired");
        setPhase({ kind: "form" });
        return;
      }
      if (res.status === 409) {
        setError("soldOut");
        setPhase({ kind: "form" });
        return;
      }
      if (!res.ok) {
        setError("generic");
        setPhase({ kind: "form" });
        return;
      }

      const data = (await res.json()) as {
        paymentUrl: string;
        paymentId: string;
        quote: Quote;
      };

      if (data.paymentUrl.startsWith("stub://")) {
        // Dev: gateway stub — el pago se simula con el webhook desde esta página
        setPhase({
          kind: "awaiting",
          paymentId: data.paymentId,
          paymentUrl: data.paymentUrl,
          quote: data.quote,
        });
      } else {
        window.location.href = data.paymentUrl;
      }
    } catch {
      setError("generic");
      setPhase({ kind: "form" });
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
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
        <Badge variant="neon">{t("success")}</Badge>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        {quantity > 1 && (
          <p className="text-sm text-white/70">
            {t("giftSuccess", { count: quantity - 1 })}
          </p>
        )}
        <Button href="/entradas" size="lg">
          {tw("title")}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <BackLink href={`/eventos/${event.id}`}>{event.name}</BackLink>

      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Resumen del evento */}
      <Card>
        <div className="flex flex-col gap-2">
          {event.series && <Badge variant="neon">{event.series.name}</Badge>}
          <h2 className="text-lg font-semibold">{event.name}</h2>
          <EventDate
            variant="full"
            start={event.startsAt}
            className="text-sm text-white/70"
          />
          <p className="text-sm">
            <span className="font-medium">{event.venue.name}</span>
            {event.venue.address && (
              <span className="block text-white/50">{event.venue.address}</span>
            )}
          </p>
        </div>
      </Card>

      <form onSubmit={submit} className="flex flex-col gap-6">
        {/* Regalo multi-entrada: checkbox por amigo = +1 entrada */}
        {friends.length > 0 && (
          <Card>
            <h2 className="text-base font-semibold">{t("giftTitle")}</h2>
            <p className="mt-1 text-xs text-white/50">{t("giftHint")}</p>
            <ul className="mt-3 flex flex-col gap-1">
              {friends.map((f) => {
                const pid = f.person!.id;
                const checked = giftIds.has(pid);
                return (
                  <li key={f.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() =>
                          setGiftIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(pid)) next.delete(pid);
                            else next.add(pid);
                            return next;
                          })
                        }
                        className="size-5 shrink-0 accent-neon"
                      />
                      <span className="text-sm">{f.person!.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* Breakdown de precio */}
        <Card>
          <dl className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-white/60">
                {t("price")}
                {quantity > 1 && ` ×${quantity}`}
              </dt>
              <dd>
                <PriceTag amount={breakdown.listPrice * quantity} />
              </dd>
            </div>
            {breakdown.discount > 0 && (
              <div className="flex items-center justify-between">
                <dt className="text-sm text-white/60">{t("discount")}</dt>
                <dd>
                  <PriceTag amount={-breakdown.discount} />
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-sm text-white/60">
                {t("serviceFee")}
                {quantity > 1 && ` ×${quantity}`}
              </dt>
              <dd>
                <PriceTag amount={breakdown.serviceFee * quantity} />
              </dd>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-night-700 pt-4">
              <dt className="text-base font-semibold">{t("total")}</dt>
              <dd>
                <PriceTag amount={breakdown.total} className="text-2xl" />
              </dd>
            </div>
          </dl>
        </Card>

        {/* Código de descuento */}
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/70">{t("discountCode")}</span>
          <input
            type="text"
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value)}
            placeholder={t("discountPlaceholder")}
            disabled={busy}
            autoComplete="off"
            aria-invalid={error === "invalidCode" || undefined}
            aria-describedby={
              error === "invalidCode" ? "checkout-discount-error" : undefined
            }
            className="min-h-12 rounded-xl border border-night-700 bg-night-900 px-4 py-3 uppercase text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50 disabled:opacity-50"
          />
        </label>

        {/* Errores del contrato */}
        {error === "invalidCode" && (
          <p
            id="checkout-discount-error"
            role="alert"
            className="text-sm text-red-400"
          >
            {t("invalidCode")}
          </p>
        )}
        {error === "soldOut" && (
          <p role="alert" className="text-sm text-red-400">
            {t("soldOut")}
          </p>
        )}
        {serverError && (
          <p role="alert" className="text-sm text-red-400">
            {serverError}
          </p>
        )}
        {error === "generic" && (
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
        )}
        {error === "loginRequired" && (
          <Card className="flex flex-col items-center gap-4 text-center">
            <p className="text-white/70">{t("loginRequired")}</p>
            <Button href="/login">{tc("login")}</Button>
          </Card>
        )}

        {phase.kind === "failed" ? (
          <div className="flex flex-col gap-4">
            <p role="alert" className="text-center text-red-400">
              {t("failed")}
            </p>
            <Button
              type="button"
              size="lg"
              onClick={() => setPhase({ kind: "form" })}
            >
              {t("pay")}
            </Button>
          </div>
        ) : (
          <Button type="submit" size="lg" disabled={busy}>
            {phase.kind === "processing" ? t("processing") : t("pay")}
          </Button>
        )}

        {/* Esperando confirmación + simulación dev (solo stub://) */}
        {phase.kind === "awaiting" && (
          <Card className="flex flex-col items-center gap-4 text-center">
            <p className="animate-pulse text-white/70">{t("pending")}</p>
            {isStub && (
              <div className="flex w-full flex-col gap-3 border-t border-night-700 pt-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {t("devSimTitle")}
                </p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={simulating}
                    onClick={() => void simulate("PAID")}
                  >
                    {t("devSimApprove")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={simulating}
                    onClick={() => void simulate("FAILED")}
                  >
                    {t("devSimFail")}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </form>
    </main>
  );
}
