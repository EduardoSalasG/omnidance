import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { requireEventActor } from "../../common/event-access";

/**
 * EntryPass del evento (spec pases/listas). Autorización mixta - sin
 * @RequirePermissions porque el productor y el staff asignado no
 * necesariamente tienen un grant global: exige el scoping de actor del
 * evento (productor dueño, staff asignado o admin - spec
 * event-access-scope; `social.manage`/`checkins.write` global solo ya
 * no basta - expone teléfonos de asistentes).
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
    await requireEventActor(this.prisma, eventId, req.person!);

    const passes = await this.prisma.entryPass.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    });
    const people = await this.prisma.person.findMany({
      where: {
        deletedAt: null, id: { in: [...new Set(passes.map((p) => p.personId))] } },
      select: { id: true, name: true, phone: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return passes.map((p) => ({
      ...p,
      person: byId.get(p.personId) ?? null,
    }));
  }
}
