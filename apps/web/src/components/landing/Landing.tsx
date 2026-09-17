import Link from "next/link";
import messages from "../../../messages/es-CL.json";
import { Badge, Card, EventDate, PriceTag } from "@/components/ui";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type EventListItem = {
  id: string;
  name: string;
  startsAt: string;
  presalePrice: number | null;
  series: { name: string } | null;
  venue: { name: string };
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
const ctaSecondary =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-night-700 " +
  "bg-night-900 px-6 font-semibold text-white transition-transform active:scale-[0.97] hover:border-neon/60";

export async function Landing() {
  const t = messages.landing;
  const events = await fetchPublicEvents(3);

  return (
    <main className="flex min-h-screen flex-col">
      {/* ─── Hero ─── */}
      <section className="glow-neon relative flex flex-col items-center px-6 pb-16 pt-20 text-center sm:pt-28">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neon">
          {t.eyebrow}
        </p>
        <h1 className="text-display mt-4 max-w-3xl text-4xl font-extrabold sm:text-5xl lg:text-6xl">
          {t.heroTitle}
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-white/70 sm:text-lg">
          {t.heroSubtitle}
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link href="/eventos" className={ctaPrimary}>
            {t.ctaEvents}
          </Link>
          <Link href="/login" className={ctaSecondary}>
            {t.ctaJoin}
          </Link>
        </div>
      </section>

      {/* ─── Eventos en vivo — prueba social con datos reales ─── */}
      {events.length > 0 && (
        <section
          aria-labelledby="landing-live"
          className="mx-auto w-full max-w-5xl px-6 py-12"
        >
          <h2
            id="landing-live"
            className="text-sm font-semibold uppercase tracking-wide text-white/50"
          >
            {t.liveTitle}
          </h2>
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
                      <EventDate start={e.startsAt} /> · {e.venue.name}
                    </p>
                    {e.presalePrice != null && (
                      <PriceTag
                        amount={e.presalePrice}
                        className="mt-2 block text-sm"
                      />
                    )}
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

      {/* ─── Para toda la escena ─── */}
      <section
        aria-labelledby="landing-for"
        className="border-y border-night-700 bg-night-900/50 py-12"
      >
        <div className="mx-auto w-full max-w-5xl px-6">
          <h2
            id="landing-for"
            className="text-display text-2xl font-bold sm:text-3xl"
          >
            {t.forTitle}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {(["dancers", "producers", "academies"] as const).map((r) => (
              <li key={r}>
                <Card className="h-full">
                  <h3 className="font-semibold text-neon">
                    {t.for[`${r}Title` as keyof typeof t.for]}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    {t.for[`${r}Desc` as keyof typeof t.for]}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── CTA final ─── */}
      <section className="flex flex-col items-center px-6 py-20 text-center">
        <h2 className="text-display text-3xl font-extrabold sm:text-4xl">
          {t.finalCta}
        </h2>
        <p className="mt-3 max-w-sm text-white/60">{t.finalCtaDesc}</p>
        <Link href="/login" className={`${ctaPrimary} mt-8 px-8`}>
          {t.ctaJoin}
        </Link>
      </section>

      <footer className="border-t border-night-700 px-6 py-8 text-center">
        <p className="text-sm font-semibold">
          Omni<span className="text-neon">dance</span>
        </p>
        <p className="mt-1 text-xs text-white/50">
          {t.footer} · {messages.common.tagline}
        </p>
        <Link
          href="/eventos"
          className="mt-3 inline-block text-xs text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
        >
          {messages.events.title}
        </Link>
      </footer>
    </main>
  );
}
