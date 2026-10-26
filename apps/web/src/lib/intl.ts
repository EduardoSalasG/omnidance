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

/**
 * Monto en unidad menor → string con símbolo/código de moneda (spec
 * multipais-currency). `currency` es ISO-4217; sin moneda o código
 * inválido cae a CLP para no romper vistas legacy.
 * Para monedas ≠ CLP se agrega el código visible ("EUR 12.000") para
 * que el lector no confunda el símbolo con pesos.
 */
export function formatMoney(
  amountMinor: number,
  currency = "CLP",
  locale = "es-CL",
): string {
  const cur = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "CLP";
  const fmt = getNumFmt(locale, { style: "currency", currency: cur });
  // amountMinor es unidad menor de la moneda: los dígitos de fracción
  // los resuelve Intl por moneda (CLP=0 → sin división; USD/EUR=2 →
  // /100). Nunca se hardcodea una tabla - resolvedOptions es la fuente.
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 0;
  const out = fmt.format(amountMinor / 10 ** digits);
  return cur === "CLP" ? out : `${out} ${cur}`;
}

/** Compat: lo que hoy se formatea CLP queda igual (envuelve formatMoney). */
export function formatClp(amountMinor: number, locale = "es-CL"): string {
  return formatMoney(amountMinor, "CLP", locale);
}
