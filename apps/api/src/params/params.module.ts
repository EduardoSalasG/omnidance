import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import {
  AdminParamsController,
  PublicParamsController,
} from "./params.controller";
import { ParamsService } from "./params.service";

@Module({
  imports: [AuthModule],
  controllers: [PublicParamsController, AdminParamsController],
  providers: [PrismaService, ParamsService],
  exports: [ParamsService],
})
export class ParamsModule {}
