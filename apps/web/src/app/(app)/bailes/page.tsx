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
  // Insights del último social: catálogo de estilos para resolver
  // styleId → nombre (la ficha del evento ya viene en cada sesión).
  const [styleNames, setStyleNames] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );

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

  // Nombres de estilo para el breakdown — catálogo chico, una sola vez.
  useEffect(() => {
    if (!sessions.some((s) => s.styleId) || styleNames.size > 0) return;
    apiFetch("/styles")
      .then(async (res) => {
        if (!res.ok) return;
        const styles = (await res.json()) as { id: string; name: string }[];
        setStyleNames(new Map(styles.map((s) => [s.id, s.name])));
      })
      .catch(() => {});
  }, [sessions, styleNames.size]);

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

  // Resumen de la vista actual: bailes confirmados y parejas distintas.
  const confirmed = history.filter((s) => s.status === "CONFIRMED");
  const partnerCount = new Set(
    confirmed.map((s) => s.partner?.name).filter(Boolean),
  ).size;

  // ── Insights del último social ─────────────────────────────────────
  // Baile real = CONFIRMED | RATED | CLOSED (DECLINED/DISCARDED/EXPIRED
  // no cuentan). El evento es el de la sesión más reciente.
  const DANCED = new Set(["CONFIRMED", "RATED", "CLOSED"]);
  const lastSessions = lastEventId
    ? sessions.filter((s) => s.eventId === lastEventId)
    : [];
  const danced = lastSessions.filter((s) => DANCED.has(s.status));
  const lastPartners = new Set(
    danced.map((s) =>
      s.role.toLowerCase() === "inviter" ? s.inviteeId : s.inviterId,
    ),
  ).size;
  const myScores = lastSessions
    .map((s) => s.myRating?.global)
    .filter((v): v is number => typeof v === "number");
  const lastAvg =
    myScores.length > 0
      ? Math.round((myScores.reduce((a, b) => a + b, 0) / myScores.length) * 10) /
        10
      : null;
  const times = danced.map((s) => new Date(s.scannedAt).getTime());
  const lastFrom = times.length ? new Date(Math.min(...times)) : null;
  const lastTo = times.length ? new Date(Math.max(...times)) : null;
  const styleCounts = new Map<string, number>();
  for (const s of danced) {
    if (s.styleId) styleCounts.set(s.styleId, (styleCounts.get(s.styleId) ?? 0) + 1);
  }
  const topStyles = [...styleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id, n]) => `${styleNames.get(id) ?? ""} ×${n}`)
    .filter((s) => !s.startsWith(" "));
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
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
        </div>
      ) : (
        <>
          {/* Insights del último social — primera sección cuando la vista
              no viene filtrada por ?event= */}
          {showInsights && lastEvent && (
            <section
              aria-labelledby="last-social-heading"
              className="rounded-2xl border border-night-700 bg-night-800/60 p-4"
            >
              <h2
                id="last-social-heading"
                className="text-sm font-semibold uppercase tracking-wide text-white/50"
              >
                {t("lastSocial")}
              </h2>
              <Link
                href={`/eventos/${lastEventId}`}
                className="mt-1.5 block text-lg font-semibold text-white transition-colors hover:text-neon"
              >
                {lastEvent.name}
              </Link>
              <p className="mt-0.5 text-xs text-white/50">
                <EventDate start={lastEvent.startsAt} />
                {lastEvent.venue?.name ? ` · ${lastEvent.venue.name}` : ""}
              </p>
              <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <div className="flex items-baseline gap-1.5">
                  <dd className="font-semibold text-neon">{danced.length}</dd>
                  <dt className="text-white/60">
                    {t("dancesStat", { count: danced.length })}
                  </dt>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dd className="font-semibold text-neon">{lastPartners}</dd>
                  <dt className="text-white/60">
                    {t("partnersStat", { count: lastPartners })}
                  </dt>
                </div>
                {lastAvg !== null && (
                  <div className="flex items-baseline gap-1.5">
                    <dd className="font-semibold text-neon">
                      ★ {lastAvg.toFixed(1)}
                    </dd>
                    <dt className="text-white/60">{t("avgGiven")}</dt>
                  </div>
                )}
              </dl>
              {(lastFrom || topStyles.length > 0) && (
                <p className="mt-2 text-xs text-white/50">
                  {lastFrom && lastTo && (
                    <>
                      <EventDate start={lastFrom} variant="time" />
                      {" – "}
                      <EventDate start={lastTo} variant="time" />
                    </>
                  )}
                  {topStyles.length > 0 &&
                    `${lastFrom ? " · " : ""}${topStyles.join(" · ")}`}
                </p>
              )}
            </section>
          )}

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
              {historyGroups.map((g) => (
                <section
                  key={g.eventId}
                  aria-label={g.event?.name}
                  className="flex flex-col gap-2"
                >
                  {!eventId && g.event && (
                    <header className="flex items-baseline justify-between gap-3 px-0.5 pt-1">
                      <div className="min-w-0">
                        <Link
                          href={`/eventos/${g.event.id}`}
                          className="block truncate text-sm font-semibold text-white transition-colors hover:text-neon"
                        >
                          {g.event.name}
                        </Link>
                        <p className="text-xs text-white/50">
                          <EventDate start={g.event.startsAt} />
                          {g.event.venue?.name
                            ? ` · ${g.event.venue.name}`
                            : ""}
                        </p>
                      </div>
                      {g.dances > 0 && (
                        <p className="shrink-0 text-xs text-white/50">
                          {t("summary", {
                            dances: g.dances,
                            partners: g.partners,
                          })}
                        </p>
                      )}
                    </header>
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
                </section>
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
