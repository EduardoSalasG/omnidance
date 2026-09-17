import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QrModule } from "../qr/qr.module";
import { PrismaModule } from "../prisma.module";
import { GamificationModule } from "../gamification/gamification.module";
import { CheckinsService } from "./domain/checkins.service";
import { CHECKINS_REPO, type CheckinsRepo } from "./domain/ports";
import {
  CheckinsController,
  EventCheckinsController,
} from "./infrastructure/checkins.controller";
import { PrismaCheckinsRepo } from "./infrastructure/prisma-checkins.repo";

@Module({
  imports: [AuthModule, QrModule, GamificationModule, PrismaModule],
  controllers: [CheckinsController, EventCheckinsController],
  providers: [
    { provide: CHECKINS_REPO, useClass: PrismaCheckinsRepo },
    {
      provide: CheckinsService,
      useFactory: (repo: CheckinsRepo) => new CheckinsService(repo),
      inject: [CHECKINS_REPO],
    },
  ],
  exports: [CheckinsService],
})
export class CheckinsModule {}
