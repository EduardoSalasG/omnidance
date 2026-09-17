"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TicketStatus } from "@omnidance/shared";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

type Ticket = {
  id: string;
  status: string;
  listPrice: number;
  serviceFee: number;
  event: {
    id: string;
    name: string;
    startsAt: string;
    venue: { name: string };
  };
};

type State = "loading" | "unauth" | "error" | "ready";

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

export default function EntradasPage() {
  const t = useTranslations("wallet");
  const tc = useTranslations("common");
  const te = useTranslations("events");

  const [state, setState] = useState<State>("loading");
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // --- Transferencia ("Regalar entrada") ---
  const [transferFor, setTransferFor] = useState<Ticket | null>(null);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/tickets/mine")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setState("unauth");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const data = (await res.json()) as Ticket[];
        setTickets(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  function openTransfer(ticket: Ticket) {
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
      setTickets((ts) => ts.filter((tk) => tk.id !== transferFor.id));
      closeTransfer();
      setTransferSuccess(true);
    } catch {
      setTransferError(true);
    } finally {
      setTransferring(false);
    }
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

  const sorted = [...tickets].sort(
    (a, b) =>
      new Date(a.event.startsAt).getTime() -
      new Date(b.event.startsAt).getTime(),
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/eventos"
        className="inline-flex min-h-11 w-fit items-center text-sm text-white/60 hover:text-white"
      >
        ← {te("backToList")}
      </Link>

      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {transferSuccess && (
        <p role="status" className="text-sm font-medium text-neon">
          {t("transferSuccess")}
        </p>
      )}

      {state === "loading" && (
        <p className="text-white/60">{tc("loading")}</p>
      )}

      {state === "unauth" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="text-white/70">{t("loginRequired")}</p>
          <Button href="/login">{tc("login")}</Button>
        </Card>
      )}

      {state === "error" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="text-white/70">{tc("error")}</p>
        </Card>
      )}

      {state === "ready" && sorted.length === 0 && (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-white/70">{t("empty")}</p>
          <Button href="/eventos">{t("emptyCta")}</Button>
        </Card>
      )}

      {state === "ready" && sorted.length > 0 && (
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
                        STATUS_VARIANT[ticket.status as TicketStatus] ?? "muted"
                      }
                    >
                      {statusLabel(ticket.status)}
                    </Badge>
                    <PriceTag
                      amount={ticket.listPrice + ticket.serviceFee}
                      className="text-base"
                    />
                  </div>
                </div>
                {ticket.status === "ACTIVE" && (
                  <>
                    <Link
                      href="/qr"
                      className="flex min-h-11 items-center justify-between rounded-xl border border-night-700 bg-night-800 px-4 text-sm text-neon transition-colors hover:border-neon/60"
                    >
                      <span>{t("showQrHint")}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => openTransfer(ticket)}
                    >
                      {t("transfer")}
                    </Button>
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Modal "Regalar entrada" — bottom sheet en mobile, centrado en desktop.
          Se cierra con Escape o clic en el backdrop. */}
      {transferFor && (
        <div
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
            <form
              onSubmit={submitTransfer}
              className="mt-4 flex flex-col gap-4"
            >
              <label className="flex flex-col gap-1.5">
                <span className="sr-only">{t("transferEmail")}</span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={transferEmail}
                  onChange={(e) => setTransferEmail(e.target.value)}
                  placeholder={t("transferEmail")}
                  className={inputCls}
                />
              </label>
              {transferError && (
                <p role="alert" className="text-sm text-red-400">
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
    </main>
  );
}
