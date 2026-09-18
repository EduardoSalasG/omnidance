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
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";

const TOP_N = 20;

/**
 * Ranking de canciones pedidas en preventa. Las sugerencias se crean en el
 * checkout ligadas al comprador; aquí solo cuentan las de personas con
 * ticket ACTIVE|USED en el evento (pago confirmado — spec §18).
 */
@Controller("events")
@UseGuards(SessionGuard)
export class SongSuggestionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id/song-suggestions")
  async top(@Param("id") eventId: string, @Req() req: Request) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        producerId: true,
        djs: { select: { personId: true } },
      },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const me = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const allowed =
      isAdmin ||
      event.producerId === me.id ||
      event.djs.some((d) => d.personId === me.id);
    if (!allowed) {
      throw new ForbiddenException(
        "solo el productor, un DJ del evento o un admin puede ver el ranking",
      );
    }

    const suggestions = await this.prisma.songSuggestion.findMany({
      where: { eventId },
      select: { personId: true, title: true },
    });
    if (suggestions.length === 0) return [];

    // Solo cuentan personas con ticket pagado (ACTIVE|USED) en el evento —
    // join manual: Ticket.eventId/ownerId son escalares sin relación.
    const personIds = [...new Set(suggestions.map((s) => s.personId))];
    const paidTickets = await this.prisma.ticket.findMany({
      where: {
        eventId,
        ownerId: { in: personIds },
        status: { in: ["ACTIVE", "USED"] },
      },
      select: { ownerId: true },
    });
    const paidOwners = new Set(paidTickets.map((t) => t.ownerId));

    // Deduplicar por título normalizado (lowercase + espacios colapsados).
    const counts = new Map<string, number>();
    for (const s of suggestions) {
      if (!paidOwners.has(s.personId)) continue;
      const key = s.title.trim().replace(/\s+/g, " ").toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, TOP_N);
  }
}
