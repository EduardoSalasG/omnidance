import { defineRouting } from "next-intl/routing";

/**
 * Locales de la app. es-CL es el default y va sin prefijo
 * (localePrefix "as-needed" - las URLs existentes no cambian); los
 * demás locales viven bajo /<locale>/* (/en/*, /fr/*, /pt-PT/*).
 *
 * La cookie NEXT_LOCALE (default de next-intl) persiste la elección
 * para anónimos; usuarios logueados la guardan en Person.language.
 */
export const routing = defineRouting({
  locales: ["es-CL", "en", "fr", "pt-PT"],
  defaultLocale: "es-CL",
  localePrefix: "as-needed",
  localeDetection: true, // Accept-Language en primera visita
});

export type Locale = (typeof routing.locales)[number];
