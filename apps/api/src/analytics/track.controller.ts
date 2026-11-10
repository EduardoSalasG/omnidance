import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { OptionalSessionGuard } from "../auth/infrastructure/optional-session.guard";
import { PrismaService } from "../prisma.service";
import { throttleTtlMs } from "../common/throttle.config";

// Whitelist corta de eventos aceptados (spec auth-sessions): el beacon
// es público - solo se persisten tipos conocidos en AnalyticsEvent.
const TRACK_EVENTS = ["app.launch"] as const;
const DISPLAY_MODES = ["standalone", "browser"] as const;

export class TrackEventDto {
  @IsIn(TRACK_EVENTS)
  @ApiProperty({ enum: TRACK_EVENTS })
  event!: string;

  @IsOptional()
  @IsIn(DISPLAY_MODES)
  @ApiPropertyOptional({ enum: DISPLAY_MODES })
  displayMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional()
  platform?: string;
}

// Límite dedicado del beacon (spec api-hardening): endpoint público de
// escritura - se resuelve por request para respetar la env en runtime,
// mismo patrón que AUTH_THROTTLE en auth.controller.
const TRACK_THROTTLE = {
  default: {
    limit: () => {
      const parsed = Number.parseInt(
        process.env.THROTTLE_TRACK_LIMIT ?? "",
        10,
      );
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
    },
    ttl: () => throttleTtlMs(),
  },
};

/**
 * Telemetría de instalación/dispositivo (spec auth-sessions): público y
 * opcionalmente autenticado - con sesión válida persiste personId, sin
 * ella el evento queda anónimo y cuenta igual en la entidad
 * `dispositivos`. La metadata va en payload: {displayMode, platform, ua}
 * con el User-Agent del header (nunca identificadores estables de
 * dispositivo - el evento es agregable).
 */
@Controller("analytics")
export class AnalyticsTrackController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("track")
  @UseGuards(OptionalSessionGuard)
  @Throttle(TRACK_THROTTLE)
  async track(@Body() body: TrackEventDto, @Req() req: Request) {
    const ua = req.headers["user-agent"];
    await this.prisma.analyticsEvent.create({
      data: {
        type: body.event,
        personId: req.person?.id ?? null,
        payload: {
          displayMode: body.displayMode ?? null,
          platform: body.platform ?? null,
          ua: typeof ua === "string" ? ua.slice(0, 300) : null,
        },
      },
    });
    return { ok: true };
  }
}
