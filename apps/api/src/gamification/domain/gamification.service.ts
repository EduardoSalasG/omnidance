import type { MissionProgress } from "@prisma/client";
import {
  BadgeAwarder,
  buildBadgeStats,
  buildStreakWeeks,
  computePrimeTime,
  computeReveal,
  computeStreak,
  CROWN_BADGE_KEY,
  CROWN_TTL_DAYS,
  EARLY_CHECKIN_CUTOFF_MINUTES,
  evaluateMission,
  isEarlyCheckinAt,
  leaderboard,
  maskSmallCount,
  POINT_VALUES,
  PRIME_DEFAULT_CAPACITY,
  PRIME_THRESHOLD_PCT,
  primeWindow,
  selectFeaturedBadge,
  summarizePoints,
  type MissionActivity,
  type PointReason,
  type RevealCandidate,
  type TimeWindow,
} from "./rules";
import type {
  AwardedBadge,
  GamificationRepo,
  GamificationSession,
  MissionWithTemplate,
} from "./ports";

export class EventNotFoundError extends Error {
  constructor(public readonly eventId: string) {
    super(`evento no encontrado: ${eventId}`);
    this.name = "EventNotFoundError";
  }
}

export class MissionNotFoundError extends Error {
  constructor(public readonly missionId: string) {
    super(`misión no encontrada: ${missionId}`);
    this.name = "MissionNotFoundError";
  }
}

export interface PublicLeaderboardEntry {
  personId: string;
  name: string;
  /** Count real si ≥ mínimo público; "<5" bajo k-anonymity (spec §6). */
  count: number | "<5";
}

export interface PrimeTimeStatus {
  threshold: number;
  current: number;
  unlocked: boolean;
  window: TimeWindow;
}

export interface MissionView {
  id: string;
  key: string;
  name: string;
  description: string;
  reward: unknown;
  progress: number;
  target: number;
  completed: boolean;
}

/**
 * Orquestación de gamificación (omni-dance.md §6-7). Sin Nest: recibe el repo
 * por constructor y delega el cálculo en las funciones puras de `rules.ts`.
 *
 * Awards de badges y progreso de misiones se evalúan LAZY al consultar, y
 * además quedan enganchados vía `evaluateBadgesFor` al confirm/rate de
 * sesiones (lo invoca SessionsController cuando está inyectado).
 */
export class GamificationService {
  constructor(
    private readonly repo: GamificationRepo,
    private readonly awarder = new BadgeAwarder(),
    /** PlatformParam reader — structural para no acoplar el dominio a Nest. */
    private readonly params?: {
      getNumber(key: string, fallback: number): Promise<number>;
    },
  ) {}

  /** Racha de "salidas semanales": semanas consecutivas con ≥1 check-in o sesión CONFIRMED. */
  async streakFor(personId: string, now = new Date()) {
    const [sessions, checkins] = await Promise.all([
      this.repo.confirmedSessionsForPerson(personId),
      this.repo.checkinsForPerson(personId),
    ]);
    const dates = [
      ...sessions.map((s) => s.confirmedAt ?? s.scannedAt),
      ...checkins.map((c) => c.inAt),
    ];
    return computeStreak(buildStreakWeeks(dates, now));
  }

  /** Badges ganados; evalúa y otorga lazy los pendientes (conducta, no puntaje). */
  async badgesFor(personId: string): Promise<AwardedBadge[]> {
    const owned = await this.repo.badgesForPerson(personId);
    const awarded = await this.evaluateBadgesFor(personId, owned);
    return awarded ? this.repo.badgesForPerson(personId) : owned;
  }

  /**
   * Hook invocable desde otros dominios (confirm/rate de sesión): evalúa las
   * reglas de award y otorga los badges pendientes de la persona.
   * `owned` opcional evita una query extra cuando el caller ya la tiene.
   * Retorna true si otorgó al menos un badge nuevo.
   */
  async evaluateBadgesFor(
    personId: string,
    owned?: AwardedBadge[],
  ): Promise<boolean> {
    const current = owned ?? (await this.repo.badgesForPerson(personId));
    const [confirmed, checkins] = await Promise.all([
      this.repo.confirmedSessionsForPerson(personId),
      this.repo.checkinsForPerson(personId),
    ]);
    const stats = buildBadgeStats(
      confirmed,
      checkins,
      personId,
      await this.earlyCheckinCutoff(),
    );
    const newKeys = this.awarder.evaluate(
      stats,
      current.map((b) => b.badge.key),
    );
    if (newKeys.length === 0) return false;
    const badges = await this.repo.badgesByKeys(newKeys);
    for (const b of badges) {
      await this.repo.awardBadge(personId, b.id);
    }
    return true;
  }

