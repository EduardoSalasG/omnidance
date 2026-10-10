import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { messages } from "@/i18n/messages";
import {
  Button,
  Card,
  EventDate,
  GenreMixBar,
  PriceTag,
  RefreshIcon,
  aggregateMix,
} from "@/components/ui";
import type { GenreMixBlock } from "@/components/ui";
import {
  DAY_MS,
  DOT_COLOR,
  GENRES,
  GENRE_TEXT,
  WEEKDAY_HEADERS,
  dayKey,
  localDayKey,
  monthCells,
  monthDate,
  monthFmt,
  monthKey,
  monthStart,
  parseDay,
  parseMonth,
} from "@/lib/calendar";
import type { GenreKey } from "@/lib/calendar";
import { serverApiUrl } from "@/lib/server-api";

export const dynamic = "force-dynamic";


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
// El merge i18n devuelve Dict - las claves se declaran explícitas.
type EventsT = (typeof messages)["events"] & {
  genre: Record<string, string>;
  filterAll: string;
  filterByStyle: string;
  emptyFiltered: string;
  viewList: string;
  viewCalendar: string;
  prevMonth: string;
  nextMonth: string;
  more: string;
  today: string;
  tomorrow: string;
  noEventsDay: string;
};

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
// Nombre completo del día para lectores de pantalla - la celda del
// calendario solo muestra el número (mismo patrón que /eventos).
const weekdayNameFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
});

function groupByDay(events: VenueEvent[]) {
  const groups = new Map<string, VenueEvent[]>();
  for (const e of events) {
    const key = dayKey(e.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, items }));
}

function dayLabel(key: string, te: EventsT): string {
  const today = localDayKey(new Date());
  const tomorrow = localDayKey(new Date(Date.now() + DAY_MS));
  if (key === today) return te.today;
  if (key === tomorrow) return te.tomorrow;
  return dayFmt.format(new Date(`${key}T12:00:00`));
}

// Solo un 404 real es not-found: 5xx/red es un fallo de carga y la
// página muestra error con retry - esconderlo como "no existe" miente.
async function getVenue(id: string): Promise<VenueProfile | "error"> {
  const API_URL = serverApiUrl();
  const res = await fetch(`${API_URL}/api/venues/${id}?days=62`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res?.ok) return "error";
  return (await res.json()) as VenueProfile;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const tv = messages.venuePublic as VenueT;
  const venue = await getVenue(params.id);
  return {
    title:
      venue === "error"
        ? tv.metaTitleFallback
        : tv.metaTitle.replace("{name}", venue.name),
  };
}

