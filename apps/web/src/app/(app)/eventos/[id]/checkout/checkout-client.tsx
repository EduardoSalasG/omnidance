"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SERVICE_FEE } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
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
  | { kind: "success"; paymentId: string }
  | { kind: "failed" };

type FormError = "invalidCode" | "soldOut" | "loginRequired" | "generic" | null;

type FriendItem = {
  id: string;
  person: { id: string; name: string; photoUrl: string | null } | null;
};

type OrderTicket = {
  id: string;
  claimToken: string | null;
  ownerId: string;
};

const MAX_TICKETS = 10;
const MAX_TABLE_PARTY = 12;

// Búsqueda de amigos insensible a tildes/mayúsculas.
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

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

  // Cantidad de la orden (1–10): 1 propia + asignadas a amigos +
  // reclamables (link por WhatsApp para quien no esté en la app).
  const [quantity, setQuantity] = useState(1);
  // Regalo multi-entrada: amigos ACCEPTED a los que se les puede asignar
  // una entrada. La validación real (existen + amistad + sin entrada) la
  // hace el servidor; la lista solo filtra la UI.
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [giftIds, setGiftIds] = useState<Set<string>>(new Set());
  const [giftQuery, setGiftQuery] = useState("");
  // claimable = entradas sin amigo asignado (se comparten por link)
  const claimable = quantity - 1 - giftIds.size;

  // Reserva de mesa opcional (spec §13): solo si el evento ofrece mesas
  // (tablesTotal no-null). La disponibilidad mostrada es referencial — la
  // reserva queda REQUESTED y el productor la confirma/ajusta.
  const [wantsTable, setWantsTable] = useState(false);
  const [partySize, setPartySize] = useState(4);
  const hasTables = event.tablesTotal != null;
  const tablesLeft = event.tablesLeft ?? 0;

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

  // Canal de venta: puerta-app cuando el evento está en vivo o ya sin
  // preventa (misma resolución que el server: LIVE o post-corte vende a
  // doorPrice). Solo mueve el texto explicativo — el precio real lo
  // decide el quote del API.
  const doorChannel =
    event.doorPrice != null &&
    (event.status === "LIVE" || event.presalePrice == null);

  // Breakdown: estimado local hasta que el POST devuelva el quote real.
  // El quote del API trae montos unitarios + total de la orden; acá cada
  // línea se multiplica por la cantidad (descuento = una vez por orden).
  const listPrice = doorChannel
    ? event.doorPrice!
    : (event.presalePrice ?? 0);
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
          if (payment.status === "PAID") {
            setPhase({ kind: "success", paymentId });
          }
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
          quantity,
          ...(discountCode.trim() ? { discountCode: discountCode.trim() } : {}),
          ...(giftIds.size ? { recipientIds: [...giftIds] } : {}),
          ...(wantsTable && hasTables && tablesLeft > 0
            ? { tablePartySize: partySize }
            : {}),
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
      <CheckoutSuccess
        eventName={event.name}
        paymentId={phase.paymentId}
        giftCount={giftIds.size}
        tablePartySize={
          wantsTable && hasTables && tablesLeft > 0 ? partySize : null
        }
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
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
        {/* Cantidad de la orden: stepper 1–10. Las sobrantes de los
            amigos marcados quedan como links reclamables (WhatsApp). */}
        <Card>
          <h2 className="text-base font-semibold">{t("qtyTitle")}</h2>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2" role="group" aria-label={t("qtyTitle")}>
              <button
                type="button"
                disabled={busy || quantity <= 1 + giftIds.size}
                onClick={() => setQuantity((q) => Math.max(1 + giftIds.size, q - 1))}
                aria-label={t("qtyMinus")}
                className="flex size-11 items-center justify-center rounded-xl border border-night-700 text-lg font-bold text-white/80 transition-colors hover:border-neon/60 hover:text-white disabled:opacity-30"
              >
                −
              </button>
              <output
                aria-live="polite"
                className="w-10 text-center text-xl font-bold tabular-nums"
              >
                {quantity}
              </output>
              <button
                type="button"
                disabled={busy || quantity >= MAX_TICKETS}
                onClick={() => setQuantity((q) => Math.min(MAX_TICKETS, q + 1))}
                aria-label={t("qtyPlus")}
                className="flex size-11 items-center justify-center rounded-xl border border-night-700 text-lg font-bold text-white/80 transition-colors hover:border-neon/60 hover:text-white disabled:opacity-30"
              >
                +
              </button>
            </div>
            <p className="max-w-[55%] text-right text-xs text-white/50">
              {t("qtyHint")}
            </p>
          </div>
          {quantity > 1 && (
            <p className="mt-3 rounded-xl bg-night-800 px-3 py-2 text-xs text-white/60">
              {t("qtyBreakdown", {
                assigned: giftIds.size,
                claimable,
              })}
            </p>
          )}
        </Card>

        {/* Regalo multi-entrada: buscador de amigos — cada resultado se
            toca para asignar/quitar una entrada. Los receptores quedan
            como chips (tocar también quita). */}
        {friends.length > 0 && (
          <Card>
            <h2 className="text-base font-semibold">{t("giftTitle")}</h2>
            <p className="mt-1 text-xs text-white/50">{t("giftHint")}</p>

            {giftIds.size > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {friends
                  .filter((f) => giftIds.has(f.person!.id))
                  .map((f) => {
                    const pid = f.person!.id;
                    return (
                      <li key={pid}>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={t("giftRemove", {
                            name: f.person!.name,
                          })}
                          onClick={() =>
                            setGiftIds((prev) => {
                              const next = new Set(prev);
                              next.delete(pid);
                              return next;
                            })
                          }
                          className="flex min-h-9 items-center gap-2 rounded-full bg-neon/15 px-3 text-sm font-medium text-neon transition-colors hover:bg-neon/25 disabled:opacity-50"
                        >
                          {f.person!.name}
                          <span aria-hidden="true">✕</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}

            <input
              type="search"
              value={giftQuery}
              onChange={(e) => setGiftQuery(e.target.value)}
              placeholder={t("giftSearchPlaceholder")}
              aria-label={t("giftTitle")}
              disabled={busy}
              className="mt-3 min-h-11 w-full rounded-xl border border-night-700 bg-night-900 px-4 text-white placeholder:text-white/40 focus:border-neon focus:outline-none disabled:opacity-50"
            />

            {giftQuery.trim().length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {friends
                  .filter((f) =>
                    norm(f.person!.name).includes(norm(giftQuery)),
                  )
                  .map((f) => {
                    const pid = f.person!.id;
                    const checked = giftIds.has(pid);
                    // No hay cupos asignables: el resto queda como link
                    const full = claimable <= 0 && !checked;
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          disabled={busy || full}
                          aria-pressed={checked}
                          onClick={() =>
                            setGiftIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(pid)) next.delete(pid);
                              else next.add(pid);
                              return next;
                            })
                          }
                          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                            checked
                              ? "bg-neon/10 font-medium text-neon"
                              : full
                                ? "cursor-not-allowed opacity-40"
                                : "hover:bg-white/5"
                          }`}
                        >
                          {f.person!.name}
                          {checked && <span aria-hidden="true">✓</span>}
                        </button>
                      </li>
                    );
                  })}
                {friends.filter((f) =>
                  norm(f.person!.name).includes(norm(giftQuery)),
                ).length === 0 && (
                  <li
                    role="status"
                    className="px-3 py-2 text-sm text-white/50"
                  >
                    {t("giftNoResults")}
                  </li>
                )}
              </ul>
            )}
          </Card>
        )}

        {/* Reserva de mesa (spec §13): solo si el evento ofrece mesas.
            Sin stock → estado informativo, no interactivo. Con stock →
            Sí/No; el Sí revela el stepper de personas + disclaimer. */}
        {hasTables && tablesLeft <= 0 && (
          <Card className="opacity-70">
            <h2 className="text-base font-semibold">{t("tableTitle")}</h2>
            <p role="status" className="mt-1 text-sm text-white/50">
              {t("tableSoldOut")}
            </p>
          </Card>
        )}
        {hasTables && tablesLeft > 0 && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{t("tableTitle")}</h2>
              <div
                role="group"
                aria-label={t("tableTitle")}
                className="flex shrink-0 rounded-full border border-night-700 p-1"
              >
                {([false, true] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    disabled={busy}
                    aria-pressed={wantsTable === v}
                    onClick={() => setWantsTable(v)}
                    className={`min-h-9 min-w-14 rounded-full px-4 text-sm font-medium transition-colors active:scale-[0.97] disabled:opacity-50 ${
                      wantsTable === v
                        ? "bg-neon text-night-950"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    {v ? t("tableYes") : t("tableNo")}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-white/50">
              {t("tableAvailable", { count: tablesLeft })}
            </p>

            {wantsTable && (
              <>
                <div className="mt-4 flex items-center justify-between border-t border-night-700 pt-4">
                  <span className="text-sm text-white/70">
                    {t("tablePartySize")}
                  </span>
                  <div
                    className="flex items-center gap-2"
                    role="group"
                    aria-label={t("tablePartySize")}
                  >
                    <button
                      type="button"
                      disabled={busy || partySize <= 1}
                      onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                      aria-label={t("tableMinus")}
                      className="flex size-11 items-center justify-center rounded-xl border border-night-700 text-lg font-bold text-white/80 transition-colors hover:border-neon/60 hover:text-white disabled:opacity-30"
                    >
                      −
                    </button>
                    <output
                      aria-live="polite"
                      className="w-10 text-center text-xl font-bold tabular-nums"
                    >
                      {partySize}
                    </output>
                    <button
                      type="button"
                      disabled={busy || partySize >= MAX_TABLE_PARTY}
                      onClick={() =>
                        setPartySize((n) => Math.min(MAX_TABLE_PARTY, n + 1))
                      }
                      aria-label={t("tablePlus")}
                      className="flex size-11 items-center justify-center rounded-xl border border-night-700 text-lg font-bold text-white/80 transition-colors hover:border-neon/60 hover:text-white disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="mt-3 rounded-xl bg-night-800 px-3 py-2 text-xs text-white/60">
                  {t("tableDisclaimer")}
                </p>
              </>
            )}
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
          <p className="mt-3 text-xs text-white/50">
            {doorChannel ? t("doorChannelNote") : t("presaleCutoff")}
          </p>
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

/**
 * Éxito del checkout: confirma la compra y, si la orden dejó entradas
 * reclamables, lista un botón de WhatsApp por cada link (/reclamar/<t>)
 * — el destinatario no necesita estar registrado ni ser amigo.
 */
function CheckoutSuccess({
  eventName,
  paymentId,
  giftCount,
  tablePartySize,
}: {
  eventName: string;
  paymentId: string;
  giftCount: number;
  tablePartySize: number | null;
}) {
  const t = useTranslations("checkout");
  const tw = useTranslations("wallet");
  const tcClaim = useTranslations("claim");

  const [tickets, setTickets] = useState<OrderTicket[] | null>(null);

  useEffect(() => {
    apiFetch(`/payments/${paymentId}/tickets`)
      .then(async (res) => (res.ok ? res.json() : []))
      .then((data: OrderTicket[]) => setTickets(data))
      .catch(() => setTickets([]));
  }, [paymentId]);

  const claimables = (tickets ?? []).filter((tk) => tk.claimToken);

  function waHref(token: string): string {
    const url = `${window.location.origin}/reclamar/${token}`;
    const text = tcClaim("waMessage", { event: eventName, url });
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <Badge variant="neon">{t("success")}</Badge>
      <h1 className="text-2xl font-bold">{eventName}</h1>
      {giftCount > 0 && (
        <p className="text-sm text-white/70">
          {t("giftSuccess", { count: giftCount })}
        </p>
      )}
      {tablePartySize != null && (
        <p className="text-sm text-white/70">
          {t("tableSuccess", { count: tablePartySize })}
        </p>
      )}

      {claimables.length > 0 && (
        <Card className="flex w-full flex-col gap-3 text-left">
          <h2 className="text-base font-semibold">{t("shareTitle")}</h2>
          <p className="text-xs text-white/50">{t("shareHint")}</p>
          <ul className="flex flex-col gap-2">
            {claimables.map((tk, i) => (
              <li key={tk.id}>
                <a
                  href={waHref(tk.claimToken!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366]/15 px-4 text-sm font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/25"
                >
                  {t("shareWhatsApp", { index: i + 1 })}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Button href="/entradas" size="lg">
        {tw("title")}
      </Button>
    </main>
  );
}
