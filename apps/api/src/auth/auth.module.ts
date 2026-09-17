import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AuthService } from "./domain/auth.service";
import { AuthController } from "./infrastructure/auth.controller";
import { PrismaAuthRepo } from "./infrastructure/prisma-auth.repo";
import { ResendMailer } from "./infrastructure/resend-mailer";

import { MAILER, AUTH_REPO } from "./domain/ports";

export { MAILER, AUTH_REPO };

@Module({
  controllers: [AuthController],
  providers: [
    PrismaService,
    {
      provide: AuthService,
      useFactory: () =>
        new AuthService(process.env.JWT_SECRET ?? "dev-secret-change-me"),
    },
    { provide: MAILER, useClass: ResendMailer },
    { provide: AUTH_REPO, useClass: PrismaAuthRepo },
  ],
  exports: [AuthService, AUTH_REPO],
})
export class AuthModule {}
