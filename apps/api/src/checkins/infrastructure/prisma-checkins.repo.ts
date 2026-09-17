import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import type {
  CheckinsRepo,
  CreateCheckinData,
  ResolvedPass,
} from "../domain/ports";

@Injectable()
export class PrismaCheckinsRepo implements CheckinsRepo {
  constructor(private readonly prisma: PrismaService) {}

  findEventById(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  findPersonById(id: string) {
    return this.prisma.person.findUnique({
      where: { id },
      select: { id: true, name: true, photoUrl: true },
    });
  }

  findOpenCheckin(eventId: string, personId: string) {
    return this.prisma.checkin.findFirst({
      where: { eventId, personId, outAt: null },
      orderBy: { inAt: "desc" },
    });
  }

  findActiveTicket(eventId: string, ownerId: string) {
    return this.prisma.ticket.findFirst({
      where: { eventId, ownerId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
  }

  findActiveEntryPass(eventId: string, personId: string) {
    return this.prisma.entryPass.findFirst({
      where: { eventId, personId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Crea el check-in y marca USED el pase resuelto en la misma transacción. */
  createCheckin(data: CreateCheckinData, pass: ResolvedPass | null) {
    return this.prisma.$transaction(async (tx) => {
      const checkin = await tx.checkin.create({
        data: {
          eventId: data.eventId,
          personId: data.personId,
          staffId: data.staffId,
          method: data.method,
          passId: data.passId,
          note: data.note,
          syncedAt: new Date(),
        },
      });
      if (pass?.kind === "TICKET") {
        await tx.ticket.update({
          where: { id: pass.id },
          data: { status: "USED" },
        });
      } else if (pass?.kind === "ENTRY_PASS") {
        await tx.entryPass.update({
          where: { id: pass.id },
          data: { status: "USED" },
        });
      }
      return checkin;
    });
  }

  async listEventCheckins(eventId: string) {
    const checkins = await this.prisma.checkin.findMany({
      where: { eventId },
      orderBy: { inAt: "asc" },
    });
    // Checkin.personId es escalar (sin relación Prisma) → join manual
    const personIds = [...new Set(checkins.map((c) => c.personId))];
    const people = await this.prisma.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return checkins.map((c) => ({
      ...c,
      person: byId.get(c.personId) ?? { name: "?", photoUrl: null },
    }));
  }
}
