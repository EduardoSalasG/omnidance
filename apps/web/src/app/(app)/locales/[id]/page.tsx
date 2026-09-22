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
// El merge i18n devuelve Dict — las claves se declaran explícitas.
type EventsT = (typeof messages)["events"] & {
  genre: Record<string, string>;
  filterAll: string;
  emptyFiltered: string;
  viewList: string;
  viewCalendar: string;
  prevWeek: string;
  nextWeek: string;
  more: string;
  today: string;
  noEventsDay: string;
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
const dayCompactFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});
const WEEKDAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const GENRES = ["SALSA", "BACHATA", "CUBANO"] as const;

// Color del punto por género (el primero del evento) — misma paleta
// que el calendario de /eventos.
const DOT_COLOR: Record<string, string> = {
  SALSA: "bg-orange-500",
  BACHATA: "bg-fuchsia-400",
  CUBANO: "bg-amber-400",
};

const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/** "YYYY-MM-DD" validado; null si no matchea. */
const parseDay = (raw: string | undefined): string | null =>
  raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;

/** Lunes de la semana que contiene `d` (semana parte lunes, es-CL). */
function weekStart(d: Date): Date {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

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
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    vista?: string;
    semana?: string;
    dia?: string;
    genre?: string;
  };
}) {
  const t = messages.venuePublic as VenueT;
  const te = messages.events as EventsT;
  const isAuthed = cookies().has("omnidance_session");
  const venue = await getVenue(params.id);

  const vista = searchParams?.vista === "calendario" ? "calendario" : "lista";

  // Filtro por estilo: ?genre=SALSA,BACHATA — unión, mismo patrón de
  // /eventos. Aplica a la lista y al calendario (mismo pool).
  const genreSet = new Set(
    (searchParams?.genre ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((g): g is (typeof GENRES)[number] =>
        (GENRES as readonly string[]).includes(g),
      ),
  );
  const filtered =
    genreSet.size === 0
      ? venue.events
      : venue.events.filter((e) =>
          e.genres.some((g) => genreSet.has(g as (typeof GENRES)[number])),
        );

  const hrefFor = (o: {
    vista?: string;
    semana?: string;
    dia?: string;
    genre?: string;
  }) => {
    const merged = {
      vista: vista !== "lista" ? vista : undefined,
      genre: [...genreSet].join(",") || undefined,
      ...o,
    };
    const qs = new URLSearchParams(
      Object.entries(merged).filter((e): e is [string, string] => !!e[1]),
    ).toString();
    return `/locales/${params.id}${qs ? `?${qs}` : ""}`;
  };

  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.97] ${
      active
        ? "border-neon bg-neon/15 text-neon"
        : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
    }`;

  // ─── Calendario semanal (?semana=<día> → su lunes) ───
  const byDay = new Map<string, VenueEvent[]>();
  for (const e of filtered) {
    const key = dayKey(e.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const semanaParam = parseDay(searchParams?.semana);
  const monday = weekStart(
    semanaParam ? new Date(`${semanaParam}T12:00:00`) : new Date(),
  );
  const weekKey = localDayKey(monday);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const prevWeekKey = localDayKey(new Date(monday.getTime() - 7 * DAY_MS));
  const nextWeekKey = localDayKey(new Date(monday.getTime() + 7 * DAY_MS));
  const cells = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * DAY_MS);
    const key = localDayKey(d);
    return { day: d.getDate(), key, events: byDay.get(key) ?? [] };
  });
  const weekKeys = new Set(cells.map((c) => c.key));
  const todayKey = localDayKey(new Date());
  // Día seleccionado: param si cae en la semana visible; si no, hoy.
  const selectedDay = (() => {
    const d = parseDay(searchParams?.dia);
    if (d && weekKeys.has(d)) return d;
    if (weekKeys.has(todayKey)) return todayKey;
    return null;
  })();
  const selectedEvents = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const weekLabel = `${dayCompactFmt.format(monday)} – ${dayCompactFmt.format(sunday)}`;

  const iconBtn = (active: boolean) =>
    `inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      active ? "bg-neon text-night-950" : "text-white/60 hover:text-white"
    }`;

  const eventCard = (e: VenueEvent) => {
    const mixSegs = e.genreMix?.length ? aggregateMix(e.genreMix) : null;
    const orderedGenres = mixSegs
      ? [...mixSegs].sort((a, b) => b.pct - a.pct).map((s) => s.genre)
      : e.genres;
    return (
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
                    {i > 0 && <span className="text-white/30"> · </span>}
                    <span className={GENRE_TEXT[g] ?? "text-white/50"}>
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
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-6 pt-6 sm:px-6">
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

      {/* Próximos eventos del local — lista o calendario semanal */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neon">{t.upcoming}</h2>
          <div className="flex items-center rounded-full border border-white/15 p-0.5">
            <Link
              href={hrefFor({ vista: undefined, semana: undefined, dia: undefined })}
              aria-label={te.viewList}
              aria-current={vista === "lista" ? "true" : undefined}
              className={iconBtn(vista === "lista")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
              </svg>
            </Link>
            <Link
              href={hrefFor({ vista: "calendario" })}
              aria-label={te.viewCalendar}
              aria-current={vista === "calendario" ? "true" : undefined}
              className={iconBtn(vista === "calendario")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M8 2v3M16 2v3M3 9h18" />
              </svg>
            </Link>
          </div>
        </div>
        {/* Estilos — multiselect chips (unión), preservan vista/semana/día */}
        {venue.events.length > 0 && (
          <nav
            aria-label="Filtrar por estilo"
            className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
          >
            <Link
              href={hrefFor({ genre: undefined })}
              className={chipClass(genreSet.size === 0)}
            >
              {te.filterAll}
            </Link>
            {GENRES.map((g) => {
              const next = new Set(genreSet);
              if (next.has(g)) next.delete(g);
              else next.add(g);
              const active = genreSet.has(g);
              return (
                <Link
                  key={g}
                  href={hrefFor({ genre: [...next].join(",") || undefined })}
                  aria-pressed={active}
                  className={chipClass(active)}
                >
                  {te.genre[g]}
                </Link>
              );
            })}
          </nav>
        )}
        {venue.events.length === 0 ? (
          <p className="text-sm text-white/50">{t.noUpcoming}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-white/50">{te.emptyFiltered}</p>
        ) : vista === "calendario" ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <Link
                href={hrefFor({ semana: prevWeekKey, dia: undefined })}
                className={iconBtn(false)}
                aria-label={te.prevWeek}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
              <h3 className="text-base font-semibold capitalize">{weekLabel}</h3>
              <Link
                href={hrefFor({ semana: nextWeekKey, dia: undefined })}
                className={iconBtn(false)}
                aria-label={te.nextWeek}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
            {/* Franja semanal: letra del día + número + puntos por género */}
            <div role="grid" className="grid grid-cols-7 gap-1" aria-label={te.viewCalendar}>
              {cells.map((cell, i) => {
                const isToday = cell.key === todayKey;
                const isSelected = cell.key === selectedDay;
                const inner = (
                  <>
                    <span className="text-[10px] font-semibold uppercase text-white/40">
                      {WEEKDAY_HEADERS[i]}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        isToday ? "text-neon" : isSelected ? "text-white" : "text-white/70"
                      }`}
                    >
                      {cell.day}
                    </span>
                    <span className="flex h-1.5 items-start gap-0.5">
                      {cell.events.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            DOT_COLOR[e.genres[0]] ?? "bg-white/50"
                          }`}
                        />
                      ))}
                    </span>
                    {cell.events.length > 3 && (
                      <span className="text-[10px] leading-none text-white/40">
                        {te.more.replace("{count}", String(cell.events.length - 3))}
                      </span>
                    )}
                  </>
                );
                const cellClass = `flex min-h-14 flex-col items-center gap-0.5 rounded-xl py-2 ${
                  isSelected ? "bg-neon/15" : ""
                }`;
                return cell.events.length === 0 ? (
                  <div key={cell.key} className={cellClass}>
                    {inner}
                  </div>
                ) : (
                  <Link
                    key={cell.key}
                    href={hrefFor({ semana: weekKey, dia: cell.key })}
                    aria-current={isSelected ? "date" : undefined}
                    className={`${cellClass} transition-colors hover:bg-white/5 active:scale-[0.97]`}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>

            {/* Eventos del día seleccionado */}
            {selectedDay && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
                  {selectedDay === todayKey
                    ? te.today
                    : dayFmt.format(new Date(`${selectedDay}T12:00:00`))}
                </h3>
                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-white/50">{te.noEventsDay}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {selectedEvents.map((e) => (
                      <li key={e.id}>
                        {isAuthed ? (
                          <Link
                            href={`/eventos/${e.id}`}
                            className="block rounded-2xl"
                          >
                            {eventCard(e)}
                          </Link>
                        ) : (
                          <div>{eventCard(e)}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((e) => (
              <li key={e.id}>
                {isAuthed ? (
                  <Link
                    href={`/eventos/${e.id}`}
                    className="block rounded-2xl"
                  >
                    {eventCard(e)}
                  </Link>
                ) : (
                  <div>{eventCard(e)}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
