import { Injectable } from "@nestjs/common";
import { ParamsService } from "../../params/params.service";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import type {
  CheckinsRepo,
  CreateCheckinData,
  DoorSaleTxInput,
  ResolvedPass,
  VoidCheckinInput,
} from "../domain/ports";

@Injectable()
export class PrismaCheckinsRepo implements CheckinsRepo {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
  ) {}

  findEventById(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        doorPrice: true,
        doorCap: true,
        producerId: true,
        seriesId: true,
      },
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

  /** Pase mensual de serie vigente: @@unique([seriesId,personId,month]). */
  findActiveSeriesPass(seriesId: string, personId: string, month: string) {
    return this.prisma.seriesPass.findUnique({
      where: { seriesId_personId_month: { seriesId, personId, month } },
    });
  }

  /**
   * Crea el check-in y marca USED el pase resuelto en la misma transacción.
   * SERIES_PASS no se marca USED: es un pase mensual reutilizable — solo
   * queda referenciado en Checkin.passId para auditoría/reporting.
   */
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

  findCheckinById(id: string) {
    return this.prisma.checkin.findUnique({ where: { id } });
  }

  /** Roles APPROVED del actor (keys) — la resolución a permisos usa el
   * catálogo cacheado de roles.guard (misma fuente que el guard HTTP). */
  private async actorRoleKeys(personId: string) {
    const personRoles = await this.prisma.personRole.findMany({
      where: { personId, status: "APPROVED" },
      select: { role: true },
    });
    return personRoles.map((r) => r.role);
  }

  async personHasPermission(personId: string, permissionKey: string) {
    const roleKeys = await this.actorRoleKeys(personId);
    return roleKeysHavePermission(this.prisma, roleKeys, [permissionKey]);
  }

  async isSuperuser(personId: string) {
    // isSuperuser pasa cualquier check de permiso — reusa el mismo resolver.
    const roleKeys = await this.actorRoleKeys(personId);
    return roleKeysHavePermission(this.prisma, roleKeys, [
      "__superuser_probe__",
    ]);
  }

  async isStaffAssigned(eventId: string, personId: string) {
    const row = await this.prisma.staffAssignment.findUnique({
      where: { eventId_personId: { eventId, personId } },
      select: { id: true },
    });
    return row !== null;
  }

  closeCheckin(id: string) {
    return this.prisma.checkin.update({
      where: { id },
      data: { outAt: new Date() },
    });
  }

  /**
   * Void atómico: marca el check-in, devuelve a ACTIVE el pase que consumió
   * (Ticket o EntryPass en estado USED) y deja AuditLog CHECKIN_VOID.
   */
  voidCheckin(input: VoidCheckinInput) {
    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.checkin.findUniqueOrThrow({
        where: { id: input.checkinId },
      });
      const checkin = await tx.checkin.update({
        where: { id: input.checkinId },
        data: { voidedAt: new Date(), voidReason: input.reason },
      });
      if (prev.passId) {
        const ticket = await tx.ticket.updateMany({
          where: { id: prev.passId, status: "USED" },
          data: { status: "ACTIVE" },
        });
        if (ticket.count === 0) {
          await tx.entryPass.updateMany({
            where: { id: prev.passId, status: "USED" },
            data: { status: "ACTIVE" },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "CHECKIN_VOID",
          targetType: "Checkin",
          targetId: input.checkinId,
          payload: {
            checkinId: input.checkinId,
            eventId: prev.eventId,
            reason: input.reason,
            prevOutAt: prev.outAt ? prev.outAt.toISOString() : null,
          },
        },
      });
      return checkin;
    });
  }

  /** Ventas de puerta = checkins MANUAL no anulados (spec: doorCap). */
  countDoorSales(eventId: string) {
    return this.prisma.checkin.count({
      where: { eventId, method: "MANUAL", voidedAt: null },
    });
  }

  findPersonByPhone(phone: string) {
    return this.prisma.person.findUnique({
      where: { phone },
      select: { id: true, name: true },
    });
  }

  createLightPerson(input: { name: string; phone: string }) {
    return this.prisma.person.create({
      data: {
        name: input.name,
        phone: input.phone,
        isLightAccount: true,
        roles: { create: { role: "DANCER", status: "APPROVED" } },
      },
      select: { id: true, name: true },
    });
  }

  createDoorSale(input: DoorSaleTxInput) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          eventId: input.eventId,
          ownerId: input.personId,
          buyerId: input.personId,
          listPrice: input.listPrice,
          serviceFee: input.serviceFee,
          status: "USED",
        },
      });
      const checkin = await tx.checkin.create({
        data: {
          eventId: input.eventId,
          personId: input.personId,
          staffId: input.staffId,
          method: "MANUAL",
          passId: ticket.id,
          syncedAt: new Date(),
        },
      });
      return { ticket, checkin };
    });
  }

  getParamNumber(key: string, fallback: number) {
    return this.params.getNumber(key, fallback);
  }
}
