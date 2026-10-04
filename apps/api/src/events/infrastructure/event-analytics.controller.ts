import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  assertProducerOrAdmin,
  EXPOSURE_THRESHOLD,
} from "./event-ratings.controller";

const ANALYTICS_DIMS = [
  "overall",
  "music",
  "occupation",
  "organization",
  "floorComfort",
  "temperature",
  "lightingSound",
] as const;
type AnalyticsDim = (typeof ANALYTICS_DIMS)[number];

@Controller("events")
@UseGuards(SessionGuard)
export class EventAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /events/:id/analytics — analítica del evento para su productor
   * (o admin): asistencia real por check-in, composición por género y
   * rol de baile, y promedios de la encuesta. Todo agregado — nunca
   * filas individuales; bajo EXPOSURE_THRESHOLD los splits y ratings
   * se ocultan (k-anonymity, mismo umbral que ratings/summary).
   */
  @Get(":id/analytics")
  async analytics(@Param("id") eventId: string, @Req() req: Request) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        producerId: true,
        genres: true, // vacío → hereda series.genres
        series: { select: { genres: true } },
      },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    await assertProducerOrAdmin(this.prisma, event, req.person!);

    const checkins = await this.prisma.checkin.findMany({
      where: { eventId, voidedAt: null },
      distinct: ["personId"],
      select: { personId: true },
    });
    const attendees = checkins.length;
    if (attendees < EXPOSURE_THRESHOLD) {
      return { attendees, genderSplit: null, roleSplit: null, ratings: null };
    }

    const attendeeIds = checkins.map((c) => c.personId);
    const [people, ratings] = await Promise.all([
      this.prisma.person.findMany({
        where: { id: { in: attendeeIds } },
        select: {
          gender: true,
          styleRoles: {
            select: { role: true, style: { select: { genre: true } } },
          },
        },
      }),
      this.prisma.eventRating.findMany({
        where: { eventId },
        select: {
          overall: true,
          music: true,
          occupation: true,
          organization: true,
          floorComfort: true,
          temperature: true,
          lightingSound: true,
        },
      }),
    ]);

    const eventGenres = event.genres.length
      ? event.genres
      : (event.series?.genres ?? []);
    const genderSplit = { M: 0, F: 0, OTHER: 0, unknown: 0 };
    const roleSplit = { leader: 0, follower: 0, both: 0 };
    for (const person of people) {
      genderSplit[person.gender ?? "unknown"]++;
      // Rol del asistente en los géneros del evento (o todos sus estilos
      // si el evento no declara géneros): 1 rol → ese; baila ambos
      // (SWITCH o LEADER+FOLLOWER entre estilos) → "both"; sin
      // styleRoles relevantes → no se cuenta.
      const roles = new Set(
        person.styleRoles
          .filter(
            (r) =>
              eventGenres.length === 0 || eventGenres.includes(r.style.genre),
          )
          .map((r) => r.role),
      );
      if (roles.has("SWITCH") || (roles.has("LEADER") && roles.has("FOLLOWER"))) {
        roleSplit.both++;
      } else if (roles.has("LEADER")) {
        roleSplit.leader++;
      } else if (roles.has("FOLLOWER")) {
        roleSplit.follower++;
      }
    }

    const byDim = {} as Record<AnalyticsDim, number | null>;
    for (const dim of ANALYTICS_DIMS) {
      const values = ratings
        .map((r) => r[dim])
        .filter((v): v is number => v != null);
      byDim[dim] = values.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
          10
        : null;
    }

    return {
      attendees,
      genderSplit,
      roleSplit,
      ratings: { count: ratings.length, byDim },
    };
  }
}
