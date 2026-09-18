import type { Badge, EventStatus, Mission, MissionProgress, MissionTemplate, PersonBadge, PointLedger, Season } from "@prisma/client";

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
  eventId: string;
  inviterId: string;
  inviteeId: string;
  styleId: string | null;
  scannedAt: Date;
  confirmedAt: Date | null;
}

/** Sesión elegible del reveal: CONFIRMED/RATED, retroDeclared:false. */
export interface RatedEventSession {
  inviterId: string;
  inviteeId: string;
  styleId: string | null;
  ratings: { raterId: string; global: number }[];
}

/** Rol de baile autodeclarado (PersonStyleRole). */
export interface PersonStyleRoleRow {
  personId: string;
  styleId: string;
  role: string;
}

/** Entrada nueva del PointLedger (idempotencia la maneja el service). */
export interface NewLedgerEntry {
  personId: string;
  seasonId: string | null;
  points: number;
  reason: string;
  refType: string | null;
  refId: string | null;
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

  /**
   * Sesiones CONFIRMED/RATED del evento para contador Prime Time y
   * leaderboard — EXCLUYE retroDeclared (el escaneo en vivo es lo que
   * alimenta el Prime Time; las declaradas cuentan para streaks/badges).
   */
  confirmedSessionsForEvent(eventId: string): Promise<GamificationSession[]>;

  /**
   * Sesiones elegibles del reveal con sus ratings (CONFIRMED/RATED,
   * retroDeclared:false).
   */
  ratedSessionsForEvent(eventId: string): Promise<RatedEventSession[]>;

  /** Roles de baile autodeclarados para resolver leader/follower. */
  styleRolesForPeople(personIds: string[]): Promise<PersonStyleRoleRow[]>;

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

  /**
   * Corona Prime Time (PersonBadge con expiresAt): si ya existe una corona
   * vigente no re-otorga; si expiró o no existe, la crea/renueva a
   * `expiresAt` (re-win en otro evento extiende la corona).
   */
  awardBadgeWithExpiry(
    personId: string,
    badgeId: string,
    expiresAt: Date,
  ): Promise<PersonBadge>;

  /** Temporada activa (now entre startsAt/endsAt); null si no hay. */
  activeSeason(now: Date): Promise<Season | null>;

  /** Idempotencia del ledger: entrada por (personId, reason, refType, refId). */
  findLedgerEntry(
    personId: string,
    reason: string,
    refType: string | null,
    refId: string | null,
  ): Promise<PointLedger | null>;

  /**
   * Crea la entrada; retorna null si ya existía una con la misma referencia
   * (conflicto del unique compuesto — race de doble accrual).
   */
  createLedgerEntry(entry: NewLedgerEntry): Promise<PointLedger | null>;

  /**
   * Entradas del ledger de la persona; `seasonId` undefined = todas,
   * un id = solo esa temporada.
   */
  ledgerForPerson(
    personId: string,
    seasonId?: string,
  ): Promise<{ reason: string; points: number }[]>;
}
