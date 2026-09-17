import type { Checkin, EventStatus, PassType, Ticket } from "@prisma/client";
import { SERVICE_FEE } from "@omnidance/shared";
import type {
  CheckinMethod,
  CheckinsRepo,
  DoorSaleChannel,
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

export class CheckinNotFoundError extends Error {
  constructor(public readonly checkinId: string) {
    super(`check-in no encontrado: ${checkinId}`);
    this.name = "CheckinNotFoundError";
  }
}

/** Actor sin autorización para la operación sobre el check-in/evento. */
export class CheckinForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckinForbiddenError";
  }
}

export class AlreadyVoidedError extends Error {
  constructor(public readonly checkin: Checkin) {
    super(`check-in ya anulado: ${checkin.id}`);
    this.name = "AlreadyVoidedError";
  }
}

/** Check-in/venta sobre evento que no está abierto (DRAFT/CLOSED/CANCELLED). */
export class EventNotOpenError extends Error {
  constructor(
    public readonly eventId: string,
    public readonly status: EventStatus,
  ) {
    super(`el evento no admite check-ins (estado ${status})`);
    this.name = "EventNotOpenError";
  }
}

export class DoorCapReachedError extends Error {
  constructor(
    public readonly eventId: string,
    public readonly doorCap: number,
  ) {
    super(`aforo de puerta agotado (${doorCap})`);
    this.name = "DoorCapReachedError";
  }
}

export interface RegisterCheckinInput {
  eventId: string;
  personId: string;
  /** Quien opera la puerta — siempre auditado. */
  staffId: string;
  method: CheckinMethod;
  /** Nota del staff (solo check-in manual / cortesías). */
  note?: string;
}

export interface CheckinResult {
  checkin: Checkin;
  person: { name: string; photoUrl: string | null };
  ticket: { id: string; status: string } | null;
  /** Tipo del EntryPass resuelto (COMP/LIST/…) — null si fue ticket o sin pase. */
  passType: PassType | null;
}

/** Actor autenticado (SessionGuard) — el id basta: roles se leen en DB. */
export interface ActorRef {
  id: string;
}

export interface DoorSaleInput {
  eventId: string;
  channel: DoorSaleChannel;
  name: string;
  phone: string;
}

export interface DoorSaleResult {
  person: { id: string; name: string };
  ticket: Ticket;
  checkin: Checkin;
}

/** Permiso que habilita operar puerta (guard + checks en servicio). */
const CHECKINS_WRITE = "checkins.write";
const PARAM_DOOR_CASH_FEE = "service_fee.door_cash_clp";
const PARAM_DOOR_APP_FEE = "service_fee.door_app_clp";

// Estados en que la puerta opera: publicado (pre-venta activa) o en vivo.
const CHECKIN_OPEN_STATUSES: readonly EventStatus[] = ["PUBLISHED", "LIVE"];

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
    this.assertEventOpen(event);

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
        note: input.note ?? null,
      },
      pass,
    );

    return {
      checkin,
      person: { name: person.name, photoUrl: person.photoUrl },
      ticket: ticket ? { id: ticket.id, status: "USED" } : null,
      passType: entryPass?.type ?? null,
    };
  }

  async listByEvent(eventId: string): Promise<ListedCheckin[]> {
    const event = await this.repo.findEventById(eventId);
    if (!event) throw new EventNotFoundError(eventId);
    return this.repo.listEventCheckins(eventId);
  }

  /**
   * Check-out ("me fui"): el dueño del check-in o cualquier staff con
   * checkins.write. Idempotente — ya cerrado o anulado devuelve sin tocar.
   */
  async closeCheckin(checkinId: string, actor: ActorRef): Promise<Checkin> {
    const checkin = await this.repo.findCheckinById(checkinId);
    if (!checkin) throw new CheckinNotFoundError(checkinId);

    const allowed =
      checkin.personId === actor.id ||
      (await this.repo.personHasPermission(actor.id, CHECKINS_WRITE));
    if (!allowed) {
      throw new CheckinForbiddenError(
        "solo el dueño del check-in o staff puede cerrarlo",
      );
    }

    if (checkin.outAt || checkin.voidedAt) return checkin;
    return this.repo.closeCheckin(checkinId);
  }

  /**
   * Anulación staff-only: exige checkins.write y además StaffAssignment en el
   * evento (o rol superuser). Revierte el pase usado y audita CHECKIN_VOID.
   */
  async voidCheckin(
    checkinId: string,
    reason: string,
    actor: ActorRef,
  ): Promise<Checkin> {
    const checkin = await this.repo.findCheckinById(checkinId);
    if (!checkin) throw new CheckinNotFoundError(checkinId);
    if (checkin.voidedAt) throw new AlreadyVoidedError(checkin);

    const [hasWrite, superuser, assigned] = await Promise.all([
      this.repo.personHasPermission(actor.id, CHECKINS_WRITE),
      this.repo.isSuperuser(actor.id),
      this.repo.isStaffAssigned(checkin.eventId, actor.id),
    ]);
    if (!hasWrite || !(superuser || assigned)) {
      throw new CheckinForbiddenError(
        "requiere staff asignado al evento o admin",
      );
    }

    return this.repo.voidCheckin({ checkinId, reason, actorId: actor.id });
  }

  /**
   * Venta en puerta (spec door-sale): staff asignado al evento, productor del
   * evento o admin. Reutiliza la Person por phone o crea cuenta ligera; emite
   * ticket USED con el cargo del canal y hace el check-in MANUAL atómicamente.
   */
  async doorSale(
    input: DoorSaleInput,
    actor: ActorRef,
  ): Promise<DoorSaleResult> {
    const event = await this.repo.findEventById(input.eventId);
    if (!event) throw new EventNotFoundError(input.eventId);
    this.assertEventOpen(event);

    const [hasWrite, superuser, assigned] = await Promise.all([
      this.repo.personHasPermission(actor.id, CHECKINS_WRITE),
      this.repo.isSuperuser(actor.id),
      this.repo.isStaffAssigned(input.eventId, actor.id),
    ]);
    const isProducer = event.producerId === actor.id;
    if (!(superuser || isProducer || (hasWrite && assigned))) {
      throw new CheckinForbiddenError(
        "requiere staff asignado al evento, productor o admin",
      );
    }

    if (event.doorCap != null) {
      const sold = await this.repo.countDoorSales(input.eventId);
      if (sold >= event.doorCap) {
        throw new DoorCapReachedError(input.eventId, event.doorCap);
      }
    }

    let person = await this.repo.findPersonByPhone(input.phone);
    if (!person) {
      person = await this.repo.createLightPerson({
        name: input.name,
        phone: input.phone,
      });
    }

    const open = await this.repo.findOpenCheckin(input.eventId, person.id);
    if (open) throw new DuplicateCheckinError(open);

    const serviceFee = await this.repo.getParamNumber(
      input.channel === "CASH" ? PARAM_DOOR_CASH_FEE : PARAM_DOOR_APP_FEE,
      input.channel === "CASH"
        ? SERVICE_FEE.DOOR_CASH_REGISTRATION_CLP
        : SERVICE_FEE.DOOR_APP_CLP,
    );

    const { ticket, checkin } = await this.repo.createDoorSale({
      eventId: input.eventId,
      personId: person.id,
      staffId: actor.id,
      listPrice: event.doorPrice ?? 0,
      serviceFee,
    });

    return { person, ticket, checkin };
  }

  private assertEventOpen(event: { id: string; status: EventStatus }): void {
    if (!CHECKIN_OPEN_STATUSES.includes(event.status)) {
      throw new EventNotOpenError(event.id, event.status);
    }
  }
}
