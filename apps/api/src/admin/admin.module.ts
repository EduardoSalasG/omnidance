import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { ParamsModule } from "../params/params.module";
import { AdminController } from "./infrastructure/admin.controller";
import { CatalogsController } from "./infrastructure/catalogs.controller";
import { AdminProducerParamsController } from "./infrastructure/producer-params.controller";
import { RolesController } from "./infrastructure/roles.controller";

@Module({
  imports: [AuthModule, PrismaModule, ParamsModule],
  controllers: [
    AdminController,
    CatalogsController,
    AdminProducerParamsController,
    RolesController,
  ],
})
export class AdminModule {}
