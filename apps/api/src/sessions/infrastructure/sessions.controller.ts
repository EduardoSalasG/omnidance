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
import {
  SessionDomainError,
  SessionsService,
  type SessionAction,
} from "../domain/sessions.service";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly qr: QrService,
    private readonly sessions: SessionsService,
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

    try {
      this.sessions.assertInvitable(inviterId, inviteeId, lastPair);
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
      return await this.prisma.sessionRating.upsert({
        where: { sessionId_raterId: { sessionId: id, raterId } },
        create: { sessionId: id, raterId, ...data },
        update: data,
      });
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
      return await this.prisma.danceSession.update({
        where: { id },
        data: {
          status: result.status,
          ...(result.confirmedAt ? { confirmedAt: result.confirmedAt } : {}),
        },
      });
    } catch (e) {
      this.toHttp(e);
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
