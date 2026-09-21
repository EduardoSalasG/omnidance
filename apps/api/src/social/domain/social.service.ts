// Reglas de negocio del módulo social (RSVP, guest lists, waitlist, prácticas,
// trips) — servicio de dominio puro, sin Nest/Prisma.

export type SocialErrorCode =
  | "INVALID_INPUT"
  | "ALREADY_WAITING"
  | "HAS_ACTIVE_PASS"
  | "NOTHING_TO_PROMOTE";

export class SocialDomainError extends Error {
  constructor(
    readonly code: SocialErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SocialDomainError";
  }
}

export type WaitlistStatus = "WAITING" | "PROMOTED" | "EXPIRED";

/** Posición de una entrada nueva en la waitlist: max(posiciones) + 1 (parte en 1). */
export function nextWaitlistPosition(
  existing: ReadonlyArray<{ position: number }>,
): number {
  return existing.reduce((max, e) => Math.max(max, e.position), 0) + 1;
}

/**
 * Decisión v1: se permite entrar a la waitlist siempre que la persona no tenga
 * ya una entrada/pase activo para el evento (ticket ACTIVE o entry_pass ACTIVE)
 * ni una entrada de waitlist viva (WAITING o PROMOTED). Una entrada EXPIRED no
 * bloquea: la persona puede re-ingresar con una posición nueva.
 */
export function canJoinWaitlist(
  existing: { status: string } | null | undefined,
  hasActivePass: boolean,
): boolean {
  return (
    !hasActivePass && (existing == null || existing.status === "EXPIRED")
  );
}

/** Igual que canJoinWaitlist pero lanza SocialDomainError con el motivo. */
export function assertCanJoinWaitlist(
  existing: { status: string } | null | undefined,
  hasActivePass: boolean,
): void {
  if (hasActivePass) {
    throw new SocialDomainError(
      "HAS_ACTIVE_PASS",
      "ya tienes una entrada/pase activo para este evento",
    );
  }
  if (existing != null && existing.status !== "EXPIRED") {
    throw new SocialDomainError(
      "ALREADY_WAITING",
      "ya estás en la lista de espera de este evento",
    );
  }
}

/** Primera entrada WAITING por posición (la que se promueve al liberarse cupo). */
export function pickNextWaiting<T extends { position: number; status: string }>(
  entries: readonly T[],
): T | null {
  return (
    entries
      .filter((e) => e.status === "WAITING")
      .sort((a, b) => a.position - b.position)[0] ?? null
  );
}

export interface PracticeInput {
  name: string;
  startsAt: Date;
  endsAt: Date;
  capacity?: number | null;
}

function assertDateRange(
  startsAt: Date,
  endsAt: Date,
  what: string,
): void {
  if (
    !(startsAt instanceof Date) ||
    Number.isNaN(startsAt.getTime()) ||
    !(endsAt instanceof Date) ||
    Number.isNaN(endsAt.getTime())
  ) {
    throw new SocialDomainError(
      "INVALID_INPUT",
      `${what}: fechas inválidas`,
    );
  }
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw new SocialDomainError(
      "INVALID_INPUT",
      `${what}: startsAt debe ser anterior a endsAt`,
    );
  }
}

/**
 * Validación de práctica (micro-evento creado por bailarín, spec omni-dance.md §8):
 * nombre requerido, rango horario válido y aforo chico > 0 si se declara.
 */
export function assertPracticeInput(input: PracticeInput): void {
  if (!input.name || !input.name.trim()) {
    throw new SocialDomainError("INVALID_INPUT", "nombre requerido");
  }
  assertDateRange(input.startsAt, input.endsAt, "práctica");
  if (
    input.capacity != null &&
    (!Number.isInteger(input.capacity) || input.capacity <= 0)
  ) {
    throw new SocialDomainError(
      "INVALID_INPUT",
      "capacidad debe ser un entero > 0",
    );
  }
}

export interface TripInput {
  destination: string;
  startsAt: Date;
  endsAt: Date;
}

/** Anuncio de viaje: destino requerido y rango de fechas válido. */
export function assertTripInput(input: TripInput): void {
  if (!input.destination || !input.destination.trim()) {
    throw new SocialDomainError("INVALID_INPUT", "destino requerido");
  }
  assertDateRange(input.startsAt, input.endsAt, "viaje");
}
