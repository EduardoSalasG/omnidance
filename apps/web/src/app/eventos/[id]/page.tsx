import Link from "next/link";
import { notFound } from "next/navigation";
import messages from "../../../../messages/es-CL.json";
import { Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
import { PrimeTimeWidget } from "@/components/gamification/PrimeTimeWidget";

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
  series: { name: string } | null;
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

async function getEvent(id: string): Promise<EventDetail | "error"> {
  const res = await fetch(`${API_URL}/api/events/${id}`, {
    cache: "no-store",
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res || !res.ok) return "error";
  return (await res.json()) as EventDetail;
}

export default async function EventoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = messages.events;
  const event = await getEvent(params.id);

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-32 pt-6 sm:px-6">
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
            <p className="mt-1 text-xs text-white/40">
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
                    alt={dj.person.name}
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

      {/* CTA sticky (mobile-first) */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-night-700 bg-night-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
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
