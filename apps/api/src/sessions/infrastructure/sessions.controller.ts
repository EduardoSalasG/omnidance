import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { QrService } from "../../qr/domain/qr.service";
import { ParamsService } from "../../params/params.service";
import { SESSION_RULES } from "@omnidance/shared";
import {
  SessionDomainError,
  SessionsService,
  type SessionAction,
} from "../domain/sessions.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { GamificationService } from "../../gamification/domain/gamification.service";

class ScanDto {
  @IsString()
  qrToken!: string;

  @IsString()
  eventId!: string;
}

class RateDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  connection?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  comfort?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  musicality?: number;
}

@Controller("sessions")
@UseGuards(SessionGuard)
export class SessionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrService,
    private readonly sessions: SessionsService,
    private readonly params: ParamsService,
    private readonly notifications: NotificationsService,
    private readonly gamification: GamificationService,
  ) {}

  /**
   * Registro de baile por escaneo QR en pista - el único alta de
   * DanceSession "en vivo": el QR rotativo de la pareja acredita la
   * presencia mutua, así que la sesión nace CONFIRMED. No hay ciclo
   * invite/confirm/decline (remove-social-blocks-invites).
   */
  @Post("scan")
  async scan(@Req() req: Request, @Body() dto: ScanDto) {
    const inviterId = req.person!.id;

    let inviteeId: string;
    try {
      ({ personId: inviteeId } = await this.qr.verify(dto.qrToken));
    } catch {
      throw new BadRequestException("qrToken inválido o expirado");
    }

    return this.createScannedSession(inviterId, inviteeId, dto.eventId);
  }

  /**
   * Escaneo QR: crea la sesión directamente CONFIRMED (el escaneo en
   * persona es la confirmación - no hay handshake posterior), notifica a
   * la pareja escaneada y acredita actividad de ambos en gamificación.
   */
  private async createScannedSession(
    inviterId: string,
    inviteeId: string,
    eventId: string,
  ) {
    const { styleId } = await this.validatePairAndStyle(
      inviterId,
      inviteeId,
      eventId,
    );

    const now = new Date();
    const session = await this.prisma.danceSession.create({
      data: {
        eventId,
        inviterId,
        inviteeId,
        styleId,
        status: "CONFIRMED",
        confirmedAt: now,
      },
    });

    // La persona escaneada recibe nombre/foto de quien la registró.
    const inviter = await this.prisma.person.findUnique({
      where: { id: inviterId },
      select: { name: true, photoUrl: true },
    });

    await this.notifications.notifySafe(inviteeId, {
      category: "SOCIAL",
      type: "session.confirmed",
      title: `${inviter?.name ?? "Alguien"} registró un baile contigo`,
      data: { sessionId: session.id },
    });

    // Confirmed desde el origen: evalúa badges de ambos y acredita los
    // puntos de temporada (mismo hook que tenía el confirm del ciclo
    // de invitación).
    await this.safeEvaluateBadges(inviterId);
    await this.safeEvaluateBadges(inviteeId);
    await this.safeAccrue(
      inviterId,
      "session_confirmed",
      "session",
      session.id,
    );
    await this.safeAccrue(
      inviteeId,
      "session_confirmed",
      "session",
      session.id,
    );

    return { ...session, inviter };
  }

  /**
   * Validación del escaneo: evento existe, cooldown del par
   * (~4min, ambas direcciones) y estilo inferido por bloque horario.
   */
  private async validatePairAndStyle(
    inviterId: string,
    inviteeId: string,
    eventId: string,
  ): Promise<{ styleId: string | null }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    // última sesión "viva" del par (INVITED/CONFIRMED), en cualquier dirección
    const lastPair = await this.prisma.danceSession.findFirst({
      where: {
        status: { in: ["INVITED", "CONFIRMED"] },
        OR: [
          { inviterId, inviteeId },
          { inviterId: inviteeId, inviteeId: inviterId },
        ],
      },
      orderBy: { scannedAt: "desc" },
    });

    const cooldownMs =
      (await this.params.getNumber(
        "session.cooldown_minutes",
        SESSION_RULES.INVITE_COOLDOWN_MINUTES,
      )) * 60_000;
    try {
      this.sessions.assertInvitable(
        inviterId,
        inviteeId,
        lastPair,
        new Date(),
        cooldownMs,
      );
    } catch (e) {
      this.toHttp(e);
    }

    // estilo inferido por bloque horario del evento (corregible después)
    const now = new Date();
    const block = await this.prisma.scheduleBlock.findFirst({
      where: {
        eventId,
        styleId: { not: null },
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: { styleId: true },
    });

    return { styleId: block?.styleId ?? null };
  }

  @Post(":id/discard")
  @HttpCode(200)
  discard(@Req() req: Request, @Param("id") id: string) {
    return this.act(id, req.person!.id, "discard");
  }

  @Get("mine")
  async mine(@Req() req: Request, @Query("eventId") eventId?: string) {
    const me = req.person!.id;
    const rows = await this.prisma.danceSession.findMany({
      where: {
        ...(eventId ? { eventId } : {}),
        OR: [{ inviterId: me }, { inviteeId: me }],
      },
      orderBy: { scannedAt: "desc" },
      include: {
        ratings: {
          where: { raterId: me },
          select: {
            global: true,
            connection: true,
            comfort: true,
            musicality: true,
          },
        },
      },
    });

    // Ficha mínima de los eventos para agrupar el historial por noche -
    // DanceSession.eventId es escalar (sin relación), lookup manual.
    const eventIds = [...new Set(rows.map((s) => s.eventId))];
    const events = await this.prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        venue: { select: { name: true } },
      },
    });
    const eventById = new Map(events.map((e) => [e.id, e]));

    const counterpartIds = [
      ...new Set(
        rows.map((s) => (s.inviterId === me ? s.inviteeId : s.inviterId)),
      ),
    ];
    const people = await this.prisma.person.findMany({
      where: { id: { in: counterpartIds } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    const now = new Date();

    return rows.map(({ ratings, ...s }) => {
      const iAmInviter = s.inviterId === me;
      const partner = byId.get(iAmInviter ? s.inviteeId : s.inviterId) ?? null;
      return {
        ...s,
        status: this.sessions.effectiveStatus(s, now),
        role: iAmInviter ? ("inviter" as const) : ("invitee" as const),
        event: eventById.get(s.eventId) ?? null,
        partner,
        myRating: ratings[0] ?? null,
      };
    });
  }

  @Post(":id/rate")
  @HttpCode(200)
  async rate(@Req() req: Request, @Param("id") id: string, @Body() dto: RateDto) {
    const session = await this.prisma.danceSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException("sesión no encontrada");

    const raterId = req.person!.id;
    try {
      this.sessions.assertRateable(session, raterId);
      const global = this.sessions.validateScore(dto.score);
      const data = {
        global,
        connection: this.optionalScore(dto.connection),
        comfort: this.optionalScore(dto.comfort),
        musicality: this.optionalScore(dto.musicality),
      };
      const rating = await this.prisma.sessionRating.upsert({
        where: { sessionId_raterId: { sessionId: id, raterId } },
        create: { sessionId: id, raterId, ...data },
        update: data,
      });

      // La sesión queda RATED (sigue siendo rateable para la contraparte -
      // ver SessionsService.assertRateable).
      await this.prisma.danceSession.update({
        where: { id },
        data: { status: "RATED" },
      });

      // Hook de gamificación: evalúa badges del rater y del rated.
      const ratedId =
        session.inviterId === raterId
          ? session.inviteeId
          : session.inviterId;
      await this.safeEvaluateBadges(raterId);
      await this.safeEvaluateBadges(ratedId);
      await this.safeAccrue(raterId, "rating_closed", "session", id);

      return rating;
    } catch (e) {
      this.toHttp(e);
    }
  }

  // ─── helpers ───

  private optionalScore(v: number | undefined): number | null {
    return v == null ? null : this.sessions.validateScore(v);
  }

  private async act(id: string, actorId: string, action: SessionAction) {
    const session = await this.prisma.danceSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException("sesión no encontrada");
    try {
      const result = this.sessions.transition(session, actorId, action);
      const updated = await this.prisma.danceSession.update({
        where: { id },
        data: {
          status: result.status,
          ...(result.confirmedAt ? { confirmedAt: result.confirmedAt } : {}),
        },
      });

      return updated;
    } catch (e) {
      this.toHttp(e);
    }
  }

  /** Hook de gamificación best-effort (evalúa y otorga badges pendientes). */
  private async safeEvaluateBadges(personId: string): Promise<void> {
    try {
      await this.gamification.evaluateBadgesFor(personId);
    } catch {
      /* gamificación no crítica */
    }
  }

  /** Acredita puntos de temporada best-effort (idempotente por refType/refId). */
  private async safeAccrue(
    personId: string,
    reason: "session_confirmed" | "rating_closed",
    refType: string,
    refId: string,
  ): Promise<void> {
    try {
      await this.gamification.accruePoints(personId, reason, refType, refId);
    } catch {
      /* gamificación no crítica */
    }
  }

  private toHttp(e: unknown): never {
    if (e instanceof SessionDomainError) {
      switch (e.code) {
        case "SELF_INVITE":
        case "INVALID_SCORE":
          throw new BadRequestException(e.message);
        case "FORBIDDEN":
          throw new ForbiddenException(e.message);
        case "PAIR_COOLDOWN":
        case "INVALID_STATE":
          throw new ConflictException(e.message);
      }
    }
    throw e;
  }
}
