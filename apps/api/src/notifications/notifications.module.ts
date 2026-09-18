import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { NotificationsService } from "./domain/notifications.service";
import {
  NOTIFICATIONS_REPO,
  PUSH_PORT,
  REALTIME_PORT,
  type NotificationsRepo,
  type PushPort,
  type RealtimePort,
} from "./domain/ports";
import {
  NotificationsController,
  PushTokensController,
} from "./infrastructure/notifications.controller";
import { NotificationsGateway } from "./infrastructure/notifications.gateway";
import { WebPushSender } from "./infrastructure/web-push.sender";
import { PrismaNotificationsRepo } from "./infrastructure/prisma-notifications.repo";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController, PushTokensController],
  providers: [
    { provide: NOTIFICATIONS_REPO, useClass: PrismaNotificationsRepo },
    NotificationsGateway,
    { provide: REALTIME_PORT, useExisting: NotificationsGateway },
    { provide: PUSH_PORT, useClass: WebPushSender },
    {
      provide: NotificationsService,
      useFactory: (
        repo: NotificationsRepo,
        realtime?: RealtimePort,
        push?: PushPort,
      ) => new NotificationsService(repo, realtime, push),
      inject: [
        NOTIFICATIONS_REPO,
        { token: REALTIME_PORT, optional: true },
        { token: PUSH_PORT, optional: true },
      ],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
