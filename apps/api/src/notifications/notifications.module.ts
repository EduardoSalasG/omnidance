import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { NotificationsService } from "./domain/notifications.service";
import { NOTIFICATIONS_REPO, type NotificationsRepo } from "./domain/ports";
import {
  NotificationsController,
  PushTokensController,
} from "./infrastructure/notifications.controller";
import { PrismaNotificationsRepo } from "./infrastructure/prisma-notifications.repo";

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, PushTokensController],
  providers: [
    PrismaService,
    { provide: NOTIFICATIONS_REPO, useClass: PrismaNotificationsRepo },
    {
      provide: NotificationsService,
      useFactory: (repo: NotificationsRepo) => new NotificationsService(repo),
      inject: [NOTIFICATIONS_REPO],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
