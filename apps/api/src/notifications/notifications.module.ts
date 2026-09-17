import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { NotificationsService } from "./domain/notifications.service";
import { NOTIFICATIONS_REPO, type NotificationsRepo } from "./domain/ports";
import {
  NotificationsController,
  PushTokensController,
} from "./infrastructure/notifications.controller";
import { PrismaNotificationsRepo } from "./infrastructure/prisma-notifications.repo";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController, PushTokensController],
  providers: [
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
