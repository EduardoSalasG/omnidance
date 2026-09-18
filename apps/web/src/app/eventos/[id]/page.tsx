import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import messages from "../../../../messages/es-CL.json";
import { Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
import { PrimeTimeWidget } from "@/components/gamification/PrimeTimeWidget";
import { RsvpControls } from "@/components/rsvp/RsvpControls";
import { SeriesPassCta } from "@/components/checkout/series-pass-cta";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

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
  /** FK escalar — hoy GET /events/:id no la selecciona (ver nota en el render). */
  seriesId?: string | null;
  series: { id?: string; name: string } | null;
  venue: { name: string; address: string | null; capacity: number | null };
  djs: {
    slotNote: string | null;
    person: { name: string; photoUrl: string | null };
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

export default async function EventoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = messages.events;
  const tg = messages.gamification;
  const [event, missions] = await Promise.all([
    getEvent(params.id),
    getMissions(params.id),
  ]);

  if (event === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
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
      <Link
        href="/eventos"
        className="inline-flex min-h-11 w-fit items-center text-sm text-white/60 hover:text-white"
      >
        ← {t.backToList}
      </Link>

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
        <div className="text-sm">
          <p className="font-medium">{event.venue.name}</p>
          {event.venue.address && (
            <p className="text-white/50">{event.venue.address}</p>
          )}
          {capacity != null && (
            <p className="mt-1 text-xs text-white/50">
              {t.capacity.replace("{count}", capacity.toLocaleString("es-CL"))}
            </p>
          )}
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

      {/* Pase de serie — solo si el evento pertenece a una serie con id */}
      {seriesId && (
        <SeriesPassCta
          seriesId={seriesId}
          month={eventMonth}
          seriesName={event.series?.name ?? ""}
        />
      )}

      {/* RSVP social */}
      <RsvpControls eventId={event.id} />
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
            <Link
              href={`/bailes?event=${event.id}`}
              className="inline-flex min-h-11 items-center text-xs text-white/50 underline-offset-4 hover:text-neon"
            >
              {messages.sessions.title} →
            </Link>
          </div>
          <Button
            href={`/eventos/${event.id}/checkout`}
            size="lg"
            className="shrink-0"
          >
            {t.getTicket}
          </Button>
        </div>
      </div>
    </main>
  );
}
