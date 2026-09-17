import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { GamificationService } from "./domain/gamification.service";
import { GAMIFICATION_REPO, type GamificationRepo } from "./domain/ports";
import {
  EventGamificationController,
  GamificationController,
} from "./infrastructure/gamification.controller";
import { PrismaGamificationRepo } from "./infrastructure/prisma-gamification.repo";

@Module({
  imports: [AuthModule],
  controllers: [GamificationController, EventGamificationController],
  providers: [
    PrismaService,
    { provide: GAMIFICATION_REPO, useClass: PrismaGamificationRepo },
    {
      provide: GamificationService,
      useFactory: (repo: GamificationRepo) => new GamificationService(repo),
      inject: [GAMIFICATION_REPO],
    },
  ],
  exports: [GamificationService],
})
export class GamificationModule {}
