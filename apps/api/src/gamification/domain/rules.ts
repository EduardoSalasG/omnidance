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
/**
 * Check-in "temprano": antes del cutoff (minutos desde medianoche local,
 * param `early_checkin.cutoff_minutes`, default 23:00) y después del
 * mediodía — las 00:xx post-medianoche son "tarde", no "temprano"
 * (misma ventana que la misión `madrugador`).
 */
export const EARLY_CHECKIN_CUTOFF_MINUTES = 23 * 60;
/** Sesiones en una misma noche/evento para el badge `maratonista`. */
export const MARATONISTA_SESSIONS = 15;
/** Parejas distintas en una misma noche/evento para `mariposa_social`. */
export const MARIPOSA_SOCIAL_PARTNERS = 8;
/** Badge de status temporal del reveal Prime Time (corona 👑, +7 días). */
export const CROWN_BADGE_KEY = "prime_time_crown";
/** Duración de la corona tras otorgarse (spec §7: 1 semana). */
export const CROWN_TTL_DAYS = 7;
/** Mínimo de evaluaciones recibidas para ser candidato en el reveal. */
export const REVEAL_MIN_EVALUATIONS = 3;
/** Prior bayesiano: pseudo-evaluaciones con la media del evento (spec §6). */
export const REVEAL_BAYES_C = 10;
/** Ambos lados de la pareja deben puntuarse al menos esto (spec §6). */
export const COUPLE_MIN_MUTUAL_SCORE = 4;

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
  /** Check-ins dentro de la ventana "temprana" [mediodía, cutoff). */
  earlyCheckins?: number;
  /** Máximo de sesiones confirmadas en un mismo evento/noche. */
  maxSessionsInNight?: number;
  /** Máximo de parejas distintas en un mismo evento/noche. */
  maxDistinctPartnersInNight?: number;
}

/** ¿Un check-in cuenta como "temprano"? Ventana [12:00, cutoff) hora local. */
export function isEarlyCheckinAt(
  d: Date,
  cutoffMinutes = EARLY_CHECKIN_CUTOFF_MINUTES,
): boolean {
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 12 * 60 && m < cutoffMinutes;
}

/**
 * Stats de conducta para BadgeAwarder, computados desde filas planas:
 * sesiones CONFIRMED (con eventId para agrupar por noche) y check-ins.
 * `personId` se usa para derivar la pareja de cada sesión.
 */
