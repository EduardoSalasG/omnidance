import type { Metadata } from "next";
import { cache } from "react";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import {
  aggregateMix,
  Badge,
  Button,
  Card,
  EventDate,
  GenreMixBar,
  PriceTag,
} from "@/components/ui";
import type { GenreMixBlock } from "@/components/ui";
import { GENRE_TEXT } from "@/lib/calendar";
import type { GenreKey } from "@/lib/calendar";
import { getDateFmt } from "@/lib/intl";
import { localeAlternates } from "@/lib/seo";
import type { Locale } from "@/i18n/routing";
import { serverApiUrl } from "@/lib/server-api";

export const dynamic = "force-dynamic";

/**
 * GET /events/:id (endpoint público, sin SessionGuard): shape del
 * controller (events.controller.ts detail()). La landing solo consume
 * este subconjunto. El response no trae flyer ni imagen de evento: el
 * schema no tiene portada (photosUrl es el Drive post-evento del
 * fotógrafo y tampoco se selecciona en el detail).
 */
type PublicEvent = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  presalePrice: number | null;
  doorPrice: number | null;
  /** ISO-4217; no-CLP se muestra con el código (formatMoney). */
  currency?: string;
  genres: string[];
  genreMix: GenreMixBlock[] | null;
  series: {
    id: string;
    name: string;
    genres?: string[];
    genreMix?: GenreMixBlock[] | null;
  } | null;
  venue: { name: string; address: string | null } | null;
  /** Lugar libre cuando no hay Venue del catálogo ("Parque Bustamante"). */
  venueText: string | null;
  /** Detalle del lugar (sala, piso); se usa cuando falta address. */
  venueNotes: string | null;
  description: string | null;
};

