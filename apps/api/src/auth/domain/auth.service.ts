import {
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type BinaryLike,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import type { AuthRepo } from "./ports";

// El overload con `options` existe en runtime pero @types/node no lo
// expone en la firma promisificada - se declara aquí explícitamente.
const scryptAsync = promisify(scrypt) as unknown as (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

// Formato del hash: scrypt$N$r$p$salt$hash (salt y hash en hex).
// Self-describing para permitir rotar parámetros sin romper hashes viejos.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export class AuthService {
  private readonly key: Uint8Array;

  // `repo` es opcional: solo lo usan los métodos OTP (spec
  // auth-email-otp) - JWT y passwords son puros. El módulo lo inyecta;
  // en specs de JWT/password no hace falta.
  constructor(
    secret: string,
    private readonly repo?: AuthRepo,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  issueSession(personId: string): Promise<string> {
    return new SignJWT({ purpose: "session" })
      .setSubject(personId)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(this.key);
  }

  // `consent` viaja dentro del token: quien pidió el link marcó el
  // checkbox en el form → al verificar (GET /auth/verify, al crear la
  // sesión) se estampa en la Person (spec legal-consent).
  // `ttl` opcional: las invitaciones (staff/import de alumnos, spec
  // academy-staff-roles) necesitan un link que dure días, no 15min.
  // `role` opcional (spec role-registration-pipeline): landings de
  // actores mandan ?role=ACADEMY_OWNER|PRODUCER - viaja en el token y
  // verify() crea el PersonRole PENDING al entrar.
  createMagicToken(
    email: string,
    consent = false,
    ttl: string | number = "15m",
    role?: string,
  ): Promise<string> {
    return new SignJWT({
      purpose: "magic",
      email,
      ...(consent ? { consent: true } : {}),
      ...(role ? { role } : {}),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(ttl)
      .sign(this.key);
  }

  async verifyMagicToken(
    token: string,
  ): Promise<{ email: string; consent: boolean; role?: string }> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload.purpose !== "magic" || typeof payload.email !== "string") {
      throw new Error("invalid magic token");
    }
    return {
      email: payload.email,
      consent: payload.consent === true,
      role: typeof payload.role === "string" ? payload.role : undefined,
    };
  }

  async verifySession(token: string): Promise<{ personId: string }> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload.purpose !== "session" || !payload.sub) {
      throw new Error("invalid session token");
    }
    return { personId: payload.sub };
  }

  async hashPassword(password: string): Promise<string> {
    const { N, r, p, keylen } = SCRYPT_PARAMS;
    const salt = randomBytes(16);
    const hash = (await scryptAsync(password, salt, keylen, { N, r, p })) as Buffer;
    return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
    const [N, r, p] = [Number(nStr), Number(rStr), Number(pStr)];
    const expected = Buffer.from(hashHex, "hex");
    if (!N || !r || !p || !saltHex || expected.length === 0) return false;
    const salt = Buffer.from(saltHex, "hex");
    const actual = (await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      // scrypt lanza si el costo excede maxmem por defecto con N altos
      maxmem: 128 * N * r * 2,
    })) as Buffer;
    return timingSafeEqual(actual, expected);
  }

  // ─── OTP de acceso por email (spec auth-email-otp) ───
  // 6 dígitos, TTL ~10min, máx 5 intentos, single-use real (fila en DB:
  // un JWT no es revocable ni consumible). El código viaja en el mismo
  // correo que el magic link - solo sale del service para ir al email,
  // nunca a logs ni respuestas.

  private otpRepo(): AuthRepo {
    if (!this.repo) throw new Error("AuthService sin repo: OTP no disponible");
    return this.repo;
  }

  // sha256(code + secreto JWT como pepper) - mismo patrón de secreto que
  // inyecta auth.module.
  private hashOtpCode(code: string): Buffer {
    return createHash("sha256").update(code).update(this.key).digest();
  }

  /** Genera el código, consume los activos previos del email y persiste el hash. Devuelve el código en claro solo para el email. */
  async createOtp(
    email: string,
    consent = false,
    role?: string,
  ): Promise<string> {
    const repo = this.otpRepo();
    await repo.consumeActives(email);
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await repo.createOtp({
      email,
      codeHash: this.hashOtpCode(code).toString("hex"),
      consent,
      role,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    return code;
  }

  /**
   * Verifica y consume el código del email. Lanza ante cualquier fallo
   * (sin OTP, expirado, consumido, intentos agotados, código incorrecto) -
   * el controller lo traduce a un 401 uniforme.
   */
  async verifyOtp(
    email: string,
    code: string,
  ): Promise<{ email: string; consent: boolean; role?: string }> {
    const repo = this.otpRepo();
    const otp = await repo.findActiveOtp(email);
    const invalid = () => new Error("invalid otp");
    if (
      !otp ||
      otp.consumedAt ||
      otp.expiresAt.getTime() <= Date.now() ||
      otp.attempts >= OTP_MAX_ATTEMPTS
    ) {
      throw invalid();
    }
    const expected = Buffer.from(otp.codeHash, "hex");
    const actual = this.hashOtpCode(code);
    if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
      await repo.bumpAttempts(otp.id);
      throw invalid();
    }
    await repo.consumeOtp(otp.id);
    return { email: otp.email, consent: otp.consent, role: otp.role ?? undefined };
  }
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
