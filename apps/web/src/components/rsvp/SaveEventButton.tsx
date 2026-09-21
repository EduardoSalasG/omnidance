"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";

type RsvpStatus = "GOING" | "INTERESTED";

/**
 * Bookmark "guardar" sobre la card del listado. Semántica: el evento está en
 * mi lista ⇔ tengo RSVP (GOING o INTERESTED). Tap sin RSVP → INTERESTED;
 * tap con RSVP → DELETE (lo saca de mi lista). La distinción Voy/Me interesa
 * se gestiona en el detalle del evento (RsvpControls).
 * Optimista: revierte al estado previo si la API falla.
 */
export function SaveEventButton({
  eventId,
  initialStatus,
  className = "",
}: {
  eventId: string;
  initialStatus: RsvpStatus | null;
  className?: string;
}) {
  const t = useTranslations("events");
  const [status, setStatus] = useState<RsvpStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const prev = status;
    const next = prev === null ? ("INTERESTED" as const) : null;
    setPending(true);
    setStatus(next);
    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        method: next === null ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        ...(next !== null && { body: JSON.stringify({ status: next }) }),
      });
      if (!res.ok) setStatus(prev);
    } catch {
      setStatus(prev);
    } finally {
      setPending(false);
    }
  }

  const saved = status !== null;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? t("saved") : t("save")}
      title={saved ? t("saved") : t("save")}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-50 ${
        saved ? "text-neon" : "text-white/50 hover:text-white"
      } ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