// cache() deduplica el fetch entre generateMetadata y la página dentro
// del mismo render (fetch con no-store no se deduplica solo).
const getEvent = cache(
  async (id: string): Promise<PublicEvent | "gone" | "error"> => {
    const API_URL = await serverApiUrl();
    const res = await fetch(`${API_URL}/api/events/${encodeURIComponent(id)}`, {
      cache: "no-store",
    }).catch(() => null);
    if (res?.status === 404) return "gone";
    if (!res || !res.ok) return "error";
    return (await res.json()) as PublicEvent;
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("eventLanding");
  const locale = (await getLocale()) as Locale;
  const event = await getEvent(id);
  if (event === "gone" || event === "error" || event.status === "DRAFT") {
    return { title: t("unavailableTitle") };
  }
  const venueName = event.venue?.name ?? event.venueText;
  const date = getDateFmt(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(event.startsAt));
  return {
    // El template del root layout agrega " | Omnidance".
    title: event.name,
    description: venueName
      ? t("metaDescription", { name: event.name, date, venue: venueName })
      : t("metaDescriptionNoVenue", { name: event.name, date }),
    alternates: localeAlternates(locale, `/e/${id}`),
  };
}

/**
 * Landing pública de captación del evento (spec
 * public-event-landing): el link lo comparte el productor por
 * redes/WhatsApp. Anónimo ve la ficha completa; el CTA de compra va a
 * /login?next=/eventos/<id> (path sin locale; el adapter de i18n lo
 * re-agrega post-login) y con sesión va directo al detalle, donde
 * corre el flujo de compra estándar.
 */
export default async function EventLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("eventLanding");
  const te = await getTranslations("events");
  const tc = await getTranslations("common");
  const event = await getEvent(id);

  // Estado terminal claro (nunca el 404 crudo): el link puede venir de
  // un post viejo; inexistente, borrador sin publicar o error de API
  // se comunican con el mismo nivel de cuidado que la ficha.
  if (event === "gone" || event === "error" || event.status === "DRAFT") {
    const isError = event === "error";
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">
          {isError ? t("errorTitle") : t("unavailableTitle")}
        </h1>
        <p className="max-w-sm text-sm text-ink/60">
          {isError ? t("errorDesc") : t("unavailableDesc")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {isError && (
            <Button href={`/e/${id}`} variant="secondary">
              {tc("retry")}
            </Button>
          )}
          <Button href="/">{t("exploreCta")}</Button>
        </div>
      </main>
    );
  }

  const hasSession = (await cookies()).has("omnidance_session");

  const isCancelled = event.status === "CANCELLED";
  const isPast =
    isCancelled ||
    event.status === "CLOSED" ||
    Date.now() >= new Date(event.endsAt).getTime();
  const buyable = !isPast;

  // next= lleva el path SIN prefijo de locale (mismo contrato que el
  // middleware y /reclamar): la navegación post-login re-agrega el
  // locale activo vía el adapter de i18n.
  const buyNext = `/eventos/${event.id}`;
  const buyHref = hasSession
    ? buyNext
    : `/login?next=${encodeURIComponent(buyNext)}`;

  const typeLabel = te.has(`type.${event.type}`)
    ? te(`type.${event.type}`)
    : event.type;
  const genres = event.genres.length
    ? event.genres
    : (event.series?.genres ?? []);
  const genreMix = event.genreMix ?? event.series?.genreMix ?? null;
  const mixSegs = genreMix?.length ? aggregateMix(genreMix) : null;
  const orderedGenres = mixSegs
    ? [...mixSegs].sort((a, b) => b.pct - a.pct).map((s) => s.genre)
    : genres;
  const venueName = event.venue?.name ?? event.venueText;
  const venueDetail = event.venue?.address ?? event.venueNotes;
  const currency = event.currency ?? "CLP";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 p-6 lg:max-w-xl">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {event.series && <Badge variant="neon">{event.series.name}</Badge>}
          <Badge variant="outline">{typeLabel}</Badge>
          {event.status === "LIVE" && !isPast && (
            <Badge variant="live">{te("live")}</Badge>
          )}
          {isCancelled ? (
            <Badge variant="outline">{te("cancelled")}</Badge>
          ) : (
            isPast && <Badge variant="outline">{te("past")}</Badge>
          )}
        </div>
        <h1 className="text-3xl font-bold leading-tight">{event.name}</h1>
        <EventDate
          variant="full"
          start={event.startsAt}
          end={event.endsAt}
          className="text-ink/70"
        />
        {orderedGenres.length > 0 && (
          <p className="text-sm">
            {orderedGenres.map((g, i) => (
              <span key={g}>
                {i > 0 && <span className="text-ink/30"> · </span>}
                <span className={GENRE_TEXT[g as GenreKey] ?? "text-ink/50"}>
                  {te.has(`genre.${g}`) ? te(`genre.${g}`) : g}
                </span>
              </span>
            ))}
          </p>
        )}
        {mixSegs && (
          <GenreMixBar
            mix={genreMix!}
            labels={{
              SALSA: te("genre.SALSA"),
              BACHATA: te("genre.BACHATA"),
              CUBANO: te("genre.CUBANO"),
            }}
            className="max-w-xs"
          />
        )}
        {venueName && (
          <div className="flex items-start gap-2 text-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mt-0.5 h-4 w-4 shrink-0 text-ink/50"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div className="min-w-0">
              <p className="font-medium">{venueName}</p>
              {venueDetail && <p className="text-ink/50">{venueDetail}</p>}
            </div>
          </div>
        )}
      </header>

      {/* Precios: preventa/puerta o "Gratis" cuando el evento no vende. */}
      <Card>
        {event.presalePrice == null && event.doorPrice == null ? (
          <p className="text-lg font-semibold text-neon">{te("free")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink/50">
                {te("presale")}
              </dt>
              <dd className="mt-1">
                <PriceTag
                  amount={event.presalePrice}
                  currency={currency}
                  className="text-xl"
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink/50">
                {te("door")}
              </dt>
              <dd className="mt-1">
                <PriceTag
                  amount={event.doorPrice}
                  currency={currency}
                  className="text-xl"
                />
              </dd>
            </div>
          </dl>
        )}
      </Card>

      {event.description && (
        <Card>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">
            {event.description}
          </p>
        </Card>
      )}

      {/* CTA principal: con sesión va directo a la ficha (flujo de
          compra estándar); anónimo pasa por login/registro con next=
          de vuelta a /eventos/<id>. */}
      <div className="flex flex-col gap-3">
        {buyable ? (
          <>
            <Button href={buyHref} size="lg" className="w-full">
              {t("buyCta")}
            </Button>
            {!hasSession && (
              <p className="text-center text-xs text-ink/50">
                {t("buyHint")}
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-ink/60">
            {isCancelled ? t("cancelledNote") : t("pastNote")}
          </p>
        )}
      </div>
    </main>
  );
}
