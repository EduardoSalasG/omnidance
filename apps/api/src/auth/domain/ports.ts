import type { AuthSession, Person } from "@prisma/client";
import type { ResolvedAcquisition } from "./acquisition";

export const MAILER = "MAILER";
export const AUTH_REPO = "AUTH_REPO";

export interface Mailer {
  send(to: string, subject: string, html: string): Promise<void>;
}

// Fila persistida de un OTP de acceso (spec auth-email-otp).
export interface AuthOtpRecord {
  id: string;
  email: string;
  codeHash: string;
  consent: boolean;
  role: string | null;
  // Destino interno post-onboarding (spec academies/student-invites) -
  // viaja como `role`/`consent`: de la fila al verify.
  next: string | null;
  // Capture de adquisición orgánica (spec auth/acquisition-source):
  // viaja como `role`/`consent`/`next` - de la fila al verify.
  acquisition: unknown;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface AuthRepo {
  // `acquisition` (spec auth/acquisition-source): fuente orgánica ya
  // normalizada - se aplica SOLO al crear la Person; una existente
  // conserva su fuente original.
  upsertByEmail(
    email: string,
    acquisition?: ResolvedAcquisition,
  ): Promise<Person>;
  findByEmail(email: string): Promise<Person | null>;
  createWithPassword(
    email: string,
    name: string,
    passwordHash: string,
    // Jurisdicción resuelta del país declarado (spec
    // consent-por-jurisdiccion) - undefined deja null → CL por default.
    jurisdiction?: string,
    acquisition?: ResolvedAcquisition,
  ): Promise<Person>;
  setPassword(personId: string, passwordHash: string): Promise<void>;
  // Admins APPROVED que reciben el aviso de registro nuevo (spec
  // notifications/admin-alerts).
  approvedAdminIds(): Promise<string[]>;
  // Ajusta la jurisdicción legal de una Person existente (register
  // sobre cuenta pre-sembrada con país declarado).
  setJurisdiction(personId: string, jurisdiction: string): Promise<void>;
  findById(
    id: string,
  ): Promise<(Person & { roles: { role: string; status: string }[] }) | null>;

  // OTP de acceso por email (spec auth-email-otp). El código nunca se
  // persiste en claro - llega ya hasheado desde el service.
  createOtp(data: {
    email: string;
    codeHash: string;
    consent: boolean;
    role?: string;
    next?: string;
    acquisition?: ResolvedAcquisition;
    expiresAt: Date;
  }): Promise<void>;
  // Registro por landing (spec role-registration-pipeline): garantiza
  // el PersonRole PENDING del rol pedido en ?role= - idempotente, no
  // toca roles ya existentes (PENDING/APPROVED/REJECTED se respetan).
  ensurePendingRole(personId: string, role: string): Promise<void>;
  // Marca consumedAt=now en todos los OTP sin consumir del email: una
  // nueva solicitud deja un solo código válido.
  consumeActives(email: string): Promise<void>;
  // Último OTP no consumido del email (puede estar expirado o bloqueado
  // por intentos - eso lo decide el service).
  findActiveOtp(email: string): Promise<AuthOtpRecord | null>;
  bumpAttempts(id: string): Promise<void>;
  consumeOtp(id: string): Promise<void>;

  // Magic token consumible (spec api-hardening/auth): el magic link es
  // JWT stateless - esta marca persistida lo vuelve single-use. Inserta
  // la fila MagicTokenUse(tokenHash) de forma atómica: `true` = este
  // llamado consumió el token; `false` = ya estaba consumido (unique).
  consumeMagicToken(data: {
    tokenHash: string;
    email: string;
  }): Promise<boolean>;

  // ─── Sesiones persistidas (spec auth-sessions) ───
  // Una fila AuthSession por JWT de sesión emitido (claim `jti`). Los
  // métodos se llaman con optional-chaining donde el repo puede ser un
  // fake legado sin ellos (mismo criterio que consumeMagicToken): sin
  // persistencia queda comportamiento JWT puro.

  /** Fila al emitir la sesión - va ANTES de firmar el JWT. */
  createAuthSession(data: {
    jti: string;
    personId: string;
    userAgent?: string;
    ip?: string;
  }): Promise<void>;

  /** Lookup del guard: sesión viva = fila existe y revokedAt es null. */
  findAuthSessionByJti(
    jti: string,
  ): Promise<Pick<AuthSession, "id" | "revokedAt" | "lastSeenAt"> | null>;

  /** Muestreo de actividad (máx 1 write/min por jti - lo regula el guard). */
  touchAuthSession(jti: string): Promise<void>;

  /** Sesiones de la persona (activas y revocadas), recientes primero. */
  listAuthSessions(personId: string): Promise<AuthSession[]>;

  /**
   * Revoca por id devolviendo filas afectadas (updateMany). `personId`
   * presente = check de ownership para el self-service.
   */
  revokeAuthSession(id: string, personId?: string): Promise<number>;

  /** "Cerrar otras sesiones": todas las activas menos la del jti actual. */
  revokeOtherAuthSessions(
    personId: string,
    exceptJti?: string,
  ): Promise<number>;

  /** Admin: mata TODAS las sesiones de la persona (incluye la vigente). */
  revokeAllAuthSessions(personId: string): Promise<number>;
}
