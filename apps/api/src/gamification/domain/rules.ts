// Gamificación — reglas de negocio puras (omni-dance.md §6-7).
// Sin Nest ni Prisma: todo es testeable con datos planos.

const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** % del aforo esperado que marca el umbral Prime Time (spec §6). */
export const PRIME_THRESHOLD_PCT = 0.2;
/** Aforo de referencia cuando el evento no declara capacity ni primeThreshold. */
export const PRIME_DEFAULT_CAPACITY = 200;
/** Top-N público del leaderboard (spec §6: mostrar top-20, no el ranking completo). */
export const LEADERBOARD_TOP_N = 20;
/** Mínimo de muestra para exponer un count real (k-anonymity, spec §6). */
export const PUBLIC_COUNT_MIN = 5;
/** Ventana hacia atrás para reconstruir la racha semanal. */
export const STREAK_LOOKBACK_WEEKS = 52;
/** Sesiones confirmadas para el badge `bailarin_constante`. */
export const BAILARIN_CONSTANTE_SESSIONS = 10;

// ─── Streaks ─────────────────────────────────────────────

/** Índice de semana alineado a lunes UTC (epoch: lunes 1969-12-29 = -3d). */
export function weekIndex(d: Date): number {
  return Math.floor((d.getTime() + 3 * DAY_MS) / WEEK_MS);
}

/**
 * Convierte timestamps de actividad (check-ins + sesiones CONFIRMED) en un
 * array boolean[] de `lookbackWeeks + 1` semanas, de más antigua a más nueva,
 * donde el último elemento es la semana actual (puede estar en curso).
 */
export function buildStreakWeeks(
  activityDates: Date[],
  now: Date,
  lookbackWeeks = STREAK_LOOKBACK_WEEKS,
): boolean[] {
  const current = weekIndex(now);
  const active = new Set(activityDates.map(weekIndex));
  const weeks: boolean[] = [];
  for (let w = current - lookbackWeeks; w <= current; w++) {
    weeks.push(active.has(w));
  }
  return weeks;
}

/**
 * Racha de semanas consecutivas con actividad.
 * - `currentWeeks`: racha viva. Si la última semana (actual, en curso) aún no
 *   tiene actividad, no mata la racha — todavía puede completarse.
 * - `bestWeeks`: la racha más larga registrada en el array.
 */
export function computeStreak(weeksWithActivity: boolean[]): {
  currentWeeks: number;
  bestWeeks: number;
} {
  let best = 0;
  let run = 0;
  for (const active of weeksWithActivity) {
    run = active ? run + 1 : 0;
    if (run > best) best = run;
  }

  let i = weeksWithActivity.length - 1;
  if (i >= 0 && !weeksWithActivity[i]) i--; // semana actual en progreso → gracia
  let current = 0;
  while (i >= 0 && weeksWithActivity[i]) {
    current++;
    i--;
  }
  return { currentWeeks: current, bestWeeks: Math.max(best, current) };
}

// ─── Prime Time ──────────────────────────────────────────

export interface TimeWindow {
  start: Date;
  end: Date;
}

/**
 * Ventana Prime Time del evento: termina en la próxima medianoche local tras
 * `startsAt` (reveal ~00:00) y dura `windowMinutes` (Event.happyHourMinutes,
 * default 30 → 23:30–00:00, el "~23:00–00:00" del spec es configurable).
 */
export function primeWindow(startsAt: Date, windowMinutes: number): TimeWindow {
  const end = new Date(startsAt);
  end.setHours(24, 0, 0, 0);
  return { start: new Date(end.getTime() - windowMinutes * 60 * 1000), end };
}

export interface PrimeTimeInput {
  /** Timestamp que cuenta por sesión CONFIRMED (confirmedAt ?? scannedAt). */
  sessions: { at: Date }[];
  window: TimeWindow;
  capacity: number | null;
  primeThreshold: number | null;
  /** Ventanas hora feliz: las sesiones dentro cuentan ×multiplier (spec §6). */
  happyHours?: { start: Date; end: Date; multiplier: number }[];
}

export function computePrimeTime(input: PrimeTimeInput): {
  threshold: number;
  current: number;
  unlocked: boolean;
} {
  const threshold =
    input.primeThreshold ??
    Math.ceil(
      (input.capacity ?? PRIME_DEFAULT_CAPACITY) * PRIME_THRESHOLD_PCT,
    );

  let current = 0;
  for (const s of input.sessions) {
    if (s.at < input.window.start || s.at >= input.window.end) continue;
    const hh = input.happyHours?.find(
      (h) => s.at >= h.start && s.at < h.end,
    );
    current += hh?.multiplier ?? 1;
  }
  return { threshold, current, unlocked: current >= threshold };
}

// ─── Leaderboard (Prime Time) ────────────────────────────

export interface LeaderboardSession {
  inviterId: string;
  inviteeId: string;
}

