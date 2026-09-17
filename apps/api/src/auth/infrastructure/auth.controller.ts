import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { IsEmail } from "class-validator";
import type { Response } from "express";
import { AuthService } from "../domain/auth.service";
import type { Mailer, AuthRepo } from "../domain/ports";
import { MAILER, AUTH_REPO } from "../domain/ports";

export const SESSION_COOKIE = "omnidance_session";

class MagicLinkDto {
  @IsEmail()
  email!: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(AUTH_REPO) private readonly repo: AuthRepo,
  ) {}

  @Post("magic-link")
  @HttpCode(202)
  async magicLink(@Body() dto: MagicLinkDto) {
    const token = await this.auth.createMagicToken(dto.email.toLowerCase());
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    const link = `${apiUrl}/api/auth/verify?token=${token}`;
    await this.mailer.send(
      dto.email,
      "Tu acceso a Omnidance",
      `<p>Entra a Omnidance con este link (válido 15 min):</p><p><a href="${link}">${link}</a></p>`,
    );
    return { sent: true };
  }

  @Get("verify")
  async verify(@Query("token") token: string, @Res() res: Response) {
    try {
      const { email } = await this.auth.verifyMagicToken(token);
      const person = await this.repo.upsertByEmail(email);
      const session = await this.auth.issueSession(person.id);
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      res
        .cookie(SESSION_COOKIE, session, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        })
        .redirect(webUrl);
    } catch {
      throw new UnauthorizedException("Link inválido o expirado");
    }
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }
}
