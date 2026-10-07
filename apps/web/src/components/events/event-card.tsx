import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Badge,
  Card,
  EventDate,
  GenreMixBar,
  PriceTag,
  aggregateMix,
} from "@/components/ui";
import type { GenreMixBlock } from "@/components/ui";
import { GENRE_TEXT } from "@/lib/calendar";
import type { GenreKey } from "@/lib/calendar";

// GET /events - evento publicado con venue y mix de géneros.
// Shape único del card (símil de ClassCardData en /clases).
export type EventCardData = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  presalePrice: number | null;
  doorPrice: number | null;
  genres: string[];
  genreMix: GenreMixBlock[] | null;
  series: { name: string } | null;
  venue: {
    id: string;
    name: string;
    address: string | null;
  } | null;
};

// La chip de serie solo informa cuando el nombre del evento no trae la
// marca ("Edición Aniversario" ← serie "Bachatamania"); si el título ya
// la contiene, es duplicado.
const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const seriesIsDup = (e: EventCardData) =>
  !!e.series && normName(e.name).includes(normName(e.series.name));

// Card de evento - mismo esqueleto que ClassCard: columna de contenido
// a la izquierda y rail de decisión a la derecha (hora arriba como
// ancla de escaneo, precio debajo). En /eventos el día lo dan los
// headings de grupo; fuera de ese contexto el caller pasa `when`.
// El card completo es link a la ficha - hoy no hay acción in-card.
export function EventCard({ e, when }: { e: EventCardData; when?: string }) {
  const t = useTranslations("events");
  // Proporción del ciclo: ordena el texto de géneros de mayor a menor
  // share y alimenta la mini barra segmentada.
  const mixSegs = e.genreMix?.length ? aggregateMix(e.genreMix) : null;
  const orderedGenres = mixSegs
    ? [...mixSegs].sort((a, b) => b.pct - a.pct).map((s) => s.genre)
    : e.genres;
  return (
    <Link
      href={`/eventos/${e.id}`}
      className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
    >
      <Card className="transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
        <div className="flex items-start gap-4">
          {/* Contenido: título → géneros/serie → mix → venue */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {when && (
              <p className="text-xs font-semibold uppercase tracking-wide text-neon">
                {when}
              </p>
            )}
            <h3 className="truncate text-base font-semibold leading-snug">
              {e.name}
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {orderedGenres.length > 0 && (
                <span>
                  {orderedGenres.map((g, i) => (
                    <span key={g}>
                      {i > 0 && <span className="text-ink/30"> · </span>}
                      <span
                        className={GENRE_TEXT[g as GenreKey] ?? "text-ink/50"}
                      >
                        {t(`genre.${g}`)}
                      </span>
                    </span>
                  ))}
                </span>
              )}
              {e.series && !seriesIsDup(e) && (
                <Badge variant="neon">{e.series.name}</Badge>
              )}
              {e.status === "LIVE" && <Badge variant="live">{t("live")}</Badge>}
            </div>
            {mixSegs && (
              <GenreMixBar
                mix={e.genreMix!}
                labels={t.raw("genre") as Record<string, string>}
                className="mt-0.5"
              />
            )}
            {/* Venue = ubicación propia: chip neon en su fila, símil del
                chip de academia en los cards de clase. */}
            {e.venue && (
              <Badge
                variant="neon"
                className="mt-0.5 max-w-44 gap-1 self-start truncate normal-case tracking-normal"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3 w-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {e.venue.name}
              </Badge>
            )}
          </div>
          {/* Rail de decisión: hora arriba (ancla de escaneo), precio
              debajo - misma posición que el CTA/estado del ClassCard. */}
          <div className="flex shrink-0 flex-col items-center gap-1 self-start py-0.5 text-center">
            <span className="text-sm font-semibold tabular-nums text-ink/80">
              <EventDate start={e.startsAt} variant="time" />
            </span>
            {e.presalePrice != null ? (
              <>
                <span className="text-xs leading-tight text-ink/50">
                  {t("presale")}
                </span>
                <PriceTag amount={e.presalePrice} />
              </>
            ) : (
              <span className="text-sm text-ink/60">{t("free")}</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
