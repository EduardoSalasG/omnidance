import type {
  Checkin,
  EntryPass,
  EventStatus,
  SeriesPass,
  Ticket,
} from "@prisma/client";

export const CHECKINS_REPO = "CHECKINS_REPO";

export type CheckinMethod = "SCAN" | "MANUAL";
export type DoorSaleChannel = "CASH" | "APP";

/** Tipo de pase expuesto en CheckinResult.passType. PassType cubre los
 * EntryPass de lista/cortesía; "SERIES_PASS" es el pase mensual de la serie
 * (no es un PassType del schema — vive en SeriesPass). */
export type CheckinPassType = import("@prisma/client").PassType | "SERIES_PASS";

/**
 * Pase resuelto al momento del check-in (ticket comprado, entry_pass de
 * lista/cortesía o pase mensual de serie). SERIES_PASS no se consume:
 * es vigente todo el mes — el check-in solo lo referencia en passId.
 */
export type ResolvedPass = {
  kind: "TICKET" | "ENTRY_PASS" | "SERIES_PASS";
  id: string;
};

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

/** Datos del evento necesarios para venta de puerta / autorización. */
export interface EventDoorInfo {
  id: string;
  status: EventStatus;
  doorPrice: number | null;
  doorCap: number | null;
  producerId: string | null;
  /** Serie a la que pertenece (para resolver SeriesPass en check-in). */
  seriesId?: string | null;
}

export interface VoidCheckinInput {
  checkinId: string;
  reason: string;
  /** Quien ejecuta el void — queda en AuditLog.actorId. */
  actorId: string;
}

export interface DoorSaleTxInput {
  eventId: string;
  personId: string;
  staffId: string;
  listPrice: number;
  serviceFee: number;
}

export interface DoorSaleTxResult {
  ticket: Ticket;
  checkin: Checkin;
}

export interface CheckinsRepo {
  findEventById(id: string): Promise<EventDoorInfo | null>;
  findPersonById(
    id: string,
  ): Promise<{ id: string; name: string; photoUrl: string | null } | null>;
  /** Check-in abierto (sin outAt) para (eventId, personId) — guard de doble ingreso. */
  findOpenCheckin(eventId: string, personId: string): Promise<Checkin | null>;
  findCheckinById(id: string): Promise<Checkin | null>;
  findActiveTicket(eventId: string, ownerId: string): Promise<Ticket | null>;
  findActiveEntryPass(
    eventId: string,
    personId: string,
  ): Promise<EntryPass | null>;
  /**
   * SeriesPass vigente de la persona para la serie en el mes dado ("YYYY-MM").
   * Opcional en el puerto para no romper implementaciones de test legadas.
   */
  findActiveSeriesPass?(
    seriesId: string,
    personId: string,
    month: string,
  ): Promise<SeriesPass | null>;
  /** Crea el check-in y marca USED el pase resuelto en la misma transacción. */
  createCheckin(
    data: CreateCheckinData,
    pass: ResolvedPass | null,
  ): Promise<Checkin>;
  listEventCheckins(eventId: string): Promise<ListedCheckin[]>;

  /** Permiso RBAC DB-driven: rol APPROVED con grant o isSuperuser. */
  personHasPermission(personId: string, permissionKey: string): Promise<boolean>;
  /** Algún rol APPROVED de la persona es isSuperuser (ADMIN). */
  isSuperuser(personId: string): Promise<boolean>;
  /** StaffAssignment del evento — operador de puerta asignado. */
  isStaffAssigned(eventId: string, personId: string): Promise<boolean>;

  /** Setea outAt — el caller garantizó autorización e idempotencia. */
  closeCheckin(id: string): Promise<Checkin>;
  /**
   * Void atómico: voidedAt+voidReason, revierte el pase (Ticket/EntryPass)
   * USED → ACTIVE si correspondía al check-in, y escribe AuditLog CHECKIN_VOID.
   */
  voidCheckin(input: VoidCheckinInput): Promise<Checkin>;

  /** Ventas de puerta registradas — checkins MANUAL no anulados del evento. */
  countDoorSales(eventId: string): Promise<number>;
  findPersonByPhone(
    phone: string,
  ): Promise<{ id: string; name: string } | null>;
  /** Cuenta ligera de puerta: Person{isLightAccount} + rol DANCER APPROVED. */
  createLightPerson(input: {
    name: string;
    phone: string;
  }): Promise<{ id: string; name: string }>;
  /** Ticket USED + Checkin MANUAL en una transacción (venta de puerta). */
  createDoorSale(input: DoorSaleTxInput): Promise<DoorSaleTxResult>;
  /** PlatformParam numérico — delega en ParamsService (cache 30s). */
  getParamNumber(key: string, fallback: number): Promise<number>;
}
