import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { ParamsModule } from "../params/params.module";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./domain/ports";
import { PricingService } from "./domain/pricing.service";
import { StubGateway } from "./infrastructure/stub.gateway";
import { FlowGateway } from "./infrastructure/flow.gateway";
import {
  GatewayTransactionsService,
  type GatewayTxEntry,
} from "./infrastructure/gateway-transactions.service";
import { PrismaService } from "../prisma.service";
import { CheckoutController } from "./infrastructure/checkout.controller";
import { TicketsController } from "./infrastructure/tickets.controller";
import { PaymentsController } from "./infrastructure/webhook.controller";
import {
  AdminPayoutsController,
  MePayoutsController,
} from "./infrastructure/payouts.controller";
import { CheckoutService } from "./application/checkout.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, ParamsModule, NotificationsModule, PrismaModule],
  controllers: [
    CheckoutController,
    TicketsController,
    PaymentsController,
    AdminPayoutsController,
    MePayoutsController,
  ],
  providers: [
    CheckoutService,
    GatewayTransactionsService,
    { provide: PricingService, useFactory: () => new PricingService() },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (prisma: PrismaService): PaymentGateway => {
        const txWriter = new GatewayTransactionsService(prisma);
        return resolveGateway(process.env, (e) => txWriter.record(e));
      },
      inject: [PrismaService],
    },
  ],
  exports: [PAYMENT_GATEWAY, GatewayTransactionsService],
})
export class PaymentsModule {}

const SANDBOX_BASE_URL = "https://sandbox.flow.cl/api";

/**
 * Selección del gateway por env. PAYMENT_GATEWAY=flow + credenciales
 * (FLOW_API_KEY / FLOW_SECRET_KEY — el alias FLOW_SECRET queda por
 * compatibilidad) instancia FlowGateway; cualquier otro caso usa el
 * StubGateway de desarrollo. Solo sandbox por ahora: FLOW_BASE_URL debe
 * ser https://sandbox.flow.cl/api — producción se habilita tras validar
 * el flujo end-to-end contra el sandbox.
 */
export function resolveGateway(
  env: NodeJS.ProcessEnv,
  onTx?: (e: GatewayTxEntry) => Promise<void>,
): PaymentGateway {
  const apiKey = env.FLOW_API_KEY;
  const secret = env.FLOW_SECRET ?? env.FLOW_SECRET_KEY;
  if (env.PAYMENT_GATEWAY === "flow") {
    if (!apiKey || !secret) {
      throw new Error(
        "PAYMENT_GATEWAY=flow requiere FLOW_API_KEY y FLOW_SECRET_KEY (sandbox: sandbox.flow.cl → Mis datos → Integraciones)",
      );
    }
    const baseUrl = env.FLOW_BASE_URL ?? SANDBOX_BASE_URL;
    if (baseUrl !== SANDBOX_BASE_URL) {
      throw new Error(
        `FLOW_BASE_URL debe ser ${SANDBOX_BASE_URL} (integración en sandbox-only); recibido: ${baseUrl}`,
      );
    }
    const apiUrl = env.API_URL ?? "http://localhost:4000";
    return new FlowGateway(
      apiKey,
      secret,
      baseUrl,
      `${apiUrl}/api/payments/webhook`,
      onTx,
    );
  }
  // Fail-close: el stub acepta webhooks sin firma — jamás en producción.
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PAYMENT_GATEWAY=flow con FLOW_API_KEY/FLOW_SECRET es requerido en producción (StubGateway deshabilitado)",
    );
  }
  return new StubGateway();
}
