import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "./prisma.service";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { PeopleModule } from "./people/people.module";
import { QrModule } from "./qr/qr.module";
import { EventsModule } from "./events/events.module";
import { SessionsModule } from "./sessions/sessions.module";
import { CheckinsModule } from "./checkins/checkins.module";
import { PaymentsModule } from "./payments/payments.module";
import { DiscountsModule } from "./discounts/discounts.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { SocialModule } from "./social/social.module";
import { AcademiesModule } from "./academies/academies.module";
import { AdminModule } from "./admin/admin.module";
import { GamificationModule } from "./gamification/gamification.module";
import { ParamsModule } from "./params/params.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PeopleModule,
    QrModule,
    EventsModule,
    SessionsModule,
    CheckinsModule,
    PaymentsModule,
    DiscountsModule,
    NotificationsModule,
    SocialModule,
    AcademiesModule,
    AdminModule,
    GamificationModule,
    ParamsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
