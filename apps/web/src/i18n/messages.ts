import es from "./catalogs/es-CL";
import en from "./catalogs/en";
import fr from "./catalogs/fr";
import pt from "./catalogs/pt-PT";
import { mergeDict, type Dict } from "./merge";
import type { Locale } from "./routing";

// Catálogo por locale. es-CL es la fuente completa; los demás locales
// se mezclan ENCIMA de es-CL → una key sin traducir cae en español en
// vez de romper la página (fallback explícito del spec).
const byLocale: Record<Locale, Dict> = {
  "es-CL": es,
  en: mergeDict(es, en),
  fr: mergeDict(es, fr),
  "pt-PT": mergeDict(es, pt),
};

/** Compat con imports existentes (catálogo default). */
export const messages = es;

/** Diccionario completo del locale. Compartido por request.ts y layout. */
export function getMessages(locale: Locale): Dict {
  return byLocale[locale] ?? es;
}

/**
 * Scoping de mensajes por route group - el provider de root layout NO
 * serializa el catálogo completo (~190KB) en el Flight payload de cada
 * página. Cada grupo monta su NextIntlClientProvider:
 * - (marketing): solo lo que usan sus client components (login-form,
 *   claim-client) - las landings son server y no pagan el costo igual.
 * - (app): todo menos los namespaces puramente marketing (landings y
 *   textos legales, que solo viven en las públicas).
 */
export function commonMessages(locale: Locale): Dict {
  return { common: getMessages(locale).common };
}

// landing*/legal también van: ProLeadForm y LegalPage son client
// components y leen esos árboles vía useMessages() del provider.
const MARKETING_NS = [
  "common",
  "login",
  "claim",
  "consent",
  "landing",
  "landingPro",
  "landingAcademy",
  "landingProducer",
  "landingProHub",
  "legal",
] as const;
export function marketingMessages(locale: Locale): Dict {
  const m = getMessages(locale);
  return Object.fromEntries(
    MARKETING_NS.flatMap((ns) => (ns in m ? [[ns, m[ns]]] : [])),
  );
}

const APP_EXCLUDE = new Set([
  "landing",
  "landingPro",
  "landingAcademy",
  "landingProducer",
  "landingProHub",
  "legal",
]);
export function appMessages(locale: Locale): Dict {
  return Object.fromEntries(
    Object.entries(getMessages(locale)).filter(([k]) => !APP_EXCLUDE.has(k)),
  );
}
