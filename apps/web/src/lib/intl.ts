import { useLocale } from "next-intl";
import { useMemo } from "react";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Formatters Intl por locale (spec i18n-multi-locale).
 *
 * - Client: `useDateFmt`/`useNumFmt`/`useRelativeFmt` devuelven el
 *   formatter memoizado del locale ACTIVO (useLocale) - reemplazan a
 *   `new Intl.*("es-CL", opts)` a nivel de módulo.
 * - Server: `getFormatter()` de next-intl/server hace lo mismo bound
 *   al locale del request (no usar estos hooks en server components).
 *
 * Los formatters se memoizan por locale+opts en un Map compartido:
 * crear Intl formatters es caro y el catálogo es cerrado (4 locales).
 */

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>();

function validLocale(l: string): Locale {
  return (routing.locales as readonly string[]).includes(l)
    ? (l as Locale)
    : routing.defaultLocale;
}

export function getDateFmt(
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `d:${validLocale(locale)}:${JSON.stringify(opts ?? null)}`;
  let f = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(validLocale(locale), opts);
    cache.set(key, f);
  }
  return f;
}

export function getNumFmt(
  locale: string,
  opts?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `n:${validLocale(locale)}:${JSON.stringify(opts ?? null)}`;
  let f = cache.get(key) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(validLocale(locale), opts);
    cache.set(key, f);
  }
  return f;
}

export function getRelativeFmt(
  locale: string,
  opts?: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat {
  const key = `r:${validLocale(locale)}:${JSON.stringify(opts ?? null)}`;
  let f = cache.get(key) as Intl.RelativeTimeFormat | undefined;
  if (!f) {
    f = new Intl.RelativeTimeFormat(validLocale(locale), opts);
    cache.set(key, f);
  }
  return f;
}

/** Hook: formatter de fecha del locale activo (memoizado por opts). */
export function useDateFmt(
  opts?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const locale = useLocale();
  return useMemo(() => getDateFmt(locale, opts), [locale, JSON.stringify(opts)]);
}

/** Hook: formatter numérico del locale activo (memoizado por opts). */
export function useNumFmt(
  opts?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const locale = useLocale();
  return useMemo(() => getNumFmt(locale, opts), [locale, JSON.stringify(opts)]);
}

/** Hook: formatter de tiempo relativo del locale activo. */
export function useRelativeFmt(
  opts?: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat {
  const locale = useLocale();
  return useMemo(
    () => getRelativeFmt(locale, opts),
    [locale, JSON.stringify(opts)],
  );
}
