import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import {
  EventNotFoundError,
  GamificationService,
  MissionNotFoundError,
} from "../domain/gamification.service";

class RecalcProgressDto {
  @IsString()
  missionId!: string;

  /** Default: el autenticado. Otro personId requiere permiso social.manage. */
  @IsOptional()
  @IsString()
  personId?: string;
}

function mapDomainError(e: unknown): never {
  if (e instanceof EventNotFoundError || e instanceof MissionNotFoundError) {
    throw new NotFoundException(e.message);
  }
  throw e;
}

@Controller("gamification")
@UseGuards(SessionGuard)
export class GamificationController {
  constructor(
    private readonly gamification: GamificationService,
    private readonly prisma: PrismaService,
  ) {}

  /** Racha semanal: semanas consecutivas con ≥1 check-in o sesión CONFIRMED. */
  @Get("me/streak")
  streak(@Req() req: Request) {
    return this.gamification.streakFor(req.person!.id);
  }

  /** Badges ganados (award lazy: evalúa reglas de conducta al consultar). */
  @Get("me/badges")
  badges(@Req() req: Request) {
    return this.gamification.badgesFor(req.person!.id);
  }

  /**
   * Puntos de temporada del autenticado: total + breakdown por conducta
   * de la Season activa (o de todas las entradas si no hay season activa).
   */
  @Get("me/points")
  points(@Req() req: Request) {
    return this.gamification.pointsFor(req.person!.id);
  }

  /** Recálculo interno de progreso misión × persona. */
  @Post("progress")
  @HttpCode(200)
  async progress(@Req() req: Request, @Body() dto: RecalcProgressDto) {
    const me = req.person!;
    const personId = dto.personId ?? me.id;
    // Recalcular a otro es operación de staff: permiso social.manage (DB).
    if (
      personId !== me.id &&
      !(await roleKeysHavePermission(this.prisma, me.roles, [
        "social.manage",
      ]))
    ) {
      throw new ForbiddenException(
        "solo staff/admin puede recalcular progreso de otra persona",
      );
    }
    try {
      return await this.gamification.recalcProgress(dto.missionId, personId);
    } catch (e) {
      mapDomainError(e);
    }
  }
}

/**
 * Endpoints públicos por evento: leaderboard y prime-time no exponen datos
 * sensibles (nombre + count agregado con k-anonymity; ver rules.maskSmallCount).
 */
@Controller("events")
export class EventGamificationController {
  constructor(private readonly gamification: GamificationService) {}

  /**
   * Leaderboard Prime Time por rol (inviter≈leader / invitee≈follower, v1).
   * Visible SOLO con evento LIVE o CLOSED — antes devuelve listas vacías.
   */
  @Get(":eventId/leaderboard")
  async leaderboard(@Param("eventId") eventId: string) {
    try {
      return await this.gamification.leaderboardForEvent(eventId);
    } catch (e) {
      mapDomainError(e);
    }
  }

  /**
   * Contador Prime Time (REST polling en v1 — sin websocket):
   * threshold (override o ~20% aforo), current en ventana, unlocked.
   */
  @Get(":eventId/prime-time")
  async primeTime(@Param("eventId") eventId: string) {
    try {
      return await this.gamification.primeTimeFor(eventId);
    } catch (e) {
      mapDomainError(e);
    }
  }

  /**
   * Reveal Prime Time (público — la pantalla del local/DJ lo muestra en
   * vivo y los ganadores se anuncian en el evento). Sin desbloqueo →
   * {unlocked:false}; desbloqueado antes del fin de ventana →
   * {unlocked:true, revealed:false} (el reveal es a las 00:00); después →
   * ganadores por score bayesiano + Pareja de la noche, con coronas
   * PersonBadge(+7d) otorgadas idempotentemente.
   */
  @Get(":eventId/prime-time/reveal")
  async primeTimeReveal(@Param("eventId") eventId: string) {
    try {
      return await this.gamification.primeTimeRevealFor(eventId);
    } catch (e) {
      mapDomainError(e);
    }
  }

  /** Misiones del evento + progreso del usuario autenticado (recálculo lazy). */
  @Get(":eventId/missions")
  @UseGuards(SessionGuard)
  async missions(@Param("eventId") eventId: string, @Req() req: Request) {
    try {
      return await this.gamification.missionsFor(eventId, req.person!.id);
    } catch (e) {
      mapDomainError(e);
    }
  }
}
