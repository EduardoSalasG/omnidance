const CL_TZ = "America/Santiago";

/** Inicio del mes corriente en hora Chile, como Date UTC. */
export function clMonthStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CL_TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  // Offset real CL en ese instante (UTC-3 verano / UTC-4 invierno): se
  // deriva comparando el wall-clock CL vs UTC, sin asumir DST.
  const guess = new Date(Date.UTC(year, month - 1, 1, 4));
  const clWall = new Date(
    guess.toLocaleString("en-US", { timeZone: CL_TZ }),
  ).getTime();
  return new Date(Date.UTC(year, month - 1, 1) - (clWall - guess.getTime()));
}

/** Medianoche CL (00:00 wall-clock) de un día calendario, como Date UTC.
    Mismo truco de offset que clMonthStart: se compara el wall-clock CL
    del instante guess vs UTC, sin asumir DST. */
export function clDayStart(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 8));
  const clWall = new Date(
    guess.toLocaleString("en-US", { timeZone: CL_TZ }),
  ).getTime();
  return new Date(Date.UTC(year, month - 1, day) - (clWall - guess.getTime()));
}

const CL_WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Lunes 00:00 CL de la semana en curso, como Date UTC. */
export function clWeekStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CL_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const back = (CL_WEEKDAY[get("weekday")] + 6) % 7; // días desde el lunes
  const mondayUtc = new Date(
    Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))) -
      back * 86_400_000,
  );
  return clDayStart(
    mondayUtc.getUTCFullYear(),
    mondayUtc.getUTCMonth() + 1,
    mondayUtc.getUTCDate(),
  );
}
