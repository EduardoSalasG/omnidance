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

class InviteDto {
  @IsString()
  qrToken!: string;

  @IsString()
  eventId!: string;
}

class DeclareDto {
  @IsString()
  eventId!: string;

  @IsString()
  personId!: string;
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

  @Post("invite")
  async invite(@Req() req: Request, @Body() dto: InviteDto) {
    const inviterId = req.person!.id;

    let inviteeId: string;
    try {
      ({ personId: inviteeId } = await this.qr.verify(dto.qrToken));
    } catch {
      throw new BadRequestException("qrToken inválido o expirado");
    }

    return this.createSessionInvite(inviterId, inviteeId, dto.eventId, false);
  }

  /**
   * Declaración retroactiva (spec-gap-closure: sessions/retro-declared):
   * mismo flujo que invite pero sin QR — la persona se elige manualmente.
   * Cuenta para perfil/historial/streaks, nunca para Prime Time
   * (retroDeclared:true — el repo de gamificación lo filtra).
   */
  @Post("declare")
  async declare(@Req() req: Request, @Body() dto: DeclareDto) {
    const inviterId = req.person!.id;

    const invitee = await this.prisma.person.findUnique({
      where: { id: dto.personId },
      select: { id: true },
    });
    if (!invitee) throw new NotFoundException("persona no encontrada");

    return this.createSessionInvite(inviterId, dto.personId, dto.eventId, true);
  }

  /**
   * Flujo compartido invite/declare: valida evento, enforcement de bloqueos
   * (silencioso — spec §4), cooldown del par, estilo por bloque horario,
   * creación INVITED y notificación a la contraparte.
   */
  private async createSessionInvite(
    inviterId: string,
    inviteeId: string,
    eventId: string,
    retroDeclared: boolean,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    // Enforcement de bloqueos: si el invitee bloqueó al inviter se rechaza
    // con un error genérico — NUNCA revelar la existencia del bloqueo.
    await this.assertNotBlocked(inviterId, inviteeId);

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

    const session = await this.prisma.danceSession.create({
      data: {
        eventId,
        inviterId,
        inviteeId,
        styleId: block?.styleId ?? null,
        retroDeclared,
      },
    });

    // el invitee necesita nombre/foto de quien invita para identificarlo en pista
    const inviter = await this.prisma.person.findUnique({
      where: { id: inviterId },
      select: { name: true, photoUrl: true },
    });

    await this.notifications.notifySafe(inviteeId, {
      category: "SOCIAL",
      type: "session.invite",
      title: `${inviter?.name ?? "Alguien"} te invitó a bailar`,
      data: { sessionId: session.id },
    });

    return { ...session, inviter };
  }

  @Post(":id/confirm")
  @HttpCode(200)
  confirm(@Req() req: Request, @Param("id") id: string) {
    return this.act(id, req.person!.id, "confirm");
  }

  @Post(":id/decline")
  @HttpCode(200)
  decline(@Req() req: Request, @Param("id") id: string) {
    return this.act(id, req.person!.id, "decline");
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

    // Ficha mínima de los eventos para agrupar el historial por noche —
    // DanceSession.eventId es escalar (sin relación), lookup manual.
    const eventIds = [...new Set(rows.map((s) => s.eventId))];
    const events = await this.prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: {
        id: true,
        name: true,
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

      // La sesión queda RATED (sigue siendo rateable para la contraparte —
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

      if (action === "confirm" || action === "decline") {
        const actor = await this.prisma.person.findUnique({
          where: { id: actorId },
          select: { name: true },
        });
        const actorName = actor?.name ?? "Tu pareja de baile";
        await this.notifications.notifySafe(session.inviterId, {
          category: "SOCIAL",
          type:
            action === "confirm" ? "session.confirmed" : "session.declined",
          title:
            action === "confirm"
              ? `${actorName} aceptó bailar contigo`
              : `${actorName} no pudo bailar esta vez`,
          data: { sessionId: id },
        });
      }
      if (action === "confirm") {
        // La sesión ya cuenta como actividad confirmada: evalúa badges de
        // ambos y acredita los puntos de temporada (retro-declaradas también
        // suman — solo Prime Time las excluye).
        await this.safeEvaluateBadges(session.inviterId);
        await this.safeEvaluateBadges(session.inviteeId);
        await this.safeAccrue(
          session.inviterId,
          "session_confirmed",
          "session",
          id,
        );
        await this.safeAccrue(
          session.inviteeId,
          "session_confirmed",
          "session",
          id,
        );
      }

      return updated;
    } catch (e) {
      this.toHttp(e);
    }
  }

  /**
   * Enforcement de user-blocks (spec-gap-closure: safety/user-blocks):
   * si el invitee bloqueó al inviter → 403 genérico. La dirección importa:
   * el bloqueo solo impide invitar a quien te bloqueó, no al revés.
   */
  private async assertNotBlocked(
    inviterId: string,
    inviteeId: string,
  ): Promise<void> {
    const blocked = await this.prisma.userBlock.findFirst({
      where: { blockerId: inviteeId, blockedId: inviterId },
      select: { id: true },
    });
    if (blocked) {
      throw new ForbiddenException("no se puede enviar la invitación");
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
