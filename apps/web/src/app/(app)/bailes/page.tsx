"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { SessionCard } from "@/components/sessions/SessionCard";
import { isInvitee } from "@/components/sessions/types";
import type { DanceSession, SessionAction } from "@/components/sessions/types";

type Phase = "loading" | "unauth" | "ready" | "error";

function Bailes() {
  const t = useTranslations("sessions");
  const tStaff = useTranslations("staff");
  const tCommon = useTranslations("common");

  const eventId = useSearchParams().get("event");

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessions, setSessions] = useState<DanceSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Nombre del evento cuando la vista viene filtrada por ?event=
  const [eventName, setEventName] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    const res = await apiFetch(
      `/sessions/mine${eventId ? `?eventId=${eventId}` : ""}`,
    ).catch(() => null);
    if (!res) {
      setPhase("error");
      return;
    }
    if (res.status === 401) {
      setPhase("unauth");
      return;
    }
    if (!res.ok) {
      setPhase("error");
      return;
    }
    setSessions((await res.json()) as DanceSession[]);
    setPhase("ready");
  }, [eventId]);

  // Refetch al volver a la pestaña — el usuario alterna entre bailar y el teléfono.
  useEffect(() => {
    void fetchSessions();
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchSessions();
    };
    const onFocus = () => void fetchSessions();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchSessions]);

  // Chip de contexto del filtro ?event= — el nombre viene del endpoint público.
  useEffect(() => {
    setEventName(null);
    if (!eventId) return;
    apiFetch(`/events/${eventId}`)
      .then(async (res) => {
        if (res.ok) setEventName(((await res.json()) as { name: string }).name);
      })
      .catch(() => {});
  }, [eventId]);

  async function act(session: DanceSession, action: SessionAction) {
    setBusyId(session.id);
    const res = await apiFetch(`/sessions/${session.id}/${action}`, {
      method: "POST",
    }).catch(() => null);
    setBusyId(null);
    if (res?.status === 401) {
      setPhase("unauth");
      return;
    }
    await fetchSessions();
  }

  async function rate(session: DanceSession, score: number) {
    setBusyId(session.id);
    const res = await apiFetch(`/sessions/${session.id}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    }).catch(() => null);
    setBusyId(null);
    if (res?.status === 401) {
      setPhase("unauth");
      return;
    }
    await fetchSessions();
  }

  const scanHref = `/qr?modo=escanear${eventId ? `&event=${eventId}` : ""}`;

  // Invitaciones entrantes primero (accionables), luego salientes pendientes.
  const pending = sessions.filter((s) => s.status === "INVITED");
  const incoming = pending.filter(isInvitee);
  const outgoing = pending.filter((s) => !isInvitee(s));
  const history = sessions.filter((s) => s.status !== "INVITED");

  // Resumen de la vista actual: bailes confirmados y parejas distintas.
  const confirmed = history.filter((s) => s.status === "CONFIRMED");
  const partnerCount = new Set(
    confirmed.map((s) => s.partner?.name).filter(Boolean),
  ).size;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <header className="flex items-center justify-end">
        <Button href={scanHref} variant="secondary" size="sm">
          {tStaff("scan")}
        </Button>
      </header>

      {/* Contexto del filtro ?event= — permite salir de la vista acotada */}
      {eventId && (
        <Link
          href="/bailes"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-night-700 bg-night-800 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-neon/50 hover:text-white"
        >
          <span className="truncate">
            {eventName ? t("filteredEvent", { name: eventName }) : t("filtered")}
          </span>
          <span aria-hidden="true">✕</span>
          <span className="sr-only">{t("clearFilter")}</span>
        </Link>
      )}

      {phase === "unauth" ? (
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <p className="text-lg font-semibold">{t("scanToInvite")}</p>
          <Button href="/login" size="lg">
            {tCommon("login")}
          </Button>
        </div>
      ) : phase === "error" ? (
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <p role="alert" className="text-lg font-semibold">
            {tCommon("error")}
          </p>
          <Button
            variant="secondary"
            size="lg"
            aria-label={tCommon("retry")}
            onClick={() => void fetchSessions()}
          >
            ↻
          </Button>
        </div>
      ) : phase === "loading" ? (
        <PageLoading />
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <p role="status" className="text-lg font-semibold">
            {t("empty")}
          </p>
          <Button href={scanHref} size="lg">
            {tStaff("scan")}
          </Button>
        </div>
      ) : (
        <>
          {/* Por confirmar — invitaciones vivas de la noche */}
          {pending.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("pending")}
              </h2>
              {incoming.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  busy={busyId === s.id}
                  onAct={(action) => void act(s, action)}
                />
              ))}
              {outgoing.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  busy={busyId === s.id}
                  onAct={(action) => void act(s, action)}
                />
              ))}
            </section>
          )}

          {/* Historial — confirmadas, puntuadas y cerradas */}
          {history.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("history")}
                </h2>
                {confirmed.length > 0 && (
                  <p className="text-xs text-white/50">
                    {t("summary", {
                      dances: confirmed.length,
                      partners: partnerCount,
                    })}
                  </p>
                )}
              </div>
              {history.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  busy={busyId === s.id}
                  onAct={(action) => void act(s, action)}
                  onRate={(score) => void rate(s, score)}
                />
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function BailesPage() {
  return (
    <Suspense
      fallback={<main className="min-h-dvh bg-night-950" aria-hidden="true" />}
    >
      <Bailes />
    </Suspense>
  );
}
