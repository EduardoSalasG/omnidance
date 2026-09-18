import Link from "next/link";
import messages from "../../../messages/es-CL.json";
// Las claves nuevas de la landing llegan en este fragmento, que se fusiona
// en messages/es-CL.json bajo el namespace "landing" (ver src/i18n/parts/).
import landingParts from "@/i18n/parts/landing.json";
import { Badge, Card, EventDate, PriceTag } from "@/components/ui";
import { JsonLd } from "./JsonLd";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type EventListItem = {
  id: string;
  name: string;
  startsAt: string;
  presalePrice: number | null;
  series: { name: string } | null;
  venue: { name: string } | null;
};

async function fetchPublicEvents(limit: number): Promise<EventListItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/events`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return ((await res.json()) as EventListItem[]).slice(0, limit);
  } catch {
    return [];
  }
}

const ctaPrimary =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-neon px-6 " +
  "font-semibold text-night-950 transition-transform active:scale-[0.97] hover:bg-neon-soft";

export async function Landing() {
  const t = { ...messages.landing, ...landingParts.landing };
  const events = await fetchPublicEvents(3);

  return (
    <>
      <JsonLd events={events} />
      <main className="flex min-h-dvh flex-col">
        {/* ─── Hero: una promesa + un CTA dominante above-the-fold ─── */}
        <section className="glow-neon relative flex flex-col items-center px-6 pb-16 pt-16 text-center sm:pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neon">
            {t.eyebrow}
          </p>
          <h1 className="text-display mt-4 max-w-2xl text-4xl font-extrabold sm:text-5xl">
            {t.heroPromise}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/70 sm:text-lg">
            {t.heroLead}
          </p>
          <Link
            href="/login"
            className={`${ctaPrimary} mt-8 w-full max-w-xs px-8 sm:w-auto`}
          >
            {t.ctaCreateAccount}
          </Link>
          <Link
            href="/eventos"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            {t.ctaSeeWeekEvents}
          </Link>
        </section>

        {/* ─── Eventos en vivo — prueba social con datos reales ─── */}
        {events.length > 0 && (
          <section
            aria-labelledby="landing-live"
            className="mx-auto w-full max-w-5xl px-6 py-12"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2
                id="landing-live"
                className="text-sm font-semibold uppercase tracking-wide text-white/50"
              >
                {t.liveTitle}
              </h2>
              <Link
                href="/eventos"
                className="inline-flex min-h-11 shrink-0 items-center text-xs font-medium text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
              >
                {messages.common.seeAll}
              </Link>
            </div>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/eventos/${e.id}`}
                    className="block rounded-2xl"
                  >
                    <Card className="h-full transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
                      {e.series && <Badge variant="neon">{e.series.name}</Badge>}
                      <h3 className="mt-2 font-semibold leading-tight">
                        {e.name}
                      </h3>
                      <p className="mt-1 text-sm text-white/60">
                        <EventDate start={e.startsAt} />
                        {e.venue?.name ? ` · ${e.venue.name}` : ""}
                      </p>
                      {e.presalePrice != null && (
                        <PriceTag
                          amount={e.presalePrice}
                          className="mt-2 block text-sm"
                        />
                      )}
                      <span className="mt-3 inline-block text-xs font-semibold text-neon">
                        {t.liveSeeDetails}
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── Cómo funciona ─── */}
        <section
          aria-labelledby="landing-how"
          className="mx-auto w-full max-w-5xl px-6 py-12"
        >
          <h2
            id="landing-how"
            className="text-display text-2xl font-bold sm:text-3xl"
          >
            {t.howTitle}
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="flex flex-col gap-3">
                <span
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-neon/40 bg-neon/10 text-lg font-bold text-neon"
                >
                  {n}
                </span>
                <h3 className="text-lg font-semibold">
                  {t.how[`step${n}Title` as keyof typeof t.how]}
                </h3>
                <p className="text-sm leading-relaxed text-white/60">
                  {t.how[`step${n}Desc` as keyof typeof t.how]}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ─── CTA final ─── */}
        <section
          aria-labelledby="landing-final"
          className="flex flex-col items-center px-6 py-20 text-center"
        >
          <h2
            id="landing-final"
            className="text-display text-3xl font-extrabold sm:text-4xl"
          >
            {t.finalCta}
          </h2>
          <p className="mt-3 max-w-sm text-white/60">{t.finalCtaDesc}</p>
          <p className="mt-2 max-w-md text-sm text-white/50">
            {t.finalCtaRoles}
          </p>
          <Link href="/login" className={`${ctaPrimary} mt-8 px-8`}>
            {t.ctaCreateAccount}
          </Link>
        </section>
      </main>

      <footer className="border-t border-night-700 px-6 py-8 text-center">
        <p className="text-sm font-semibold">
          Omni<span className="text-neon">dance</span>
        </p>
        <p className="mt-1 text-xs text-white/50">
          {t.footer} · {messages.common.tagline}
        </p>
        <Link
          href="/eventos"
          className="mt-3 inline-flex min-h-11 items-center text-xs text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
        >
          {messages.events.title}
        </Link>
      </footer>
    </>
  );
}
