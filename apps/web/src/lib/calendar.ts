// Helpers del calendario semanal compartido por /eventos y /clases:
// franja Lun–Dom con dots por género, navegación por semana y selección
// de día. Las claves de día son "YYYY-MM-DD" en hora local.

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

export const dayCompactFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
});

/** ISO → "YYYY-MM-DD" local, clave de grupo por día. */
export const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA");

export const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "YYYY-MM-DD" validado; null si no matchea. */
export const parseDay = (raw: string | undefined): string | null =>
  raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;

/** Lunes de la semana que contiene `d` (semana parte lunes, es-CL). */
export function weekStart(d: Date): Date {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/** Los 7 días de la semana que empieza en `monday`, con sus items. */
export function weekCells<T>(
  monday: Date,
  byDay: Map<string, T[]>,
): { day: number; key: string; items: T[] }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * DAY_MS);
    const key = localDayKey(d);
    return { day: d.getDate(), key, items: byDay.get(key) ?? [] };
  });
}
