import { routing, type Locale } from "@/i18n/routing";

/**
 * alternates canonical + hreflang para páginas públicas: el canonical
 * apunta a la propia URL localizada (el default es-CL va sin prefijo) y
 * languages lista las 4 variantes + x-default al default.
 */
export function localeAlternates(locale: Locale, path: string) {
  const prefixed = (l: Locale) =>
    l === routing.defaultLocale ? path : `/${l}${path === "/" ? "" : path}`;
  const languages: Record<string, string> = { "x-default": path };
  for (const l of routing.locales) languages[l] = prefixed(l);
  return { canonical: prefixed(locale), languages };
}
