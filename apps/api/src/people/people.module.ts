import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LegalModule } from "../legal/legal.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ParamsModule } from "../params/params.module";
import { PrismaModule } from "../prisma.module";
import { PeopleController } from "./people.controller";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    NotificationsModule,
    LegalModule,
    ParamsModule,
  ],
  controllers: [PeopleController],
})
export class PeopleModule {}
