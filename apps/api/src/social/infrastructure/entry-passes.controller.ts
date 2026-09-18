import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";

/**
 * EntryPass del evento (spec pases/listas). Autorización mixta — sin
 * @RequirePermissions porque el productor y el staff asignado no
 * necesariamente tienen el grant global: productor del evento, staff con
 * StaffAssignment en el evento, o cualquier rol con `social.manage` /
 * `checkins.write` (mismo catálogo cacheado que RolesGuard).
 */
@Controller("events")
export class EventEntryPassesController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /events/:id/passes → EntryPass del evento desc por createdAt con
   * person {id,name,phone} (EntryPass.personId es escalar → join manual).
   */
  @Get(":id/passes")
  @UseGuards(SessionGuard)
  async list(@Param("id") eventId: string, @Req() req: Request) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, producerId: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const me = req.person!;
    const [assigned, hasPerm] = await Promise.all([
      this.prisma.staffAssignment.findUnique({
        where: { eventId_personId: { eventId, personId: me.id } },
        select: { id: true },
      }),
      roleKeysHavePermission(this.prisma, me.roles, [
        "social.manage",
        "checkins.write",
      ]),
    ]);
    const allowed = event.producerId === me.id || assigned !== null || hasPerm;
    if (!allowed) {
      throw new ForbiddenException(
        "requiere productor del evento, staff asignado o permiso de gestión",
      );
    }

    const passes = await this.prisma.entryPass.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    });
    const people = await this.prisma.person.findMany({
      where: { id: { in: [...new Set(passes.map((p) => p.personId))] } },
      select: { id: true, name: true, phone: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return passes.map((p) => ({
      ...p,
      person: byId.get(p.personId) ?? null,
    }));
  }
}
