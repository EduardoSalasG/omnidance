import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { emitPaymentEvent } from "../domain/payment-ledger";
import { encodePlatformChargeRef } from "../domain/order-ref";
import {
  type CollectResult,
  type PaymentGateway,
  type SubscriptionProvider,
} from "../domain/ports";
import {
  GatewayRegistry,
  PAYMENT_GATEWAYS,
  supportsCurrency,
} from "../domain/gateway-registry";
import { PaymentSettlementService } from "./payment-settlement.service";
import { ensureFlowCustomer } from "./flow-customer";

/** Resultado del cobro suelto para el caller (endpoint admin / job). */
export interface PlatformChargeResult {
  paymentId: string;
  outcome: "COLLECTED" | "PENDING" | "FAILED";
  /** Link de pago cuando el proveedor degradó a cobro por link/email. */
  paymentUrl?: string;
}

/**
 * Cobros sueltos plataforma→actor (spec payments/platform-charges):
 * carga un monto arbitrario sobre el medio de pago registrado del actor
 * (customer del `subscription_gateway`, mismo resolver que
 * PlatformSubscriptionsService) vía `provider.collect()`. Lo usa el
 * endpoint admin POST /admin/platform-charges y lo reusarán jobs
 * futuros (deudas detectadas).
 *
 * Ciclo (mismo patrón que collectOverdueInvoices):
 * 1. Claim `Payment` PENDING (orderType PLATFORM_CHARGE, refId
 *    `platchg_<uuid>` @unique) + evento ORDER_CREATED antes del cargo.
 * 2. `provider.collect()` → outcome:
 *    - COLLECTED: settlePlatformSub-like → PAID con verdad gateway*.
 *    - FAILED: settle a FAILED (tarjeta rechazada).
 *    - PENDING: queda PENDING con `paymentUrl` para cobro por link;
 *      el webhook/polling lo liquida por la misma rama.
 * 3. Error transitorio del proveedor: libera el claim (borra Payment +
 *    eventos) para permitir reintento y propaga 502 al caller.
 *
 * Es ingreso directo de plataforma: fee 0, net = amount, no devenga a
 * ningún actor (igual que PLATFORM_SUB en la consola de finanzas).
 */
