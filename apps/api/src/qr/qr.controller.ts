import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { QrService } from "./domain/qr.service";

@Controller("qr")
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get("mine")
  @UseGuards(SessionGuard)
  mine(@Req() req: Request) {
    return this.qr.mint(req.person!.id);
  }
}
