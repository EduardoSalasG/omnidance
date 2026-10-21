import {
  BadRequestException,
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
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  throttleAuthLimit,
  throttleTtlMs,
} from "../../common/throttle.config";
import { AuthService } from "../domain/auth.service";
import { ConsentService } from "../../legal/consent.service";
import { resolveJurisdiction } from "../../legal/jurisdiction";
import type { Mailer, AuthRepo } from "../domain/ports";
import { MAILER, AUTH_REPO } from "../domain/ports";
import { SessionGuard } from "./session.guard";
import {
  magicLinkEmailHtml,
  verifyEmailHtml,
  welcomeEmailHtml,
} from "./emails";

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

  // Rol pedido desde una landing de actor (?role=) - viaja al magic
  // token/OTP y crea el PersonRole PENDING al entrar (spec
  // role-registration-pipeline). Solo ACADEMY_OWNER/PRODUCER.
  @IsOptional()
  @IsString()
  role?: string;
}

// Roles registrables por landing - cualquier otro valor de ?role= se
// ignora en silencio (no es canal para pedir ADMIN ni similares).
const LANDING_ROLES = new Set(["ACADEMY_OWNER", "PRODUCER"]);
const landingRole = (role?: string) =>
  role && LANDING_ROLES.has(role) ? role : undefined;

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

// Scopes granulares declarados en el alta (spec
// consent-por-jurisdiccion): EU exige opt-in separado de
// marketing/analytics; el servidor solo persiste los que el LegalText
// vigente de la jurisdicción declara en requiredScopes.
class RegisterScopesDto {
  @IsOptional()
  @IsBoolean()
  essential?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsBoolean()
  analytics?: boolean;
}

class RegisterDto extends PasswordLoginDto {
  @IsString()
  @MinLength(2)
  name!: string;

  // País declarado (ISO-3166 alpha-2): resuelve Person.jurisdiction
  // (UE/EEE/GB → EU, resto/ausencia → CL).
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  country?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RegisterScopesDto)
  scopes?: RegisterScopesDto;
}

class SetPasswordDto {
  // Obligatoria cuando la cuenta YA tiene passwordHash (spec
  // cambiar-password) - se valida en el handler, que conoce el estado
  // persistido. Cuentas magic-link-only la omiten.
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class OtpVerifyDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
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
    // Registro auditable del consentimiento (ConsentRecord + snapshot)
    // - compartido con POST /me/consent (spec consent-por-jurisdiccion).
    private readonly consentService: ConsentService,
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
  private async sendMagicLink(
    email: string,
    consent: boolean,
    role?: string,
    purpose: "access" | "verify" = "access",
  ) {
    // Consentimiento y rol pedido viajan como claims del token y en la
    // fila del OTP: ambos caminos los estampan al crear la sesión.
    const token = await this.auth.createMagicToken(email, consent, "15m", role);
    const code = await this.auth.createOtp(email, consent, role);
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const link = `${webUrl}/api/auth/verify?token=${token}`;
    // "verify" es el correo post-registro con password: no es un acceso
    // pedido - es la confirmación de posesión del correo (spec
    // auth/email-verification). Copy dedicado para no confundir.
    if (purpose === "verify") {
      await this.mailer.send(
        email,
        "Verifica tu correo en Omnidance",
        verifyEmailHtml(link, code),
      );
    } else {
      await this.mailer.send(
        email,
        "Tu acceso a Omnidance",
        magicLinkEmailHtml(link, code),
      );
    }
  }

