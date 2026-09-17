import type { Badge, EventStatus, Mission, MissionProgress, MissionTemplate, PersonBadge } from "@prisma/client";

export const GAMIFICATION_REPO = "GAMIFICATION_REPO";

export interface GamificationEvent {
  id: string;
  status: EventStatus;
  capacity: number | null;
  primeThreshold: number | null;
  happyHourMinutes: number;
  startsAt: Date;
}

/** Sesión CONFIRMED en forma mínima para reglas de gamificación. */
export interface GamificationSession {
  inviterId: string;
  inviteeId: string;
  styleId: string | null;
  scannedAt: Date;
  confirmedAt: Date | null;
}

export type MissionWithTemplate = Mission & { template: MissionTemplate };
export type AwardedBadge = PersonBadge & { badge: Badge };

export interface HappyHour {
  startsAt: Date;
  endsAt: Date;
  multiplier: number;
}

export interface GamificationRepo {
  findEvent(id: string): Promise<GamificationEvent | null>;

  /** Sesiones CONFIRMED del evento (leaderboard + prime time + misiones). */
  confirmedSessionsForEvent(eventId: string): Promise<GamificationSession[]>;

  /** Sesiones CONFIRMED de la persona (cualquier rol), opcionalmente por evento. */
  confirmedSessionsForPerson(
    personId: string,
    eventId?: string,
  ): Promise<GamificationSession[]>;

  checkinsForPerson(
    personId: string,
    eventId?: string,
  ): Promise<{ eventId: string; inAt: Date }[]>;

  /** Nombres para el leaderboard (join manual — personId es escalar). */
  peopleByIds(ids: string[]): Promise<{ id: string; name: string }[]>;

  happyHoursForEvent(eventId: string): Promise<HappyHour[]>;

  missionsForEvent(eventId: string): Promise<MissionWithTemplate[]>;
  findMission(missionId: string): Promise<MissionWithTemplate | null>;

  upsertProgress(
    missionId: string,
    personId: string,
    progress: number,
    completedAt: Date | null,
  ): Promise<MissionProgress>;

  badgesForPerson(personId: string): Promise<AwardedBadge[]>;
  badgesByKeys(keys: string[]): Promise<Badge[]>;
  awardBadge(personId: string, badgeId: string): Promise<PersonBadge>;
}
