"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { PageLoading, Spinner } from "@/components/ui/spinner";

/**
 * /dj — consola del rol DJ. GET /dj/gigs devuelve los gigs donde el DJ
 * está asignado ({upcoming, past}); cada gig próximo expande inline el
 * ranking de sugerencias del público (GET /dj/gigs/:eventId/suggestions —
 * la API ya filtra a asistentes con ticket). Sin h1: el chrome resuelve
 * el título de sección via pageLabel.
 */

// Tipos de evento con traducción en el catálogo (events.type.*) — mismo
// set que /staff.
const KNOWN_EVENT_TYPES = new Set([
  "SOCIAL",
  "PRACTICA",
  "GALA",
  "CONGRESS",
  "COMPETITION",
]);

type Gig = {
  eventId: string;
  name: string;
  type: string;
  startsAt: string;
  endsAt: string;
  venueName: string | null;
  slotNote: string | null;
};

type GigsResponse = {
  upcoming?: Gig[];
  past?: Gig[];
};

type Suggestion = { title: string; artist: string; count: number };

// El contrato dice "ranking + total"; se toleran las claves ranking /
// items / suggestions (o un array desnudo) hasta que el endpoint aterrice.
function parseSuggestions(data: unknown): {
  items: Suggestion[];
  total: number | null;
} {
  if (Array.isArray(data))
    return { items: data as Suggestion[], total: null };
  const obj = (data ?? {}) as Record<string, unknown>;
  const items = (obj.ranking ?? obj.items ?? obj.suggestions ??
    []) as Suggestion[];
  const total =
    typeof obj.total === "number" ? obj.total : items.length;
  return { items, total };
}

const num = new Intl.NumberFormat("es-CL");
// Historial: solo fecha (sin hora) — los gigs pasados no necesitan el slot.
const pastFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type SugPhase = "loading" | "error" | "forbidden" | "ready";

/** Ranking de sugerencias de un gig — se monta al expandir la card. */
function SuggestionsPanel({ eventId }: { eventId: string }) {
  const t = useTranslations("dj");
  const tc = useTranslations("common");

  const [phase, setPhase] = useState<SugPhase>("loading");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await apiFetch(`/dj/gigs/${eventId}/suggestions`);
      if (res.status === 401 || res.status === 403) {
        setPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const parsed = parseSuggestions(await res.json());
      setItems(parsed.items);
      setTotal(parsed.total);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section aria-label={t("suggestions.title")} className="flex flex-col gap-3">
      {phase === "loading" && <Spinner size="sm" className="page-loading" />}

      {phase === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {t("suggestions.error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {phase === "forbidden" && (
        <p role="status" className="text-sm text-white/50">
          {t("suggestions.forbidden")}
        </p>
      )}

      {phase === "ready" && items.length === 0 && (
        <p role="status" className="text-sm text-white/50">
          {t("suggestions.empty")}
        </p>
      )}

      {phase === "ready" && items.length > 0 && (
        <>
          {total != null && (
            <p className="text-xs text-white/50">
              {t("suggestions.total", { count: total })}
            </p>
          )}
          <ol className="flex flex-col gap-1.5">
            {items.map((s, i) => (
              <li
                key={`${s.title}-${s.artist}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-950 px-4 py-2.5"
              >
                <span
                  aria-hidden
                  className="w-5 shrink-0 text-sm font-semibold tabular-nums text-white/40"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {s.title}
                  </span>
                  <span className="block truncate text-xs text-white/50">
                    {s.artist}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-neon">
                  ×{num.format(s.count)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Card de gig próximo — expande el panel de sugerencias inline. */
function GigCard({ gig }: { gig: Gig }) {
  const t = useTranslations("dj");
  const te = useTranslations("events");
  const [open, setOpen] = useState(false);
  const panelId = `dj-suggestions-${gig.eventId}`;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {KNOWN_EVENT_TYPES.has(gig.type) && (
            <Badge variant="outline">{te(`type.${gig.type}`)}</Badge>
          )}
          {gig.slotNote && <Badge variant="neon">{gig.slotNote}</Badge>}
        </div>
        <h3 className="mt-2 text-base font-semibold">{gig.name}</h3>
        <p className="mt-0.5 text-sm text-white/60">
          <EventDate start={gig.startsAt} end={gig.endsAt} />
          {gig.venueName ? ` · ${gig.venueName}` : ""}
        </p>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-night-700 bg-night-800/60 px-4 text-sm font-semibold text-white/80 transition-colors hover:border-neon/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {open ? t("suggestions.hide") : t("suggestions.show")}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="border-t border-night-700 pt-3">
          <SuggestionsPanel eventId={gig.eventId} />
        </div>
      )}
    </Card>
  );
}

export default function DjPage() {
  const t = useTranslations("dj");
  const tc = useTranslations("common");

  const [phase, setPhase] = useState<
    "loading" | "error" | "forbidden" | "unauth" | "ready"
  >("loading");
  const [upcoming, setUpcoming] = useState<Gig[]>([]);
  const [past, setPast] = useState<Gig[]>([]);

  // Boot: gigs asignados al DJ. 401 → sin sesión (CTA login), 403 →
  // cuenta sin gigs asignados; cualquier otro fallo → error + retry.
  const boot = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await apiFetch("/dj/gigs");
      if (res.status === 401) {
        setPhase("unauth");
        return;
      }
      if (res.status === 403) {
        setPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const data = (await res.json()) as GigsResponse;
      setUpcoming(data.upcoming ?? []);
      setPast(data.past ?? []);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (phase === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <PageLoading />
      </main>
    );
  }

  if (phase === "unauth") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-white/70">{t("loadError")}</p>
          <Button variant="secondary" size="sm" onClick={() => void boot()}>
            {tc("retry")}
          </Button>
        </Card>
      </main>
    );
  }

  if (phase === "forbidden") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("forbidden")}</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      {/* Próximos gigs — cards expandibles con sugerencias del público. */}
      <section aria-labelledby="dj-upcoming">
        <h2
          id="dj-upcoming"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50"
        >
          {t("upcoming")}
        </h2>
        {upcoming.length === 0 ? (
          <Card className="py-6 text-center">
            <p className="text-sm text-white/70">{t("emptyUpcoming")}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((g) => (
              <li key={g.eventId}>
                <GigCard gig={g} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historial — colapsado al final; fecha + nombre + venue. */}
      {past.length > 0 && (
        <details className="group rounded-2xl border border-night-700 bg-night-900">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              {t("history")}
              <Badge variant="muted">{num.format(past.length)}</Badge>
            </span>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <ul className="flex flex-col divide-y divide-night-700 border-t border-night-700 px-5">
            {past.map((g) => (
              <li
                key={g.eventId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {g.name}
                  </span>
                  {g.venueName && (
                    <span className="block truncate text-xs text-white/50">
                      {g.venueName}
                    </span>
                  )}
                </span>
                <time
                  dateTime={new Date(g.startsAt).toISOString()}
                  className="shrink-0 text-xs tabular-nums text-white/50"
                >
                  {pastFmt.format(new Date(g.startsAt))}
                </time>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
