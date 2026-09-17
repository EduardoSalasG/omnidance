import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ParamsModule } from "../params/params.module";
import { PrismaModule } from "../prisma.module";
import { ParamsService } from "../params/params.service";
import { GamificationService } from "./domain/gamification.service";
import { GAMIFICATION_REPO, type GamificationRepo } from "./domain/ports";
import {
  EventGamificationController,
  GamificationController,
} from "./infrastructure/gamification.controller";
import { PrismaGamificationRepo } from "./infrastructure/prisma-gamification.repo";

@Module({
  imports: [AuthModule, ParamsModule, PrismaModule],
  controllers: [GamificationController, EventGamificationController],
  providers: [
    { provide: GAMIFICATION_REPO, useClass: PrismaGamificationRepo },
    {
      provide: GamificationService,
      useFactory: (repo: GamificationRepo, params: ParamsService) =>
        new GamificationService(repo, undefined, params),
      inject: [GAMIFICATION_REPO, ParamsService],
    },
  ],
  exports: [GamificationService],
})
export class GamificationModule {}
