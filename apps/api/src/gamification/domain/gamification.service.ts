import type { MissionProgress } from "@prisma/client";
import {
  BadgeAwarder,
  buildStreakWeeks,
  computePrimeTime,
  computeStreak,
  evaluateMission,
  leaderboard,
  maskSmallCount,
  primeWindow,
  type MissionActivity,
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
 * Awards de badges y progreso de misiones se evalúan LAZY al consultar —
 * v1 no engancha el confirm de sesión para no tocar módulos ajenos.
 */
export class GamificationService {
  constructor(
    private readonly repo: GamificationRepo,
    private readonly awarder = new BadgeAwarder(),
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
    const confirmed = await this.repo.confirmedSessionsForPerson(personId);
    const newKeys = this.awarder.evaluate(
      { confirmedSessions: confirmed.length },
      owned.map((b) => b.badge.key),
    );
    if (newKeys.length > 0) {
      const badges = await this.repo.badgesByKeys(newKeys);
      for (const b of badges) {
        await this.repo.awardBadge(personId, b.id);
      }
      return this.repo.badgesForPerson(personId);
    }
    return owned;
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
    const result = computePrimeTime({
      sessions: sessions.map((s) => ({ at: s.confirmedAt ?? s.scannedAt })),
      window,
      capacity: event.capacity,
      primeThreshold: event.primeThreshold,
      happyHours: happyHours.map((h) => ({
        start: h.startsAt,
        end: h.endsAt,
        multiplier: h.multiplier,
      })),
    });
    return { ...result, window };
  }

  /**
   * Misiones del evento + progreso del usuario. Recalcula lazy cada consulta
   * (data siempre fresca sin hooks en el flujo de sesión).
   */
  async missionsFor(eventId: string, personId: string): Promise<MissionView[]> {
    const event = await this.repo.findEvent(eventId);
    if (!event) throw new EventNotFoundError(eventId);
    const missions = await this.repo.missionsForEvent(eventId);
    return Promise.all(
      missions.map((m) => this.evaluateFor(m, personId)),
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
  ): Promise<MissionView> {
    const activity = await this.activityFor(personId, mission.eventId);
    const config =
      mission.config && typeof mission.config === "object"
        ? (mission.config as Record<string, unknown>)
        : null;
    const r = evaluateMission(mission.template.key, config, activity);
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
