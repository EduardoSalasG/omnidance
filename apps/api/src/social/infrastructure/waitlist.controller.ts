import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import {
  SocialDomainError,
  assertCanJoinWaitlist,
  nextWaitlistPosition,
} from "../domain/social.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequireRoles } from "../../common/rbac/roles.decorator";

@Controller("events")
export class WaitlistController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unirse a la waitlist. Decisión v1: no se exige que el evento esté agotado
   * para entrar (la regla "solo cuando preventa/capacidad agotada" se aplicará
   * cuando exista el flujo de compra que consume PROMOTED); solo se bloquea si
   * la persona ya tiene ticket/pase activo o una entrada viva en la lista.
   */
  @Post(":eventId/waitlist")
  @UseGuards(SessionGuard)
  async join(@Param("eventId") eventId: string, @Req() req: Request) {
    const personId = req.person!.id;

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const [existing, ticket, entryPass, entries] = await Promise.all([
      this.prisma.waitlist.findUnique({
        where: { eventId_personId: { eventId, personId } },
      }),
      this.prisma.ticket.findFirst({
        where: { eventId, ownerId: personId, status: "ACTIVE" },
        select: { id: true },
      }),
      this.prisma.entryPass.findFirst({
        where: { eventId, personId, status: "ACTIVE" },
        select: { id: true },
      }),
      this.prisma.waitlist.findMany({
        where: { eventId },
        select: { position: true },
      }),
    ]);

    try {
      assertCanJoinWaitlist(existing, !!(ticket || entryPass));
    } catch (e) {
      if (e instanceof SocialDomainError) {
        throw new ConflictException(e.message);
      }
      throw e;
    }

    const position = nextWaitlistPosition(entries);
    if (existing) {
      // re-ingreso tras EXPIRED: misma fila, nueva posición
      return this.prisma.waitlist.update({
        where: { id: existing.id },
        data: { position, status: "WAITING" },
      });
    }
    return this.prisma.waitlist.create({
      data: { eventId, personId, position, status: "WAITING" },
    });
  }

  /** Mi posición/estado en la waitlist del evento. */
  @Get(":eventId/waitlist/me")
  @UseGuards(SessionGuard)
  async me(@Param("eventId") eventId: string, @Req() req: Request) {
    const entry = await this.prisma.waitlist.findUnique({
      where: {
        eventId_personId: { eventId, personId: req.person!.id },
      },
      select: { position: true, status: true },
    });
    if (!entry) {
      throw new NotFoundException("no estás en la lista de espera");
    }
    return entry;
  }

  /**
   * Promueve al primer WAITING (menor posición) → PROMOTED.
   * Decisión v1: el flujo de compra consumirá los PROMOTED después; aquí solo
   * se marca. 404 cuando no hay nadie en espera.
   */
  @Post(":eventId/waitlist/promote")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard)
  @RequireRoles("PRODUCER", "STAFF", "ADMIN")
  async promote(@Param("eventId") eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const next = await this.prisma.waitlist.findFirst({
      where: { eventId, status: "WAITING" },
      orderBy: { position: "asc" },
    });
    if (!next) {
      throw new NotFoundException("no hay nadie en espera para promover");
    }
    return this.prisma.waitlist.update({
      where: { id: next.id },
      data: { status: "PROMOTED" },
    });
  }
}
