import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "./prisma.service";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { PeopleModule } from "./people/people.module";
import { QrModule } from "./qr/qr.module";
import { EventsModule } from "./events/events.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PeopleModule,
    QrModule,
    EventsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
