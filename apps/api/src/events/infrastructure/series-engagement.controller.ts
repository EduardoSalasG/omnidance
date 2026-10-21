import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";

class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/**
 * Engagement de serie (spec series-engagement): stats agregadas
 * verificadas por check-in + reviews gateadas por asistencia real.
 * El score público es agregado; los comentarios escritos son privados
 * del productor/admin y se devuelven anónimos (regla de plataforma:
 * ratings privados, nunca individuales ni con identidad).
 */
@Controller("events")
@UseGuards(SessionGuard)
export class SeriesEngagementController {
  constructor(private readonly prisma: PrismaService) {}

  private async seriesOr404(seriesId: string) {
    const series = await this.prisma.eventSeries.findUnique({
      where: { id: seriesId },
      select: { id: true, producerId: true, name: true },
    });
    if (!series) throw new NotFoundException("serie no encontrada");
    return series;
  }

  private async eventIdsOfSeries(seriesId: string) {
    const events = await this.prisma.event.findMany({
      where: { seriesId },
      select: { id: true },
    });
    return events.map((e) => e.id);
  }

  private async hasCheckin(seriesId: string, personId: string) {
    const eventIds = await this.eventIdsOfSeries(seriesId);
    if (!eventIds.length) return false;
    const checkin = await this.prisma.checkin.findFirst({
      where: {
        personId,
        voidedAt: null,
        eventId: { in: eventIds },
      },
      select: { id: true },
    });
    return !!checkin;
  }

  /**
   * GET /events/series/:id/engagement - stats agregadas de la serie:
   * asistencia promedio por evento, ratios género y leader/follower
   * (personas únicas con check-in), score de reviews y myReview.
   * Todo agregado/anónimo - nunca identifica a una persona.
   */
  @Get("series/:id/engagement")
  async engagement(@Param("id") seriesId: string, @Req() req: Request) {
    await this.seriesOr404(seriesId);
    const me = req.person!.id;
    const eventIds = await this.eventIdsOfSeries(seriesId);

    const [eventCounts, attendees, reviewAgg, myReview] =
      await Promise.all([
        this.prisma.checkin.groupBy({
          by: ["eventId"],
          where: { voidedAt: null, eventId: { in: eventIds } },
          _count: { eventId: true },
        }),
        this.prisma.checkin.findMany({
          where: { voidedAt: null, eventId: { in: eventIds } },
          select: { personId: true },
          distinct: ["personId"],
        }),
        this.prisma.seriesReview.aggregate({
          where: { seriesId },
          _avg: { score: true },
          _count: { _all: true },
        }),
        this.prisma.seriesReview.findUnique({
          where: {
            seriesId_personId: { seriesId, personId: me },
          },
          select: { score: true, comment: true },
        }),
      ]);

    const personIds = attendees.map((a) => a.personId);
    const [genders, styleRoles] = personIds.length
      ? await Promise.all([
          this.prisma.person.groupBy({
            by: ["gender"],
            where: { id: { in: personIds } },
            _count: { gender: true },
          }),
          this.prisma.personStyleRole.findMany({
            where: { personId: { in: personIds } },
            select: { personId: true, role: true },
          }),
        ])
      : [[], []];

    const gender = { M: 0, F: 0, OTHER: 0, undeclared: 0 };
    for (const g of genders) {
      gender[g.gender ?? "undeclared"] = g._count.gender;
    }

    const roleByPerson = new Map<string, string>();
    for (const sr of styleRoles) {
      const prev = roleByPerson.get(sr.personId);
      if (!prev || sr.role === "LEADER") roleByPerson.set(sr.personId, sr.role);
    }
    let leader = 0;
    let follower = 0;
    for (const r of roleByPerson.values()) {
      if (r === "LEADER") leader++;
      else follower++;
    }

    const eventsWithAttendance = eventCounts.length;
    const totalCheckins = eventCounts.reduce(
      (acc, e) => acc + e._count.eventId,
      0,
    );

    return {
      events: eventsWithAttendance,
      avgAttendance: eventsWithAttendance
        ? Math.round((totalCheckins / eventsWithAttendance) * 10) / 10
        : 0,
      attendees: personIds.length,
      gender,
      danceRoles: {
        leader,
        follower,
        declared: roleByPerson.size,
      },
      review: {
        avg: reviewAgg._avg.score
          ? Math.round(reviewAgg._avg.score * 10) / 10
          : null,
        count: reviewAgg._count._all,
      },
      myReview: myReview ?? null,
      canReview: await this.hasCheckin(seriesId, me),
    };
  }

  /**
   * POST /events/series/:id/review - upsert de la review propia.
   * Gate: check-in válido en un evento de la serie (review probada
   * por asistencia real - modelo Civitatis de reseña verificada).
   */
  @Post("series/:id/review")
  @HttpCode(200)
  async review(
    @Param("id") seriesId: string,
    @Body() dto: ReviewDto,
    @Req() req: Request,
  ) {
    await this.seriesOr404(seriesId);
    const me = req.person!.id;

    if (!(await this.hasCheckin(seriesId, me))) {
      throw new ForbiddenException(
        "necesitas un check-in válido en la serie para evaluarla",
      );
    }

    return this.prisma.seriesReview.upsert({
      where: { seriesId_personId: { seriesId, personId: me } },
      create: {
        seriesId,
        personId: me,
        score: dto.score,
        comment: dto.comment?.trim() || null,
      },
      update: {
        score: dto.score,
        comment: dto.comment?.trim() || null,
      },
      select: { id: true, score: true, comment: true },
    });
  }

  /**
   * GET /events/series/:id/reviews - comentarios individuales. Privado:
   * solo el productor de la serie o un admin. Devueltos ANÓNIMOS -
   * el productor ve score + texto, nunca al autor (regla de plataforma).
   */
  @Get("series/:id/reviews")
  async reviews(@Param("id") seriesId: string, @Req() req: Request) {
    const series = await this.seriesOr404(seriesId);
    const me = req.person!;
    if (
      series.producerId !== me.id &&
      !(await roleKeysHavePermission(this.prisma, me.roles, [
        "admin.access",
      ]))
    ) {
      throw new ForbiddenException(
        "solo el productor de la serie o un admin puede ver los comentarios",
      );
    }

    const rows = await this.prisma.seriesReview.findMany({
      where: { seriesId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        score: true,
        comment: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      score: r.score,
      comment: r.comment,
      createdAt: r.createdAt,
    }));
  }
}
