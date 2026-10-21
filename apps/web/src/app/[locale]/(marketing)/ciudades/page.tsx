import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";
import {
  cityLandingEnabled,
  fetchPublicCities,
} from "@/lib/public-cities";
import { Card, ChevronRightIcon } from "@/components/ui";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const locale = (await getLocale()) as Locale;
  return {
    title: m.cities.metaTitle,
    description: m.cities.metaDescription,
    alternates: localeAlternates(locale, "/ciudades"),
  };
}

/**
 * Directorio público de ciudades (spec city-discovery): ciudades con
 * eventos futuros publicados, ordenadas por actividad. Anónima y
 * logueada comparten la página - el flag city_landing la apaga entera
 * (gate server-side, mismo criterio que los endpoints).
 */
export default async function CiudadesPage() {
  if (!(await cityLandingEnabled())) notFound();
  const t = await getTranslations("cities");
  const tc = await getTranslations("common");
  const cities = await fetchPublicCities();

  return (
    <main
      id="contenido"
      className="mx-auto w-full max-w-2xl px-6 py-10 sm:py-14 lg:max-w-4xl"
    >
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm text-ink/60 transition-colors hover:text-ink"
      >
        {t("backHome")}
      </Link>

      <header className="mt-4 flex flex-col gap-2">
        <h1 className="text-display text-3xl font-extrabold sm:text-4xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-ink/70">{t("subtitle")}</p>
      </header>

      {cities === null ? (
        /* Fallo de API/red ≠ directorio vacío - error honesto con
           retry a la misma ruta. */
        <div className="mt-10 flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("loadError")}
          </p>
          <Link
            href="/ciudades"
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/70 transition-colors hover:border-neon/50 hover:text-ink"
          >
            {tc("retry")}
          </Link>
        </div>
      ) : cities.length === 0 ? (
        <p className="mt-10 text-sm text-ink/60">{t("empty")}</p>
      ) : (
        <Card padded={false} className="mt-10">
          <ul className="divide-y divide-line">
            {cities.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/ciudades/${c.slug}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neon"
                >
                  {/* Contenido: ciudad + país (identidad) */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">
                      {c.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink/50">
                      {c.country.name}
                    </span>
                  </span>
                  {/* Zona derecha: actividad + affordance juntas */}
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-neon/15 px-2.5 py-1 text-xs font-medium tabular-nums text-neon">
                      {t("eventsCount", { count: c.upcomingEvents })}
                    </span>
                    <ChevronRightIcon className="h-4 w-4 text-ink/40" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
