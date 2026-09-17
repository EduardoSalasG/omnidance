import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";
import { ParamsModule } from "../params/params.module";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./domain/ports";
import { PricingService } from "./domain/pricing.service";
import { StubGateway } from "./infrastructure/stub.gateway";
import { FlowGateway } from "./infrastructure/flow.gateway";
import {
  CheckoutController,
  TicketsController,
} from "./infrastructure/checkout.controller";
import { PaymentsController } from "./infrastructure/webhook.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, ParamsModule, NotificationsModule],
  controllers: [CheckoutController, TicketsController, PaymentsController],
  providers: [
    PrismaService,
    { provide: PricingService, useFactory: () => new PricingService() },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (): PaymentGateway => {
        const apiKey = process.env.FLOW_API_KEY;
        const secret =
          process.env.FLOW_SECRET ?? process.env.FLOW_SECRET_KEY;
        if (process.env.PAYMENT_GATEWAY === "flow" && apiKey && secret) {
          const apiUrl = process.env.API_URL ?? "http://localhost:4000";
          return new FlowGateway(
            apiKey,
            secret,
            process.env.FLOW_BASE_URL ?? "https://www.flow.cl/api",
            `${apiUrl}/api/payments/webhook`,
          );
        }
        return new StubGateway();
      },
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
