import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { messages } from "@/i18n/messages";
import { EventCard, type EventCardData } from "@/components/events/event-card";
import EventsMap, { type MapVenue } from "@/components/events/EventsMap";
import {
  TicketWallet,
  type PendingOrder,
} from "@/components/tickets/TicketWallet";
import { Button, ChevronDownIcon, RefreshIcon } from "@/components/ui";
import { Segmented, SegmentedMulti } from "@/components/ui/segmented";
import { EscapableDetails } from "@/components/ui/escapable-details";
import { OnboardingRunner, type TourStep } from "@/components/onboarding/OnboardingRunner";
import toursI18n from "@/i18n/parts/tours.json";
import {
  DAY_MS,
  DOT_COLOR,
  GENRES,
  WEEK_MS,
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
import { SERVER_API_URL } from "@/lib/server-api";

// El merge i18n devuelve Dict - las claves se declaran explícitas
// (mismo patrón que locales/[id]).
type EventsT = Record<string, string> & {
  genre: Record<string, string>;
  type: Record<string, string>;
  showTeam: Record<string, string>;
};
const eventsDict = messages.events as EventsT;

export const metadata: Metadata = {
  title: eventsDict.metaTitle,
  alternates: { canonical: "/eventos" },
};

const API_URL = SERVER_API_URL;

// Shape del card de evento - compartido con components/events/event-card.
type EventListItem = EventCardData;

type MyTicket = {
  id: string;
  status: string;
  listPrice: number;
  serviceFee: number;
  claimToken: string | null;
  // event = null cuando el evento fue eliminado tras la compra -
  // TicketWallet lo muestra como ticket huérfano (sin link).
  event: {
    id: string;
    name: string;
    startsAt: string;
    venue: { name: string } | null;
  } | null;
};
type VenueRow = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};
type View = "list" | "calendar" | "mios" | "map";

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
// Nombre completo del día para lectores de pantalla - la celda del
// calendario solo muestra el número.
const weekdayNameFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
});

