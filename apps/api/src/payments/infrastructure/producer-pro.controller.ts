import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsIn } from "class-validator";
import type { Request } from "express";
import type { BillingCycle } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import {
  PlatformSubscriptionsService,
  type PlatformSubscribeResult,
} from "../application/platform-subscriptions.service";

const BILLING_CYCLES: BillingCycle[] = ["MONTHLY", "SEMIANNUAL", "ANNUAL"];

class SubscribeProducerProDto {
  @IsIn(BILLING_CYCLES)
  cycle!: BillingCycle;

  /** Consentimiento de cargo recurrente (mismo contrato que membresías). */
  @IsBoolean()
  acceptRecurring!: boolean;
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
 * Producer Pro (spec academy-saas-billing): suscripción de plataforma del
 * productor — tier calculado por su facturación (media bruta 90d ÷ 3
 * contra `producer_tier.*_max_monthly_clp`). `:id` es el Person.id del
 * productor; el caller debe ser él mismo o admin.access (mismo gate que
 * producer.controller — permiso DB, nunca rol literal). El retorno del
 * disclaimer es `POST /api/payments/flow/platform-customer-return`.
 *
 * La mora de Producer Pro NO bloquea ticketing ni marketplace — solo
 * avisa (las features Pro las degrada S5).
 */
@Controller("producers")
@UseGuards(SessionGuard)
export class ProducerProController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSubs: PlatformSubscriptionsService,
  ) {}

  /**
   * POST /producers/:id/pro/subscribe {cycle, acceptRecurring} — el tier
   * lo calcula el servicio (PRO_STARTER/PRO_GROWTH según facturación);
   * sobre el tope autogestionado → 400 `tier_limit` (PRO_BIG es manual).
   */
  @Post(":id/pro/subscribe")
  async subscribe(
    @Param("id") id: string,
    @Body() dto: SubscribeProducerProDto,
    @Req() req: Request,
  ) {
    await this.assertProducerSelfOrAdmin(id, req.person!);
    const r = await this.platformSubs.subscribeProducer(id, {
      cycle: dto.cycle,
      acceptRecurring: dto.acceptRecurring,
    });
    return subscribeResponse(r);
  }

  /**
   * POST /producers/:id/pro/cancel — cancela a fin del período pagado
   * (las herramientas Pro siguen hasta `nextInvoiceAt`). Idempotente.
   */
  @Post(":id/pro/cancel")
  async cancel(@Param("id") id: string, @Req() req: Request) {
    await this.assertSelfOrAdmin(id, req.person!);
    return this.platformSubs.cancelProducerSubscription(id);
  }

  /**
   * GET /producers/:id/pro — estado: proTier, suscripción, facturación
   * media 90d vs tope del tier y próxima facturación.
   */
  @Get(":id/pro")
  async view(@Param("id") id: string, @Req() req: Request) {
    await this.assertSelfOrAdmin(id, req.person!);
    return this.platformSubs.producerProView(id);
  }

  /** El caller es el productor mismo o tiene admin.access. */
  private async assertSelfOrAdmin(
    producerId: string,
    person: { id: string; roles: string[] },
  ): Promise<void> {
    if (person.id === producerId) return;
    const isAdmin = await roleKeysHavePermission(this.prisma, person.roles, [
      "admin.access",
    ]);
    if (!isAdmin) {
      throw new ForbiddenException(
        "requiere ser el productor o admin",
      );
    }
  }

  /**
   * Self-or-admin + el target tiene rol PRODUCER APPROVED (contratar Pro
   * para una persona sin rol productor no tiene sentido).
   */
  private async assertProducerSelfOrAdmin(
    producerId: string,
    person: { id: string; roles: string[] },
  ): Promise<void> {
    await this.assertSelfOrAdmin(producerId, person);
    const producer = await this.prisma.personRole.findUnique({
      where: { personId_role: { personId: producerId, role: "PRODUCER" } },
      select: { status: true },
    });
    if (producer?.status !== "APPROVED") {
      throw new NotFoundException("productor no encontrado");
    }
  }
}
