import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { AuthService } from "./domain/auth.service";
import { AuthController } from "./infrastructure/auth.controller";
import { PrismaAuthRepo } from "./infrastructure/prisma-auth.repo";
import { ResendMailer } from "./infrastructure/resend-mailer";

import { MAILER, AUTH_REPO } from "./domain/ports";
import { secretOrDevFallback } from "../common/env";

export { MAILER, AUTH_REPO };

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthService,
      useFactory: () =>
        new AuthService(secretOrDevFallback("JWT_SECRET", "dev-secret-change-me")),
    },
    { provide: MAILER, useClass: ResendMailer },
    { provide: AUTH_REPO, useClass: PrismaAuthRepo },
  ],
  exports: [AuthService, AUTH_REPO],
})
export class AuthModule {}
