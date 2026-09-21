"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TicketStatus } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

export type WalletTicket = {
  id: string;
  status: string;
  listPrice: number;
  serviceFee: number;
  /** Link reclamable (compra multi-entrada sin asignar) — null tras reclamo */
  claimToken: string | null;
  event: {
    id: string;
    name: string;
    startsAt: string;
    venue: { name: string };
  };
};

const STATUS_VARIANT: Record<TicketStatus, BadgeVariant> = {
  ACTIVE: "neon",
  USED: "muted",
  CANCELLED: "live",
  TRANSFERRED: "outline",
};

const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus:border-neon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/50";

/**
 * "Mis entradas" — gestión completa de tickets (badge de estado, precio
 * pagado, QR en puerta, regalar). Vive dentro de /eventos?view=mios; la
 * antigua /entradas redirige acá. Los tickets llegan por props desde el
 * server component (cookie-forwarded), el estado interactivo es local.
 */
export function TicketWallet({ tickets }: { tickets: WalletTicket[] }) {
  const t = useTranslations("wallet");
  const tc = useTranslations("common");
  const tcClaim = useTranslations("claim");

  const [items, setItems] = useState(tickets);

  // --- Transferencia ("Regalar entrada") ---
  const [transferFor, setTransferFor] = useState<WalletTicket | null>(null);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  // Focus trap + restauración del modal de transferencia
  const transferDialogRef = useDialogFocus<HTMLDivElement>(
    transferFor !== null,
  );

  // Escape cierra el modal de transferencia
  useEffect(() => {
    if (!transferFor) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeTransfer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferFor]);

  function openTransfer(ticket: WalletTicket) {
    setTransferFor(ticket);
    setTransferEmail("");
    setTransferError(false);
    setTransferSuccess(false);
  }

  function closeTransfer() {
    setTransferFor(null);
    setTransferEmail("");
    setTransferError(false);
  }

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferFor || transferring) return;
    setTransferring(true);
    setTransferError(false);
    try {
      const res = await apiFetch(`/tickets/${transferFor.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: transferEmail.trim() }),
      });
      if (!res.ok) {
        // 400 email inexistente/igual al propio · 409 ticket no ACTIVE · 404
        setTransferError(true);
        return;
      }
      // La entrada cambia de dueño: sale de "Mis entradas" (filter local)
      setItems((ts) => ts.filter((tk) => tk.id !== transferFor.id));
      closeTransfer();
      setTransferSuccess(true);
    } catch {
      setTransferError(true);
    } finally {
      setTransferring(false);
    }
  }

  function waHref(ticket: WalletTicket): string {
    const url = `${window.location.origin}/reclamar/${ticket.claimToken}`;
    const text = tcClaim("waMessage", { event: ticket.event.name, url });
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  function statusLabel(status: string): string {
    const key = status.toLowerCase();
    const labels: Record<string, string> = {
      active: t("active"),
      used: t("used"),
      cancelled: t("cancelled"),
      transferred: t("transferred"),
    };
    return labels[key] ?? status;
  }

  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.event.startsAt).getTime() -
      new Date(b.event.startsAt).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <p role="status" className="text-white/70">
          {t("empty")}
        </p>
        <Button href="/eventos">{t("emptyCta")}</Button>
      </Card>
    );
  }

  return (
    <>
      {transferSuccess && (
        <p role="status" className="text-sm font-medium text-neon">
          {t("transferSuccess")}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {sorted.map((ticket) => (
          <li key={ticket.id}>
            <Card className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    href={`/eventos/${ticket.event.id}`}
                    className="text-lg font-semibold hover:text-neon"
                  >
                    {ticket.event.name}
                  </Link>
                  <EventDate
                    start={ticket.event.startsAt}
                    className="text-sm text-white/60"
                  />
                  <p className="text-sm text-white/50">
                    {ticket.event.venue.name}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge
                    variant={
                      ticket.claimToken
                        ? "outline"
                        : (STATUS_VARIANT[ticket.status as TicketStatus] ??
                          "muted")
                    }
                  >
                    {ticket.claimToken
                      ? t("claimPending")
                      : statusLabel(ticket.status)}
                  </Badge>
                  <PriceTag
                    amount={ticket.listPrice + ticket.serviceFee}
                    className="text-base"
                  />
                </div>
              </div>
              {ticket.status === "ACTIVE" && ticket.claimToken && (
                <>
                  <a
                    href={waHref(ticket)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center justify-between rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-4 text-sm font-medium text-[#25D366] transition-colors hover:bg-[#25D366]/20"
                  >
                    <span>{t("sendClaimLink")}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                  <p className="text-xs text-white/50">{t("claimHint")}</p>
                </>
              )}
              {ticket.status === "ACTIVE" && !ticket.claimToken && (
                <Link
                  href="/qr"
                  className="flex min-h-11 items-center justify-between rounded-xl border border-night-700 bg-night-800 px-4 text-sm text-neon transition-colors hover:border-neon/60"
                >
                  <span>{t("showQrHint")}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              )}
              {ticket.status === "ACTIVE" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => openTransfer(ticket)}
                >
                  {t("transfer")}
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {/* Modal "Regalar entrada" — bottom sheet en mobile, centrado en
          desktop. Se cierra con Escape o clic en el backdrop. */}
      {transferFor && (
        <div
          ref={transferDialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeTransfer}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-title"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="transfer-title" className="text-lg font-semibold">
              {t("transferTitle")}
            </h2>
            <p className="mt-1 text-sm text-white/60">{t("transferDesc")}</p>
            <p className="mt-3 text-sm font-medium">{transferFor.event.name}</p>
            <form onSubmit={submitTransfer} className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-white/70">
                  {t("transferEmail")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={transferEmail}
                  onChange={(e) => setTransferEmail(e.target.value)}
                  placeholder={t("transferEmail")}
                  aria-invalid={transferError || undefined}
                  aria-describedby={
                    transferError ? "transfer-email-error" : undefined
                  }
                  className={inputCls}
                />
              </label>
              {transferError && (
                <p
                  id="transfer-email-error"
                  role="alert"
                  className="text-sm text-red-400"
                >
                  {t("transferError")}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={transferring}
                  className="flex-1"
                >
                  {transferring ? tc("loading") : t("transferSubmit")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeTransfer}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
