import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RSVP_STATUSES, type RsvpStatus } from "../domain/social.service";

class SetRsvpDto {
  @IsIn(RSVP_STATUSES)
  status!: RsvpStatus;
}

@Controller("events")
export class RsvpController {
  constructor(private readonly prisma: PrismaService) {}

  /** Marcar/cambiar el propio RSVP ("voy" | "me interesa"). */
  @Put(":eventId/rsvp")
  @UseGuards(SessionGuard)
  async set(
    @Param("eventId") eventId: string,
    @Body() dto: SetRsvpDto,
    @Req() req: Request,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    return this.prisma.rsvp.upsert({
      where: {
        eventId_personId: { eventId, personId: req.person!.id },
      },
      create: { eventId, personId: req.person!.id, status: dto.status },
      update: { status: dto.status },
    });
  }

  /** Quitar el propio RSVP. */
  @Delete(":eventId/rsvp")
  @UseGuards(SessionGuard)
  async remove(@Param("eventId") eventId: string, @Req() req: Request) {
    const existing = await this.prisma.rsvp.findUnique({
      where: {
        eventId_personId: { eventId, personId: req.person!.id },
      },
    });
    if (!existing) throw new NotFoundException("no tienes RSVP en este evento");
    return this.prisma.rsvp.delete({ where: { id: existing.id } });
  }

  /**
   * Contadores públicos — solo agregados, nunca la lista de personas
   * (privacidad: spec omni-dance.md, ratings/identidad no se exponen).
   */
  @Get(":eventId/rsvps")
  async counts(@Param("eventId") eventId: string) {
    const groups = await this.prisma.rsvp.groupBy({
      by: ["status"],
      where: { eventId },
      _count: { _all: true },
    });
    const count = (status: RsvpStatus) =>
      groups.find((g) => g.status === status)?._count._all ?? 0;
    return { going: count("GOING"), interested: count("INTERESTED") };
  }

  /**
   * "Amigos que van": personas con RSVP GOING.
   * Decisión v1: cualquier usuario logueado ve a todos los GOING — la spec
   * lo refinará a solo amigos/privacy opt-in en una iteración posterior.
   */
  @Get(":eventId/attendees")
  @UseGuards(SessionGuard)
  async attendees(@Param("eventId") eventId: string) {
    const rsvps = await this.prisma.rsvp.findMany({
      where: { eventId, status: "GOING" },
      orderBy: { createdAt: "asc" },
    });
    // Rsvp.personId es escalar (sin relación Prisma) → join manual
    const people = await this.prisma.person.findMany({
      where: { id: { in: rsvps.map((r) => r.personId) } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return rsvps.map((r) => {
      const person = byId.get(r.personId);
      return {
        personId: r.personId,
        name: person?.name ?? "?",
        photoUrl: person?.photoUrl ?? null,
      };
    });
  }
}

/**
 * RSVP propios: GET /api/me/rsvp → [{ eventId, status, createdAt }]
 * del usuario autenticado (el front lo usa para marcar "voy/interesado").
 */
@Controller("me")
export class MeRsvpController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("rsvp")
  @UseGuards(SessionGuard)
  mine(@Req() req: Request) {
    return this.prisma.rsvp.findMany({
      where: { personId: req.person!.id },
      orderBy: { createdAt: "desc" },
      select: { eventId: true, status: true, createdAt: true },
    });
  }
}