  /**
   * Leaderboard del evento — SOLO visible con evento LIVE o CLOSED
   * (oculto antes para no spoilear el Prime Time). inviter≈leader en v1.
   */
  async leaderboardForEvent(eventId: string): Promise<{
    leaders: PublicLeaderboardEntry[];
    followers: PublicLeaderboardEntry[];
  }> {
    const event = await this.repo.findEvent(eventId);
    if (!event) throw new EventNotFoundError(eventId);
    if (event.status !== "LIVE" && event.status !== "CLOSED") {
      return { leaders: [], followers: [] };
    }

    const sessions = await this.repo.confirmedSessionsForEvent(eventId);
    const board = leaderboard(sessions);
    const ids = [
      ...new Set([
        ...board.leaders.map((e) => e.personId),
        ...board.followers.map((e) => e.personId),
      ]),
    ];
    const people = await this.repo.peopleByIds(ids);
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const pub = (e: { personId: string; count: number }) => ({
      personId: e.personId,
      name: nameOf.get(e.personId) ?? "?",
      count: maskSmallCount(e.count),
    });
    return {
      leaders: board.leaders.map(pub),
      followers: board.followers.map(pub),
    };
  }

  /**
   * Estado del contador Prime Time: umbral (override del productor o ~20% del
   * aforo), sesiones CONFIRMED dentro de la ventana y desbloqueo.
   */
  async primeTimeFor(eventId: string): Promise<PrimeTimeStatus> {
    const event = await this.repo.findEvent(eventId);
    if (!event) throw new EventNotFoundError(eventId);

    const window = primeWindow(event.startsAt, event.happyHourMinutes);
    const [sessions, happyHours] = await Promise.all([
      this.repo.confirmedSessionsForEvent(eventId),
      this.repo.happyHoursForEvent(eventId),
    ]);
    // Umbral: override del productor > % parametrizable del aforo > default.
    const pct = this.params
      ? await this.params.getNumber(
          "prime_time.threshold_pct",
          PRIME_THRESHOLD_PCT,
        )
      : PRIME_THRESHOLD_PCT;
    const result = computePrimeTime({
      sessions: sessions.map((s) => ({ at: s.confirmedAt ?? s.scannedAt })),
      window,
      capacity: event.capacity,
      primeThreshold:
        event.primeThreshold ??
        Math.ceil((event.capacity ?? PRIME_DEFAULT_CAPACITY) * pct),
      happyHours: happyHours.map((h) => ({
        start: h.startsAt,
        end: h.endsAt,
        multiplier: h.multiplier,
      })),
    });
    return { ...result, window };
  }

