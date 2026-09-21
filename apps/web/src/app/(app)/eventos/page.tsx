import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import type { Metadata } from "next";
import messages from "../../../../messages/es-CL.json";
import { Badge, Card, EventDate, PriceTag } from "@/components/ui";
import { SaveEventButton } from "@/components/rsvp/SaveEventButton";
import { NearMeButton } from "@/components/events/NearMeButton";
import { formatKm, haversineKm, parseNear } from "@/lib/geo";

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
  series: { name: string } | null;
  venue: {
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
};

type MyRsvp = { eventId: string; status: "GOING" | "INTERESTED" };
type View = "list" | "calendar" | "saved";

const GENRES = ["SALSA", "BACHATA", "CUBANO"] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const monthFmt = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
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

/** RSVP propios del usuario autenticado — cookie forward (401 → null). */
async function getMyRsvps(): Promise<Map<string, MyRsvp["status"]>> {
  const res = await fetch(`${API_URL}/api/me/rsvp`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (!res?.ok) return new Map();
  const rows = (await res.json()) as MyRsvp[];
  return new Map(rows.map((r) => [r.eventId, r.status]));
}

/** Mes "YYYY-MM" validado; default = mes local actual. */
function parseMonth(raw: string | undefined): { y: number; m: number } {
  const now = new Date();
  const match = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    if (m >= 1 && m <= 12) return { y, m };
  }
  return { y: now.getFullYear(), m: now.getMonth() + 1 };
}

/** Celdas de la grilla: null = relleno fuera del mes. Semana parte lunes. */
function calendarCells(
  y: number,
  m: number,
  byDay: Map<string, EventListItem[]>,
) {
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // domingo→6 … lunes→0
  const cells: ({ day: number; key: string; events: EventListItem[] } | null)[] =
    Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key, events: byDay.get(key) ?? [] });
  }
  return cells;
}