export function buildBadgeStats(
  sessions: { eventId: string; inviterId: string; inviteeId: string }[],
  checkins: { inAt: Date }[],
  personId: string,
  cutoffMinutes = EARLY_CHECKIN_CUTOFF_MINUTES,
): Required<BadgeStats> {
  const sessionsByEvent = new Map<string, number>();
  const partnersByEvent = new Map<string, Set<string>>();
  for (const s of sessions) {
    sessionsByEvent.set(s.eventId, (sessionsByEvent.get(s.eventId) ?? 0) + 1);
    const partner = s.inviterId === personId ? s.inviteeId : s.inviterId;
    const set = partnersByEvent.get(s.eventId) ?? new Set<string>();
    set.add(partner);
    partnersByEvent.set(s.eventId, set);
  }
  return {
    confirmedSessions: sessions.length,
    earlyCheckins: checkins.filter((c) => isEarlyCheckinAt(c.inAt, cutoffMinutes))
      .length,
    maxSessionsInNight: Math.max(0, ...sessionsByEvent.values()),
    maxDistinctPartnersInNight: Math.max(
      0,
      ...[...partnersByEvent.values()].map((s) => s.size),
    ),
  };
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
  // Badges de conducta por noche (spec §7 / badge-rules spec).
  { key: "madrugador", test: (s) => (s.earlyCheckins ?? 0) >= 1 },
  {
    key: "maratonista",
    test: (s) => (s.maxSessionsInNight ?? 0) >= MARATONISTA_SESSIONS,
  },
  {
    key: "mariposa_social",
    test: (s) =>
      (s.maxDistinctPartnersInNight ?? 0) >= MARIPOSA_SOCIAL_PARTNERS,
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

// ─── Puntos de temporada ─────────────────────────────────
//
// Única moneda de progreso — no gastable, resetea por Season (spec §7).
// Conductas verificables; el idempotency key lo arma el caller vía
// (personId, reason, refType, refId) — check-then-create en el service.

export const POINT_VALUES = {
  session_confirmed: 10,
  rating_closed: 5,
  early_checkin: 15,
  mission_completed: 20,
} as const;

export type PointReason = keyof typeof POINT_VALUES;

/** Total + breakdown por reason de un set de entradas del ledger. */
export function summarizePoints(
  entries: { reason: string; points: number }[],
): { total: number; byReason: Record<string, number> } {
  const byReason: Record<string, number> = {};
  let total = 0;
  for (const e of entries) {
    byReason[e.reason] = (byReason[e.reason] ?? 0) + e.points;
    total += e.points;
  }
  return { total, byReason };
}

// ─── Prime Time reveal ───────────────────────────────────

/** Sesión elegible para el reveal (CONFIRMED/RATED, retroDeclared:false). */
export interface RevealSession {
  inviterId: string;
  inviteeId: string;
  styleId: string | null;
  ratings: { raterId: string; global: number }[];
}

/** Fila de PersonStyleRole (rol autodeclarado por estilo). */
export interface StyleRoleRow {
  personId: string;
  styleId: string;
  role: string; // "LEADER" | "FOLLOWER" | "SWITCH"
}

export interface RevealCandidate {
  personId: string;
  score: number;
  evaluations: number;
}

export interface RevealResult {
  /** Media global del evento (prior m del score bayesiano). */
  eventMean: number;
  bestLeader: RevealCandidate | null;
  bestFollower: RevealCandidate | null;
  coupleOfTheNight: { aId: string; bId: string; score: number } | null;
}

type DanceRoleLeaf = "LEADER" | "FOLLOWER";

/**
 * Rol de baile declarado por la persona: si declara un único rol (en el
 * estilo de la sesión, o en cualquier estilo como fallback) se usa ese;
 * SWITCH / ambos / ninguno → null (se infiere por posición en la sesión).
 */
function declaredDanceRole(
  rows: StyleRoleRow[],
  personId: string,
  styleId: string | null,
): DanceRoleLeaf | null {
  const mine = rows.filter((r) => r.personId === personId);
  const expand = (role: string): DanceRoleLeaf[] =>
    role === "LEADER" || role === "FOLLOWER"
      ? [role]
      : role === "SWITCH"
        ? ["LEADER", "FOLLOWER"]
        : [];
  const inStyle = new Set(
    mine.filter((r) => r.styleId === styleId).flatMap((r) => expand(r.role)),
  );
  if (inStyle.size === 1) return [...inStyle][0];
  const any = new Set(mine.flatMap((r) => expand(r.role)));
  if (any.size === 1) return [...any][0];
  return null;
}

/**
 * La misma persona no puede ganar ambos roles: conserva el rol donde tiene
 * más evaluaciones (empate → leader); el otro rol va al runner-up.
 */
function dedupeWinners(
  leaders: RevealCandidate[],
  followers: RevealCandidate[],
): [RevealCandidate | null, RevealCandidate | null] {
  const bestLeader = leaders[0] ?? null;
  const bestFollower = followers[0] ?? null;
  if (
    !bestLeader ||
    !bestFollower ||
    bestLeader.personId !== bestFollower.personId
  ) {
    return [bestLeader, bestFollower];
  }
  if (bestLeader.evaluations >= bestFollower.evaluations) {
    return [
      bestLeader,
      followers.find((c) => c.personId !== bestLeader.personId) ?? null,
    ];
  }
  return [
    leaders.find((c) => c.personId !== bestFollower.personId) ?? null,
    bestFollower,
  ];
}

/**
 * Computo del reveal Prime Time (spec §6):
 * - Solo ratings recibidos en sesiones elegibles (CONFIRMED/RATED,
 *   retroDeclared:false — lo filtra el repo).
 * - Score bayesiano por candidato: (Σv + C·m)/(n + C), C=10, m = media
 *   global del evento. Candidato con < minEvaluations evaluaciones → fuera.
 * - Rol del evaluado: PersonStyleRole si declara un rol único; si no,
 *   inviter≈leader / invitee≈follower (misma aproximación que el leaderboard).
 * - Pareja de la noche: par {a,b} con mejores promedios mutuos donde
 *   ambas direcciones promedian ≥ COUPLE_MIN_MUTUAL_SCORE.
 * - Determinista: empate de score → personId asc.
 */
export function computeReveal(input: {
  sessions: RevealSession[];
  styleRoles?: StyleRoleRow[];
  minEvaluations?: number;
  priorC?: number;
}): RevealResult {
  const minN = input.minEvaluations ?? REVEAL_MIN_EVALUATIONS;
  const C = input.priorC ?? REVEAL_BAYES_C;
  const styleRoles = input.styleRoles ?? [];

  interface Bucket {
    personId: string;
    role: DanceRoleLeaf;
    sum: number;
    n: number;
  }
  const buckets = new Map<string, Bucket>();
  const directed = new Map<string, { sum: number; n: number }>();
  let totalSum = 0;
  let totalN = 0;

  for (const s of input.sessions) {
    for (const r of s.ratings) {
      const ratedId =
        r.raterId === s.inviterId
          ? s.inviteeId
          : r.raterId === s.inviteeId
            ? s.inviterId
            : null;
      if (!ratedId) continue; // rater ajeno a la sesión — no debería ocurrir
      totalSum += r.global;
      totalN++;

      const role =
        declaredDanceRole(styleRoles, ratedId, s.styleId) ??
        (ratedId === s.inviterId ? "LEADER" : "FOLLOWER");
      const bKey = `${ratedId}|${role}`;
      const bucket = buckets.get(bKey) ?? {
        personId: ratedId,
        role,
        sum: 0,
        n: 0,
      };
      bucket.sum += r.global;
      bucket.n++;
      buckets.set(bKey, bucket);

      const dKey = `${r.raterId}|${ratedId}`;
      const d = directed.get(dKey) ?? { sum: 0, n: 0 };
      d.sum += r.global;
      d.n++;
      directed.set(dKey, d);
    }
  }

  const eventMean = totalN > 0 ? totalSum / totalN : 0;

  const rank = (role: DanceRoleLeaf): RevealCandidate[] =>
    [...buckets.values()]
      .filter((b) => b.role === role && b.n >= minN)
      .map((b) => ({
        personId: b.personId,
        score: (b.sum + C * eventMean) / (b.n + C),
        evaluations: b.n,
      }))
      .sort(
        (a, b) => b.score - a.score || a.personId.localeCompare(b.personId),
      );

  const leaders = rank("LEADER");
  const followers = rank("FOLLOWER");
  const [bestLeader, bestFollower] = dedupeWinners(leaders, followers);

  // Pareja de la noche: ambos se puntuaron ≥ umbral (promedio por
  // dirección), orden por promedio mutuo; empate → ids asc (determinista).
  let couple: { aId: string; bId: string; score: number } | null = null;
  for (const [key, fwd] of directed) {
    const [a, b] = key.split("|");
    if (a >= b) continue; // cada par desordenado una sola vez
    const back = directed.get(`${b}|${a}`);
    if (!back) continue;
    const avgAB = fwd.sum / fwd.n;
    const avgBA = back.sum / back.n;
    if (avgAB < COUPLE_MIN_MUTUAL_SCORE || avgBA < COUPLE_MIN_MUTUAL_SCORE) {
      continue;
    }
    const score = (avgAB + avgBA) / 2;
    if (
      !couple ||
      score > couple.score ||
      (score === couple.score && `${a}|${b}` < `${couple.aId}|${couple.bId}`)
    ) {
      couple = { aId: a, bId: b, score };
    }
  }

  return { eventMean, bestLeader, bestFollower, coupleOfTheNight: couple };
}

// ─── Badge destacado en QR ───────────────────────────────

export interface BadgeInstance {
  key: string;
  name: string;
  featured: boolean;
  expiresAt: Date | null;
}

/**
 * Badge que se exhibe al ser escaneado (spec §7: el status vive en el
 * ritual). Prioridad: PersonBadge featured elegido por la persona (no
 * expirado) → corona Prime Time vigente → null.
 */
export function selectFeaturedBadge(
  badges: BadgeInstance[],
  now = new Date(),
): { key: string; name: string } | null {
  const live = (b: BadgeInstance) =>
    b.expiresAt == null || b.expiresAt.getTime() > now.getTime();
  const featured = badges.find((b) => b.featured && live(b));
  if (featured) return { key: featured.key, name: featured.name };
  const crown = badges.find(
    (b) => b.key === CROWN_BADGE_KEY && b.expiresAt != null && live(b),
  );
  return crown ? { key: crown.key, name: crown.name } : null;
}
