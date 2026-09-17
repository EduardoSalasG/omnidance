import type { Checkin, EntryPass, Ticket } from "@prisma/client";

export const CHECKINS_REPO = "CHECKINS_REPO";

export type CheckinMethod = "SCAN" | "MANUAL";

/** Pase resuelto al momento del check-in (ticket comprado o entry_pass de lista/cortesía). */
export type ResolvedPass = { kind: "TICKET" | "ENTRY_PASS"; id: string };

export interface CreateCheckinData {
  eventId: string;
  personId: string;
  staffId: string;
  method: CheckinMethod;
  passId: string | null;
  /** Nota del staff (cortesías manuales) — se persiste en Checkin.note. */
  note: string | null;
}

export type ListedCheckin = Checkin & {
  person: { name: string; photoUrl: string | null };
};

export interface CheckinsRepo {
  findEventById(id: string): Promise<{ id: string } | null>;
  findPersonById(
    id: string,
  ): Promise<{ id: string; name: string; photoUrl: string | null } | null>;
  /** Check-in abierto (sin outAt) para (eventId, personId) — guard de doble ingreso. */
  findOpenCheckin(eventId: string, personId: string): Promise<Checkin | null>;
  findActiveTicket(eventId: string, ownerId: string): Promise<Ticket | null>;
  findActiveEntryPass(
    eventId: string,
    personId: string,
  ): Promise<EntryPass | null>;
  /** Crea el check-in y marca USED el pase resuelto, en la misma transacción. */
  createCheckin(
    data: CreateCheckinData,
    pass: ResolvedPass | null,
  ): Promise<Checkin>;
  listEventCheckins(eventId: string): Promise<ListedCheckin[]>;
}
