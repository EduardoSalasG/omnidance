import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma.module";
import { JobsModule } from "../jobs/jobs.module";
import { ParamsModule } from "../params/params.module";
import { StorageModule } from "../storage/storage.module";
import { AdminController } from "./infrastructure/admin.controller";
import { AdminBillingService } from "./application/billing.service";
import {
  AdminBillingController,
  MeBillingController,
} from "./infrastructure/billing.controller";
import { AdminFinanceController } from "./infrastructure/finance.controller";
import { BrowseController } from "./infrastructure/browse.controller";
import { CatalogsController } from "./infrastructure/catalogs.controller";
import { AdminProducerParamsController } from "./infrastructure/producer-params.controller";
import { SupportController } from "./infrastructure/support.controller";
import { UserIntelController } from "./infrastructure/user-intel.controller";
import { AdminJobsController } from "./infrastructure/jobs.controller";

@Module({
  imports: [
    AuthModule,
    JobsModule,
    NotificationsModule,
    PrismaModule,
    ParamsModule,
    PaymentsModule,
    StorageModule,
  ],
  controllers: [
    AdminController,
    AdminBillingController,
    MeBillingController,
    AdminFinanceController,
    BrowseController,
    CatalogsController,
    AdminProducerParamsController,
    SupportController,
    UserIntelController,
    AdminJobsController,
  ],
  providers: [AdminBillingService],
})
export class AdminModule {}
