import type { Person } from "@prisma/client";

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
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface AuthRepo {
  upsertByEmail(email: string): Promise<Person>;
  findByEmail(email: string): Promise<Person | null>;
  createWithPassword(
    email: string,
    name: string,
    passwordHash: string,
    // Jurisdicción resuelta del país declarado (spec
    // consent-por-jurisdiccion) - undefined deja null → CL por default.
    jurisdiction?: string,
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
}
