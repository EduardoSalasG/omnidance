"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Card, EventDate, PageLoading, PriceTag } from "@/components/ui";
import { Link } from "@/i18n/navigation";

type CityDetail = {
  id: string;
  name: string;
  slug: string;
  country: { code: string; name: string };
  academies: {
    id: string;
    name: string;
    photoUrl: string | null;
    instagram: string | null;
    address: string | null;
  }[];
  events: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    presalePrice: number | null;
    currency: string;
    venue?: { name: string } | null;
    venueText?: string | null;
    series?: { name: string } | null;
  }[];
  practices: {
    id: string;
    name: string;
    startsAt: string;
    venueText: string | null;
    venue?: { name: string } | null;
  }[];
};

/**
 * Landing de ciudad (spec multipais-foundation): "¿dónde bailar en
 * X?" - academias, próximos eventos y prácticas de la ciudad.
 */
export default function CityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("cities");
  const [city, setCity] = useState<CityDetail | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/cities/${slug}`);
    if (!res.ok) {
      setError(true);
      return;
    }
    setCity((await res.json()) as CityDetail);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
        <p className="text-sm text-ink/60">{t("notFound")}</p>
      </main>
    );
  }
  if (!city) return <PageLoading />;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">
          {t("title", { city: city.name })}
        </h1>
        <p className="text-sm text-ink/60">
          {city.name}, {city.country.name}
        </p>
      </header>

      {city.events.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
            {t("events")}
          </h2>
          {city.events.map((e) => (
            <Link key={e.id} href={`/eventos/${e.id}`} className="block">
              <Card className="transition-colors hover:border-neon/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.name}</p>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {e.series?.name ? `${e.series.name} · ` : ""}
                      {e.venue?.name ?? e.venueText ?? ""}
                    </p>
                  </div>
                  {e.presalePrice != null && (
                    <PriceTag amount={e.presalePrice} className="text-sm" />
                  )}
                </div>
                <EventDate
                  start={e.startsAt}
                  end={e.endsAt}
                  variant="full"
                  className="mt-2 text-xs text-ink/60"
                />
              </Card>
            </Link>
          ))}
        </section>
      )}

      {city.academies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
            {t("academies")}
          </h2>
          {city.academies.map((a) => (
            <Card key={a.id}>
              <p className="font-semibold">{a.name}</p>
              {a.address && (
                <p className="mt-0.5 text-xs text-ink/50">{a.address}</p>
              )}
            </Card>
          ))}
        </section>
      )}

      {city.practices.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
            {t("practices")}
          </h2>
          {city.practices.map((p) => (
            <Link key={p.id} href={`/eventos/${p.id}`} className="block">
              <Card className="transition-colors hover:border-neon/60">
                <p className="truncate font-semibold">{p.name}</p>
                <EventDate
                  start={p.startsAt}
                  variant="compact"
                  className="mt-0.5 text-xs text-ink/60"
                />
              </Card>
            </Link>
          ))}
        </section>
      )}

      {!city.events.length && !city.academies.length && (
        <p className="text-sm text-ink/60">{t("empty")}</p>
      )}
    </main>
  );
}
