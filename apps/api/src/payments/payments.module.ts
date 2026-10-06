import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { ParamsModule } from "../params/params.module";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./domain/ports";
import {
  GatewayRegistry,
  PAYMENT_GATEWAYS,
} from "./domain/gateway-registry";
import { PricingService } from "./domain/pricing.service";
import { StubGateway } from "./infrastructure/stub.gateway";
import { FlowGateway } from "./infrastructure/flow.gateway";
import { MercadoPagoGateway } from "./infrastructure/mercadopago.gateway";
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
import { GatewayAccountsService } from "./application/gateway-accounts.service";
import { PaymentSettlementService } from "./application/payment-settlement.service";
import { PayoutSettlementService } from "./application/payout-settlement.service";
import { SubscriptionsService } from "./application/subscriptions.service";
import { PlatformSubscriptionsService } from "./application/platform-subscriptions.service";
import { SubscriptionsController } from "./infrastructure/subscriptions.controller";
import { ProducerGatewayAccountsController } from "./infrastructure/producer-gateway.controller";
import { ProducerClaimsController } from "./infrastructure/producer-claims.controller";
import { ProducerClaimsService } from "./infrastructure/producer-claims.service";
import { ProducerProController } from "./infrastructure/producer-pro.controller";
import { SubscriptionsScheduler } from "./infrastructure/subscriptions.scheduler";
import { NotificationsModule } from "../notifications/notifications.module";
import { AcademyAccessModule } from "../academies/academy-access.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [
    AuthModule,
    ParamsModule,
    NotificationsModule,
    PrismaModule,
    AcademyAccessModule,
    StorageModule,
  ],
  controllers: [
    CheckoutController,
    TicketsController,
    PaymentsController,
    AdminPayoutsController,
    MePayoutsController,
    SubscriptionsController,
    ProducerGatewayAccountsController,
    ProducerClaimsController,
    ProducerProController,
  ],
  providers: [
    CheckoutService,
    GatewayAccountsService,
    ProducerClaimsService,
    PaymentSettlementService,
    PayoutSettlementService,
    SubscriptionsService,
    PlatformSubscriptionsService,
    SubscriptionsScheduler,
    GatewayTransactionsService,
    { provide: PricingService, useFactory: () => new PricingService() },
    {
      provide: PAYMENT_GATEWAYS,
      useFactory: (prisma: PrismaService): GatewayRegistry => {
        const txWriter = new GatewayTransactionsService(prisma);
        return resolveGateways(process.env, (e) => txWriter.record(e));
      },
      inject: [PrismaService],
    },
    {
      // Compat: los consumers que inyectan el gateway único (checkout,
      // subscriptions) reciben el default del registry - comportamiento
      // idéntico al resolveGateway anterior.
      provide: PAYMENT_GATEWAY,
      useFactory: (registry: GatewayRegistry): PaymentGateway =>
        registry.default(),
      inject: [PAYMENT_GATEWAYS],
    },
  ],
  exports: [
    PAYMENT_GATEWAY,
    PAYMENT_GATEWAYS,
    GatewayTransactionsService,
    GatewayAccountsService,
    PaymentSettlementService,
    PayoutSettlementService,
    SubscriptionsService,
    PlatformSubscriptionsService,
  ],
})
export class PaymentsModule {}

const SANDBOX_BASE_URL = "https://sandbox.flow.cl/api";

/**
 * Selección del gateway por env. PAYMENT_GATEWAY=flow + credenciales
 * (FLOW_API_KEY / FLOW_SECRET_KEY - el alias FLOW_SECRET queda por
 * compatibilidad) instancia FlowGateway; cualquier otro caso usa el
 * StubGateway de desarrollo. Solo sandbox por ahora: FLOW_BASE_URL debe
 * ser https://sandbox.flow.cl/api - producción se habilita tras validar
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
      `${apiUrl}/api/payments/subscription-webhook`,
    );
  }
  // Fail-close: el stub acepta webhooks sin firma - jamás en producción.
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PAYMENT_GATEWAY=flow con FLOW_API_KEY/FLOW_SECRET es requerido en producción (StubGateway deshabilitado)",
    );
  }
  return new StubGateway();
}

/**
 * Registry multi-proveedor (spec gateway-port-normalization): instancia
 * todos los adaptadores con credenciales disponibles y los indexa por
 * name (FLOW / MERCADOPAGO / STUB). El default sigue la misma regla de
 * `resolveGateway` (PAYMENT_GATEWAY=flow o stub según env) - los
 * providers extra quedan disponibles para `webhook/:provider` y la
 * selección por param `payments.default_gateway` sin cambiar el
 * comportamiento actual.
 *
 * MercadoPago se registra cuando existe MERCADOPAGO_ACCESS_TOKEN -
 * convive con Flow: cada orden persiste Payment.gateway y el webhook
 * :provider la confirma con su adaptador.
 */
export function resolveGateways(
  env: NodeJS.ProcessEnv,
  onTx?: (e: GatewayTxEntry) => Promise<void>,
): GatewayRegistry {
  const adapters: PaymentGateway[] = [resolveGateway(env, onTx)];
  if (env.MERCADOPAGO_ACCESS_TOKEN) {
    const apiUrl = env.API_URL ?? "http://localhost:4000";
    adapters.push(
      new MercadoPagoGateway(
        env.MERCADOPAGO_ACCESS_TOKEN,
        env.MERCADOPAGO_BASE_URL ?? "https://api.mercadopago.com",
        `${apiUrl}/api/payments/webhook/MERCADOPAGO`,
        onTx,
      ),
    );
  }
  return new GatewayRegistry(adapters, adapters[0].name);
}
