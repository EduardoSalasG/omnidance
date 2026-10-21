import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsNotEmpty, IsString, Matches } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { PayoutDestinationService } from "../application/payout-destination.service";

const ACTOR_TYPES = ["PRODUCER", "ACADEMY", "VENUE"] as const;

/**
 * Alta de destino de desembolso Connect (spec payouts/payout-rails):
 * el actor declara a qué cuenta quiere sus liquidaciones. country es
 * ISO-2 del país de la cuenta Express (MX, US, … - el mercado lo
 * decide el actor, no se deduce).
 */
class CreatePayoutDestinationDto {
  /** PRODUCER (la persona misma) | ACADEMY | VENUE (propiedad del actor). */
  @IsIn(ACTOR_TYPES)
  actorType!: string;

  @IsString()
  @IsNotEmpty()
  actorId!: string;

  /** ISO-2 en mayúsculas del país de la cuenta Connect Express. */
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  country!: string;
}

/**
 * Destinos de desembolso del actor autenticado (spec
 * payouts/payout-rails): POST crea la cuenta Connect Express y devuelve
 * el onboardingUrl (Account Link); GET lista los destinos propios con
 * refresh best-effort del estado contra Stripe. Misma regla de
 * ownership y permiso que GET /me/payouts (crm.manage).
 */
@Controller("me/payout-destinations")
@UseGuards(SessionGuard, RolesGuard)
export class PayoutDestinationsController {
  constructor(private readonly destinations: PayoutDestinationService) {}

  @Post()
  @RequirePermissions("crm.manage")
  create(@Req() req: Request, @Body() dto: CreatePayoutDestinationDto) {
    return this.destinations.create(req.person!.id, dto);
  }

  @Get()
  @RequirePermissions("crm.manage")
  list(@Req() req: Request) {
    return this.destinations.listFor(req.person!.id);
  }
}
