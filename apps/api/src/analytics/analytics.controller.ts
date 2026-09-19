import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { AnalyticsService } from "./analytics.service";

/**
 * Métricas por lente de gestión (spec analytics): ADMIN/PRODUCER/
 * ACADEMY_OWNER/VENUE_MANAGER. ?role= valida que el rol esté aprobado —
 * pedir uno no aprobado o sin analítica → 403.
 */
@Controller("analytics")
@UseGuards(SessionGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Lentes con analítica disponibles para el usuario (selector de la UI). */
  @Get("roles")
  roles(@Req() req: Request) {
    return this.analytics.availableRoles(req.person!.id);
  }

  @Get("summary")
  async summary(@Req() req: Request, @Query("role") role?: string) {
    const result = await this.analytics.summaryFor(
      req.person!.id,
      role ?? "",
    );
    if (!result) {
      throw new ForbiddenException(
        "tu rol no tiene analítica o no está aprobado",
      );
    }
    return result;
  }
}
