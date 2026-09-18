import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import type { GamificationRepo, NewLedgerEntry } from "../domain/ports";

@Injectable()
export class PrismaGamificationRepo implements GamificationRepo {
  constructor(private readonly prisma: PrismaService) {}

  findEvent(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        capacity: true,
        primeThreshold: true,
        happyHourMinutes: true,
        startsAt: true,
      },
    });
  }

  confirmedSessionsForEvent(eventId: string) {
    // RATED sigue siendo una sesión confirmada (ya puntuada) — si solo se
    // cuenta CONFIRMED, el primer rating la saca de leaderboard/misiones.
    // retroDeclared NO cuenta: el Prime Time/leaderboard se alimenta del
    // escaneo en vivo (spec §6); las declaradas sí cuentan para
    // streaks/badges/puntos vía confirmedSessionsForPerson.
    return this.prisma.danceSession.findMany({
      where: {
        eventId,
        status: { in: ["CONFIRMED", "RATED"] },
        retroDeclared: false,
      },
      select: {
        eventId: true,
        inviterId: true,
        inviteeId: true,
        styleId: true,
        scannedAt: true,
        confirmedAt: true,
      },
    });
  }

  ratedSessionsForEvent(eventId: string) {
    // Reveal: solo sesiones confirmadas y evaluadas del evento, sin
    // retro-declaradas (misma regla que el contador Prime Time).
    return this.prisma.danceSession.findMany({
      where: {
        eventId,
        status: { in: ["CONFIRMED", "RATED"] },
        retroDeclared: false,
      },
      select: {
        inviterId: true,
        inviteeId: true,
        styleId: true,
        ratings: { select: { raterId: true, global: true } },
      },
    });
  }

  styleRolesForPeople(personIds: string[]) {
    return this.prisma.personStyleRole.findMany({
      where: { personId: { in: personIds } },
      select: { personId: true, styleId: true, role: true },
    });
  }

  confirmedSessionsForPerson(personId: string, eventId?: string) {
    return this.prisma.danceSession.findMany({
      where: {
        // RATED = confirmada y ya puntuada: sigue contando como actividad.
        // retroDeclared SÍ cuenta aquí (streaks/badges/puntos = conducta).
        status: { in: ["CONFIRMED", "RATED"] },
        ...(eventId ? { eventId } : {}),
        OR: [{ inviterId: personId }, { inviteeId: personId }],
      },
      select: {
        eventId: true,
        inviterId: true,
        inviteeId: true,
        styleId: true,
        scannedAt: true,
        confirmedAt: true,
      },
    });
  }

  checkinsForPerson(personId: string, eventId?: string) {
    return this.prisma.checkin.findMany({
      where: {
        personId,
        voidedAt: null, // check-ins anulados no cuentan
        ...(eventId ? { eventId } : {}),
      },
      select: { eventId: true, inAt: true },
    });
  }

  peopleByIds(ids: string[]) {
    return this.prisma.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
  }

  happyHoursForEvent(eventId: string) {
    return this.prisma.happyHourWindow.findMany({
      where: { eventId },
      select: { startsAt: true, endsAt: true, multiplier: true },
    });
  }

  missionsForEvent(eventId: string) {
    return this.prisma.mission.findMany({
      where: { eventId },
      include: { template: true },
    });
  }

  findMission(missionId: string) {
    return this.prisma.mission.findUnique({
      where: { id: missionId },
      include: { template: true },
    });
  }

  upsertProgress(
    missionId: string,
    personId: string,
    progress: number,
    completedAt: Date | null,
  ) {
    return this.prisma.missionProgress.upsert({
      where: { missionId_personId: { missionId, personId } },
      create: { missionId, personId, progress, completedAt },
      update: {
        progress,
        // conserva el primer completedAt si ya estaba cumplida
        ...(completedAt ? { completedAt } : {}),
      },
    });
  }

  async badgesForPerson(personId: string) {
    // PersonBadge.badgeId es escalar (sin @relation) → join manual con Badge
    const awarded = await this.prisma.personBadge.findMany({
      where: { personId },
      orderBy: { awardedAt: "asc" },
    });
    const badges = await this.prisma.badge.findMany({
      where: { id: { in: awarded.map((a) => a.badgeId) } },
    });
    const byId = new Map(badges.map((b) => [b.id, b]));
    return awarded
      .map((a) => ({ ...a, badge: byId.get(a.badgeId) }))
      .filter((a): a is typeof a & { badge: NonNullable<typeof a.badge> } =>
        Boolean(a.badge),
      );
  }

  badgesByKeys(keys: string[]) {
    return this.prisma.badge.findMany({ where: { key: { in: keys } } });
  }

  awardBadge(personId: string, badgeId: string) {
    return this.prisma.personBadge.upsert({
      where: { personId_badgeId: { personId, badgeId } },
      create: { personId, badgeId },
      update: {},
    });
  }

  async awardBadgeWithExpiry(
    personId: string,
    badgeId: string,
    expiresAt: Date,
  ) {
    // Corona vigente → no re-otorga (idempotencia del reveal); corona
    // expirada o inexistente → crea/renueva (re-win en otro evento).
    const existing = await this.prisma.personBadge.findUnique({
      where: { personId_badgeId: { personId, badgeId } },
    });
    if (
      existing?.expiresAt &&
      existing.expiresAt.getTime() > Date.now()
    ) {
      return existing;
    }
    return this.prisma.personBadge.upsert({
      where: { personId_badgeId: { personId, badgeId } },
      create: { personId, badgeId, expiresAt },
      update: { expiresAt },
    });
  }

  activeSeason(now: Date) {
    return this.prisma.season.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { startsAt: "desc" },
    });
  }

  findLedgerEntry(
    personId: string,
    reason: string,
    refType: string | null,
    refId: string | null,
  ) {
    return this.prisma.pointLedger.findFirst({
      where: { personId, reason, refType, refId },
    });
  }

  async createLedgerEntry(entry: NewLedgerEntry) {
    try {
      return await this.prisma.pointLedger.create({ data: entry });
    } catch (e) {
      // P2002: el unique (personId, reason, refType, refId) rechaza el
      // duplicado — es el path de la race, no un error real.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return null;
      }
      throw e;
    }
  }

  ledgerForPerson(personId: string, seasonId?: string) {
    return this.prisma.pointLedger.findMany({
      where: {
        personId,
        ...(seasonId !== undefined ? { seasonId } : {}),
      },
      select: { reason: true, points: true },
    });
  }
}
