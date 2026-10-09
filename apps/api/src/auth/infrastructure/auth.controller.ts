import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  throttleAuthLimit,
  throttleTtlMs,
} from "../../common/throttle.config";
import { AuthService } from "../domain/auth.service";
import type { Mailer, AuthRepo } from "../domain/ports";
import { MAILER, AUTH_REPO } from "../domain/ports";
import { SessionGuard } from "./session.guard";
import { magicLinkEmailHtml, welcomeEmailHtml } from "./emails";

export const SESSION_COOKIE = "omnidance_session";

// Cookie de sesión compartida: la usa este controller (login/register) y
// el acceso demo de leads (POST /leads/:id/demo). Misma config siempre.
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
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

// `consent?: boolean` (spec legal-consent): el front lo manda true cuando
// la persona marcó el checkbox de Términos+Privacidad. No es obligatorio
// a nivel API - cuentas legadas pasan por el aviso in-app (POST
// /me/consent). Si llega true se estampa al crear la sesión.
class ConsentField {
  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}

class MagicLinkDto extends ConsentField {
  @IsEmail()
  email!: string;
}

class PasswordLoginDto extends ConsentField {
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

// Límite estricto anti spam/fuerza bruta (spec api-hardening): pocos
// intentos por IP en magic-link/login/register. Se resuelve por request
// → respeta THROTTLE_AUTH_LIMIT/THROTTLE_TTL_MS de env en runtime.
const AUTH_THROTTLE = {
  default: {
    limit: () => throttleAuthLimit(),
    ttl: () => throttleTtlMs(),
  },
};

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(AUTH_REPO) private readonly repo: AuthRepo,
  ) {}

  /** Bienvenida best-effort: el alta nunca falla por el correo. */
  private async sendWelcome(email: string, name: string) {
    try {
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      await this.mailer.send(
        email,
        `Bienvenido a la pista, ${name.split(" ")[0] || name} 🕺`,
        welcomeEmailHtml(name, webUrl),
      );
    } catch (err) {
      this.logger.warn(
        `welcome email a ${email} falló: ${(err as Error).message}`,
      );
    }
  }

  // El link apunta al ORIGEN WEB (no al API): verify corre a través del
  // proxy /api/* del front, así el Set-Cookie de la sesión cae en el
  // dominio del web - donde la SPA hace todas sus llamadas. Si el link
  // fuera al dominio del API, la cookie quedaría en ese origen y el
  // usuario aterrizaría en el web sin sesión.
  private async sendMagicLink(email: string, consent: boolean) {
    // El consentimiento viaja como claim del token: al abrir el link
    // (verify) se estampa en la Person junto a la sesión.
    const token = await this.auth.createMagicToken(email, consent);
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const link = `${webUrl}/api/auth/verify?token=${token}`;
    await this.mailer.send(
      email,
      "Tu acceso a Omnidance",
      magicLinkEmailHtml(link),
    );
  }

  @Post("magic-link")
  @HttpCode(202)
  @Throttle(AUTH_THROTTLE)
  async magicLink(@Body() dto: MagicLinkDto) {
    await this.sendMagicLink(dto.email.toLowerCase(), dto.consent === true);
    return { sent: true };
  }

  @Post("login")
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
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

    if (dto.consent === true) await this.repo.recordConsent(person.id);
    const session = await this.auth.issueSession(person.id);
    this.setSessionCookie(res, session);
    return { ok: true };
  }

  @Post("register")
  @HttpCode(201)
  @Throttle(AUTH_THROTTLE)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = dto.email.toLowerCase();
    const existing = await this.repo.findByEmail(email);
    if (existing) {
      // Cuenta pre-sembrada (piloto: personas reales con data ya
      // cargada - seed por email). Reclamarla exige probar el correo:
      // si el password coincide equivale a login y la sesión se emite
      // al tiro; si no (o la cuenta nunca tuvo password), se envía un
      // magic link - al verificarlo, upsertByEmail adjunta toda la
      // data sembrada a su sesión.
      if (
        existing.passwordHash &&
        (await this.auth.verifyPassword(dto.password, existing.passwordHash))
      ) {
        if (dto.consent === true) await this.repo.recordConsent(existing.id);
        const session = await this.auth.issueSession(existing.id);
        this.setSessionCookie(res, session);
        return { ok: true };
      }
      // Best-effort: el 409 no cambia si el correo falla - la persona
      // puede reintentar con "acceder por email" desde login.
      try {
        await this.sendMagicLink(email, dto.consent === true);
      } catch (err) {
        this.logger.warn(
          `claim link a ${email} falló: ${(err as Error).message}`,
        );
      }
      throw new ConflictException(
        "Ya existe una cuenta con ese email - te enviamos un link de acceso a tu correo",
      );
    }
    const passwordHash = await this.auth.hashPassword(dto.password);
    const person = await this.repo.createWithPassword(
      email,
      dto.name.trim(),
      passwordHash,
    );
    if (dto.consent === true) await this.repo.recordConsent(person.id);
    await this.sendWelcome(email, person.name);
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
      const { email, consent } = await this.auth.verifyMagicToken(token);
      // Si el correo no existía, el upsert crea la cuenta → bienvenida.
      const existed = await this.repo.findByEmail(email);
      const person = await this.repo.upsertByEmail(email);
      // Checkbox marcado al pedir el link → se estampa al crear sesión.
      if (consent) await this.repo.recordConsent(person.id);
      if (!existed) await this.sendWelcome(email, person.name);
      const session = await this.auth.issueSession(person.id);
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      this.setSessionCookie(res, session);
      // Cuenta recién creada por el verify → paso de perfil
      // post-registro (/bienvenida); cuenta existente → home.
      res.redirect(existed ? `${webUrl}/inicio` : `${webUrl}/bienvenida`);
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

  private setSessionCookie(res: Response, session: string): void {
    setSessionCookie(res, session);
  }
}