  @Post("magic-link")
  @HttpCode(202)
  @Throttle(AUTH_THROTTLE)
  async magicLink(@Body() dto: MagicLinkDto) {
    await this.sendMagicLink(
      dto.email.toLowerCase(),
      dto.consent === true,
      landingRole(dto.role),
    );
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
    // Cuenta con baja lógica: mismo error genérico que credenciales
    // inválidas - no revela que el email existe (spec
    // admin-user-soft-delete).
    const ok =
      person &&
      !person.deletedAt &&
      person.passwordHash &&
      (await this.auth.verifyPassword(dto.password, person.passwordHash));
    if (!ok) {
      recordFailure(key);
      throw invalid();
    }
    // Login exitoso limpia los fallos previos de la ventana.
    loginAttempts.delete(key);

    if (dto.consent === true) {
      await this.consentService.recordAcceptance(person.id);
    }
    // Login con password desde una landing de actor también adjunta el
    // rol pedido (PENDING si aún no existía).
    const role = landingRole(dto.role);
    if (role) await this.repo.ensurePendingRole(person.id, role);
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
        // País declarado en un re-registro: actualiza la jurisdicción
        // (alta inicial sin country deja CL por default).
        if (dto.country) {
          await this.repo.setJurisdiction(
            existing.id,
            resolveJurisdiction(dto.country),
          );
        }
        if (dto.consent === true) {
          await this.consentService.recordAcceptance(
            existing.id,
            dto.scopes,
          );
        }
        const session = await this.auth.issueSession(existing.id);
        this.setSessionCookie(res, session);
        return { ok: true };
      }
      // Best-effort: el 409 no cambia si el correo falla - la persona
      // puede reintentar con "acceder por email" desde login.
      try {
        await this.sendMagicLink(email, dto.consent === true, landingRole(dto.role));
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
      // Jurisdicción legal del país declarado (CL si no declara).
      resolveJurisdiction(dto.country),
    );
    const role = landingRole(dto.role);
    if (role) await this.repo.ensurePendingRole(person.id, role);
    // Consent declarado en el alta → ConsentRecord auditable con los
    // scopes de la jurisdicción (spec consent-por-jurisdiccion).
    if (dto.consent === true) {
      await this.consentService.recordAcceptance(person.id, dto.scopes);
    }
    await this.sendWelcome(email, person.name);
    // Correo de acceso (link+OTP) = verificación de posesión del email
    // (spec auth-email-verification) - la cuenta con password nace sin
    // verifiedAt y el checklist de actores lo exige. Best-effort: el
    // alta nunca falla por el correo.
    try {
      await this.sendMagicLink(
        email,
        dto.consent === true,
        landingRole(dto.role),
        "verify",
      );
    } catch (err) {
      this.logger.warn(
        `verification link a ${email} falló: ${(err as Error).message}`,
      );
    }
    const session = await this.auth.issueSession(person.id);
    this.setSessionCookie(res, session);
    return { ok: true };
  }

  /**
   * Reenvío del correo de verificación para cuentas con password (spec
   * auth-email-verification): link+OTP prueban la posesión del email.
   * Idempotente - si el correo ya está verificado no reenvía.
   */
  @Post("resend-verification")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @Throttle(AUTH_THROTTLE)
  async resendVerification(@Req() req: Request) {
    const person = await this.repo.findById(req.person!.id);
    if (person?.verifiedAt) return { ok: true, alreadyVerified: true };
    if (!person?.email) {
      throw new BadRequestException("la cuenta no tiene email");
    }
    await this.sendMagicLink(person.email, false, undefined, "verify");
    return { ok: true };
  }

  // Crear/cambiar contraseña de la cuenta propia (sesión activa requerida).
  // Cubre a usuarios que entraron por magic link y quieren habilitar
  // el login con contraseña después. Misma regla que PUT /me/password
  // (spec cambiar-password): con hash existente la actual es requerida
  // y verificada - una sesión activa ya no cambia el password en
  // silencio. Superficie legacy: el front usa PUT /me/password.
  @Post("password")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async setPassword(@Req() req: Request, @Body() dto: SetPasswordDto) {
    const person = await this.repo.findById(req.person!.id);
    if (person?.passwordHash) {
      const ok =
        !!dto.currentPassword &&
        (await this.auth.verifyPassword(
          dto.currentPassword,
          person.passwordHash,
        ));
      if (!ok) throw new BadRequestException("password.incorrect");
      if (dto.password === dto.currentPassword) {
        throw new BadRequestException("password.same");
      }
    }
    const hash = await this.auth.hashPassword(dto.password);
    await this.repo.setPassword(req.person!.id, hash);
    return { ok: true };
  }

  @Get("verify")
  @Throttle(AUTH_THROTTLE)
  async verify(@Query("token") token: string, @Res() res: Response) {
    try {
      const { email, consent, role } =
        await this.auth.verifyMagicToken(token);
      // Si el correo no existía, el upsert crea la cuenta → bienvenida.
      const existed = await this.repo.findByEmail(email);
      const person = await this.repo.upsertByEmail(email);
      // Checkbox marcado al pedir el link → se estampa al crear sesión.
      if (consent) await this.consentService.recordAcceptance(person.id);
      // Rol pedido desde la landing (?role= viaja en el token).
      if (role) await this.repo.ensurePendingRole(person.id, role);
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

  // Verificación del código OTP que viaja en el mismo correo que el magic
  // link (spec auth/email-otp): mismo desenlace que GET /auth/verify pero
  // responde JSON - lo llama la app instalada sin salir de su contexto.
  @Post("otp/verify")
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  async otpVerify(
    @Body() dto: OtpVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const email = dto.email.toLowerCase();
      const { consent, role } = await this.auth.verifyOtp(email, dto.code);
      const existed = await this.repo.findByEmail(email);
      const person = await this.repo.upsertByEmail(email);
      if (consent) await this.consentService.recordAcceptance(person.id);
      if (role) await this.repo.ensurePendingRole(person.id, role);
      if (!existed) await this.sendWelcome(email, person.name);
      const session = await this.auth.issueSession(person.id);
      this.setSessionCookie(res, session);
      return { ok: true, isNew: !existed };
    } catch {
      // Uniforme: no revela si el email existe ni por qué falló el código.
      throw new UnauthorizedException("Código inválido o expirado");
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
