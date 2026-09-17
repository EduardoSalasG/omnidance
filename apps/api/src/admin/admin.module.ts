import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { AdminGuard } from "./infrastructure/admin.guard";
import { AdminController } from "./infrastructure/admin.controller";
import { RolesController } from "./infrastructure/roles.controller";

@Module({
  imports: [AuthModule],
  controllers: [AdminController, RolesController],
  providers: [PrismaService, AdminGuard],
})
export class AdminModule {}