function dayLabel(iso: string, t: EventsT): string {
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

/** Tickets del usuario - cookie forward; la vista mios los muestra.
    null = fallo de carga (no confundir con "sin entradas": un 500/red
    no puede renderizar el empty de la wallet). */
async function getMyTickets(): Promise<MyTicket[] | null> {
  const res = await fetch(`${API_URL}/api/tickets/mine`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as MyTicket[];
}

/** Órdenes PENDING del usuario (spec wallet-passes): la compra por
    método propio queda en revisión del productor y NO genera ticket
    hasta el settle - la wallet las muestra como "pago en validación"
    para que nadie llegue a puerta creyendo que tiene entrada. [] en
    fallo (mejor omitir la sección que bloquear la wallet). */
async function getPendingOrders(): Promise<PendingOrder[]> {
  const res = await fetch(`${API_URL}/api/payments/mine`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json()) as (PendingOrder & { status: string })[];
  return rows.filter(
    (r) =>
      r.status === "PENDING" &&
      (r.orderType === "TICKET" || r.orderType === "SERIES_PASS"),
  );
}

/** Las celdas del grid mensual que cubre `month`, con sus eventos. */
function eventCells(
  month: Date,
  byDay: Map<string, EventListItem[]>,
): { day: number; key: string; events: EventListItem[]; inMonth: boolean }[] {
  return monthCells(month, byDay).map(({ items, ...rest }) => ({
    ...rest,
    events: items,
  }));
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams?: {
    genre?: string;
    venue?: string;
    view?: string;
    month?: string;
    week?: string; // legado: <día> → su mes
    day?: string;
    upto?: string;
  };
}) {
  const t = eventsDict;
  const tc = messages.common as Record<string, string>;
  // El middleware exige sesión para esta ruta - todo visitante está
  // autenticado (no hay ramas anónimas).
  const [res, myTickets, pendingOrders] = await Promise.all([
    fetch(`${API_URL}/api/events`, { cache: "no-store" }).catch(() => null),
    getMyTickets(),
    getPendingOrders(),
  ]);
  // Fallo de carga ≠ cartelera vacía: el empty diría "no hay eventos"
  // cuando el problema es el API/red.
  const eventsError = !res?.ok;
  const all: EventListItem[] = res?.ok ? await res.json() : [];

  // Género multiselect: ?genre=SALSA,BACHATA - unión (cualquiera matchea).
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
  const view: View =
    rawView === "calendar" || rawView === "mios" || rawView === "map"
      ? rawView
      : "list";

  const pool = all;

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
    for (const e of pool) {
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

  // ─── Calendario mensual (?month=YYYY-MM; legado week=<día> → su mes) ───
  const calByDay = new Map<string, EventListItem[]>();
  for (const e of filtered) {
    const key = dayKey(e.startsAt);
    calByDay.set(key, [...(calByDay.get(key) ?? []), e]);
  }
  const monthParam = parseMonth(searchParams?.month);
  const legacyWeek = parseDay(searchParams?.week);
  const monthCursor = monthStart(
    monthParam
      ? monthDate(monthParam)
      : legacyWeek
        ? new Date(`${legacyWeek}T12:00:00`)
        : new Date(),
  );
  const monthParamKey = monthKey(monthCursor);
  const prevMonthKey = monthKey(
    new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
  );
  const nextMonthKey = monthKey(
    new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
  );
  const cells = eventCells(monthCursor, calByDay);
  const gridKeys = new Set(cells.map((c) => c.key));
  const todayKey = localDayKey(new Date());
  // Día seleccionado: param si cae en el grid visible; si no, hoy.
  const selectedDay = (() => {
    const d = parseDay(searchParams?.day);
    if (d && gridKeys.has(d)) return d;
    if (gridKeys.has(todayKey)) return todayKey;
    return null;
  })();
  const selectedEvents = selectedDay ? (calByDay.get(selectedDay) ?? []) : [];
  const monthLabel = monthFmt.format(monthCursor);

  // Chips SSR: cada filtro preserva el resto - compartibles y sin JS.
  const hrefFor = (o: {
    genre?: string;
    venue?: string;
    view?: string;
    month?: string;
    day?: string;
    upto?: string;
  }) => {
    const merged = {
      genre: [...genreSet].join(",") || undefined,
      venue: venueId,
      view: view !== "list" ? view : undefined,
      month: view === "calendar" ? monthParamKey : undefined,
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
        : "border-ink/15 text-ink/60 hover:border-ink/30 hover:text-ink"
    }`;
  const iconBtn = (active: boolean) =>
    `inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.97] ${
      active ? "bg-neon text-on-accent" : "text-ink/60 hover:text-ink"
    }`;
  // Género multiselect → SegmentedMulti: cada chip activo lleva su
  // pill propio y un anillo neon itinerante se desliza al último
  // toggled-on (el set preserva orden de inserción → el último de la
  // lista es el más reciente). "Todos" es el ítem exclusivo.

  // Card de evento - componente compartido (mismo esqueleto que el
  // ClassCard de /clases): contenido a la izquierda, rail hora+precio
  // a la derecha. Los cards viven bajo heading de día → sin `when`.
  const renderCard = (e: EventListItem) => <EventCard e={e} />;

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
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-ink/50">
        {dayLabel(label, t)}
      </h3>
      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
        {items.map((e) => (
          <li key={e.id}>{renderCard(e)}</li>
        ))}
      </ul>
    </section>
  );

  const venueLabel = venueId
    ? (venues.find(([id]) => id === venueId)?.[1] ?? t.allVenues)
    : t.allVenues;

  // Tour de primera visita - steps cuyo target puede faltar (p.ej.
  // ev-list sin eventos) se filtran dentro del runner.
  const tt = toursI18n.tours.eventos;
  const tourSteps: TourStep[] = [
    {
      element: "[data-tour='ev-genres']",
      title: tt.s1.title,
      description: tt.s1.desc,
      side: "bottom",
    },
    {
      element: "[data-tour='ev-venues']",
      title: tt.s2.title,
      description: tt.s2.desc,
      side: "bottom",
    },
    {
      element: "[data-tour='ev-views']",
      title: tt.s3.title,
      description: tt.s3.desc,
      side: "bottom",
    },
    {
      element: "[data-tour='ev-mios']",
      title: tt.s4.title,
      description: tt.s4.desc,
      side: "bottom",
    },
    {
      element: "[data-tour='ev-list']",
      title: tt.s5.title,
      description: tt.s5.desc,
      side: "top",
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 pb-6 pt-3 lg:max-w-5xl lg:px-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            {view === "mios"
              ? t.viewMios
              : view === "map"
                ? t.viewMap
                : t.title}
          </h1>
          <div className="flex items-center gap-2">
              {/* Toggle lista/calendario/mapa - íconos, segmented con
                  thumb deslizante (mismo control que /clases) */}
              <Segmented
                tour="ev-views"
                ariaLabel={t.viewsLabel}
                active={view}
                tone="solid"
                items={[
                  {
                    key: "list",
                    href: hrefFor({ view: undefined, month: undefined, day: undefined }),
                    icon: true,
                    ariaLabel: t.viewList,
                    children: (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
                      </svg>
                    ),
                  },
                  {
                    key: "calendar",
                    href: hrefFor({ view: "calendar", month: undefined, day: undefined }),
                    icon: true,
                    ariaLabel: t.viewCalendar,
                    children: (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <rect x="3" y="4" width="18" height="17" rx="2" />
                        <path d="M8 2v3M16 2v3M3 9h18" />
                      </svg>
                    ),
                  },
                  {
                    key: "map",
                    href: hrefFor({ view: "map", month: undefined, day: undefined, genre: undefined, venue: undefined }),
                    icon: true,
                    ariaLabel: t.viewMap,
                    children: (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 6v15l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
                        <path d="M8 2v15M16 6v15" />
                      </svg>
                    ),
                  },
                ]}
              />
              {/* Mis eventos - agenda propia (ticket activo), ícono aparte */}
              <Link
                href={hrefFor({ view: "mios", month: undefined, day: undefined })}
                data-tour="ev-mios"
                aria-label={t.viewMios}
                aria-current={view === "mios" ? "true" : undefined}
                className={`${iconBtn(view === "mios")} border border-ink/15`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1zm13-5v2m0 10v2m0-8v2" />
                </svg>
              </Link>
            </div>
        </div>

        {/* Géneros - multiselect segmentado con anillo itinerante
            (misma física del thumb del BottomNav). Ocultos en mapa:
            el mapa es vista global de locales (mapVenues se arma
            desde `pool`). */}
        {view !== "map" && (
          <>
            <nav
              aria-label={t.filterByStyle}
              className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6"
            >
              <SegmentedMulti
                tour="ev-genres"
                ariaLabel={t.genresLabel}
                focusKey={[...genreSet].at(-1) ?? "all"}
                items={[
                  {
                    key: "all",
                    href: hrefFor({ genre: undefined }),
                    active: genreSet.size === 0,
                    children: t.filterAll,
                  },
                  ...GENRES.map((g) => {
                    const next = new Set(genreSet);
                    if (next.has(g)) next.delete(g);
                    else next.add(g);
                    return {
                      key: g,
                      href: hrefFor({
                        genre: [...next].join(",") || undefined,
                      }),
                      active: genreSet.has(g),
                      children: t.genre[g],
                    };
                  }),
                ]}
              />
            </nav>

            {/* Locales - dropdown tipo chip (click-afuera por capa CSS;
            Escape vía wrapper client). key por venue: al navegar a
            otro local el <details> se remonta cerrado - el estado
            open no es controlado por React y sin key sobrevive a la
            navegación client-side. */}
        <div className="flex items-center" data-tour="ev-venues">
          <EscapableDetails key={venueId ?? "all"} className="venue-filter relative">
            <summary
              className={`${chipClass(!!venueId)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1.5 inline h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {venueLabel}
            </summary>
            <ul className="absolute left-0 z-20 mt-2 flex max-h-72 w-56 flex-col overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl shadow-black/40">
              <li>
                <Link
                  href={hrefFor({ venue: undefined })}
                  className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${
                    !venueId ? "font-semibold text-neon" : "text-ink/80 hover:bg-ink/5"
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
                      venueId === id ? "font-semibold text-neon" : "text-ink/80 hover:bg-ink/5"
                    }`}
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </EscapableDetails>
        </div>
          </>
        )}
      </header>

      {view === "mios" ? (
        /* "Mis entradas" fusionada con /entradas: gestión completa
           (estado, precio, QR, regalar) en la misma vista. Fallo de
           /tickets/mine → error con retry (link = misma ruta), nunca
           el empty falso de la wallet. */
        myTickets === null ? (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-ink/60">
              {t.loadError}
            </p>
            <Button href={hrefFor({})} variant="secondary" size="sm">
              <RefreshIcon /> {tc.retry}
            </Button>
          </div>
        ) : (
          <TicketWallet tickets={myTickets} pendingOrders={pendingOrders} />
        )
      ) : eventsError ? (
        /* 500/red en /events no es cartelera vacía - error honesto
           con retry a la misma ruta (conserva vista y filtros). */
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t.loadError}
          </p>
          <Button href={hrefFor({})} variant="secondary" size="sm">
            <RefreshIcon /> {tc.retry}
          </Button>
        </div>
      ) : view === "map" ? (
        <section aria-label={t.viewMap}>
          {mapVenues.length === 0 ? (
            <p className="text-ink/60">
              {genreSet.size || venueId ? t.emptyFiltered : t.empty}
            </p>
          ) : (
            <>
              <div className="h-[68dvh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-line">
                <EventsMap venues={mapVenues} />
              </div>
              <p className="mt-3 text-center text-xs text-ink/50">
                {t.mapHint}
              </p>
            </>
          )}
        </section>
      ) : view === "calendar" ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={hrefFor({ month: prevMonthKey, day: undefined })}
              className={iconBtn(false)}
              aria-label={t.prevMonth}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <h2 className="text-base font-semibold capitalize">
              {monthLabel}
            </h2>
            <Link
              href={hrefFor({ month: nextMonthKey, day: undefined })}
              className={iconBtn(false)}
              aria-label={t.nextMonth}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
          {/* Grid mensual: fila de letras L–D + número + puntos por
              género. Los días de meses vecinos que completan el grid
              se atenúan. */}
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
          <div role="grid" className="grid grid-cols-7 gap-1" aria-label={t.viewCalendar}>
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
                      {t.more.replace("{count}", String(cell.events.length - 3))}
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
                  href={hrefFor({ day: cell.key })}
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
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-ink/50">
                {dayLabel(selectedDay, t)}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-ink/50">{t.noEventsDay}</p>
              ) : (
                <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
                  {selectedEvents.map((e) => (
                    <li key={e.id}>{renderCard(e)}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </section>
      ) : filtered.length === 0 ? (
        <p className="text-ink/60">
          {genreSet.size || venueId ? t.emptyFiltered : t.empty}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <section data-tour="ev-list">
            <h2 className="mb-3 text-sm font-semibold text-neon">
              {t.thisWeek}
            </h2>
            <div className="flex flex-col gap-6">
              {groupByDay(thisWeek).map(renderDayGroup)}
              {thisWeek.length === 0 && (
                <p className="text-sm text-ink/60">{t.emptyFiltered}</p>
              )}
            </div>
          </section>
          {later.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink/60">
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
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-ink/15 text-sm font-medium text-ink/70 transition-colors hover:border-neon/50 hover:text-ink active:scale-[0.98]"
            >
              {t.loadLater}
              <ChevronDownIcon />
            </Link>
          )}
        </div>
      )}

      {/* En mapa los filtros y la lista no existen - el tour espera a
          la primera visita a lista/calendario para mostrarse completo. */}
      {view !== "map" && (
        <OnboardingRunner tour="eventos" steps={tourSteps} />
      )}
    </main>
  );
}
