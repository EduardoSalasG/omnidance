import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma.module";
import { JobsModule } from "../jobs/jobs.module";
import { ParamsModule } from "../params/params.module";
import { FeaturesModule } from "../features/features.module";
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
import { AdminFeatureFlagsController } from "./infrastructure/feature-flags.controller";
import { AdminCityGuidesController } from "./infrastructure/city-guides.controller";
import { AdminCityGuidesService } from "./application/city-guides.service";
import { AdminPlatformPromosController } from "./infrastructure/platform-promos.controller";
import { AdminTierPricesController } from "./infrastructure/tier-prices.controller";

@Module({
  imports: [
    AuthModule,
    JobsModule,
    NotificationsModule,
    PrismaModule,
    ParamsModule,
    FeaturesModule,
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
    AdminFeatureFlagsController,
    AdminCityGuidesController,
    AdminPlatformPromosController,
    AdminTierPricesController,
  ],
  providers: [AdminBillingService, AdminCityGuidesService],
})
export class AdminModule {}
