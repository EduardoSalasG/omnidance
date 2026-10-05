import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { SubscriptionsService } from "../application/subscriptions.service";

/**
 * Suscripciones del usuario autenticado (motor Flow). Todo es owner-only:
 * el service verifica que la sub pertenezca al autenticado (404 si no).
 * Los callbacks públicos de Flow viven en webhook.controller.ts.
 */
@Controller("subscriptions")
@UseGuards(SessionGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  /** Suscripciones del usuario con plan + academia. */
  @Get("mine")
  mine(@Req() req: Request) {
    return this.subscriptions.listMine(req.person!.id);
  }

  /**
   * Detalle con refresh activo contra Flow (subscription/get + reconcile
   * de invoices pagados) - cubre sandbox/dev donde el webhook no llega.
   */
  @Get(":id")
  detail(@Req() req: Request, @Param("id") id: string) {
    return this.subscriptions.getForOwner(req.person!.id, id);
  }

  /**
   * Cancela al fin del período ya pagado (Flow at_period_end=1).
   * Idempotente: una sub ya CANCEL_PENDING/CANCELED responde OK.
   */
  @Post(":id/cancel")
  cancel(@Req() req: Request, @Param("id") id: string) {
    return this.subscriptions.cancel(req.person!.id, id);
  }
}
