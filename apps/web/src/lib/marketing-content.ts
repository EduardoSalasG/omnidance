import eventsJson from "@/content/events.json";
import academiesJson from "@/content/academies.json";
import type { JsonLdEvent } from "@/components/landing/JsonLd";

/**
 * Catálogos de contenido de las landings (spec marketing-content):
 * JSONs commiteados en `src/content/`, editables a mano y regenerables
 * con `pnpm --filter @omnidance/web content:sync`. Las landings (/, /pro,
 * /para-academias, /para-productores) leen de acá - nunca fetchan el
 * API en render, así la superficie pública no depende del backend.
 *
 * `generatedAt` en cada JSON marca la última regeneración; la data
 * envejece con gracia porque las páginas filtran "esta semana" en
 * render (ISR revalida sin tocar el API).
 */

export type PublicAcademy = {
  id: string;
  name: string;
  styles: { id: string; name: string }[];
};

/** Eventos destacados: alimentan JsonLd y el strip "esta semana". */
export function marketingEvents(): JsonLdEvent[] {
  return eventsJson.events as JsonLdEvent[];
}

/** Academias del directorio público: strip de /para-academias. */
export function marketingAcademies(): PublicAcademy[] {
  return academiesJson.academies as PublicAcademy[];
}

/** Eventos dentro de los próximos 7 días - mismo criterio de siempre. */
export function thisWeek(events: JsonLdEvent[]): JsonLdEvent[] {
  const now = Date.now();
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
  return events.filter((e) => {
    const at = new Date(e.startsAt).getTime();
    return at >= now && at <= weekEnd;
  });
}
