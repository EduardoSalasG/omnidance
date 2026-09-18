import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ParamsModule } from "../params/params.module";
import { PrismaModule } from "../prisma.module";
import { CrmService } from "./domain/crm.service";
import { CrmController } from "./infrastructure/crm.controller";
import { CrmTriggersScheduler } from "./infrastructure/crm-triggers.scheduler";

/** CRM transversal: scores, tags, campañas y triggers por actor (producer/academy). */
@Module({
  imports: [PrismaModule, NotificationsModule, ParamsModule, AuthModule],
  controllers: [CrmController],
  providers: [CrmService, CrmTriggersScheduler],
})
export class CrmModule {}
