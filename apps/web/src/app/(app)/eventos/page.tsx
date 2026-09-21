import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import messages from "../../../../messages/es-CL.json";
import {
  Badge,
  Card,
  EventDate,
  GenreMixBar,
  PriceTag,
  aggregateMix,
} from "@/components/ui";
import type { GenreMixBlock } from "@/components/ui";
import EventsMap, { type MapVenue } from "@/components/events/EventsMap";

export const metadata: Metadata = {
  title: "Eventos de salsa y bachata esta semana",
  alternates: { canonical: "/eventos" },
};

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type EventListItem = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  presalePrice: number | null;
  doorPrice: number | null;
  genres: string[];
  genreMix: GenreMixBlock[] | null;
  series: { name: string } | null;
  venue: {
    id: string;
    name: string;
    address: string | null;
  } | null;
};

type MyTicket = { status: string; event: { id: string } };
type VenueRow = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};
type View = "list" | "calendar" | "mios" | "map";
type GenreKey = (typeof GENRES)[number];

const GENRES = ["SALSA", "BACHATA", "CUBANO"] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Color del punto en calendario por género (el primero del evento).
const DOT_COLOR: Record<GenreKey, string> = {
  SALSA: "bg-orange-500",
  BACHATA: "bg-fuchsia-400",
  CUBANO: "bg-amber-400",
};
// Género como texto coloreado en el card (misma paleta que los dots,
// variante clara para AA sobre fondo oscuro).
const GENRE_TEXT: Record<GenreKey, string> = {
  SALSA: "text-orange-400",
  BACHATA: "text-fuchsia-300",
  CUBANO: "text-amber-300",
};

// La chip de serie solo informa cuando el nombre del evento no trae la
// marca ("Edición Aniversario" ← serie "Bachatamania"); si el título ya
// la contiene, es duplicado.
const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const seriesIsDup = (e: EventListItem) =>
  !!e.series && normName(e.name).includes(normName(e.series.name));

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

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD local, clave de grupo

function dayLabel(iso: string, t: typeof messages.events): string {
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86400000).toISOString());
  const key = dayKey(iso);
  if (key === today) return t.today;
  if (key === tomorrow) return t.tomorrow;
  return dayFmt.format(new Date(iso));
}

function groupByDay(events: EventListItem[]) {
  const groups = new Map<string, EventListItem[]>();
  for (const e of events) {
    const key = dayKey(e.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, label: items[0].startsAt, items }));
}

