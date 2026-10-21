import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";
import {
  cityLandingEnabled,
  fetchPublicCity,
} from "@/lib/public-cities";
import { EventCard, type EventCardData } from "@/components/events/event-card";
import { Card } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { dayKey } from "@/lib/calendar";
import { getDateFmt } from "@/lib/intl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("cities");
  const city = await fetchPublicCity(slug);
  // Sin ciudad (o flag OFF) la página hace notFound - el title da igual,
  // pero el fetch es el mismo que el de la página (dedupe de Next).
  if (!city || city === "not-found") {
    return { title: m.cities.notFound };
  }
  return {
    title: t("cityMetaTitle", { city: city.name }),
    description: t("cityMetaDescription", {
      city: city.name,
      country: city.country.name,
    }),
    alternates: localeAlternates(locale, `/ciudades/${slug}`),
  };
}

type GroupedDay = { key: string; label: string; items: EventCardData[] };

/** Agrupa por día local ("YYYY-MM-DD") - mismo patrón que /eventos. */
function groupByDay(events: EventCardData[]): GroupedDay[] {
  const groups = new Map<string, EventCardData[]>();
  for (const e of events) {
    const key = dayKey(e.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, label: items[0].startsAt, items }));
}

/**
 * Landing pública de ciudad (spec city-discovery): hero + próximos
 * eventos (mismo card del feed) + venues + bloque reservado para la
 * guía editorial (city-guides la puebla - hoy hasGuide es false).
 * Slug inexistente → 404; flag OFF → 404 (gate server-side).
 */
export default async function CiudadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await cityLandingEnabled())) notFound();
  const t = await getTranslations("cities");
  const te = await getTranslations("events");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const city = await fetchPublicCity(slug);
  if (city === "not-found") notFound();

  const dayFmt = getDateFmt(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const dayLabel = (iso: string) => {
    const today = dayKey(new Date().toISOString());
    const tomorrow = dayKey(new Date(Date.now() + 86400000).toISOString());
    const key = dayKey(iso);
    if (key === today) return te("today");
    if (key === tomorrow) return te("tomorrow");
    return dayFmt.format(new Date(iso));
  };

  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 sm:py-14 lg:max-w-4xl"
    >
      <div>
        <Link
          href="/ciudades"
          className="inline-flex min-h-11 items-center text-sm text-ink/60 transition-colors hover:text-ink"
        >
          {t("backToCities")}
        </Link>

        {city === null ? (
          /* Fallo de API/red - error honesto con retry a la misma ruta. */
          <div className="mt-6 flex items-center gap-3">
            <p role="alert" className="text-sm text-ink/60">
              {t("loadError")}
            </p>
            <Link
              href={`/ciudades/${slug}`}
              className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:border-neon/50 hover:text-ink"
            >
              {tc("retry")}
            </Link>
          </div>
        ) : (
          <>
            {/* Hero: identidad de la ciudad + pulso de actividad */}
            <header className="mt-4 flex flex-col gap-2">
              <h1 className="text-display text-3xl font-extrabold sm:text-4xl">
                {t("cityTitle", { city: city.name })}
              </h1>
              <p className="text-ink/70">
                {t("citySubtitle", {
                  count: city.upcomingEvents.length,
                  city: city.name,
                  country: city.country.name,
                })}
              </p>
            </header>
          </>
        )}
      </div>

      {city !== null && (
        <>
          {/* Guía editorial - bloque reservado (spec city-discovery);
              la API emite guide cuando city-guides lo active. */}
          {city.hasGuide && city.guide && (
            <section aria-labelledby="guia" className="flex flex-col gap-4">
              <h2
                id="guia"
                className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/50"
              >
                {t("guide")}
              </h2>
              {(
                [
                  ["guideIntro", city.guide.intro],
                  ["guideNightlife", city.guide.nightlife],
                  ["guidePractical", city.guide.practical],
                ] as const
              )
                .filter(([, body]) => body.trim().length > 0)
                .map(([labelKey, body]) => (
                  <div key={labelKey}>
                    <h3 className="text-sm font-semibold">
                      {t(labelKey)}
                    </h3>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink/70">
                      {body}
                    </p>
                  </div>
                ))}
            </section>
          )}

          <section aria-labelledby="proximos" className="flex flex-col gap-4">
            <h2
              id="proximos"
              className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/50"
            >
              {t("upcomingEvents")}
            </h2>
            {city.upcomingEvents.length === 0 ? (
              <p className="text-sm text-ink/60">
                {t("noEvents", { city: city.name })}
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {groupByDay(city.upcomingEvents).map((g) => (
                  <section key={g.key}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-ink/50">
                      {dayLabel(g.label)}
                    </h3>
                    <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
                      {g.items.map((e) => (
                        <li key={e.id}>
                          <EventCard e={e} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>

          {city.venues.length > 0 && (
            <section aria-labelledby="locales" className="flex flex-col gap-4">
              <h2
                id="locales"
                className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/50"
              >
                {t("venues")}
              </h2>
              <Card padded={false}>
                <ul className="divide-y divide-line">
                  {city.venues.map((v) => (
                    <li key={v.id}>
                      <Link
                        href={`/locales/${v.id}`}
                        className="flex min-h-11 items-center px-4 text-sm font-medium transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {v.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </main>
  );
}
