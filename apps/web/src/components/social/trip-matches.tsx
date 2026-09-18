"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import consumer from "@/i18n/parts/consumer.json";

// GET /trips/matches (trips.controller.ts): viajes de OTRAS personas que
// coinciden por destination (contains, insensitive) o eventId. Requiere al
// menos uno de esos params (400 si falta); from/to acotan a rangos que
// solapan. No devuelve overlapDays — se calcula en cliente contra mi viaje.
type MatchPerson = { id: string; name: string; photoUrl: string | null };

type TripMatch = {
  id: string;
  destination: string;
  eventId: string | null;
  startsAt: string;
  endsAt: string;
  person: MatchPerson | null;
};

/** Subconjunto de Trip que la sección necesita para consultar matches. */
export type TripRange = {
  id: string;
  destination: string;
  eventId: string | null;
  startsAt: string;
  endsAt: string;
};

type MatchEntry = { match: TripMatch; overlapDays: number };
type FeedState = "loading" | "ready" | "error";

const DAY_MS = 24 * 60 * 60 * 1000;
const tm = consumer.tripMatches;

/**
 * Sección "Coincidencias" de /viajes: para cada viaje propio consulta
 * /trips/matches (destination + eventId + rango) y fusiona los resultados
 * deduplicando por id de viaje. Carga y errores independientes del resto
 * de la página — una falla solo afecta esta sección.
 */
export function TripMatches({ trips }: { trips: TripRange[] }) {
  const tc = useTranslations("common");
  const titleId = useId();

  const [state, setState] = useState<FeedState>("loading");
  const [entries, setEntries] = useState<MatchEntry[]>([]);
  // personId → "sent" | "error": estado de la solicitud de amistad por match.
  const [requests, setRequests] = useState<Record<string, "sent" | "error">>(
    {},
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (trips.length === 0) {
        setEntries([]);
        setState("ready");
        return;
      }
      setState("loading");
      const byId = new Map<string, MatchEntry>();

      const results = await Promise.all(
        trips.map(async (mine) => {
          const params = new URLSearchParams({
            destination: mine.destination,
            from: mine.startsAt,
            to: mine.endsAt,
          });
          if (mine.eventId) params.set("eventId", mine.eventId);
          const res = await apiFetch(`/trips/matches?${params}`).catch(
            () => null,
          );
          if (!res || !res.ok) return "error" as const;

          for (const m of (await res.json()) as TripMatch[]) {
            // Solape [startsAt,endsAt] ∩ [mine] — inclusivo en días.
            const start = Math.max(
              new Date(m.startsAt).getTime(),
              new Date(mine.startsAt).getTime(),
            );
            const end = Math.min(
              new Date(m.endsAt).getTime(),
              new Date(mine.endsAt).getTime(),
            );
            const days = Math.max(1, Math.floor((end - start) / DAY_MS) + 1);
            const prev = byId.get(m.id);
            if (!prev || days > prev.overlapDays) {
              byId.set(m.id, { match: m, overlapDays: days });
            }
          }
          return "ok" as const;
        }),
      );

      if (cancelled) return;
      if (results.includes("error")) {
        setState("error");
        return;
      }
      setEntries(
        [...byId.values()].sort(
          (a, b) =>
            new Date(a.match.startsAt).getTime() -
            new Date(b.match.startsAt).getTime(),
        ),
      );
      setState("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [trips]);

  /** POST /friends {personId}: solicitud de amistad. 409 = ya existe → "sent". */
  async function connect(personId: string) {
    setRequests((r) => {
      const next = { ...r };
      delete next[personId];
      return next;
    });
    const res = await apiFetch("/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId }),
    }).catch(() => null);
    const sent = res?.ok || res?.status === 409;
    setRequests((r) => ({ ...r, [personId]: sent ? "sent" : "error" }));
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2
        id={titleId}
        className="text-sm font-semibold uppercase tracking-wide text-white/50"
      >
        {tm.title}
      </h2>

      {state === "loading" && (
        <p role="status" className="text-white/50">
          {tc("loading")}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-white/60">
          {tc("error")}
        </p>
      )}

      {state === "ready" &&
        (entries.length === 0 ? (
          <Card>
            <p role="status" className="text-white/60">
              {tm.empty}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map(({ match, overlapDays }) => {
              const person = match.person;
              const name = person?.name?.trim() || tm.traveler;
              const req = person ? requests[person.id] : undefined;
              return (
                <li key={match.id}>
                  <Card className="flex items-center gap-3">
                    <PartnerAvatar
                      name={name}
                      photoUrl={person?.photoUrl ?? null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{name}</p>
                      <p className="truncate text-sm text-white/60">
                        {match.destination}
                      </p>
                      <p className="mt-0.5 text-xs text-white/50">
                        <EventDate variant="compact" start={match.startsAt} /> →{" "}
                        <EventDate variant="compact" start={match.endsAt} />
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant="neon">
                        {overlapDays === 1
                          ? tm.overlapDay
                          : tm.overlapDays.replace(
                              "{days}",
                              String(overlapDays),
                            )}
                      </Badge>
                      {person &&
                        (req === "sent" ? (
                          <span className="text-xs text-white/50">
                            {tm.requestSent}
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 px-2"
                            onClick={() => void connect(person.id)}
                          >
                            {tm.connect}
                          </Button>
                        ))}
                      {req === "error" && (
                        <p role="alert" className="text-xs text-red-400">
                          {tc("error")}
                        </p>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
