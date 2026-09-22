"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { EventDate } from "@/components/ui/EventDate";
import { PageLoading } from "@/components/ui/spinner";
import { SessionCard } from "@/components/sessions/SessionCard";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import { isInvitee } from "@/components/sessions/types";
import type { DanceSession, SessionAction } from "@/components/sessions/types";

type Phase = "loading" | "unauth" | "ready" | "error";

function Bailes() {
  const t = useTranslations("sessions");
  const tCommon = useTranslations("common");

  const eventId = useSearchParams().get("event");

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessions, setSessions] = useState<DanceSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Nombre del evento cuando la vista viene filtrada por ?event=
  const [eventName, setEventName] = useState<string | null>(null);
  // Racha semanal para la línea de continuidad del insights.
  const [streak, setStreak] = useState<number | null>(null);
  // Progressive disclosure del historial: primeras N noches visibles.
  const [allNights, setAllNights] = useState(false);

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

  // Ficha del último social — la sesión más reciente define el evento;
  // su nombre/fecha/local ya vienen embebidos en la sesión.
  const lastEvent = !eventId && sessions.length > 0 ? sessions[0].event : null;
  const lastEventId = lastEvent?.id ?? null;

  // Racha semanal — solo cuando el card del último social va a mostrarse.
  useEffect(() => {
    if (!lastEventId) return;
    apiFetch("/gamification/me/streak")
      .then(async (res) => {
        if (!res.ok) return;
        const d = (await res.json()) as { currentWeeks?: number };
        setStreak(d.currentWeeks ?? null);
      })
      .catch(() => {});
  }, [lastEventId]);

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

  // Invitaciones entrantes primero (accionables), luego salientes pendientes.
  const pending = sessions.filter((s) => s.status === "INVITED");
  const incoming = pending.filter(isInvitee);
  const outgoing = pending.filter((s) => !isInvitee(s));
  const history = sessions.filter((s) => s.status !== "INVITED");

  // Resumen de la vista actual: bailes confirmados y parejas distintas
  // (por id — los homónimos no colapsan).
  const counterpartId = (s: DanceSession) =>
    s.role.toLowerCase() === "inviter" ? s.inviteeId : s.inviterId;
  const confirmed = history.filter((s) => s.status === "CONFIRMED");
  const partnerCount = new Set(confirmed.map(counterpartId)).size;

  // ── Insights del último social ─────────────────────────────────────
  // Baile real = CONFIRMED | RATED | CLOSED (DECLINED/DISCARDED/EXPIRED
  // no cuentan). El evento es el de la sesión más reciente.
  const DANCED = new Set(["CONFIRMED", "RATED", "CLOSED"]);
  const lastSessions = lastEventId
    ? sessions.filter((s) => s.eventId === lastEventId)
    : [];
  const danced = lastSessions.filter((s) => DANCED.has(s.status));
  const lastPartners = new Set(danced.map(counterpartId)).size;
  const myScores = lastSessions
    .map((s) => s.myRating?.global)
    .filter((v): v is number => typeof v === "number");
  const lastAvg =
    myScores.length > 0
      ? Math.round((myScores.reduce((a, b) => a + b, 0) / myScores.length) * 10) /
        10
      : null;
  // El mejor baile de la noche — highlight personal (solo si fue bueno:
  // "mejor baile ★2" no celebra nada).
  const bestDance = danced
    .filter((s) => s.myRating && s.myRating.global >= 4 && s.partner)
    .sort(
      (a, b) =>
        b.myRating!.global - a.myRating!.global ||
        +new Date(b.scannedAt) - +new Date(a.scannedAt),
    )[0];
  const showInsights = Boolean(lastEventId && danced.length > 0);

  // Historial agrupado por noche — la lista viene ordenada desc por
  // scannedAt, así que el primer grupo es siempre el evento más reciente.
  const historyGroups: {
    eventId: string;
    event: DanceSession["event"];
    items: DanceSession[];
    dances: number;
    partners: number;
  }[] = [];
  const byEvent = new Map<string, DanceSession[]>();
  for (const s of history) {
    const arr = byEvent.get(s.eventId) ?? [];
    arr.push(s);
    byEvent.set(s.eventId, arr);
  }
  for (const [groupEventId, items] of byEvent) {
    const d = items.filter((s) => DANCED.has(s.status));
    historyGroups.push({
      eventId: groupEventId,
      event: items[0].event,
      items,
      dances: d.length,
      partners: new Set(
        d.map((s) =>
          s.role.toLowerCase() === "inviter" ? s.inviteeId : s.inviterId,
        ),
      ).size,
    });
  }

  // Progressive disclosure: máximo 3 noches expandidas; el resto tras
  // "ver más". Con ?event= hay un solo grupo — no aplica.
  const VISIBLE_NIGHTS = 3;
  const moreNights = Math.max(0, historyGroups.length - VISIBLE_NIGHTS);
  const visibleGroups =
    allNights || eventId ? historyGroups : historyGroups.slice(0, VISIBLE_NIGHTS);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>
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
          <Button href="/eventos" variant="secondary" size="lg">
            {t("findSocial")}
          </Button>
        </div>
      ) : (
        <>
          {/* Por confirmar — invitaciones vivas de la noche. Siempre
              primero: es la acción más urgente (regla de los ~5s).
              aria-live anuncia invitaciones que llegan por refetch. */}
          {pending.length > 0 && (
            <section
              aria-live="polite"
              aria-label={t("pending")}
              className="flex flex-col gap-3"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("pending")}
              </h2>
              {incoming.length > 0 && outgoing.length > 0 && (
                <h3 className="text-xs font-medium text-white/60">
                  {t("pendingIn")}
                </h3>
              )}
              {incoming.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  busy={busyId === s.id}
                  onAct={(action) => void act(s, action)}
                />
              ))}
              {incoming.length > 0 && outgoing.length > 0 && (
                <h3 className="mt-1 text-xs font-medium text-white/60">
                  {t("pendingOut")}
                </h3>
              )}
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

          {/* Insights del último social — retrospectiva; cuando la vista
              no viene filtrada por ?event= */}
          {showInsights && lastEvent && (
            <section
              aria-labelledby="last-social-heading"
              className="relative overflow-hidden rounded-2xl border border-night-700 bg-night-900 p-4"
            >
              {/* La pista como material: glow radial del acento sobre la
                  superficie — mismo lenguaje que el hero de /inicio */}
              <div
                aria-hidden="true"
                className="glow-neon pointer-events-none absolute inset-0"
              />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <h2
                    id="last-social-heading"
                    className="text-sm font-semibold uppercase tracking-wide text-white/50"
                  >
                    {lastEvent.status === "LIVE"
                      ? t("tonight")
                      : t("lastSocial")}
                  </h2>
                  {lastEvent.status === "LIVE" && (
                    // Indicador live — mismo rojo que Badge variant="live"
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                    </span>
                  )}
                </div>
                <Link
                  href={`/eventos/${lastEventId}`}
                  className="text-display mt-1 block truncate text-xl font-bold text-white transition-colors hover:text-neon"
                >
                  {lastEvent.name}
                </Link>
                <p className="mt-0.5 text-xs text-white/50">
                  {lastEvent.status !== "LIVE" && (
                    <>
                      <EventDate start={lastEvent.startsAt} />
                      {lastEvent.venue?.name ? " · " : ""}
                    </>
                  )}
                  {lastEvent.venue?.name}
                </p>
                <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <div className="flex items-baseline gap-1.5">
                    <dd className="font-semibold tabular-nums text-neon">
                      {danced.length}
                    </dd>
                    <dt className="text-white/60">
                      {t("dancesStat", { count: danced.length })}
                    </dt>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <dd className="font-semibold tabular-nums text-neon">
                      {lastPartners}
                    </dd>
                    <dt className="text-white/60">
                      {t("partnersStat", { count: lastPartners })}
                    </dt>
                  </div>
                  {lastAvg !== null && (
                    <div className="flex items-baseline gap-1.5">
                      <dd className="font-semibold tabular-nums text-neon">
                        ★ {lastAvg.toFixed(1)}
                      </dd>
                      <dt className="text-white/60">{t("avgGiven")}</dt>
                    </div>
                  )}
                </dl>
                {/* Highlight emocional: el mejor baile es una persona, no
                    un texto — avatar + nombre + tu nota. La racha cierra
                    como línea de continuidad. */}
                {(bestDance?.partner || (streak !== null && streak >= 2)) && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-night-700/60 pt-3">
                    {bestDance?.partner && (
                      <p className="flex items-center gap-2 text-sm text-white/70">
                        <PartnerAvatar
                          name={bestDance.partner.name}
                          photoUrl={bestDance.partner.photoUrl}
                          size="sm"
                        />
                        <span className="min-w-0 truncate">
                          {t("bestDance", { name: bestDance.partner.name })}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-neon">
                          ★ {bestDance.myRating!.global}
                        </span>
                      </p>
                    )}
                    {streak !== null && streak >= 2 && (
                      <p className="text-xs font-medium text-neon/80">
                        {t("streakLine", { weeks: streak })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Historial — agrupado por noche (la unidad real del baile).
              Con ?event= hay un solo grupo y el chip ya da el contexto,
              así que el header del grupo se omite. */}
          {history.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("history")}
                </h2>
                {eventId && confirmed.length > 0 && (
                  <p className="text-xs text-white/50">
                    {t("summary", {
                      dances: confirmed.length,
                      partners: partnerCount,
                    })}
                  </p>
                )}
              </div>
              {visibleGroups.map((g) =>
                // Vista filtrada ?event=: un solo grupo — lista plana, el
                // chip ya da el contexto. Sin filtro: acordeón por noche.
                eventId ? (
                  <div key={g.eventId} className="flex flex-col gap-2">
                    {g.items.map((s) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        busy={busyId === s.id}
                        onAct={(action) => void act(s, action)}
                        onRate={(score) => void rate(s, score)}
                      />
                    ))}
                  </div>
                ) : (
                  <details
                    key={g.eventId}
                    className="group rounded-2xl border border-night-700 bg-night-800/40 transition-colors open:bg-night-800/60"
                  >
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {g.event?.name ?? t("unknownEvent")}
                        </p>
                        <p className="text-xs text-white/50">
                          {g.event && (
                            <>
                              <EventDate start={g.event.startsAt} />
                              {g.event.venue?.name
                                ? ` · ${g.event.venue.name}`
                                : ""}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {g.dances > 0 && (
                          <p className="text-xs text-white/50">
                            {t("summary", {
                              dances: g.dances,
                              partners: g.partners,
                            })}
                          </p>
                        )}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          className="h-4 w-4 text-white/40 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m4 6 4 4 4-4" />
                        </svg>
                      </div>
                    </summary>
                    <div className="flex flex-col gap-2 px-3 pb-3">
                      {g.event && (
                        <Link
                          href={`/eventos/${g.event.id}`}
                          className="w-fit text-xs text-neon underline-offset-4 transition-colors hover:underline"
                        >
                          {t("viewEvent")}
                        </Link>
                      )}
                      {g.items.map((s) => (
                        <SessionCard
                          key={s.id}
                          session={s}
                          busy={busyId === s.id}
                          onAct={(action) => void act(s, action)}
                          onRate={(score) => void rate(s, score)}
                        />
                      ))}
                    </div>
                  </details>
                ),
              )}
              {!eventId && moreNights > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-center"
                  aria-expanded={allNights}
                  onClick={() => setAllNights((v) => !v)}
                >
                  {allNights
                    ? t("fewerNights")
                    : t("moreNights", { count: moreNights })}
                </Button>
              )}
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