export default async function EventosPage({
  searchParams,
}: {
  searchParams?: {
    genre?: string;
    venue?: string;
    view?: string;
    month?: string;
    near?: string;
  };
}) {
  const t = messages.events;
  const isAuthed = cookies().has("omnidance_session");

  const [res, myRsvps] = await Promise.all([
    fetch(`${API_URL}/api/events`, { cache: "no-store" }),
    isAuthed ? getMyRsvps() : Promise.resolve(new Map()),
  ]);
  const all: EventListItem[] = res.ok ? await res.json() : [];

  const genre = GENRES.find((g) => g === searchParams?.genre?.toUpperCase());
  const venueId = searchParams?.venue;
  const near = parseNear(searchParams?.near);
  const rawView = searchParams?.view;
  // Las vistas calendar/saved son solo para autenticados.
  const view: View =
    isAuthed && (rawView === "calendar" || rawView === "saved")
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
      (!genre || e.genres.includes(genre)) &&
      (!venueId || e.venue?.id === venueId),
  );

  // "Cerca de ti": orden por distancia al punto; sin coords → al final.
  const distOf = (e: EventListItem) =>
    near && e.venue?.lat != null && e.venue.lng != null
      ? haversineKm(near.lat, near.lng, e.venue.lat, e.venue.lng)
      : null;
  const sorted = near
    ? [...filtered].sort(
        (a, b) => (distOf(a) ?? Infinity) - (distOf(b) ?? Infinity),
      )
    : filtered;

  const now = Date.now();
  const thisWeek = sorted.filter(
    (e) => new Date(e.startsAt).getTime() <= now + WEEK_MS,
  );
  const later = sorted.filter(
    (e) => new Date(e.startsAt).getTime() > now + WEEK_MS,
  );

  const saved = filtered.filter((e) => myRsvps.has(e.id));

  const { y: calY, m: calM } = parseMonth(searchParams?.month);
  const calByDay = new Map<string, EventListItem[]>();
  for (const e of filtered) {
    const key = dayKey(e.startsAt);
    calByDay.set(key, [...(calByDay.get(key) ?? []), e]);
  }
  const cells = calendarCells(calY, calM, calByDay);
  const prevMonth = new Date(calY, calM - 2, 1);
  const nextMonth = new Date(calY, calM, 1);
  const monthParam = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const todayKey = dayKey(new Date().toISOString());

  // Chips SSR: cada filtro preserva el resto — compartibles y sin JS.
  const hrefFor = (o: {
    genre?: string;
    venue?: string;
    view?: string;
    month?: string;
    near?: string;
  }) => {
    const merged = {
      genre,
      venue: venueId,
      view: view !== "list" ? view : undefined,
      month:
        view === "calendar" ? monthParam(new Date(calY, calM - 1, 1)) : undefined,
      near: searchParams?.near,
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

  const renderCard = (e: EventListItem) => {
    const km = distOf(e);
    const inner = (
      <Card className="transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {e.series && <Badge variant="neon">{e.series.name}</Badge>}
              {e.status === "LIVE" && <Badge variant="live">{t.live}</Badge>}
              {e.genres.map((g) => (
                <Badge key={g} variant="outline">
                  {t.genre[g as keyof typeof t.genre] ?? g}
                </Badge>
              ))}
              {isAuthed && myRsvps.get(e.id) === "GOING" && (
                <Badge variant="outline">{messages.rsvp.going}</Badge>
              )}
            </div>
            <h2 className="text-lg font-semibold">{e.name}</h2>
            <p className="text-sm text-white/60">
              <EventDate start={e.startsAt} />
              {e.venue ? ` · ${e.venue.name}` : ""}
              {km != null && ` · a ${formatKm(km)}`}
            </p>
          </div>
          <div
            className={`shrink-0 text-right ${isAuthed ? "pt-11" : ""}`}
          >
            {e.presalePrice != null ? (
              <>
                <span className="block text-xs text-white/50">
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
    // El bookmark es sibling absoluto del Link — HTML válido, card clickeable.
    return isAuthed ? (
      <div className="relative">
        <Link href={`/eventos/${e.id}`} className="block rounded-2xl">
          {inner}
        </Link>
        <SaveEventButton
          eventId={e.id}
          initialStatus={myRsvps.get(e.id) ?? null}
          className="absolute right-3 top-3 z-10"
        />
      </div>
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

  const filterNav = (
    <>
      <nav
        aria-label="Filtrar por estilo"
        className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6"
      >
        <Link href={hrefFor({ genre: undefined })} className={chipClass(!genre)}>
          {t.filterAll}
        </Link>
        {GENRES.map((g) => (
          <Link
            key={g}
            href={hrefFor({ genre: g })}
            aria-current={genre === g ? "true" : undefined}
            className={chipClass(genre === g)}
          >
            {t.genre[g]}
          </Link>
        ))}
      </nav>

      {(venues.length > 1 || view === "list") && (
        <nav
          aria-label="Filtrar por local"
          className="no-scrollbar -mx-6 flex items-center gap-2 overflow-x-auto px-6"
        >
          {venues.length > 1 && (
            <>
              <Link
                href={hrefFor({ venue: undefined })}
                className={chipClass(!venueId)}
              >
                {t.allVenues}
              </Link>
              {venues.map(([id, name]) => (
                <Link
                  key={id}
                  href={hrefFor({ venue: id })}
                  aria-current={venueId === id ? "true" : undefined}
                  className={chipClass(venueId === id)}
                >
                  {name}
                </Link>
              ))}
            </>
          )}
          {view === "list" &&
            (near ? (
              <Link
                href={hrefFor({ near: undefined })}
                className={chipClass(true)}
                aria-label={t.nearClear}
              >
                {t.near} ✕
              </Link>
            ) : (
              <Suspense fallback={null}>
                <NearMeButton />
              </Suspense>
            ))}
        </nav>
      )}
    </>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">
          {isAuthed ? t.title : t.publicLead}
        </h1>

        {isAuthed && (
          <nav
            aria-label="Vista de eventos"
            className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6"
          >
            <Link
              href={hrefFor({ view: undefined, month: undefined })}
              className={chipClass(view === "list")}
            >
              {t.viewList}
            </Link>
            <Link
              href={hrefFor({ view: "calendar", month: undefined })}
              className={chipClass(view === "calendar")}
            >
              {t.viewCalendar}
            </Link>
            <Link
              href={hrefFor({ view: "saved", month: undefined })}
              className={chipClass(view === "saved")}
            >
              {t.viewSaved}
            </Link>
          </nav>
        )}

        {filterNav}
      </header>

      {view === "calendar" ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={hrefFor({ month: monthParam(prevMonth) })}
              className={chipClass(false)}
              aria-label={t.prevMonth}
            >
              ←
            </Link>
            <h2 className="text-base font-semibold capitalize">
              {monthFmt.format(new Date(calY, calM - 1, 1))}
            </h2>
            <Link
              href={hrefFor({ month: monthParam(nextMonth) })}
              className={chipClass(false)}
              aria-label={t.nextMonth}
            >
              →
            </Link>
          </div>
          <div
            role="grid"
            className="grid grid-cols-7 gap-1"
            aria-label={t.viewCalendar}
          >
            {WEEKDAY_HEADERS.map((d, i) => (
              <div
                key={i}
                className="pb-1 text-center text-xs font-semibold text-white/40"
              >
                {d}
              </div>
            ))}
            {cells.map((cell, i) =>
              cell === null ? (
                <div key={`pad-${i}`} />
              ) : (
                <div
                  key={cell.key}
                  className={`flex min-h-16 flex-col gap-1 rounded-lg border p-1.5 ${
                    cell.key === todayKey
                      ? "border-neon/60"
                      : "border-white/10"
                  } ${cell.events.length ? "bg-night-900" : ""}`}
                >
                  <span
                    className={`text-xs font-medium ${
                      cell.key === todayKey ? "text-neon" : "text-white/60"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {cell.events.slice(0, 2).map((e) => (
                    <Link
                      key={e.id}
                      href={`/eventos/${e.id}`}
                      className="truncate rounded bg-neon/10 px-1 py-0.5 text-[11px] leading-tight text-neon hover:bg-neon/20"
                      title={e.name}
                    >
                      {e.name}
                    </Link>
                  ))}
                  {cell.events.length > 2 && (
                    <span className="px-1 text-[11px] text-white/40">
                      {t.more.replace("{count}", String(cell.events.length - 2))}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
        </section>
      ) : view === "saved" ? (
        <div className="flex flex-col gap-8">
          {saved.length === 0 ? (
            <p className="text-white/60">{t.savedEmpty}</p>
          ) : (
            groupByDay(saved).map(renderDayGroup)
          )}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-white/60">
          {genre || venueId || near ? t.emptyFiltered : t.empty}
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
