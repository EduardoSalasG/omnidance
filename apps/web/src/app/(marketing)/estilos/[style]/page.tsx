import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import seoParts from "@/i18n/parts/seo.json";
import { Badge, Card, EventDate } from "@/components/ui";
import {
  fetchStyleLanding,
  fetchStyles,
  styleSlug,
  GENRE_LABEL,
  type StyleLanding,
} from "@/lib/styles";

const t = seoParts.seo;
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

type Params = { style: string };

// Los params no pre-generados resuelven on-demand (catálogo puede crecer
// sin rebuild). fetchStyleLanding tiene revalidate 300 → ISR.
export const dynamicParams = true;

export async function generateStaticParams(): Promise<Params[]> {
  const styles = await fetchStyles();
  return styles.map((s) => ({ style: styleSlug(s.name) }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const data = await fetchStyleLanding(params.style);
  if (!data) return { title: t.stylesIndexTitle };

  const genre = GENRE_LABEL[data.style.genre] ?? data.style.genre;
  const title = `${data.style.name} en Santiago`;
  const description =
    `Clases, academias y eventos de ${data.style.name} (${genre}) en ` +
    `Santiago. ${data.academies.length} academias lo enseñan en Omnidance — ` +
    `crea tu cuenta gratis y reserva tu cupo.`;
  const canonical = `/estilos/${data.style.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: `${title} — Omnidance`,
      description,
      url: canonical,
    },
  };
}

// JSON-LD del estilo: BreadcrumbList + ItemList de academias (School) +
// ItemList de DanceEvent cuando hay eventos con bloques del estilo.
// Mismo cuidado que components/landing/JsonLd: escapar "<".
function StyleJsonLd({ data }: { data: StyleLanding }) {
  const slug = data.style.slug;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Omnidance",
          item: WEB_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: t.stylesIndexTitle,
          item: `${WEB_URL}/estilos`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: data.style.name,
          item: `${WEB_URL}/estilos/${slug}`,
        },
      ],
    },
  ];

  if (data.academies.length > 0) {
    graph.push({
      "@type": "ItemList",
      name: `${t.landingAcademiesTitle} ${data.style.name}`,
      itemListElement: data.academies.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: { "@type": "School", name: a.name },
      })),
    });
  }

  if (data.upcomingEvents.length > 0) {
    graph.push({
      "@type": "ItemList",
      itemListElement: data.upcomingEvents.map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "DanceEvent",
          name: e.name,
          startDate: e.startsAt,
          url: `${WEB_URL}/eventos/${e.id}`,
          ...(e.venue?.name
            ? { location: { "@type": "Place", name: e.venue.name } }
            : {}),
        },
      })),
    });
  }

  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

// Landing SEO pública por estilo: hero + academias + próximas clases +
// eventos + CTA de conversión. Todo SSR (datos reales del API).
export default async function StyleLandingPage({
  params,
}: {
  params: Params;
}) {
  const data = await fetchStyleLanding(params.style);
  if (!data) notFound();

  const { style, academies, upcomingClasses, upcomingEvents } = data;
  const genre = GENRE_LABEL[style.genre] ?? style.genre;

  return (
    <>
      <StyleJsonLd data={data} />
      <main className="relative flex min-h-dvh flex-col overflow-hidden bg-night-950">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_25%,rgba(167,139,250,0.08),transparent_70%)]"
        />

        <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/" className="text-sm font-bold tracking-tight">
            Omni<span className="text-neon">dance</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            {t.ctaLogin}
          </Link>
        </header>

        {/* ─── Hero del estilo ─── */}
        <section className="relative z-10 mx-auto w-full max-w-3xl px-6 pt-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neon">
            {genre} · {t.landingEyebrow}
          </p>
          <h1 className="text-display mt-4 text-4xl font-extrabold sm:text-6xl">
            {style.name} en Santiago
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
            Academias, clases y socials de {style.name} en la escena SBK —
            todo en una sola app.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-neon px-8 text-base font-semibold text-night-950 transition-transform active:scale-[0.97] hover:bg-neon-soft sm:w-auto sm:px-10"
          >
            {t.ctaCreateAccount}
          </Link>
        </section>

        {/* ─── Academias que lo enseñan ─── */}
        <section className="relative z-10 mx-auto w-full max-w-3xl px-6 pt-16">
          <h2 className="text-xl font-bold sm:text-2xl">
            {t.landingAcademiesTitle} {style.name}
          </h2>
          {academies.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">
              {t.landingAcademiesEmpty}
            </p>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {academies.map((a) => (
                <li key={a.id}>
                  <Card className="flex items-center gap-3 p-4">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neon/15 text-sm font-bold text-neon"
                    >
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="font-medium">{a.name}</span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Próximas clases ─── */}
        <section className="relative z-10 mx-auto w-full max-w-3xl px-6 pt-14">
          <h2 className="text-xl font-bold sm:text-2xl">
            {t.landingClassesTitle}
          </h2>
          {upcomingClasses.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">
              {t.landingClassesEmpty}
            </p>
          ) : (
            <ul className="mt-6 flex flex-col gap-3">
              {upcomingClasses.map((c) => (
                <li key={c.id}>
                  <Card className="flex items-start justify-between gap-4 p-4">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        {c.seriesName ?? style.name}
                      </span>
                      <span className="text-sm text-white/55">
                        <EventDate start={c.date} /> · {c.academyName}
                      </span>
                    </div>
                    {c.levelName && <Badge variant="neon">{c.levelName}</Badge>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── Eventos con bloques del estilo ─── */}
        <section className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-20 pt-14">
          <h2 className="text-xl font-bold sm:text-2xl">
            {t.landingEventsTitle}
          </h2>
          {upcomingEvents.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">
              {t.landingEventsEmpty}
            </p>
          ) : (
            <ul className="mt-6 flex flex-col gap-3">
              {upcomingEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="block">
                    <Card className="flex flex-col gap-1 p-4 transition-colors hover:border-neon/50">
                      <div className="flex flex-wrap items-center gap-2">
                        {e.series && (
                          <Badge variant="neon">{e.series.name}</Badge>
                        )}
                      </div>
                      <span className="font-medium">{e.name}</span>
                      <span className="text-sm text-white/55">
                        <EventDate start={e.startsAt} />
                        {e.venue?.name ? ` · ${e.venue.name}` : ""}
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <Link
              href="/eventos"
              className="inline-flex min-h-11 items-center text-sm font-medium text-white/45 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
            >
              {t.ctaEvents}
            </Link>
            <Link
              href="/estilos"
              className="inline-flex min-h-11 items-center text-sm font-medium text-white/45 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
            >
              {t.ctaAllStyles}
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 pb-12 pt-2 text-center">
        <p className="text-xs text-white/40">
          Omni<span className="text-neon">dance</span> · {t.footer}
        </p>
      </footer>
    </>
  );
}
