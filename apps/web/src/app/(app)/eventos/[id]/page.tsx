import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import messages from "../../../../../messages/es-CL.json";
import {
  aggregateMix,
  BackLink,
  Badge,
  Button,
  Card,
  EventDate,
  GenreMixBar,
  PriceTag,
} from "@/components/ui";
import type { GenreMixBlock } from "@/components/ui";
import { PrimeTimeWidget } from "@/components/gamification/PrimeTimeWidget";
import { SeriesPassCta } from "@/components/checkout/series-pass-cta";
import { BuyTicketCta } from "@/components/checkout/buy-ticket-cta";

// Misma paleta que la cartelera (eventos/page.tsx).
const GENRE_TEXT: Record<string, string> = {
  SALSA: "text-orange-400",
  BACHATA: "text-fuchsia-300",
  CUBANO: "text-amber-300",
};

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Fila del cronograma: t = "HH:MM" o "Hasta HH:MM", end cierra el rango. */
type ProgramItem = { t: string; end?: string; label: string };

type EventDetail = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  presalePrice: number | null;
  doorPrice: number | null;
  primeThreshold: number | null;
  genres: string[];
  genreMix: GenreMixBlock[] | null;
  program: ProgramItem[] | null;
  /** FK escalar — hoy GET /events/:id no la selecciona (ver nota en el render). */
  seriesId?: string | null;
  /** FK escalar del venue — sí viene en el select; se usa para linkear al perfil. */
  venueId?: string | null;
  series: {
    id?: string;
    name: string;
    genres?: string[];
    genreMix?: GenreMixBlock[] | null;
    program?: ProgramItem[] | null;
  } | null;
  venue: { name: string; address: string | null; capacity: number | null };
  djs: {
    slotNote: string | null;
    person: { name: string; photoUrl: string | null };
  }[];
  shows: {
    academy: string;
    teamType: string;
    name: string;
  }[];
  scheduleBlocks: {
    startsAt: string;
    endsAt: string;
    style: { name: string } | null;
  }[];
};

/** MissionView del API (gamification.service.ts): misiones del evento + progreso propio. */
type MissionView = {
  id: string;
  key: string;
  name: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
};

