import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { AdminController } from "./infrastructure/admin.controller";
import { CatalogsController } from "./infrastructure/catalogs.controller";
import { RolesController } from "./infrastructure/roles.controller";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdminController, CatalogsController, RolesController],
})
export class AdminModule {}
