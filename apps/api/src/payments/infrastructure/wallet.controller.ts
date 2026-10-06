import {
  Controller,
  Get,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { WalletService } from "../application/wallet.service";

/**
 * Wallet passes (spec wallet-passes): saveUrl de Google Wallet como
 * lanzador del QR personal. 503 `wallet.not_configured` sin
 * credenciales - el front oculta el botón en ese caso.
 */
@Controller("wallet")
@UseGuards(SessionGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get("google")
  async google(@Req() req: Request) {
    const saveUrl = await this.wallet.googleSaveUrl(req.person!.id);
    if (!saveUrl)
      throw new ServiceUnavailableException({
        error: "wallet.not_configured",
        message: "Google Wallet no está configurado",
      });
    return { saveUrl };
  }
}
