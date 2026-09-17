import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { SESSION_RULES } from "@omnidance/shared";
import { ParamsService } from "../params/params.service";
import { GamificationService } from "../gamification/domain/gamification.service";
import { QrService } from "./domain/qr.service";

@Controller("qr")
export class QrController {
  constructor(
    private readonly qr: QrService,
    private readonly params: ParamsService,
    private readonly gamification: GamificationService,
  ) {}

  /**
   * QR rotativo del autenticado + badge destacado que se exhibe al ser
   * escaneado (featured elegido → corona Prime Time vigente → null).
   */
  @Get("mine")
  @UseGuards(SessionGuard)
  async mine(@Req() req: Request) {
    const ttl = await this.params.getNumber(
      "qr.rotation_seconds",
      SESSION_RULES.QR_ROTATION_SECONDS,
    );
    const mint = await this.qr.mint(req.person!.id, ttl);
    return {
      ...mint,
      featuredBadge: await this.featuredBadge(req.person!.id),
    };
  }

  /** Featured badge best-effort: gamificación nunca rompe el mint del QR. */
  private async featuredBadge(
    personId: string,
  ): Promise<{ key: string; name: string } | null> {
    try {
      return (await this.gamification.featuredBadgeFor(personId)) ?? null;
    } catch {
      return null;
    }
  }
}
