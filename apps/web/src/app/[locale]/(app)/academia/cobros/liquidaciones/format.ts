/** "2026-11" → "noviembre 2026" (día 2 evita el borde de zona horaria). */
export function periodLabel(period: string, locale: string): string {
  const d = new Date(`${period}-02T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
