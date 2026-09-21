import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { messages } from "@/i18n/messages";
import {
  Card,
  EventDate,
  GenreMixBar,
  PriceTag,
  aggregateMix,
} from "@/components/ui";
import type { GenreMixBlock } from "@/components/ui";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type VenueEvent = {
  id: string;
  name: string;
  startsAt: string;
  genres: string[];
  genreMix: GenreMixBlock[] | null;
  presalePrice: number | null;
  doorPrice: number | null;
};

type VenueProfile = {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
  logoUrl: string | null;
  hours: string | null;
  events: VenueEvent[];
};

type VenueT = (typeof messages)["venuePublic"] & Record<string, string>;
type EventsT = (typeof messages)["events"] & {
  genre: Record<string, string>;
};

const GENRE_TEXT: Record<string, string> = {
  SALSA: "text-orange-400",
  BACHATA: "text-fuchsia-300",
  CUBANO: "text-amber-300",
};

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

async function getVenue(id: string): Promise<VenueProfile> {
  const res = await fetch(`${API_URL}/api/venues/${id}?days=45`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res?.ok) notFound();
  return (await res.json()) as VenueProfile;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const venue = await getVenue(params.id);
  return { title: `${venue.name} — locales` };
}

export default async function VenueProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const t = messages.venuePublic as VenueT;
  const te = messages.events as EventsT;
  const isAuthed = cookies().has("omnidance_session");
  const venue = await getVenue(params.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-24 pt-6 sm:px-6">
      <Link
        href="/eventos?view=map"
        className="inline-flex min-h-11 w-fit items-center text-sm text-white/60 hover:text-white"
      >
        ← {t.back}
      </Link>

      {/* Perfil: logo (o inicial), nombre, dirección y horarios */}
      <header className="flex items-start gap-4">
        {venue.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa del venue
          <img
            src={venue.logoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-neon/15 text-2xl font-bold text-neon"
          >
            {venue.name.charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight">{venue.name}</h1>
          {venue.address && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {venue.address}
            </p>
          )}
          {venue.hours && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
              {venue.hours}
            </p>
          )}
          {venue.capacity != null && (
            <p className="mt-1 text-xs text-white/40">
              {t.capacity.replace(
                "{count}",
                venue.capacity.toLocaleString("es-CL"),
              )}
            </p>
          )}
        </div>
      </header>

      {/* Próximos eventos del local */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-neon">{t.upcoming}</h2>
        {venue.events.length === 0 ? (
          <p className="text-sm text-white/50">{t.noUpcoming}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {venue.events.map((e) => {
              const mixSegs = e.genreMix?.length
                ? aggregateMix(e.genreMix)
                : null;
              const orderedGenres = mixSegs
                ? [...mixSegs].sort((a, b) => b.pct - a.pct).map((s) => s.genre)
                : e.genres;
              const inner = (
                <Card className="transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
                  <div className="flex items-start gap-2">
                    <div className="flex w-1/4 shrink-0 flex-col items-start gap-0.5">
                      <span className="text-xs font-medium capitalize text-white/50">
                        {dayFmt.format(new Date(e.startsAt))}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-white/80">
                        <EventDate start={e.startsAt} variant="time" />
                      </span>
                    </div>
                    <div className="w-1/2 min-w-0">
                      <h3 className="truncate text-base font-semibold leading-snug">
                        {e.name}
                      </h3>
                      {orderedGenres.length > 0 && (
                        <p className="mt-1 text-xs">
                          {orderedGenres.map((g, i) => (
                            <span key={g}>
                              {i > 0 && (
                                <span className="text-white/30"> · </span>
                              )}
                              <span
                                className={GENRE_TEXT[g] ?? "text-white/50"}
                              >
                                {te.genre[g] ?? g}
                              </span>
                            </span>
                          ))}
                        </p>
                      )}
                      {mixSegs && (
                        <GenreMixBar
                          mix={e.genreMix!}
                          labels={te.genre}
                          className="mt-1.5"
                        />
                      )}
                    </div>
                    <div className="w-1/4 shrink-0 pt-0.5 text-right">
                      {e.presalePrice != null ? (
                        <>
                          <span className="block text-xs leading-tight text-white/50">
                            {t.presale}
                          </span>
                          <PriceTag amount={e.presalePrice} />
                        </>
                      ) : (
                        <span className="text-sm text-white/60">{t.free}</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
              return (
                <li key={e.id}>
                  {isAuthed ? (
                    <Link
                      href={`/eventos/${e.id}`}
                      className="block rounded-2xl"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
