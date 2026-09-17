import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { QrModule } from "../qr/qr.module";
import { CheckinsService } from "./domain/checkins.service";
import { CHECKINS_REPO, type CheckinsRepo } from "./domain/ports";
import {
  CheckinsController,
  EventCheckinsController,
} from "./infrastructure/checkins.controller";
import { PrismaCheckinsRepo } from "./infrastructure/prisma-checkins.repo";

@Module({
  imports: [AuthModule, QrModule],
  controllers: [CheckinsController, EventCheckinsController],
  providers: [
    PrismaService,
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
