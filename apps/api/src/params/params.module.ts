import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import {
  AdminParamsController,
  PublicParamsController,
} from "./params.controller";
import { ParamsService } from "./params.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PublicParamsController, AdminParamsController],
  providers: [ParamsService],
  exports: [ParamsService],
})
export class ParamsModule {}
