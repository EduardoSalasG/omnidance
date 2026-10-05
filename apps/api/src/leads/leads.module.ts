import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthModule } from "../auth/auth.module";
import { LeadsController } from "./leads.controller";

@Module({
  imports: [PrismaModule, NotificationsModule, AuthModule],
  controllers: [LeadsController],
})
export class LeadsModule {}
