import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional } from "class-validator";
import type { Request } from "express";
import type { BillingCycle } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  PlatformSubscriptionsService,
  type PlatformSubscribeResult,
} from "../../payments/application/platform-subscriptions.service";
import { AcademyAccess } from "./academy-access.service";

const ACADEMY_TIERS = ["STARTER", "PRO", "STUDIO", "ENTERPRISE"] as const;
const BILLING_CYCLES: BillingCycle[] = ["MONTHLY", "SEMIANNUAL", "ANNUAL"];

class SubscribeAcademyDto {
  @IsIn(ACADEMY_TIERS)
  tier!: string;

  @IsIn(BILLING_CYCLES)
  cycle!: BillingCycle;

  /** Consentimiento de cargo recurrente (mismo contrato que membresías). */
  @IsBoolean()
  acceptRecurring!: boolean;
}

class UpdateAcademySubscriptionDto {
  @IsOptional()
  @IsIn(ACADEMY_TIERS)
  tier?: string;

  @IsOptional()
  @IsIn(BILLING_CYCLES)
  cycle?: BillingCycle;
}

/** Shape uniforme del subscribe: la URL del disclaimer o "ya activa". */
function subscribeResponse(r: PlatformSubscribeResult) {
  return r.kind === "needs_card"
    ? {
        paymentUrl: r.paymentUrl,
        subscriptionId: r.subscriptionId,
        status: "PENDING_CARD",
      }
    : {
        paymentUrl: null,
        subscriptionId: r.subscriptionId,
        status: "ACTIVE",
      };
}

/**
 * Billing SaaS de la academia (spec academy-saas-billing): contratación,
 * cambio de plan, cancelación y vista de billing del owner.
 * Todo pasa por `AcademyAccess.requireCapability("billing")` (owner,
 * mismo gate de los planes/enrollments de la academia); el service
 * verifica el límite de alumnos del tier y el motor Flow replica el ciclo
 * de las membresías de alumnos. El retorno del disclaimer de tarjeta es
 * `POST /api/payments/flow/platform-customer-return` (endpoint público en
 * webhook.controller - equivale al "subscription/activate" de la spec).
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyBillingController {
  constructor(
    private readonly access: AcademyAccess,
    private readonly platformSubs: PlatformSubscriptionsService,
  ) {}

  /**
   * POST /academies/:id/subscribe {tier, cycle, acceptRecurring} - crea
   * la PlatformSubscription PENDING_CARD y devuelve `paymentUrl` (URL del
   * disclaimer Flow) para registrar la tarjeta; si el pagador ya tiene
   * tarjeta el alta es directa (`status: "ACTIVE"`).
   * 400 `tier_limit` si los alumnos activos superan el tope del tier.
   */
  @Post(":id/subscribe")
  async subscribe(
    @Param("id") id: string,
    @Body() dto: SubscribeAcademyDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapability(id, req.person!, "billing");
    const r = await this.platformSubs.subscribeAcademy(req.person!.id, academy, {
      tier: dto.tier,
      cycle: dto.cycle,
      acceptRecurring: dto.acceptRecurring,
    });
    return subscribeResponse(r);
  }

  /**
   * PATCH /academies/:id/subscription {tier?, cycle?} - upgrade de tier
   * inmediato (swap de plan Flow, cobra el ciclo nuevo ya); downgrade o
   * cambio de ciclo queda pendiente (`pendingTier`/`pendingCycle`) y
   * aplica al próximo ciclo. 400 `tier_limit` si el tier destino no
   * cabe los alumnos activos.
   */
  @Patch(":id/subscription")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateAcademySubscriptionDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapability(id, req.person!, "billing");
    const sub = await this.platformSubs.updateAcademySubscription(
      req.person!.id,
      academy,
      { tier: dto.tier, cycle: dto.cycle },
    );
    return {
      subscriptionId: sub.id,
      status: sub.status,
      tier: sub.tierCode,
      cycle: sub.billingCycle,
      pendingTier: sub.pendingTierCode,
      pendingCycle: sub.pendingBillingCycle,
      nextInvoiceAt: sub.nextInvoiceAt,
    };
  }

  /**
   * POST /academies/:id/subscription/cancel - cancela a fin del período
   * pagado (el plan sigue activo hasta `nextInvoiceAt`). Idempotente.
   */
  @Post(":id/subscription/cancel")
  async cancel(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "billing");
    return this.platformSubs.cancelAcademySubscription(id);
  }

  /**
   * GET /academies/:id/billing - vista de billing del owner: tier/ciclo
   * vigentes y pendientes, alumnos activos vs límite, próxima
   * facturación, trial, gracia restante, bloqueo e invoices (Payment
   * PLATFORM_SUB de sus suscripciones).
   */
  @Get(":id/billing")
  async billing(@Param("id") id: string, @Req() req: Request) {
    const { academy } = await this.access.requireCapability(id, req.person!, "billing");
    return this.platformSubs.academyBillingView(academy);
  }
}
