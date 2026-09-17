import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";
import { QrModule } from "../qr/qr.module";
import { ParamsModule } from "../params/params.module";
import { SessionsService } from "./domain/sessions.service";
import { SessionsController } from "./infrastructure/sessions.controller";

@Module({
  imports: [AuthModule, QrModule, ParamsModule],
  controllers: [SessionsController],
  providers: [
    PrismaService,
    { provide: SessionsService, useFactory: () => new SessionsService() },
  ],
})
export class SessionsModule {}
