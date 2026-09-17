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
import {
  EventNotFoundError,
  GamificationService,
  MissionNotFoundError,
} from "../domain/gamification.service";

class RecalcProgressDto {
  @IsString()
  missionId!: string;

  /** Default: el autenticado. Otro personId requiere rol ADMIN/STAFF. */
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
  constructor(private readonly gamification: GamificationService) {}

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

  /** Recálculo interno de progreso misión × persona. */
  @Post("progress")
  @HttpCode(200)
  async progress(@Req() req: Request, @Body() dto: RecalcProgressDto) {
    const me = req.person!;
    const personId = dto.personId ?? me.id;
    if (
      personId !== me.id &&
      !me.roles.some((r) => r === "ADMIN" || r === "STAFF")
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
