import type { Checkin } from "@prisma/client";
import type {
  CheckinMethod,
  CheckinsRepo,
  ListedCheckin,
  ResolvedPass,
} from "./ports";

export class EventNotFoundError extends Error {
  constructor(public readonly eventId: string) {
    super(`evento no encontrado: ${eventId}`);
    this.name = "EventNotFoundError";
  }
}

export class PersonNotFoundError extends Error {
  constructor(public readonly personId: string) {
    super(`persona no encontrada: ${personId}`);
    this.name = "PersonNotFoundError";
  }
}

export class DuplicateCheckinError extends Error {
  constructor(public readonly existing: Checkin) {
    super(`ya existe un check-in abierto: ${existing.id}`);
    this.name = "DuplicateCheckinError";
  }
}

export interface RegisterCheckinInput {
  eventId: string;
  personId: string;
  /** Quien opera la puerta — siempre auditado. */
  staffId: string;
  method: CheckinMethod;
}

export interface CheckinResult {
  checkin: Checkin;
  person: { name: string; photoUrl: string | null };
  ticket: { id: string; status: string } | null;
}

/**
 * Reglas de check-in de puerta (spec omni-dance.md — staff offline-first):
 * - El escaneo resuelve personId; se busca un pase ACTIVE del evento
 *   (ticket comprado primero, entry_pass de lista/cortesía como fallback).
 * - El check-in se registra aunque no haya pase (MANUAL/cortesía) —
 *   staffId queda siempre para auditoría.
 * - Doble check-in: si ya hay uno abierto (sin outAt) para (evento, persona)
 *   se rechaza con el existente; el sync offline resuelve por timestamp.
 */
export class CheckinsService {
  constructor(private readonly repo: CheckinsRepo) {}

  async register(input: RegisterCheckinInput): Promise<CheckinResult> {
    const event = await this.repo.findEventById(input.eventId);
    if (!event) throw new EventNotFoundError(input.eventId);

    const person = await this.repo.findPersonById(input.personId);
    if (!person) throw new PersonNotFoundError(input.personId);

    const open = await this.repo.findOpenCheckin(input.eventId, input.personId);
    if (open) throw new DuplicateCheckinError(open);

    const ticket = await this.repo.findActiveTicket(
      input.eventId,
      input.personId,
    );
    const entryPass = ticket
      ? null
      : await this.repo.findActiveEntryPass(input.eventId, input.personId);

    const pass: ResolvedPass | null = ticket
      ? { kind: "TICKET", id: ticket.id }
      : entryPass
        ? { kind: "ENTRY_PASS", id: entryPass.id }
        : null;

    const checkin = await this.repo.createCheckin(
      {
        eventId: input.eventId,
        personId: input.personId,
        staffId: input.staffId,
        method: input.method,
        passId: pass?.id ?? null,
      },
      pass,
    );

    return {
      checkin,
      person: { name: person.name, photoUrl: person.photoUrl },
      ticket: ticket ? { id: ticket.id, status: "USED" } : null,
    };
  }

  async listByEvent(eventId: string): Promise<ListedCheckin[]> {
    const event = await this.repo.findEventById(eventId);
    if (!event) throw new EventNotFoundError(eventId);
    return this.repo.listEventCheckins(eventId);
  }
}
