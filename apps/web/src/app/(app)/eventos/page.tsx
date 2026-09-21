import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import messages from "../../../../messages/es-CL.json";
import { Badge, Card, EventDate, PriceTag } from "@/components/ui";

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
  venue: { id: string; name: string; address: string | null } | null;
};

const GENRES = ["SALSA", "BACHATA", "CUBANO"] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

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

export default async function EventosPage({
  searchParams,
}: {
  searchParams?: { genre?: string; venue?: string };
}) {
  const t = messages.events;
  const isAuthed = cookies().has("omnidance_session");

  const res = await fetch(`${API_URL}/api/events`, { cache: "no-store" });
  const all: EventListItem[] = res.ok ? await res.json() : [];

  // Anónimo: solo la semana, sin entrar a la app — el detalle lo pide
  // el middleware vía /login?next=/eventos/<id>.
  const genre = GENRES.find((g) => g === searchParams?.genre?.toUpperCase());
  const venueId = searchParams?.venue;

  const pool = isAuthed ? all : all.filter((e) =>
    new Date(e.startsAt).getTime() <= Date.now() + WEEK_MS,
  );
  const venues = [...new Map(
    pool.filter((e) => e.venue).map((e) => [e.venue!.id, e.venue!.name]),
  ).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const filtered = pool.filter(
    (e) =>
      (!genre || e.genres.includes(genre)) &&
      (!venueId || e.venue?.id === venueId),
  );

  const now = Date.now() + 0;
  const weekEnd = now + WEEK_MS;
  const thisWeek = filtered.filter(
    (e) => new Date(e.startsAt).getTime() <= weekEnd,
  );
  const later = filtered.filter(
    (e) => new Date(e.startsAt).getTime() > weekEnd,
  );

  // Chips SSR: cada filtro preserva el otro — compartibles y sin JS.
  const chipHref = (g?: string, v?: string) => {
    const params = new URLSearchParams();
    if (g) params.set("genre", g);
    if (v) params.set("venue", v);
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
            </div>
            <h2 className="text-lg font-semibold">{e.name}</h2>
            <p className="text-sm text-white/60">
              <EventDate start={e.startsAt} />
              {e.venue ? ` · ${e.venue.name}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">
          {isAuthed ? t.title : t.publicLead}
        </h1>

        {/* Filtros por género — links SSR preservando el otro filtro */}
        <nav
          aria-label="Filtrar por estilo"
          className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6"
        >
          <Link href={chipHref(undefined, venueId)} className={chipClass(!genre)}>
            {t.filterAll}
          </Link>
          {GENRES.map((g) => (
            <Link
              key={g}
              href={chipHref(g, venueId)}
              aria-current={genre === g ? "true" : undefined}
              className={chipClass(genre === g)}
            >
              {t.genre[g]}
            </Link>
          ))}
        </nav>

        {venues.length > 1 && (
          <nav
            aria-label="Filtrar por local"
            className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6"
          >
            <Link
              href={chipHref(genre)}
              className={chipClass(!venueId)}
            >
              {t.allVenues}
            </Link>
            {venues.map(([id, name]) => (
              <Link
                key={id}
                href={chipHref(genre, id)}
                aria-current={venueId === id ? "true" : undefined}
                className={chipClass(venueId === id)}
              >
                {name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {filtered.length === 0 ? (
        <p className="text-white/60">
          {genre || venueId ? t.emptyFiltered : t.empty}
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
