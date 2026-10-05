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
import {
  roleKeysHavePermission,
  RolesGuard,
} from "../../common/rbac/roles.guard";
import { RequireRoles } from "../../common/rbac/roles.decorator";
import { PrismaService } from "../../prisma.service";
import { EXPOSURE_THRESHOLD } from "./event-ratings.controller";

const TOP_N = 20;

// Deduplicación igual que el ranking de preventa: trim + espacios
// colapsados + lowercase, sobre título y artista.
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Consola del DJ: sus gigs (EventDj) y el ranking de canciones pedidas
 * por evento. Misma semántica que /events/:id/song-suggestions — solo
 * cuentan sugerencias de personas con ticket ACTIVE|USED — pero acá se
 * agrupa por título+artista y se expone el total bruto de sugerencias.
 * ADMIN (o permiso admin.access) bypassa el check de DJ del evento.
 */
@Controller("dj")
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles("DJ", "ADMIN")
export class DjController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/dj/gigs — gigs propios separados en upcoming/past (admin: todos). */
  @Get("gigs")
  async gigs(@Req() req: Request) {
    const me = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const rows = await this.prisma.eventDj.findMany({
      where: isAdmin ? {} : { personId: me.id },
      select: {
        eventId: true,
        slotNote: true,
        event: {
          select: {
            name: true,
            type: true,
            startsAt: true,
            endsAt: true,
            venue: { select: { name: true } },
          },
        },
      },
    });

    const items = rows.map((g) => ({
      eventId: g.eventId,
      name: g.event.name,
      type: g.event.type,
      startsAt: g.event.startsAt,
      endsAt: g.event.endsAt,
      venueName: g.event.venue?.name ?? null,
      slotNote: g.slotNote,
    }));
    const now = Date.now();
    const ts = (g: (typeof items)[number]) => g.startsAt.getTime();
    return {
      // próximos en orden cronológico; pasados del más reciente al más antiguo
      upcoming: items.filter((g) => ts(g) >= now).sort((a, b) => ts(a) - ts(b)),
      past: items.filter((g) => ts(g) < now).sort((a, b) => ts(b) - ts(a)),
    };
  }

  /**
   * GET /api/dj/gigs/:eventId/suggestions — ranking agregado de pedidos
   * del evento. Requiere ser DJ del evento (o admin).
   */
  @Get("gigs/:eventId/suggestions")
  async suggestions(@Param("eventId") eventId: string, @Req() req: Request) {
    const me = req.person!;
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, djs: { select: { personId: true } } },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    if (!isAdmin && !event.djs.some((d) => d.personId === me.id)) {
      throw new ForbiddenException("solo un DJ del evento puede ver su ranking");
    }

    const suggestions = await this.prisma.songSuggestion.findMany({
      where: { eventId },
      select: { personId: true, title: true, artist: true },
    });
    const total = suggestions.length;
    if (total === 0) return { total: 0, ranking: [] };

    // Solo cuentan personas con ticket pagado (ACTIVE|USED) — join manual:
    // Ticket.eventId/ownerId son escalares sin relación.
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

    const counts = new Map<
      string,
      { title: string; artist: string | null; count: number }
    >();
    for (const s of suggestions) {
      if (!paidOwners.has(s.personId)) continue;
      const key = `${norm(s.title)}|||${norm(s.artist ?? "")}`;
      const hit = counts.get(key);
      if (hit) {
        hit.count += 1;
      } else {
        counts.set(key, {
          title: s.title.trim(),
          artist: s.artist?.trim() || null,
          count: 1,
        });
      }
    }

    const ranking = [...counts.values()]
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, TOP_N);
    return { total, ranking };
  }

  /**
   * GET /api/dj/gigs/:eventId/rating — evaluación agregada de la música
   * del evento para el DJ asignado (spec §13: vista ligera del DJ —
   * "su evaluación agregada de música por evento"). Misma k-anonymity
   * que /events/:id/ratings/summary: bajo el umbral no se expone
   * promedio, solo {exposed:false,count}.
   */
  @Get("gigs/:eventId/rating")
  async rating(@Param("eventId") eventId: string, @Req() req: Request) {
    const me = req.person!;
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, djs: { select: { personId: true } } },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    if (!isAdmin && !event.djs.some((d) => d.personId === me.id)) {
      throw new ForbiddenException(
        "solo un DJ del evento puede ver su evaluación",
      );
    }

    const ratings = await this.prisma.eventRating.findMany({
      where: { eventId, music: { not: null } },
      select: { music: true },
    });
    const count = ratings.length;
    if (count < EXPOSURE_THRESHOLD) {
      return { exposed: false, count, music: null };
    }
    const avg =
      ratings.reduce((a, r) => a + (r.music as number), 0) / count;
    return { exposed: true, count, music: { avg, count } };
  }
}
