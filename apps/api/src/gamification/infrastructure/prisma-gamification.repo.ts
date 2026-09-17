import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import type { GamificationRepo } from "../domain/ports";

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
    return this.prisma.danceSession.findMany({
      where: { eventId, status: "CONFIRMED" },
      select: {
        inviterId: true,
        inviteeId: true,
        styleId: true,
        scannedAt: true,
        confirmedAt: true,
      },
    });
  }

  confirmedSessionsForPerson(personId: string, eventId?: string) {
    return this.prisma.danceSession.findMany({
      where: {
        status: "CONFIRMED",
        ...(eventId ? { eventId } : {}),
        OR: [{ inviterId: personId }, { inviteeId: personId }],
      },
      select: {
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
}
