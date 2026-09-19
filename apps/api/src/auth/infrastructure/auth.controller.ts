import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { AuthService } from "../domain/auth.service";
import type { Mailer, AuthRepo } from "../domain/ports";
import { MAILER, AUTH_REPO } from "../domain/ports";
import { SessionGuard } from "./session.guard";

export const SESSION_COOKIE = "omnidance_session";

class MagicLinkDto {
  @IsEmail()
  email!: string;
}

class PasswordLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class RegisterDto extends PasswordLoginDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

class SetPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

// Rate limit in-memory para /auth/login: max 10 intentos fallidos por
// email+IP en ventana de 10 min. Suficiente a escala dev/monolito; en
// multi-instancia se reemplaza por Redis o ThrottlerModule.
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, number[]>();

function recentFailures(key: string): number[] {
  const now = Date.now();
  const hits = (loginAttempts.get(key) ?? []).filter(
    (t) => now - t < LOGIN_WINDOW_MS,
  );
  loginAttempts.set(key, hits);
  return hits;
}

function recordFailure(key: string) {
  recentFailures(key).push(Date.now());
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

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: PasswordLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = dto.email.toLowerCase();
    const key = `${email}|${req.ip ?? "?"}`;
    // Error uniforme: no revela si el email existe o si el password falló.
    const invalid = () =>
      new UnauthorizedException("Email o contraseña inválidos");

    if (recentFailures(key).length >= LOGIN_MAX_ATTEMPTS) {
      throw invalid();
    }

    const person = await this.repo.findByEmail(email);
    const ok =
      person?.passwordHash &&
      (await this.auth.verifyPassword(dto.password, person.passwordHash));
    if (!ok) {
      recordFailure(key);
      throw invalid();
    }
    // Login exitoso limpia los fallos previos de la ventana.
    loginAttempts.delete(key);

    const session = await this.auth.issueSession(person.id);
    this.setSessionCookie(res, session);
    return { ok: true };
  }

  @Post("register")
  @HttpCode(201)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = dto.email.toLowerCase();
    const existing = await this.repo.findByEmail(email);
    if (existing) {
      throw new ConflictException("Ya existe una cuenta con ese email");
    }
    const passwordHash = await this.auth.hashPassword(dto.password);
    const person = await this.repo.createWithPassword(
      email,
      dto.name.trim(),
      passwordHash,
    );
    const session = await this.auth.issueSession(person.id);
    this.setSessionCookie(res, session);
    return { ok: true };
  }

  // Crear/cambiar contraseña de la cuenta propia (sesión activa requerida).
  // Cubre a usuarios que entraron por magic link y quieren habilitar
  // el login con contraseña después.
  @Post("password")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async setPassword(@Req() req: Request, @Body() dto: SetPasswordDto) {
    const hash = await this.auth.hashPassword(dto.password);
    await this.repo.setPassword(req.person!.id, hash);
    return { ok: true };
  }

  @Get("verify")
  async verify(@Query("token") token: string, @Res() res: Response) {
    try {
      const { email } = await this.auth.verifyMagicToken(token);
      const person = await this.repo.upsertByEmail(email);
      const session = await this.auth.issueSession(person.id);
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      this.setSessionCookie(res, session).redirect(webUrl);
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

  private setSessionCookie(res: Response, session: string): Response {
    return res.cookie(SESSION_COOKIE, session, {
      httpOnly: true,
      // SESSION_SAMESITE=none + secure para acceso cross-site (p.ej.
      // dev tunnels: web y API en hosts distintos).
      sameSite: (process.env.SESSION_SAMESITE ?? "lax") as
        | "lax"
        | "strict"
        | "none",
      secure:
        process.env.SESSION_SAMESITE === "none" ||
        process.env.SESSION_SECURE === "true" ||
        process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
