import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { ParamsModule } from "../params/params.module";
import { AdminController } from "./infrastructure/admin.controller";
import { BrowseController } from "./infrastructure/browse.controller";
import { CatalogsController } from "./infrastructure/catalogs.controller";
import { AdminProducerParamsController } from "./infrastructure/producer-params.controller";
import { SupportController } from "./infrastructure/support.controller";
import { UserIntelController } from "./infrastructure/user-intel.controller";

@Module({
  imports: [AuthModule, PrismaModule, ParamsModule],
  controllers: [
    AdminController,
    BrowseController,
    CatalogsController,
    AdminProducerParamsController,
    SupportController,
    UserIntelController,
  ],
})
export class AdminModule {}
