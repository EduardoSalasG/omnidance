"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  Badge,
  Button,
  Card,
  EventDate,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";

// Roles que habilitan la consola de puerta (espejo de StaffGuard en la API).
const DOOR_ROLES = new Set(["STAFF", "ADMIN"]);

// Tipos de evento con traducción en el catálogo (events.type.*).
const KNOWN_EVENT_TYPES = new Set([
  "SOCIAL",
  "PRACTICA",
  "GALA",
  "CONGRESS",
  "COMPETITION",
]);

type StaffEvent = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  series: { name: string } | null;
  venue: { name: string; address: string | null } | null;
};

type Gate = "loading" | "unauth" | "notStaff" | "error" | "ready";

export default function StaffPage() {
  const t = useTranslations("staff");
  const tc = useTranslations("common");
  const te = useTranslations("events");

  // /me compartido (MeProvider) - sin fetch propio de sesión: la lista
  // se pide en paralelo desde el mount y el gate se deriva del contexto.
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const gate: Gate = meLoading
    ? "loading"
    : meError
      ? "error"
      : !me
        ? "unauth"
        : !me.roles.some((r) => DOOR_ROLES.has(r))
          ? "notStaff"
          : "ready";

  const [events, setEvents] = useState<StaffEvent[] | null>(null);
  const [eventsError, setEventsError] = useState(false);
  const [eventsNonce, setEventsNonce] = useState(0);

  // v1: staff ve todos los eventos PUBLISHED/LIVE del endpoint público.
  // TODO: filtrar por StaffAssignment cuando la API exponga "mis turnos".
  useEffect(() => {
    let cancelled = false;
    apiFetch("/events")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setEventsError(true);
          return;
        }
        setEventsError(false);
        setEvents((await res.json()) as StaffEvent[]);
      })
      .catch(() => {
        // Fetch rechazado = red caída o API apagada.
        // TODO(offline-first): cachear último listado en IndexedDB.
        if (!cancelled) setEventsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventsNonce]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-5xl lg:px-8">
      {(gate === "loading" || (gate === "ready" && events === null && !eventsError)) && (
        <SkeletonList items={3} />
      )}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notStaff" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{t("notStaff")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void refreshMe()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && eventsError && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="text-ink/70">
            {tc("error")}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setEvents(null);
              setEventsError(false);
              setEventsNonce((n) => n + 1);
            }}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && events !== null &&
        (events.length === 0 ? (
          <p className="text-ink/60">{te("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/staff/${e.id}`} className="block">
                  <Card className="transition-colors hover:border-neon/50">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {e.status === "LIVE" && (
                          <Badge variant="live">{te("live")}</Badge>
                        )}
                        {e.series && (
                          <Badge variant="neon">{e.series.name}</Badge>
                        )}
                        {KNOWN_EVENT_TYPES.has(e.type) && (
                          <Badge variant="outline">
                            {te(`type.${e.type}`)}
                          </Badge>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold">{e.name}</h2>
                      <p className="text-sm text-ink/60">
                        <EventDate start={e.startsAt} end={e.endsAt} />
                        {e.venue && ` · ${e.venue.name}`}
                      </p>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </main>
  );
}