export default async function VenueProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: {
    vista?: string;
    mes?: string;
    semana?: string; // legado: <día> → su mes
    dia?: string;
    genre?: string;
  };
}) {
  const t = messages.venuePublic as VenueT;
  const te = messages.events as EventsT;
  const tc = messages.common as { error: string; retry: string; back: string };
  // Sin isAuthed: el grupo (app) ya exige sesión por middleware - las
  // cards de evento siempre linkean al detalle.
  const venue = await getVenue(params.id);

  if (venue === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p role="alert" className="text-ink/60">{tc.error}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {/* Server page: el retry es recargar la misma ruta. */}
          <Button href={`/locales/${params.id}`}>
            <RefreshIcon /> {tc.retry}
          </Button>
          <Button href="/eventos" variant="secondary">
            {tc.back}
          </Button>
        </div>
      </main>
    );
  }

  const vista = searchParams?.vista === "calendario" ? "calendario" : "lista";

  // Filtro por estilo: ?genre=SALSA,BACHATA - unión, mismo patrón de
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
    mes?: string;
    dia?: string;
    genre?: string;
  }) => {
    const merged = {
      vista: vista !== "lista" ? vista : undefined,
      genre: [...genreSet].join(",") || undefined,
      mes: vista === "calendario" ? monthKey(monthCursor) : undefined,
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
        : "border-ink/15 text-ink/60 hover:border-ink/30 hover:text-ink"
    }`;

  // ─── Calendario mensual (?mes=YYYY-MM; legado semana=<día> → su mes) ───
  const byDay = new Map<string, VenueEvent[]>();
  for (const e of filtered) {
    const key = dayKey(e.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const mesParam = parseMonth(searchParams?.mes);
  const legacySemana = parseDay(searchParams?.semana);
  const monthCursor = monthStart(
    mesParam
      ? monthDate(mesParam)
      : legacySemana
        ? new Date(`${legacySemana}T12:00:00`)
        : new Date(),
  );
  const prevMonthKey = monthKey(
    new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
  );
  const nextMonthKey = monthKey(
    new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
  );
  const cells = monthCells(monthCursor, byDay).map(
    ({ items, ...rest }) => ({ ...rest, events: items }),
  );
  const gridKeys = new Set(cells.map((c) => c.key));
  const todayKey = localDayKey(new Date());
  // Día seleccionado: param si cae en el grid visible; si no, hoy.
  const selectedDay = (() => {
    const d = parseDay(searchParams?.dia);
    if (d && gridKeys.has(d)) return d;
    if (gridKeys.has(todayKey)) return todayKey;
    return null;
  })();
  const selectedEvents = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const monthLabel = monthFmt.format(monthCursor);

  const iconBtn = (active: boolean) =>
    `inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      active ? "bg-neon text-on-accent" : "text-ink/60 hover:text-ink"
    }`;

  const eventCard = (e: VenueEvent) => {
    const mixSegs = e.genreMix?.length ? aggregateMix(e.genreMix) : null;
    const orderedGenres = mixSegs
      ? [...mixSegs].sort((a, b) => b.pct - a.pct).map((s) => s.genre)
      : e.genres;
    return (
      <Card className="transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
        <div className="flex items-start gap-2">
          {/* Solo la hora - el día es agrupador (lista) o selección
              (calendario); repetirlo en cada card era ruido. */}
          <div className="flex w-1/4 shrink-0 flex-col items-start gap-0.5">
            <span className="pt-0.5 text-sm font-semibold tabular-nums text-ink/80">
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
                    {i > 0 && <span className="text-ink/30"> · </span>}
                    <span className={GENRE_TEXT[g as GenreKey] ?? "text-ink/50"}>
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
                <span className="block text-xs leading-tight text-ink/50">
                  {t.presale}
                </span>
                <PriceTag amount={e.presalePrice} />
              </>
            ) : (
              <span className="text-sm text-ink/60">{t.free}</span>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-6 pt-6 sm:px-6 lg:max-w-4xl lg:px-8">
      {/* Perfil: logo (o inicial), nombre, dirección y horarios */}
      <header className="flex items-start gap-4">
        {venue.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa del venue
          <img
            src={venue.logoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-2xl border border-ink/10 object-cover"
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
            <a
              href={
                // URL universal de Google Maps - sin API key, el SO la
                // abre en la app de mapas instalada (igual que /eventos/:id).
                venue.lat != null && venue.lng != null
                  ? `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`
              }
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t.directions}: ${venue.address}`}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg text-sm text-ink/60 transition-colors hover:text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
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
              <span className="underline decoration-ink/20 underline-offset-2">
                {venue.address}
              </span>
            </a>
          )}
          {venue.hours && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink/60">
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
            <p className="mt-1 text-xs text-ink/50">
              {t.capacity.replace(
                "{count}",
                venue.capacity.toLocaleString("es-CL"),
              )}
            </p>
          )}
        </div>
      </header>

      {/* Próximos eventos del local - lista o calendario semanal */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neon">{t.upcoming}</h2>
          <div className="flex items-center rounded-full border border-ink/15 p-0.5">
            <Link
              href={hrefFor({ vista: undefined, mes: undefined, dia: undefined })}
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
        {/* Estilos - multiselect chips (unión), preservan vista/semana/día */}
        {venue.events.length > 0 && (
          <nav
            aria-label={te.filterByStyle}
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
                  aria-current={active ? "true" : undefined}
                  className={chipClass(active)}
                >
                  {te.genre[g]}
                </Link>
              );
            })}
          </nav>
        )}
        {venue.events.length === 0 ? (
          <p className="text-sm text-ink/50">{t.noUpcoming}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink/50">{te.emptyFiltered}</p>
        ) : vista === "calendario" ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <Link
                href={hrefFor({ mes: prevMonthKey, dia: undefined })}
                className={iconBtn(false)}
                aria-label={te.prevMonth}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
              <h3 className="text-base font-semibold capitalize">{monthLabel}</h3>
              <Link
                href={hrefFor({ mes: nextMonthKey, dia: undefined })}
                className={iconBtn(false)}
                aria-label={te.nextMonth}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
            {/* Grid mensual: fila de letras L–D + número + puntos por
                género. Días de meses vecinos atenuados. */}
            <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden="true">
              {WEEKDAY_HEADERS.map((h, i) => (
                <span
                  key={i}
                  className="text-center text-[10px] font-semibold uppercase text-ink/40"
                >
                  {h}
                </span>
              ))}
            </div>
            <div role="grid" className="grid grid-cols-7 gap-1" aria-label={te.viewCalendar}>
              {cells.map((cell) => {
                const isToday = cell.key === todayKey;
                const isSelected = cell.key === selectedDay;
                const dayName = weekdayNameFmt.format(
                  new Date(`${cell.key}T12:00:00`),
                );
                const inner = (
                  <>
                    <span className="sr-only">{dayName}</span>
                    <span
                      className={`text-sm font-semibold ${
                        isToday ? "text-neon" : isSelected ? "text-ink" : "text-ink/70"
                      }`}
                    >
                      {cell.day}
                    </span>
                    <span className="flex h-1.5 items-start gap-0.5">
                      {cell.events.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            DOT_COLOR[e.genres[0] as GenreKey] ?? "bg-ink/50"
                          }`}
                        />
                      ))}
                    </span>
                    {cell.events.length > 3 && (
                      <span className="text-[10px] leading-none text-ink/50">
                        {te.more.replace("{count}", String(cell.events.length - 3))}
                      </span>
                    )}
                  </>
                );
                const cellClass = `flex min-h-11 flex-col items-center gap-0.5 rounded-xl py-1.5 ${
                  isSelected ? "bg-neon/15" : ""
                } ${cell.inMonth ? "" : "opacity-40"}`;
                return cell.events.length === 0 ? (
                  <div key={cell.key} className={cellClass}>
                    {inner}
                  </div>
                ) : (
                  <Link
                    key={cell.key}
                    href={hrefFor({ dia: cell.key })}
                    aria-label={`${dayName} ${cell.day}`}
                    aria-current={isSelected ? "date" : undefined}
                    className={`${cellClass} transition-colors hover:bg-ink/5 active:scale-[0.97]`}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>

            {/* Eventos del día seleccionado */}
            {selectedDay && (
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-ink/50">
                  {selectedDay === todayKey
                    ? te.today
                    : dayFmt.format(new Date(`${selectedDay}T12:00:00`))}
                </h3>
                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-ink/50">{te.noEventsDay}</p>
                ) : (
                  <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
                    {selectedEvents.map((e) => (
                      <li key={e.id}>
                        <Link
                          href={`/eventos/${e.id}`}
                          className="block rounded-2xl"
                        >
                          {eventCard(e)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-6">
            {groupByDay(filtered).map((g) => (
              <section key={g.key}>
                <h3 className="mb-2 text-xs font-semibold capitalize tracking-wide text-ink/50">
                  {dayLabel(g.key, te)}
                </h3>
                <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
                  {g.items.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/eventos/${e.id}`}
                        className="block rounded-2xl"
                      >
                        {eventCard(e)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
