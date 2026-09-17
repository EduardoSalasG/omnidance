import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { ParamsService } from "../params/params.service";
import { QrService } from "./domain/qr.service";

@Controller("qr")
export class QrController {
  constructor(
    private readonly qr: QrService,
    private readonly params: ParamsService,
  ) {}

  @Get("mine")
  @UseGuards(SessionGuard)
  async mine(@Req() req: Request) {
    const ttl = await this.params.getNumber("qr.rotation_seconds", 60);
    return this.qr.mint(req.person!.id, ttl);
  }
}