@Injectable()
export class PlatformChargesService {
  private readonly logger = new Logger(PlatformChargesService.name);
  private readonly apiUrl = process.env.API_URL ?? "http://localhost:4000";

  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
    private readonly settlement: PaymentSettlementService,
    @Inject(PAYMENT_GATEWAYS)
    private readonly gateways: GatewayRegistry,
  ) {}

  /**
   * Provider de suscripciones (mismo resolver que
   * PlatformSubscriptionsService.subscriptionGateway): param
   * `payments.subscription_gateway` para CLP; otra moneda gana el
   * primer adaptador con motor de suscripciones que la soporte.
   */
  private async subscriptionGateway(
    currency = "CLP",
  ): Promise<PaymentGateway | null> {
    const cur = currency.toUpperCase();
    if (cur === "CLP") {
      const name = await this.params.get("payments.subscription_gateway");
      const gw = this.gateways.resolve(
        typeof name === "string" ? name : null,
      );
      return typeof (gw as Partial<SubscriptionProvider>)
        .createSubscription === "function"
        ? gw
        : null;
    }
    for (const name of this.gateways.names()) {
      const gw = this.gateways.get(name);
      if (
        gw &&
        typeof (gw as Partial<SubscriptionProvider>).createSubscription ===
          "function" &&
        supportsCurrency(gw, cur)
      ) {
        return gw;
      }
    }
    return null;
  }

  /** Provider resuelto + su nombre (auditoría y Payment.gateway). */
  private async provider(currency = "CLP"): Promise<{
    provider: SubscriptionProvider;
    name: string;
  }> {
    const gw = await this.subscriptionGateway(currency);
    if (!gw) {
      throw new BadRequestException(
        currency.toUpperCase() === "CLP"
          ? "el proveedor de suscripciones configurado no tiene motor de suscripciones"
          : `la moneda ${currency.toUpperCase()} no tiene proveedor de suscripciones registrado`,
      );
    }
    return {
      provider: gw as unknown as SubscriptionProvider,
      name: gw.name,
    };
  }

  /**
   * Ejecuta un cobro suelto sobre el medio de pago de `personId`.
   * `actor` es el vocabulario del ledger ("admin" desde la consola,
   * "system"/"cron" desde jobs futuros); `adminId` queda en el payload
   * de ORDER_CREATED para trazabilidad de quién gatilló el cargo.
   */
  async collect(input: {
    personId: string;
    amount: number;
    subject: string;
    actor: string;
    adminId?: string;
    currency?: string;
  }): Promise<PlatformChargeResult> {
    const currency = (input.currency ?? "CLP").toUpperCase();
    // 404 antes de cualquier llamada al proveedor.
    const person = await this.prisma.person.findUnique({
      where: { id: input.personId },
      select: { id: true },
    });
    if (!person) {
      throw new NotFoundException("persona no encontrada");
    }
    const { provider, name: providerName } = await this.provider(currency);
    if (typeof provider.collect !== "function") {
      throw new BadRequestException(
        "el proveedor de suscripciones no soporta cobro on-demand",
      );
    }
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      providerName,
      input.personId,
      { correlationId: randomUUID() },
    );

    // Claim PENDING antes del cargo: el refId @unique serializa contra
    // un segundo cobro concurrente sobre la misma orden.
    const refId = encodePlatformChargeRef();
    const payment = await this.prisma.payment.create({
      data: {
        orderType: "PLATFORM_CHARGE",
        refId,
        personId: input.personId,
        amount: input.amount,
        fee: 0,
        net: input.amount,
        currency,
        gateway: providerName,
      },
    });
    await this.prisma.$transaction((tx) =>
      emitPaymentEvent(tx, payment.id, "ORDER_CREATED", input.actor, {
        refId,
        subject: input.subject,
        amount: input.amount,
        adminId: input.adminId ?? null,
        via: "collect",
      }),
    );

    let res: CollectResult;
    try {
      res = await provider.collect(
        {
          customerId,
          amount: input.amount,
          subject: input.subject,
          commerceOrder: refId,
          returnUrl: `${this.apiUrl}/api/payments/order-return`,
          currency,
        },
        { correlationId: randomUUID() },
      );
    } catch (e) {
      // Error transitorio (red/HTTP del proveedor): se libera el claim
      // para que el reintento no choque con el refId, y el caller ve
      // el fallo como 502 reintentable.
      this.logger.warn(
        `collect platchg ${input.personId}: ${e instanceof Error ? e.message : e}`,
      );
      await this.prisma
        .$transaction(async (tx) => {
          await tx.paymentEvent.deleteMany({
            where: { paymentId: payment.id },
          });
          await tx.payment.delete({ where: { id: payment.id } });
        })
        .catch(() => undefined);
      throw new BadGatewayException(
        "la pasarela no respondió; reintenta el cobro",
      );
    }

    if (res.flowOrder) {
      await this.prisma.payment.updateMany({
        where: { id: payment.id },
        data: { gatewayRef: res.flowOrder },
      });
    }
    const current: Payment = {
      ...payment,
      gatewayRef: res.flowOrder ?? payment.gatewayRef,
    };

    if (res.outcome === "COLLECTED") {
      await this.settlement.settlePlatformCharge(current, {
        actor: input.actor,
        gatewayData: res.gatewayData,
      });
      return { paymentId: payment.id, outcome: "COLLECTED" };
    }
    if (res.outcome === "FAILED") {
      await this.settlement.settle(current, "FAILED", {
        actor: input.actor,
      });
      return { paymentId: payment.id, outcome: "FAILED" };
    }
    return {
      paymentId: payment.id,
      outcome: "PENDING",
      paymentUrl: res.paymentUrl,
    };
  }
}
