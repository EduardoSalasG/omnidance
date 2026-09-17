import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Optional,
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
import {
  NotificationsService,
  type NotifyInput,
} from "../../notifications/domain/notifications.service";
import { GamificationService } from "../../gamification/domain/gamification.service";

class InviteDto {
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
  // NotificationsService y GamificationService son @Optional: SessionsModule
  // aún no importa NotificationsModule/GamificationModule (pendiente de wiring
  // — ver handoff). Una vez importados se resuelven solos; sin ellos los hooks
  // son no-op y el flujo de dominio no se rompe.
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrService,
    private readonly sessions: SessionsService,
    private readonly params: ParamsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly gamification?: GamificationService,
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

    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
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
        eventId: dto.eventId,
        styleId: { not: null },
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: { styleId: true },
    });

    const session = await this.prisma.danceSession.create({
      data: {
        eventId: dto.eventId,
        inviterId,
        inviteeId,
        styleId: block?.styleId ?? null,
      },
    });

    // el invitee necesita nombre/foto de quien invita para identificarlo en pista
    const inviter = await this.prisma.person.findUnique({
      where: { id: inviterId },
      select: { name: true, photoUrl: true },
    });

    await this.safeNotify(inviteeId, {
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
        await this.safeNotify(session.inviterId, {
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
        // La sesión ya cuenta como actividad confirmada: evalúa badges de ambos.
        await this.safeEvaluateBadges(session.inviterId);
        await this.safeEvaluateBadges(session.inviteeId);
      }

      return updated;
    } catch (e) {
      this.toHttp(e);
    }
  }

  /**
   * Notificación best-effort: un fallo del centro de notificaciones (o la
   * ausencia del provider mientras el módulo no esté wireado) nunca rompe el
   * flujo de dominio.
   */
  private async safeNotify(
    personId: string,
    input: NotifyInput,
  ): Promise<void> {
    try {
      await this.notifications?.notify(personId, input);
    } catch {
      /* notificación no crítica */
    }
  }

  /** Hook de gamificación best-effort (evalúa y otorga badges pendientes). */
  private async safeEvaluateBadges(personId: string): Promise<void> {
    try {
      await this.gamification?.evaluateBadgesFor(personId);
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