async function getEvent(id: string): Promise<EventDetail | "error"> {
  const res = await fetch(`${API_URL}/api/events/${id}`, {
    cache: "no-store",
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res || !res.ok) return "error";
  return (await res.json()) as EventDetail;
}

/**
 * GET /events/:id/missions (SessionGuard en el API): requiere la cookie de
 * sesión del request — 401 = no autenticado → la sección se oculta (null).
 * Shape real (GamificationService.missionsFor → MissionView): ver type abajo.
 */
async function getMissions(eventId: string): Promise<MissionView[] | null> {
  const res = await fetch(`${API_URL}/api/events/${eventId}/missions`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return (await res.json()) as MissionView[];
}

/**
 * GET /tickets/mine (SessionGuard): true si el usuario ya tiene una entrada
 * ACTIVE para este evento — dispara el popup de confirmación en el CTA.
 */
async function hasActiveTicket(eventId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/tickets/mine`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (!res?.ok) return false;
  const rows = (await res.json()) as {
    event: { id: string };
    status: string;
  }[];
  return rows.some((r) => r.event.id === eventId && r.status === "ACTIVE");
}

export default async function EventoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = messages.events;
  const tg = messages.gamification;
  const [event, missions, myTicket] = await Promise.all([
    getEvent(params.id),
    getMissions(params.id),
    hasActiveTicket(params.id),
  ]);

  if (event === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-white/60">{t.loadError}</p>
        <Button href="/eventos" variant="secondary">
          {t.backToList}
        </Button>
      </main>
    );
  }

  const typeLabel =
    event.type in t.type
      ? t.type[event.type as keyof typeof t.type]
      : event.type;
  const blocks = [...event.scheduleBlocks].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const ctaPrice = event.presalePrice ?? event.doorPrice;
  const ctaLabel =
    event.presalePrice != null
      ? t.presale
      : event.doorPrice != null
        ? t.door
        : t.free;
  const capacity = event.capacity ?? event.venue.capacity;

  // Géneros/mix resueltos igual que el listado: el evento manda, si no hereda la serie.
  const genres = event.genres.length
    ? event.genres
    : (event.series?.genres ?? []);
  const genreMix = event.genreMix ?? event.series?.genreMix ?? null;
  // Cronograma: misma herencia — el evento manda, si no el de la serie.
  const program = event.program ?? event.series?.program ?? null;
  const mixSegs = genreMix?.length ? aggregateMix(genreMix) : null;
  const orderedGenres = mixSegs
    ? [...mixSegs].sort((a, b) => b.pct - a.pct).map((s) => s.genre)
    : genres;

  // "Cómo llegar": URL universal de Google Maps — sin API key, el SO la
  // abre en la app de mapas que el usuario tenga.
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [event.venue.name, event.venue.address].filter(Boolean).join(" "),
  )}`;

  // Pase de serie: el endpoint hoy devuelve solo series.name — el CTA se
  // muestra cuando el id llega (seriesId escalar o series.id). POST
  // /checkout/series-pass exige month "YYYY-MM" = mes del evento (mismo
  // criterio local que currentMonth() en checkins).
  const seriesId = event.seriesId ?? event.series?.id ?? null;
  const eventMonth = (() => {
    const d = new Date(event.startsAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-44 pt-6 sm:px-6">
      <BackLink href="/eventos">{t.backToList}</BackLink>

      {/* Hero */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {event.series && <Badge variant="neon">{event.series.name}</Badge>}
          <Badge variant="outline">{typeLabel}</Badge>
          {event.status === "LIVE" && <Badge variant="live">{t.live}</Badge>}
        </div>
        <h1 className="text-3xl font-bold leading-tight">{event.name}</h1>
        <EventDate
          variant="full"
          start={event.startsAt}
          end={event.endsAt}
          className="text-white/70"
        />
        {/* Estilos: texto coloreado + barra del ciclo del DJ */}
        {orderedGenres.length > 0 && (
          <p className="text-sm">
            {orderedGenres.map((g, i) => (
              <span key={g}>
                {i > 0 && <span className="text-white/30"> · </span>}
                <span className={GENRE_TEXT[g] ?? "text-white/50"}>
                  {t.genre[g as keyof typeof t.genre] ?? g}
                </span>
              </span>
            ))}
          </p>
        )}
        {mixSegs && (
          <GenreMixBar
            mix={genreMix!}
            labels={t.genre as Record<string, string>}
            className="max-w-xs"
          />
        )}
        {/* Local: nombre → perfil público; Cómo llegar → app de mapas */}
        <div className="flex items-center gap-2 text-sm">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-white/50"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <div className="min-w-0">
            <p className="font-medium">
              {event.venueId ? (
                <Link
                  href={`/locales/${event.venueId}`}
                  className="underline-offset-4 hover:text-neon hover:underline"
                >
                  {event.venue.name}
                </Link>
              ) : (
                event.venue.name
              )}
            </p>
            <p className="text-white/50">
              {[
                event.venue.address,
                capacity != null
                  ? t.capacity.replace("{count}", capacity.toLocaleString("es-CL"))
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex min-h-11 items-center text-xs font-medium text-neon hover:underline"
            >
              {t.howToGet} →
            </a>
          </div>
        </div>
      </header>

      {/* Prime Time — solo cuando el evento está en vivo */}
      {event.status === "LIVE" && <PrimeTimeWidget eventId={event.id} />}

      {/* Precios */}
      <Card>
        {event.presalePrice == null && event.doorPrice == null ? (
          <p className="text-lg font-semibold text-neon">{t.free}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/50">
                {t.presale}
              </dt>
              <dd className="mt-1">
                <PriceTag amount={event.presalePrice} className="text-xl" />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/50">
                {t.door}
              </dt>
              <dd className="mt-1">
                <PriceTag amount={event.doorPrice} className="text-xl" />
              </dd>
            </div>
          </dl>
        )}
      </Card>

      {/* Planificación de la noche — qué pasa y a qué hora */}
      {program != null && program.length > 0 && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.program}
          </h2>
          <ol className="relative ml-2 flex flex-col gap-3.5 border-l border-night-700 pl-5">
            {program.map((p, i) => (
              <li key={i} className="relative flex items-baseline gap-3">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.6875rem] top-1.5 h-2.5 w-2.5 rounded-full bg-neon"
                />
                <span className="w-24 shrink-0 text-sm tabular-nums text-white/50">
                  {p.t}
                  {p.end ? `–${p.end}` : ""}
                </span>
                <p className="font-medium">{p.label}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Pase de serie — solo si el evento pertenece a una serie con id */}
      {seriesId && (
        <SeriesPassCta
          seriesId={seriesId}
          month={eventMonth}
          seriesName={event.series?.name ?? ""}
        />
      )}

      {event.type === "PRACTICA" && (
        <Link
          href="/practicas"
          className="inline-flex min-h-11 w-fit items-center text-sm text-white/60 underline-offset-4 hover:text-neon"
        >
          {messages.practices.title} →
        </Link>
      )}

      {/* Misiones — solo con sesión (401 → getMissions devuelve null y se oculta) */}
      {missions !== null && missions.length > 0 && (
        <section aria-labelledby="missions-heading">
          <Card>
            <h2
              id="missions-heading"
              className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50"
            >
              {tg.missions}
            </h2>
            <ul className="flex flex-col gap-4">
              {missions.map((m) => {
                const pct =
                  m.target > 0
                    ? Math.min(100, Math.round((m.progress / m.target) * 100))
                    : 0;
                return (
                  <li key={m.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{m.name}</p>
                      {m.completed ? (
                        <Badge variant="neon">{tg.completed}</Badge>
                      ) : (
                        <span className="shrink-0 text-sm text-white/50">
                          {tg.primeProgress
                            .replace("{current}", String(m.progress))
                            .replace("{threshold}", String(m.target))}
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-sm text-white/60">{m.description}</p>
                    )}
                    <div
                      role="progressbar"
                      aria-valuenow={m.progress}
                      aria-valuemin={0}
                      aria-valuemax={m.target}
                      aria-label={m.name}
                      className="h-2 w-full overflow-hidden rounded-full bg-night-800"
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${
                          m.completed ? "bg-neon" : "bg-neon/60"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {/* Lineup */}
      {event.djs.length > 0 && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.lineup}
          </h2>
          <ul className="flex flex-col gap-4">
            {event.djs.map((dj, i) => (
              <li key={`${dj.person.name}-${i}`} className="flex items-center gap-3">
                {dj.person.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URLs externas, dominios no configurados
                  <img
                    src={dj.person.photoUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full border border-night-700 object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-night-700 bg-night-800 text-sm font-bold text-neon"
                  >
                    {dj.person.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="font-medium">{dj.person.name}</p>
                  {dj.slotNote && (
                    <p className="text-xs text-white/50">{dj.slotNote}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Shows de la noche — academias invitadas con sus teams.
          0..n (típico 3–5); vacío → sección oculta. */}
      {event.shows.length > 0 && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.shows}
          </h2>
          <ul className="flex flex-col gap-4">
            {event.shows.map((show, i) => (
              <li key={`${show.academy}-${show.name}-${i}`}>
                <p className="font-medium">{show.academy}</p>
                <p className="text-sm text-white/60">
                  {(t.showTeam as Record<string, string>)[show.teamType] ??
                    show.teamType}
                  {" · "}
                  <span className="text-white/80">{show.name}</span>
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Timeline por estilo */}
      {blocks.length > 0 && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.schedule}
          </h2>
          <ol className="relative ml-2 flex flex-col gap-5 border-l border-night-700 pl-5">
            {blocks.map((b, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.6875rem] top-1.5 h-2.5 w-2.5 rounded-full bg-neon"
                />
                <EventDate
                  variant="time"
                  start={b.startsAt}
                  end={b.endsAt}
                  className="block text-sm text-white/50"
                />
                <p className="font-medium">{b.style?.name ?? t.openFloor}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* CTA sticky (mobile-first) — flota sobre la BottomNav */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-night-700 bg-night-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <span className="block text-xs text-white/50">{ctaLabel}</span>
            {ctaPrice != null ? (
              <PriceTag amount={ctaPrice} className="text-lg" />
            ) : (
              <span className="text-lg font-semibold text-neon">{t.free}</span>
            )}
          </div>
          <BuyTicketCta
            href={`/eventos/${event.id}/checkout`}
            hasTicket={myTicket}
            label={t.getTicket}
          />
        </div>
      </div>
    </main>
  );
}