  /**
   * Reveal Prime Time (spec §6): ganadores por score bayesiano sobre
   * ratings de sesiones elegibles + Pareja de la noche. Coronas como
   * PersonBadge(+7d) otorgadas idempotentemente al computar.
   *
   * - `unlocked:false` → el premio nunca se desbloqueó esa noche.
   * - `unlocked:true, revealed:false` → desbloqueado pero el reveal es al
   *   fin de la ventana (00:00; desbloqueo tardío revela al alcanzar).
   * - `revealed:true` → ganadores computados (idempotente en cada lectura).
   */
  async primeTimeRevealFor(eventId: string) {
    const status = await this.primeTimeFor(eventId); // 404 si no existe
    if (!status.unlocked) {
      return { unlocked: false as const, revealed: false as const };
    }
    if (new Date() < status.window.end) {
      return { unlocked: true as const, revealed: false as const };
    }

    const sessions = await this.repo.ratedSessionsForEvent(eventId);
    const participantIds = [
      ...new Set(sessions.flatMap((s) => [s.inviterId, s.inviteeId])),
    ];
    const styleRoles = await this.repo.styleRolesForPeople(participantIds);
    const result = computeReveal({ sessions, styleRoles });

    // Corona 👑 +7d para los ganadores Leader/Follower (premio del spec §7;
    // Pareja de la noche es reconocimiento sin corona). Upsert idempotente:
    // corona vigente no se re-otorga, expirada se renueva.
    const winnerIds = [
      ...new Set(
        [result.bestLeader?.personId, result.bestFollower?.personId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    if (winnerIds.length > 0) {
      const [crown] = await this.repo.badgesByKeys([CROWN_BADGE_KEY]);
      if (crown) {
        const expiresAt = new Date(
          Date.now() + CROWN_TTL_DAYS * 24 * 3600 * 1000,
        );
        for (const personId of winnerIds) {
          await this.repo.awardBadgeWithExpiry(personId, crown.id, expiresAt);
        }
      }
    }

    // Nombres para la pantalla del reveal (los ganadores son públicos —
    // el DJ los anuncia; no hay k-anonymity en el premio).
    const nameIds = [
      ...new Set([
        ...winnerIds,
        ...(result.coupleOfTheNight
          ? [result.coupleOfTheNight.aId, result.coupleOfTheNight.bId]
          : []),
      ]),
    ];
    const people = await this.repo.peopleByIds(nameIds);
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const named = (c: RevealCandidate | null) =>
      c && {
        personId: c.personId,
        name: nameOf.get(c.personId) ?? "?",
        score: round2(c.score),
        evaluations: c.evaluations,
      };

    return {
      unlocked: true as const,
      revealed: true as const,
      bestLeader: named(result.bestLeader) ?? null,
      bestFollower: named(result.bestFollower) ?? null,
      coupleOfTheNight: result.coupleOfTheNight
        ? {
            a: {
              personId: result.coupleOfTheNight.aId,
              name: nameOf.get(result.coupleOfTheNight.aId) ?? "?",
            },
            b: {
              personId: result.coupleOfTheNight.bId,
              name: nameOf.get(result.coupleOfTheNight.bId) ?? "?",
            },
            score: round2(result.coupleOfTheNight.score),
          }
        : null,
    };
  }

  /**
   * Acredita puntos de temporada por conducta (hook público para otros
   * dominios — sessions.confirm/rate, checkins, misiones). Idempotente por
   * (personId, reason, refType, refId): la misma conducta procesada dos
   * veces (retry, re-evaluación) no duplica puntos.
   *
   * Retorna true si acreditó una entrada nueva.
   */
  async accruePoints(
    personId: string,
    reason: PointReason,
    refType?: string,
    refId?: string,
  ): Promise<boolean> {
    const points = POINT_VALUES[reason];
    if (!points) return false;
    const existing = await this.repo.findLedgerEntry(
      personId,
      reason,
      refType ?? null,
      refId ?? null,
    );
    if (existing) return false;
    const season = await this.repo.activeSeason(new Date());
    // El repo retorna null si el unique rechazó un duplicado concurrente —
    // el find de arriba es solo el fast-path; la constraint es la verdad.
    const created = await this.repo.createLedgerEntry({
      personId,
      seasonId: season?.id ?? null,
      points,
      reason,
      refType: refType ?? null,
      refId: refId ?? null,
    });
    return created !== null;
  }

  /**
   * Hook de check-in para otros dominios (checkins.scan/manual/door-sale):
   * si el check-in es "temprano" (ventana [12:00, cutoff) — param
   * `early_checkin.cutoff_minutes`, default 23:00) acredita early_checkin
   * y evalúa badges de conducta (madrugador queda cubierto vía
   * evaluateBadgesFor). Idempotente por checkin.id.
   */
  async onCheckin(
    personId: string,
    checkin: { id: string; inAt: Date },
  ): Promise<void> {
    const cutoff = await this.earlyCheckinCutoff();
    if (isEarlyCheckinAt(checkin.inAt, cutoff)) {
      await this.accruePoints(personId, "early_checkin", "checkin", checkin.id);
    }
    await this.evaluateBadgesFor(personId);
  }

  /**
   * Puntos del usuario en la temporada activa (o de todas las entradas si
   * no hay Season activa): total + breakdown por conducta.
   */
  async pointsFor(personId: string) {
    const season = await this.repo.activeSeason(new Date());
    const entries = season
      ? await this.repo.ledgerForPerson(personId, season.id)
      : await this.repo.ledgerForPerson(personId);
    return {
      seasonId: season?.id ?? null,
      ...summarizePoints(entries),
    };
  }

  /**
   * Badge destacado que se exhibe en el QR al ser escaneado (spec §7):
   * PersonBadge featured vigente → corona Prime Time vigente → null.
   */
  async featuredBadgeFor(
    personId: string,
  ): Promise<{ key: string; name: string } | null> {
    const badges = await this.repo.badgesForPerson(personId);
    return selectFeaturedBadge(
      badges.map((b) => ({
        key: b.badge.key,
        name: b.badge.name,
        featured: b.featured,
        expiresAt: b.expiresAt,
      })),
    );
  }

  /**
   * Misiones del evento + progreso del usuario. Recalcula lazy cada consulta
   * (data siempre fresca sin hooks en el flujo de sesión).
   */
  async missionsFor(eventId: string, personId: string): Promise<MissionView[]> {
    const event = await this.repo.findEvent(eventId);
    if (!event) throw new EventNotFoundError(eventId);
    const missions = await this.repo.missionsForEvent(eventId);
    // Una lectura de actividad por eventId — cada misión evalúa sobre el
    // mismo dataset (evita 2N queries idénticas cuando hay N misiones).
    const activities = new Map<string | null, MissionActivity>();
    return Promise.all(
      missions.map(async (m) => {
        let activity = activities.get(m.eventId);
        if (!activity) {
          activity = await this.activityFor(personId, m.eventId);
          activities.set(m.eventId, activity);
        }
        return this.evaluateFor(m, personId, activity);
      }),
    );
  }

  /** Recálculo bajo demanda (uso interno): misión × persona. */
  async recalcProgress(
    missionId: string,
    personId: string,
  ): Promise<MissionProgress> {
    const mission = await this.repo.findMission(missionId);
    if (!mission) throw new MissionNotFoundError(missionId);
    const view = await this.evaluateFor(mission, personId);
    return this.repo.upsertProgress(
      mission.id,
      personId,
      view.progress,
      view.completed ? new Date() : null,
    );
  }

  // ─── helpers ───

  /** Cutoff de check-in temprano en minutos desde medianoche (param DB). */
  private async earlyCheckinCutoff(): Promise<number> {
    return this.params
      ? this.params.getNumber(
          "early_checkin.cutoff_minutes",
          EARLY_CHECKIN_CUTOFF_MINUTES,
        )
      : EARLY_CHECKIN_CUTOFF_MINUTES;
  }

  private async activityFor(
    personId: string,
    eventId: string | null,
  ): Promise<MissionActivity> {
    const [sessions, checkins] = await Promise.all([
      this.repo.confirmedSessionsForPerson(personId, eventId ?? undefined),
      this.repo.checkinsForPerson(personId, eventId ?? undefined),
    ]);
    return {
      sessions: sessions.map((s) => this.toActivitySession(s, personId)),
      checkins,
    };
  }

  private toActivitySession(s: GamificationSession, personId: string) {
    return {
      partnerId: s.inviterId === personId ? s.inviteeId : s.inviterId,
      styleId: s.styleId,
      at: s.confirmedAt ?? s.scannedAt,
    };
  }

  private async evaluateFor(
    mission: MissionWithTemplate,
    personId: string,
    activity?: MissionActivity,
  ): Promise<MissionView> {
    const act = activity ?? (await this.activityFor(personId, mission.eventId));
    const config =
      mission.config && typeof mission.config === "object"
        ? (mission.config as Record<string, unknown>)
        : null;
    const r = evaluateMission(mission.template.key, config, act);
    // Misión cumplida → puntos de temporada (idempotente por mission.id;
    // corre lazy en cada evaluación, igual que el award de badges).
    if (r.completed) {
      await this.accruePoints(
        personId,
        "mission_completed",
        "mission",
        mission.id,
      );
    }
    await this.repo.upsertProgress(
      mission.id,
      personId,
      r.progress,
      r.completed ? new Date() : null,
    );
    return {
      id: mission.id,
      key: mission.template.key,
      name: mission.template.name,
      description: mission.template.description,
      reward: mission.reward ?? mission.template.defaultReward,
      ...r,
    };
  }
}
