// Helpers del calendario mensual compartido por /eventos, /clases y
// /locales/[id]: grid Lun–Dom que cubre el mes completo con dots por
// género, navegación por mes y selección de día. Las claves de día son
// "YYYY-MM-DD" en hora local; las de mes "YYYY-MM".

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export const WEEKDAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"] as const;

export const GENRES = ["SALSA", "BACHATA", "CUBANO"] as const;
export type GenreKey = (typeof GENRES)[number];

// Color del punto en calendario por género.
export const DOT_COLOR: Record<GenreKey, string> = {
  SALSA: "bg-orange-500",
  BACHATA: "bg-fuchsia-400",
  CUBANO: "bg-amber-400",
};

// Género como texto coloreado en el card (misma paleta que los dots,
// variante clara para AA sobre fondo oscuro).
export const GENRE_TEXT: Record<GenreKey, string> = {
  SALSA: "text-orange-400",
  BACHATA: "text-fuchsia-300",
  CUBANO: "text-amber-300",
};

// Label del mes en el header del calendario ("septiembre de 2026" -
// el `capitalize` del h2 la presenta).
export const monthFmt = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
});

/** ISO → "YYYY-MM-DD" local, clave de grupo por día. */
export const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA");

export const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "YYYY-MM-DD" validado; null si no matchea. */
export const parseDay = (raw: string | undefined): string | null =>
  raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;

/** "YYYY-MM" local, clave de mes para la URL. */
export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** "YYYY-MM" validado; null si no matchea. */
export const parseMonth = (raw: string | undefined): string | null =>
  raw && /^\d{4}-\d{2}$/.test(raw) ? raw : null;

/** Date local del día 1 del mes "YYYY-MM" (sin parsing ISO - `new
    Date("YYYY-MM")` se interpreta en UTC y corre un día en zonas -). */
export const monthDate = (k: string) =>
  new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1);

/** Día 1 del mes que contiene `d` (medianoche local). */
export const monthStart = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), 1);

/** Lunes de la semana que contiene `d` (semana parte lunes, es-CL). */
export function weekStart(d: Date): Date {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/** Rango visible del grid mensual: del lunes de la semana del día 1 al
    domingo de la semana del último día (4–6 filas de 7 celdas). */
export function monthGridRange(month: Date): { start: Date; end: Date } {
  const first = monthStart(month);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return {
    start: weekStart(first),
    end: new Date(
      last.getTime() + (6 - ((last.getDay() + 6) % 7)) * DAY_MS,
    ),
  };
}

/** Celdas del grid mensual con sus items. Los días de meses vecinos
    que completan la primera/última semana vienen con inMonth=false -
    se renderizan atenuados pero siguen siendo seleccionables. */
export function monthCells<T>(
  month: Date,
  byDay: Map<string, T[]>,
): { day: number; key: string; items: T[]; inMonth: boolean }[] {
  const { start, end } = monthGridRange(month);
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const key = localDayKey(d);
    out.push({
      day: d.getDate(),
      key,
      items: byDay.get(key) ?? [],
      inMonth: d.getMonth() === month.getMonth(),
    });
  }
  return out;
}
