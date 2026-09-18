"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { SessionCard } from "@/components/sessions/SessionCard";
import { isInvitee } from "@/components/sessions/types";
import type { DanceSession, SessionAction } from "@/components/sessions/types";
import { AvailabilitySection } from "@/components/social/AvailabilitySection";
import { PartnerRequests } from "@/components/social/PartnerRequests";
import type { Me } from "@/components/social/types";

type Phase = "loading" | "unauth" | "ready" | "error";

function Bailes() {
  const t = useTranslations("sessions");
  const tStaff = useTranslations("staff");
  const tCommon = useTranslations("common");

  const eventId = useSearchParams().get("event");

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessions, setSessions] = useState<DanceSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // undefined = cargando; null = sin sesión. Alimenta las secciones sociales.
  const [me, setMe] = useState<Me | null | undefined>(undefined);

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
    // /me alimenta las secciones sociales (toggle, ownership de solicitudes).
    apiFetch("/me")
      .then(async (res) => setMe(res.ok ? ((await res.json()) as Me) : null))
      .catch(() => setMe(null));
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("refresh")}
            onClick={() => void fetchSessions()}
          >
            ↻
          </Button>
          <Button href={scanHref} variant="secondary" size="sm">
            {tStaff("scan")}
          </Button>
        </div>
      </header>

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
        <p role="status" className="text-white/50">
          {tCommon("loading")}
        </p>
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

      {/* Discovery social — feeds públicos; acciones requieren sesión */}
      <AvailabilitySection me={me} />
      <PartnerRequests me={me} />
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
