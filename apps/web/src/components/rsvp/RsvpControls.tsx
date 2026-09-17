"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

type RsvpStatus = "GOING" | "INTERESTED";

type Counts = { going: number; interested: number };

type WaitlistStatus = "WAITING" | "PROMOTED" | "EXPIRED" | string;

type WaitlistMe = { position: number; status: WaitlistStatus };

type Attendee = { personId: string; name: string; photoUrl: string | null };

function applyDelta(
  c: Counts,
  from: RsvpStatus | null,
  to: RsvpStatus | null,
): Counts {
  return {
    going:
      c.going + (to === "GOING" ? 1 : 0) - (from === "GOING" ? 1 : 0),
    interested:
      c.interested +
      (to === "INTERESTED" ? 1 : 0) -
      (from === "INTERESTED" ? 1 : 0),
  };
}

/**
 * RSVP + waitlist del evento. Self-fetching:
 * - GET /events/:id/rsvps es público (solo agregados).
 * - El estado propio se reconstruye con /me + /events/:id/attendees
 *   (el backend no expone "mi RSVP"; INTERESTED solo persiste en sesión).
 * - GET /events/:id/waitlist/me → posición/estado propios (404 = fuera).
 */
export function RsvpControls({ eventId }: { eventId: string }) {
  const t = useTranslations("rsvp");
  const tc = useTranslations("common");

  const [counts, setCounts] = useState<Counts | null>(null);
  const [myStatus, setMyStatus] = useState<RsvpStatus | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistMe | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Contadores públicos — no dependen de sesión
      try {
        const res = await apiFetch(`/events/${eventId}/rsvps`);
        if (cancelled) return;
        if (res.ok) setCounts((await res.json()) as Counts);
      } catch {
        // Sin contadores: los botones igual funcionan
      }

      // Sesión → mi RSVP (GOING vía attendees) + mi waitlist
      try {
        const meRes = await apiFetch("/me");
        if (cancelled) return;
        if (meRes.status === 401) {
          setAuthed(false);
          return;
        }
        if (!meRes.ok) return;
        setAuthed(true);
        const me = (await meRes.json()) as { id: string };

        const [attRes, wlRes] = await Promise.all([
          apiFetch(`/events/${eventId}/attendees`),
          apiFetch(`/events/${eventId}/waitlist/me`),
        ]);
        if (cancelled) return;
        if (attRes.ok) {
          const attendees = (await attRes.json()) as Attendee[];
          if (attendees.some((a) => a.personId === me.id)) {
            setMyStatus("GOING");
          }
        }
        if (wlRes.ok) setWaitlist((await wlRes.json()) as WaitlistMe);
      } catch {
        // Fallos de red: la UI queda en estado no autenticado/neutro
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function toggle(status: RsvpStatus) {
    if (pending) return;
    const prevStatus = myStatus;
    const prevCounts = counts;
    // Click sobre el estado activo = quitar RSVP (DELETE)
    const next: RsvpStatus | null = prevStatus === status ? null : status;

    setPending(true);
    setError(false);
    setMyStatus(next);
    setCounts((c) => (c ? applyDelta(c, prevStatus, next) : c));

    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        method: next === null ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        ...(next !== null && { body: JSON.stringify({ status: next }) }),
      });
      if (res.status === 401) {
        setMyStatus(prevStatus);
        setCounts(prevCounts);
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        setMyStatus(prevStatus);
        setCounts(prevCounts);
        setError(true);
        return;
      }
      // Reconciliar contadores con el servidor
      const fresh = await apiFetch(`/events/${eventId}/rsvps`);
      if (fresh.ok) setCounts((await fresh.json()) as Counts);
    } catch {
      setMyStatus(prevStatus);
      setCounts(prevCounts);
      setError(true);
    } finally {
      setPending(false);
    }
  }

  async function joinWaitlist() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/waitlist`, {
        method: "POST",
      });
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        // 409: ya tiene ticket/pase o entrada viva en la lista
        setError(true);
        return;
      }
      setWaitlist((await res.json()) as WaitlistMe);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  const onWaitlist =
    waitlist?.status === "WAITING" || waitlist?.status === "PROMOTED";

  return (
    <Card aria-busy={pending}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("attendees")}
        </h2>
        {counts && (
          <p className="text-xs text-white/60">
            {t("goingCount", { count: counts.going })} ·{" "}
            {t("interestedCount", { count: counts.interested })}
          </p>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <Button
          type="button"
          variant={myStatus === "GOING" ? "primary" : "secondary"}
          className="flex-1"
          aria-pressed={myStatus === "GOING"}
          disabled={pending}
          onClick={() => toggle("GOING")}
        >
          {t("going")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={`flex-1 ${
            myStatus === "INTERESTED" ? "border-neon/60 text-neon" : ""
          }`}
          aria-pressed={myStatus === "INTERESTED"}
          disabled={pending}
          onClick={() => toggle("INTERESTED")}
        >
          {t("interested")}
        </Button>
      </div>

      {authed === false && (
        <div className="mt-4 flex flex-col items-start gap-2">
          <p className="text-sm text-white/60">{t("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {tc("error")}
        </p>
      )}

      {/* Waitlist — v1 el backend permite anotarse salvo ticket/pase activo
          o entrada viva (409). Sin flag de disponibilidad: siempre visible
          para usuarios autenticados que no estén ya en la lista. */}
      {authed === true && (
        <div className="mt-4 border-t border-night-700 pt-4">
          {onWaitlist ? (
            <div className="flex items-center gap-2">
              {waitlist.status === "PROMOTED" ? (
                <Badge variant="neon">{t("promoted")}</Badge>
              ) : (
                <Badge variant="outline">{t("waitlist")}</Badge>
              )}
              <span className="text-sm text-white/70">
                {t("waitlistPosition", { position: waitlist.position })}
              </span>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={joinWaitlist}
            >
              {t("joinWaitlist")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
