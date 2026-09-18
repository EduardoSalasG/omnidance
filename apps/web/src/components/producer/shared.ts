// Tipos y helpers compartidos de la consola /productor.
// Contratos verificados contra:
//   apps/api/src/events/infrastructure/events.controller.ts
//   apps/api/src/events/infrastructure/table-reservations.controller.ts
//   apps/api/src/events/infrastructure/event-ratings.controller.ts
//   apps/api/src/events/infrastructure/song-suggestions.controller.ts
//   apps/api/src/social/infrastructure/entry-passes.controller.ts
//   apps/api/src/social/infrastructure/venues.controller.ts
//   apps/api/src/social/infrastructure/styles.controller.ts
//   apps/api/src/payments/infrastructure/payouts.controller.ts
import type { BadgeVariant } from "@/components/ui";

export { readError } from "../academy/shared";

// Roles que habilitan la consola (espejo de ProducerGuard — mismo set que
// src/app/(app)/productor/page.tsx).
export const PRODUCER_ROLES = new Set(["PRODUCER", "ADMIN"]);

// Enum EventType del schema (PRACTICA, no PRACTICE).
export const EVENT_TYPES = [
  "SOCIAL",
  "PRACTICA",
  "GALA",
  "CONGRESS",
  "COMPETITION",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "LIVE",
  "CLOSED",
  "CANCELLED",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// Espejo de EDITABLE/CANCELLABLE del controller.
export const EDITABLE_STATUSES: readonly string[] = ["DRAFT", "PUBLISHED"];
export const CANCELLABLE_STATUSES: readonly string[] = [
  "DRAFT",
  "PUBLISHED",
  "LIVE",
];

export const STAFF_ROLES = ["DOOR", "DOOR_SALES"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PASS_TYPES = [
  "PAID",
  "ARTIST",
  "STAFF",
  "COMP",
  "LIST",
  "FREE_WINDOW",
] as const;

export const PAYOUT_STATUSES = ["PENDING", "APPROVED", "PAID"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const EVENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: "outline",
  PUBLISHED: "neon",
  LIVE: "live",
  CLOSED: "muted",
  CANCELLED: "live",
};

export const PAYOUT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: "muted",
  APPROVED: "outline",
  PAID: "neon",
};

export const PASS_STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "neon",
  USED: "muted",
  CANCELLED: "live",
};

/**
 * GET /events hoy devuelve solo PUBLISHED/LIVE sin producerId — los campos
 * opcionales quedan para cuando el contrato los exponga (el filtro client-side
 * por producerId está especificado en el brief de la consola).
 */
export type EventListItem = {
  id: string;
  name: string;
  type?: string;
  status: string;
  startsAt: string;
  endsAt: string;
  presalePrice?: number | null;
  doorPrice?: number | null;
  producerId?: string | null;
  seriesId?: string | null;
  series?: { id?: string; name: string } | null;
  venue?: { id?: string; name: string; address?: string | null } | null;
};

/** GET /events/:id — shape real del controller (select explícito). */
export type EventDetail = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  presalePrice: number | null;
  doorPrice: number | null;
  primeThreshold: number | null;
  /** Override admin del cargo por servicio; null → fee global de plataforma. */
  serviceFeeClp?: number | null;
  // No seleccionados por el endpoint hoy; quedan para pre-cargar el form
  // si el contrato los agrega.
  presaleCap?: number | null;
  doorCap?: number | null;
  happyHourMinutes?: number | null;
  producerId?: string | null;
  venueId?: string | null;
  seriesId?: string | null;
  series: { id?: string; name: string } | null;
  venue: {
    id?: string;
    name: string;
    address: string | null;
    capacity: number | null;
  } | null;
  djs: {
    slotNote: string | null;
    person: { name: string | null; photoUrl: string | null };
  }[];
  scheduleBlocks: {
    startsAt: string;
    endsAt: string;
    style: { id?: string; name: string } | null;
  }[];
};

/** POST /events y PATCH /events/:id — mismo payload (todo opcional en PATCH). */
export type EventPayload = {
  name?: string;
  venueId?: string;
  seriesId?: string;
  type?: string;
  startsAt?: string;
  endsAt?: string;
  capacity?: number;
  presalePrice?: number;
  doorPrice?: number;
  presaleCap?: number;
  doorCap?: number;
  primeThreshold?: number;
  happyHourMinutes?: number;
  scheduleBlocks?: {
    startsAt: string;
    endsAt: string;
    styleId?: string;
    djId?: string;
  }[];
  djIds?: string[];
};

export type Venue = {
  id: string;
  name: string;
  address?: string | null;
  capacity?: number | null;
};

export type Style = { id: string; name: string; genre?: string | null };

export type StaffEntry = {
  id: string;
  role: string;
  person: { id: string; name: string | null; email: string | null };
};

export type EntryPass = {
  id: string;
  type: string;
  price: number;
  status: string;
  validUntil: string | null;
  createdAt: string;
  person: { id: string; name: string | null; phone: string | null } | null;
};

export type SongSuggestion = { title: string; count: number };

/**
 * GET /events/:id/table-reservations hoy devuelve SOLO confirmadas y sin id
 * ({person:{name}, partySize, tableNo}). Los campos id/status/personId quedan
 * opcionales para habilitar las acciones PATCH si el contrato los expone.
 */
export type TableReservationItem = {
  id?: string;
  personId?: string;
  status?: string;
  person: { name: string | null };
  partySize: number;
  tableNo: string | null;
};

export type RatingAgg = { avg: number | null; count: number };

/** GET /events/:id/ratings/summary — agregado k-anónimo por actor. */
export type RatingsSummary = {
  exposed: boolean;
  count: number;
  byActor: {
    dj: { music: RatingAgg };
    producer: { occupation: RatingAgg; organization: RatingAgg };
    venue: {
      floorComfort: RatingAgg;
      temperature: RatingAgg;
      lightingSound: RatingAgg;
    };
  } | null;
};

export type Payout = {
  id: string;
  actorType: string;
  actorId: string;
  periodStart: string;
  periodEnd: string;
  gross: number;
  net: number;
  status: string;
  evidenceUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

// Inputs dark-first; min-h-12 = touch target (mismo lenguaje que /productor).
export const inputCls =
  "min-h-12 w-full rounded-xl border border-night-700 bg-night-950 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50 disabled:opacity-50";

/** ISO → valor de <input type="datetime-local"> en hora local. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** "1,2" → número entero opcional; "" / NaN → undefined (no se envía). */
export function toOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
