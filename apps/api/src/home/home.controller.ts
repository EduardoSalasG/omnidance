import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { HomeService } from "./home.service";

/**
 * GET /api/home/stats?role=X&mode=Y — KPIs del home según la lente activa.
 * role valida contra PersonRole aprobado (DANCER siempre permitido);
 * mode solo aplica a DANCER ("social" | "academy").
 */
@Controller("home")
@UseGuards(SessionGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get("stats")
  stats(
    @Req() req: Request,
    @Query("role") role = "DANCER",
    @Query("mode") mode = "social",
  ) {
    return this.home.statsFor(req.person!.id, role, mode);
  }
}
