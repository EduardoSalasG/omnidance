import { SESSION_RULES, type SessionStatus } from "@omnidance/shared";

// Reglas de negocio (omni-dance.md §4) — servicio de dominio puro, sin Nest/Prisma.

export const PAIR_COOLDOWN_MS =
  SESSION_RULES.INVITE_COOLDOWN_MINUTES * 60 * 1000; // ~4 min: una canción
export const INVITE_GRACE_MS =
  SESSION_RULES.CONFIRM_GRACE_HOURS * 60 * 60 * 1000; // cierre +24h

export type SessionErrorCode =
  | "SELF_INVITE"
  | "PAIR_COOLDOWN"
  | "FORBIDDEN"
  | "INVALID_STATE"
  | "INVALID_SCORE";

export class SessionDomainError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SessionDomainError";
  }
}

export interface SessionLike {
  inviterId: string;
  inviteeId: string;
  status: SessionStatus;
  scannedAt: Date;
}

export type SessionAction = "confirm" | "decline" | "discard";

export interface TransitionResult {
  status: SessionStatus;
  confirmedAt?: Date;
}

// Estados que cuentan para el cooldown: solo invitaciones vivas o confirmadas.
const COOLDOWN_STATUSES: readonly SessionStatus[] = ["INVITED", "CONFIRMED"];

export class SessionsService {
  /**
   * Cooldown ~4 min entre sesiones del mismo par (cualquier dirección).
   * `lastPairSession` debe ser la sesión INVITED/CONFIRMED más reciente del par
   * (o null). Sesiones terminales no bloquean.
   */
  assertInvitable(
    inviterId: string,
    inviteeId: string,
    lastPairSession: SessionLike | null,
    now = new Date(),
  ): void {
    if (inviterId === inviteeId) {
      throw new SessionDomainError(
        "SELF_INVITE",
        "no puedes invitarte a ti mismo",
      );
    }
    if (
      lastPairSession &&
      COOLDOWN_STATUSES.includes(lastPairSession.status) &&
      now.getTime() - lastPairSession.scannedAt.getTime() < PAIR_COOLDOWN_MS
    ) {
      throw new SessionDomainError(
        "PAIR_COOLDOWN",
        "ya hay una sesión reciente con esta persona (~4 min de cooldown)",
      );
    }
  }

  /**
   * Expiración lazy: una INVITED sin confirmar por más de 24h se expone como
   * EXPIRED (v1: calculado en consulta, sin cron).
   */
  effectiveStatus(
    session: Pick<SessionLike, "status" | "scannedAt">,
    now = new Date(),
  ): SessionStatus {
    if (
      session.status === "INVITED" &&
      now.getTime() - session.scannedAt.getTime() > INVITE_GRACE_MS
    ) {
      return "EXPIRED";
    }
    return session.status;
  }

  /**
   * Transiciones desde INVITED vigente:
   * - confirm / decline: solo el invitee (quien fue escaneado)
   * - discard: solo el inviter (quien escaneó)
   */
  transition(
    session: SessionLike,
    actorId: string,
    action: SessionAction,
    now = new Date(),
  ): TransitionResult {
    const allowed =
      action === "discard"
        ? actorId === session.inviterId
        : actorId === session.inviteeId;
    if (!allowed) {
      throw new SessionDomainError(
        "FORBIDDEN",
        "no eres parte de esta acción en la sesión",
      );
    }
    if (this.effectiveStatus(session, now) !== "INVITED") {
      throw new SessionDomainError(
        "INVALID_STATE",
        "la invitación ya no está pendiente",
      );
    }
    switch (action) {
      case "confirm":
        return { status: "CONFIRMED", confirmedAt: now };
      case "decline":
        return { status: "DECLINED" };
      case "discard":
        return { status: "DISCARDED" };
    }
  }

  /** Solo participantes de sesiones CONFIRMED pueden puntuar. */
  assertRateable(session: SessionLike, raterId: string, now = new Date()): void {
    if (raterId !== session.inviterId && raterId !== session.inviteeId) {
      throw new SessionDomainError(
        "FORBIDDEN",
        "solo los participantes pueden puntuar la sesión",
      );
    }
    if (this.effectiveStatus(session, now) !== "CONFIRMED") {
      throw new SessionDomainError(
        "INVALID_STATE",
        "solo sesiones confirmadas pueden puntuarse",
      );
    }
  }

  validateScore(value: unknown): number {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 5
    ) {
      throw new SessionDomainError(
        "INVALID_SCORE",
        "el puntaje debe ser un entero entre 1 y 5",
      );
    }
    return value;
  }
}