export interface LeaderboardEntry {
  personId: string;
  count: number;
}

/**
 * Leaderboard por rol de la sesión (v1: inviter ≈ leader, invitee ≈ follower).
 * Orden desc por count; empate → personId asc (determinista). Corta en top N.
 */
export function leaderboard(
  sessions: LeaderboardSession[],
  top = LEADERBOARD_TOP_N,
): { leaders: LeaderboardEntry[]; followers: LeaderboardEntry[] } {
  const leaders = new Map<string, number>();
  const followers = new Map<string, number>();
  for (const s of sessions) {
    leaders.set(s.inviterId, (leaders.get(s.inviterId) ?? 0) + 1);
    followers.set(s.inviteeId, (followers.get(s.inviteeId) ?? 0) + 1);
  }
  const toList = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([personId, count]) => ({ personId, count }))
      .sort((a, b) => b.count - a.count || a.personId.localeCompare(b.personId))
      .slice(0, top);
  return { leaders: toList(leaders), followers: toList(followers) };
}

/**
 * Privacidad: counts menores a `min` no se exponen como número (k-anonymity).
 * Devuelve el count real o el literal "<5".
 */
export function maskSmallCount(
  count: number,
  min = PUBLIC_COUNT_MIN,
): number | "<5" {
  return count >= min ? count : "<5";
}

// ─── Misiones ────────────────────────────────────────────

/** Actividad de la persona en el evento de la misión. */
export interface MissionActivity {
  /** Sesiones CONFIRMED: pareja, estilo y timestamp (confirmedAt ?? scannedAt). */
  sessions: { partnerId: string; styleId: string | null; at: Date }[];
  checkins: { inAt: Date }[];
}

export interface MissionEval {
  progress: number;
  target: number;
  completed: boolean;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "23:00" → 1380 (minutos desde medianoche, hora local). */
function parseHHMM(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

const localMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * Evalúa el progreso de una misión por template (spec §7):
 * - `baila_diverso`: N parejas distintas (config.partners, default 5)
 * - `madrugador`: check-in (o sesión temprana como fallback) en la ventana
 *   vespertina [mediodía, config.before) — "HH:MM" local, default "23:00".
 *   Las 00:xx post-medianoche NO cuentan: son "tarde", no "temprano".
 * - `estilo_explorer`: sesiones en ≥N estilos distintos (config.styles, def. 2)
 * Template desconocido → sin progreso (fallback seguro).
 */
export function evaluateMission(
  templateKey: string,
  config: Record<string, unknown> | null,
  activity: MissionActivity,
): MissionEval {
  const evalResult = (progress: number, target: number): MissionEval => ({
    progress,
    target,
    completed: progress >= target,
  });

  switch (templateKey) {
    case "baila_diverso": {
      const target = num(config?.partners) ?? 5;
      return evalResult(
        new Set(activity.sessions.map((s) => s.partnerId)).size,
        target,
      );
    }
    case "madrugador": {
      const cutoff = parseHHMM(config?.before) ?? 23 * 60;
      const NOON = 12 * 60;
      const early = (d: Date) => {
        const m = localMinutes(d);
        return m >= NOON && m < cutoff;
      };
      const hit =
        activity.checkins.some((c) => early(c.inAt)) ||
        activity.sessions.some((s) => early(s.at));
      return evalResult(hit ? 1 : 0, 1);
    }
    case "estilo_explorer": {
      const target = num(config?.styles) ?? 2;
      const styles = new Set(
        activity.sessions
          .map((s) => s.styleId)
          .filter((id): id is string => id != null),
      );
      return evalResult(styles.size, target);
    }
    default:
      return evalResult(0, 1);
  }
}

// ─── Badges ──────────────────────────────────────────────

export interface BadgeStats {
  /** Sesiones CONFIRMED históricas de la persona (cualquier rol). */
  confirmedSessions: number;
}

/**
 * Reglas de award automático — badge por conducta, nunca por puntaje (spec §7).
 * En v1 se evalúan lazy al consultar /me/badges (los módulos de otros features
 * no se tocan para enganchar el award en el confirm).
 */
const BADGE_RULES: readonly {
  key: string;
  test: (s: BadgeStats) => boolean;
}[] = [
  { key: "primera_bachata", test: (s) => s.confirmedSessions >= 1 },
  {
    key: "bailarin_constante",
    test: (s) => s.confirmedSessions >= BAILARIN_CONSTANTE_SESSIONS,
  },
];

export class BadgeAwarder {
  /** Keys de badges ganados y aún no otorgados. */
  evaluate(stats: BadgeStats, alreadyAwarded: string[] = []): string[] {
    const owned = new Set(alreadyAwarded);
    return BADGE_RULES.filter((r) => !owned.has(r.key) && r.test(stats)).map(
      (r) => r.key,
    );
  }
}
