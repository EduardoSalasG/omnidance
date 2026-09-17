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

export default function EntradasPage() {
  const t = useTranslations("wallet");
  const tc = useTranslations("common");
  const te = useTranslations("events");

  const [state, setState] = useState<State>("loading");
  const [tickets, setTickets] = useState<Ticket[]>([]);

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
                  <Link
                    href="/qr"
                    className="flex min-h-11 items-center justify-between rounded-xl border border-night-700 bg-night-800 px-4 text-sm text-neon transition-colors hover:border-neon/60"
                  >
                    <span>{t("showQrHint")}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