/** Eventos donde el usuario tiene ticket ACTIVE — cookie forward. */
async function getMyTicketEventIds(): Promise<Set<string>> {
  const res = await fetch(`${API_URL}/api/tickets/mine`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (!res?.ok) return new Set();
  const rows = (await res.json()) as MyTicket[];
  return new Set(
    rows.filter((t) => t.status === "ACTIVE").map((t) => t.event.id),
  );
}

/** "YYYY-MM-DD" validado; null si no matchea. */
const parseDay = (raw: string | undefined): string | null =>
  raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;

const DAY_MS = 24 * 60 * 60 * 1000;

const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Lunes de la semana que contiene `d` (semana parte lunes, es-CL). */
function weekStart(d: Date): Date {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/** Los 7 días de la semana que empieza en `monday`, con sus eventos. */
function weekCells(
  monday: Date,
  byDay: Map<string, EventListItem[]>,
): { day: number; key: string; events: EventListItem[] }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * DAY_MS);
    const key = localDayKey(d);
    return { day: d.getDate(), key, events: byDay.get(key) ?? [] };
  });
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams?: {
    genre?: string;
    venue?: string;
    view?: string;
    week?: string;
    day?: string;
    upto?: string;
  };
}) {
  const t = messages.events;
  const isAuthed = cookies().has("omnidance_session");

  const [res, myTicketEventIds] = await Promise.all([
    fetch(`${API_URL}/api/events`, { cache: "no-store" }),
    isAuthed ? getMyTicketEventIds() : Promise.resolve(new Set<string>()),
  ]);
  const all: EventListItem[] = res.ok ? await res.json() : [];

  // Género multiselect: ?genre=SALSA,BACHATA — unión (cualquiera matchea).
  const genreSet = new Set(
    (searchParams?.genre ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((g): g is GenreKey =>
        (GENRES as readonly string[]).includes(g),
      ),
  );
  const venueId = searchParams?.venue;
  const rawView = searchParams?.view;
  // Las vistas calendar/mios son solo para autenticados.
  const view: View =
    isAuthed &&
    (rawView === "calendar" || rawView === "mios" || rawView === "map")
      ? rawView
      : "list";

  // Anónimo: solo la semana — el detalle lo pide el middleware vía /login.
  const pool = isAuthed
    ? all
    : all.filter(
        (e) => new Date(e.startsAt).getTime() <= Date.now() + WEEK_MS,
      );

  const venues = [
    ...new Map(
      pool.filter((e) => e.venue).map((e) => [e.venue!.id, e.venue!.name]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const filtered = pool.filter(
    (e) =>
      (genreSet.size === 0 ||
        e.genres.some((g) => genreSet.has(g as GenreKey))) &&
      (!venueId || e.venue?.id === venueId),
  );

  // Vista mapa: el directorio público de venues aporta lat/lng; se
  // cruza con `filtered` para que los pins respeten género/local.
  const mapVenues: MapVenue[] = [];
  if (view === "map") {
    const vres = await fetch(`${API_URL}/api/venues`, {
      cache: "no-store",
    }).catch(() => null);
    const rows: VenueRow[] = vres?.ok ? await vres.json() : [];
    const countByVenue = new Map<string, number>();
    for (const e of filtered) {
      if (e.venue) {
        countByVenue.set(e.venue.id, (countByVenue.get(e.venue.id) ?? 0) + 1);
      }
    }
    for (const v of rows) {
      const n = countByVenue.get(v.id) ?? 0;
      if (n > 0 && v.lat != null && v.lng != null) {
        mapVenues.push({
          id: v.id,
          name: v.name,
          address: v.address,
          lat: v.lat,
          lng: v.lng,
          eventCount: n,
        });
      }
    }
  }

  const now = Date.now();
  // "Más adelante" bajo demanda: ?upto=N semanas visibles (default 1 =
  // solo esta semana). El botón incrementa el horizonte una semana.
  const upto = Math.max(
    1,
    Number.parseInt(String(searchParams?.upto ?? "1"), 10) || 1,
  );
  const horizon = now + upto * WEEK_MS;
  const visible = filtered.filter(
    (e) => new Date(e.startsAt).getTime() <= horizon,
  );
  const thisWeek = visible.filter(
    (e) => new Date(e.startsAt).getTime() <= now + WEEK_MS,
  );
  const later = visible.filter(
    (e) => new Date(e.startsAt).getTime() > now + WEEK_MS,
  );
  const hasLater = filtered.some(
    (e) => new Date(e.startsAt).getTime() > horizon,
  );

  // "Mis eventos": agenda — eventos futuros con ticket ACTIVE propio.
  const mios = filtered.filter(
    (e) =>
      myTicketEventIds.has(e.id) && new Date(e.startsAt).getTime() > now,
  );

  // ─── Calendario semanal (?week=<cualquier día> → su lunes) ───
  const calByDay = new Map<string, EventListItem[]>();
  for (const e of filtered) {
    const key = dayKey(e.startsAt);
    calByDay.set(key, [...(calByDay.get(key) ?? []), e]);
  }
  const weekParam = parseDay(searchParams?.week);
  const monday = weekStart(
    weekParam ? new Date(`${weekParam}T12:00:00`) : new Date(),
  );
  const weekKey = localDayKey(monday);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const prevWeekKey = localDayKey(
    new Date(monday.getTime() - 7 * DAY_MS),
  );
  const nextWeekKey = localDayKey(
    new Date(monday.getTime() + 7 * DAY_MS),
  );
  const cells = weekCells(monday, calByDay);
  const weekKeys = new Set(cells.map((c) => c.key));
  const todayKey = localDayKey(new Date());
  // Día seleccionado: param si cae en la semana visible; si no, hoy.
  const selectedDay = (() => {
    const d = parseDay(searchParams?.day);
    if (d && weekKeys.has(d)) return d;
    if (weekKeys.has(todayKey)) return todayKey;
    return null;
  })();
  const selectedEvents = selectedDay ? (calByDay.get(selectedDay) ?? []) : [];
  const weekLabel = `${dayCompactFmt.format(monday)} – ${dayCompactFmt.format(sunday)}`;

  // Chips SSR: cada filtro preserva el resto — compartibles y sin JS.
  const hrefFor = (o: {
    genre?: string;
    venue?: string;
    view?: string;
    week?: string;
    day?: string;
    upto?: string;
  }) => {
    const merged = {
      genre: [...genreSet].join(",") || undefined,
      venue: venueId,
      view: view !== "list" ? view : undefined,
      week: view === "calendar" ? weekKey : undefined,
      day: view === "calendar" ? (selectedDay ?? undefined) : undefined,
      upto: upto > 1 ? String(upto) : undefined,
      ...o,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return `/eventos${qs ? `?${qs}` : ""}`;
  };
  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors active:scale-[0.97] ${
      active
        ? "border-neon bg-neon/15 text-neon"
        : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
    }`;
  const iconBtn = (active: boolean) =>
    `inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      active ? "bg-neon text-night-950" : "text-white/60 hover:text-white"
    }`;

  const renderCard = (e: EventListItem) => {
    // Proporción del ciclo: ordena el texto de géneros de mayor a
    // menor share y alimenta la mini barra segmentada.
    const mixSegs = e.genreMix?.length ? aggregateMix(e.genreMix) : null;
    const orderedGenres = mixSegs
      ? [...mixSegs].sort((a, b) => b.pct - a.pct).map((s) => s.genre)
      : e.genres;
    // Los cards siempre viven bajo un heading de día (lista, día del
    // 3 columnas: [hora + chip venue] [título + estilos] [precio].
    // Los cards viven bajo heading de día → solo hora.
    const inner = (
      <Card className="transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
        <div className="flex items-start gap-2">
          {/* Col 1: hora + venue (pin + texto, sin chrome de chip —
              así nombres de dos palabras caben sin truncar) */}
          <div className="flex w-1/4 shrink-0 flex-col items-start gap-1">
            <span className="pt-0.5 text-sm font-semibold tabular-nums text-white/80">
              <EventDate start={e.startsAt} variant="time" />
            </span>
            {e.venue && (
              <span className="inline-flex max-w-full items-center gap-1 text-xs text-white/60">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3 w-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="truncate">{e.venue.name}</span>
              </span>
            )}
          </div>
          {/* Col 2: título (1 línea) + estilos debajo */}
          <div className="w-1/2 min-w-0">
            <h2 className="truncate text-base font-semibold leading-snug">
              {e.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {orderedGenres.length > 0 && (
                <span>
                  {orderedGenres.map((g, i) => (
                    <span key={g}>
                      {i > 0 && <span className="text-white/30"> · </span>}
                      <span
                        className={
                          GENRE_TEXT[g as GenreKey] ?? "text-white/50"
                        }
                      >
                        {t.genre[g as keyof typeof t.genre] ?? g}
                      </span>
                    </span>
                  ))}
                </span>
              )}
              {e.series && !seriesIsDup(e) && (
                <Badge variant="neon">{e.series.name}</Badge>
              )}
              {e.status === "LIVE" && <Badge variant="live">{t.live}</Badge>}
            </div>
            {mixSegs && (
              <GenreMixBar
                mix={e.genreMix!}
                labels={t.genre as Record<string, string>}
                className="mt-1.5"
              />
            )}
            {view === "mios" && (
              <p className="mt-1.5 text-xs font-medium text-neon">
                {t.miosQrHint}
              </p>
            )}
          </div>
          {/* Col 3: precio */}
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
    return isAuthed ? (
      <Link href={`/eventos/${e.id}`} className="block rounded-2xl">
        {inner}
      </Link>
    ) : (
      <div>{inner}</div>
    );
  };

  const renderDayGroup = ({
    key,
    label,
    items,
  }: {
    key: string;
    label: string;
    items: EventListItem[];
  }) => (
    <section key={key}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
        {dayLabel(label, t)}
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map((e) => (
          <li key={e.id}>{renderCard(e)}</li>
        ))}
      </ul>
    </section>
  );

  const venueLabel = venueId
    ? (venues.find(([id]) => id === venueId)?.[1] ?? t.allVenues)
    : t.allVenues;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-6 pb-6 pt-3">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            {isAuthed ? t.title : t.publicLead}
          </h1>
          {isAuthed && (
            <div className="flex items-center gap-2">
              {/* Toggle lista/calendario — íconos, segmented */}
              <div className="flex items-center rounded-full border border-white/15 p-0.5">
                <Link
                  href={hrefFor({ view: undefined, week: undefined, day: undefined })}
                  aria-label={t.viewList}
                  aria-current={view === "list" ? "true" : undefined}
                  className={iconBtn(view === "list")}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                  </svg>
                </Link>
                <Link
                  href={hrefFor({ view: "calendar", week: undefined, day: undefined })}
                  aria-label={t.viewCalendar}
                  aria-current={view === "calendar" ? "true" : undefined}
                  className={iconBtn(view === "calendar")}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="17" rx="2" />
                    <path d="M8 2v3M16 2v3M3 9h18" />
                  </svg>
                </Link>
                <Link
                  href={hrefFor({ view: "map", week: undefined, day: undefined })}
                  aria-label={t.viewMap}
                  aria-current={view === "map" ? "true" : undefined}
                  className={iconBtn(view === "map")}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 6v15l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                    <path d="M8 2v15M16 6v15" />
                  </svg>
                </Link>
              </div>
              {/* Mis eventos — agenda propia (ticket activo), ícono aparte */}
              <Link
                href={hrefFor({ view: "mios", week: undefined, day: undefined })}
                aria-label={t.viewMios}
                aria-current={view === "mios" ? "true" : undefined}
                className={`${iconBtn(view === "mios")} border border-white/15`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1zm13-5v2m0 10v2m0-8v2" />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {/* Géneros — multiselect, cada chip togglea en el set */}
        <nav
          aria-label="Filtrar por estilo"
          className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6"
        >
          <Link
            href={hrefFor({ genre: undefined })}
            className={chipClass(genreSet.size === 0)}
          >
            {t.filterAll}
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
                {t.genre[g]}
              </Link>
            );
          })}
        </nav>

        {/* Locales — dropdown tipo chip (sin JS). key por venue: al
            navegar a otro local el <details> se remonta cerrado —
            el estado open no es controlado por React y sin key
            sobrevive a la navegación client-side. */}
        <div className="flex items-center">
          <details key={venueId ?? "all"} className="venue-filter relative">
            <summary
              className={`${chipClass(!!venueId)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1.5 inline h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {venueLabel}
            </summary>
            <ul className="absolute left-0 z-20 mt-2 flex max-h-72 w-56 flex-col overflow-y-auto rounded-xl border border-night-700 bg-night-900 p-1 shadow-xl shadow-black/40">
              <li>
                <Link
                  href={hrefFor({ venue: undefined })}
                  className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
                    !venueId ? "font-semibold text-neon" : "text-white/80 hover:bg-white/5"
                  }`}
                >
                  {t.allVenues}
                </Link>
              </li>
              {venues.map(([id, name]) => (
                <li key={id}>
                  <Link
                    href={hrefFor({ venue: id })}
                    className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
                      venueId === id ? "font-semibold text-neon" : "text-white/80 hover:bg-white/5"
                    }`}
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </header>

      {view === "map" ? (
        <section aria-label={t.viewMap}>
          {mapVenues.length === 0 ? (
            <p className="text-white/60">
              {genreSet.size || venueId ? t.emptyFiltered : t.empty}
            </p>
          ) : (
            <>
              <div className="h-[62dvh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-night-700">
                <EventsMap venues={mapVenues} />
              </div>
              <p className="mt-3 text-center text-xs text-white/40">
                {t.mapHint}
              </p>
            </>
          )}
        </section>
      ) : view === "calendar" ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={hrefFor({ week: prevWeekKey, day: undefined })}
              className={iconBtn(false)}
              aria-label={t.prevWeek}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <h2 className="text-base font-semibold capitalize">
              {weekLabel}
            </h2>
            <Link
              href={hrefFor({ week: nextWeekKey, day: undefined })}
              className={iconBtn(false)}
              aria-label={t.nextWeek}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
          {/* Franja semanal: letra del día + número + puntos por género */}
          <div role="grid" className="grid grid-cols-7 gap-1" aria-label={t.viewCalendar}>
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
                          DOT_COLOR[e.genres[0] as GenreKey] ?? "bg-white/50"
                        }`}
                      />
                    ))}
                  </span>
                  {cell.events.length > 3 && (
                    <span className="text-[10px] leading-none text-white/40">
                      {t.more.replace("{count}", String(cell.events.length - 3))}
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
                  href={hrefFor({ day: cell.key })}
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
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/50">
                {dayLabel(selectedDay, t)}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-white/50">{t.noEventsDay}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {selectedEvents.map((e) => (
                    <li key={e.id}>{renderCard(e)}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </section>
      ) : view === "mios" ? (
        <div className="flex flex-col gap-8">
          {mios.length === 0 ? (
            <p className="text-white/60">{t.miosEmpty}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-white/60">{t.miosHint}</p>
                <Link
                  href="/entradas"
                  className="shrink-0 text-sm font-medium text-neon hover:underline"
                >
                  {t.miosManage} →
                </Link>
              </div>
              {groupByDay(mios).map(renderDayGroup)}
            </>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-white/60">
          {genreSet.size || venueId ? t.emptyFiltered : t.empty}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-neon">
              {t.thisWeek}
            </h2>
            <div className="flex flex-col gap-6">
              {groupByDay(thisWeek).map(renderDayGroup)}
              {thisWeek.length === 0 && isAuthed && (
                <p className="text-sm text-white/60">{t.emptyFiltered}</p>
              )}
            </div>
          </section>
          {later.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-white/60">
                {t.upcoming}
              </h2>
              <div className="flex flex-col gap-6">
                {groupByDay(later).map(renderDayGroup)}
              </div>
            </section>
          )}
          {/* "Más adelante" bajo demanda: cada click revela una semana */}
          {hasLater && (
            <Link
              href={hrefFor({ upto: String(upto + 1) })}
              className="flex min-h-12 items-center justify-center rounded-full border border-white/15 text-sm font-medium text-white/70 transition-colors hover:border-neon/50 hover:text-white active:scale-[0.98]"
            >
              {t.loadLater} ↓
            </Link>
          )}
        </div>
      )}

      {!isAuthed && (
        <section className="mt-2 rounded-2xl border border-neon/30 bg-neon/5 p-6 text-center">
          <p className="text-sm text-white/70">{t.publicCta}</p>
          <Link
            href="/login?next=/eventos"
            className="mt-4 inline-flex min-h-12 items-center rounded-full bg-neon px-8 text-sm font-semibold text-night-950 transition-colors hover:bg-neon-soft active:scale-[0.97]"
          >
            {t.publicCtaButton}
          </Link>
        </section>
      )}
    </main>
  );
}
