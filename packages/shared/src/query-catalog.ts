// Catálogo de consultas compartido (spec analytics/query-console) —
// fuente única de verdad front/back: la API lo usa como whitelist de
// filtros y para armar `GET /query/catalog?role=`; la web renderiza
// FilterBar/Consultas data-driven desde aquí (labels vía i18n
// `query.filters.<key>` / `query.cols.<entity>.<col>` / fallback
// `query.cols.<col>`).

export const QUERY_ROLES = ["PRODUCER", "ACADEMY_OWNER", "ADMIN"] as const;
export type QueryRole = (typeof QUERY_ROLES)[number];

export type FilterType = "text" | "enum" | "fk" | "date";

/** Fuentes de opciones FK que la API resuelve en /query/catalog. */
export type FkSource =
  | "myEventScopes" // eventos+series del productor (scope)
  | "myAcademies" // academias del owner (scope)
  | "academyPlans" // planes de la academia en scope
  | "academyClassSeries" // series de clases de la academia en scope
  | "academyInstructors" // instructores de la academia en scope
  | "eventGuestLists" // listas de invitados del evento en scope
  // fuentes admin (global):
  | "producers"
  | "venues"
  | "academies"
  | "styles"
  | "levels" // niveles de clase (ClassLevel)
  | "classTypes" // modalidades de clase (ClassType)
  | "events"
  | "roles";

export interface FilterDef {
  /** Nombre del query param (idéntico en /query/run, export y endpoints
      de lista de módulo). */
  key: string;
  type: FilterType;
  /** enum: whitelist de valores (inválido → 400). */
  options?: readonly string[];
  /** fk: fuente de opciones resuelta por la API. */
  source?: FkSource;
  /** true = filtro de scope obligatorio (evento/serie o academia). */
  scope?: boolean;
}

export interface EntityDef {
  entity: string;
  /** Filtros en orden de render en la barra. */
  filters: readonly FilterDef[];
  /** Columnas del resultado (orden = orden de columnas en CSV/preview). */
  columns: readonly string[];
}

// ─── Enums de filtros (reusan los vocabularios del schema) ────────────

import {
  EVENT_STATUSES,
  PAYMENT_STATUSES,
  TICKET_STATUSES,
  ENROLLMENT_STATUSES,
  PAYOUT_STATUSES,
} from "./index";

const TICKET_STATUS_OPTS = TICKET_STATUSES;
const CHECKIN_METHODS = ["SCAN", "MANUAL", "OFFLINE"];
const VOIDED_OPTS = ["all", "only", "exclude"];
const GUESTLIST_STATUS = ["PENDING", "ARRIVED"];
const RESERVATION_STATUS = ["REQUESTED", "CONFIRMED", "CANCELLED"];
const WAITLIST_STATUS = ["WAITING", "PROMOTED", "EXPIRED"];
const ENROLLMENT_STATUS = ENROLLMENT_STATUSES;
const BOOKING_STATUS = ["BOOKED", "WAITLIST", "CANCELLED"];
const SUBSCRIPTION_STATUS = [
  "PENDING_CARD",
  "ACTIVATING",
  "ACTIVE",
  "CANCEL_PENDING",
  "CANCELED",
  "FAILED_CARD",
];
const ORDER_TYPES = [
  "TICKET",
  "SERIES_PASS",
  "MEMBERSHIP",
  "PRIVATE_LESSON",
  "WORKSHOP",
  "PLATFORM_SUB",
];
const PRIVATE_LESSON_STATUS = [
  "REQUESTED",
  "CONFIRMED",
  "DONE",
  "CANCELLED",
];
const CHANNELS = ["PRESALE", "DOOR"];
const LEAD_STATUS = ["NEW", "CONTACTED", "CONVERTED", "DISCARDED"];
const LEAD_INTENTS = ["CONTACT", "DEMO"];
const GATEWAY_DIRECTIONS = ["OUTBOUND", "INBOUND_WEBHOOK"];
const GATEWAY_OK = ["true", "false"];
const PAYOUT_STATUS = PAYOUT_STATUSES;
const ACTOR_TYPES = ["PRODUCER", "ACADEMY", "VENUE"];

// Atajos de composición de filtros.
const scopeEvent: FilterDef = {
  key: "scopeId",
  type: "fk",
  source: "myEventScopes",
  scope: true,
};
const scopeAcademy: FilterDef = {
  key: "academyId",
  type: "fk",
  source: "myAcademies",
  scope: true,
};
const q: FilterDef = { key: "q", type: "text" };
const from: FilterDef = { key: "from", type: "date" };
const to: FilterDef = { key: "to", type: "date" };

// ─── Catálogo por lente ───────────────────────────────────────────────

export const QUERY_CATALOG: Record<QueryRole, readonly EntityDef[]> = {
  PRODUCER: [
    {
      entity: "sales",
      filters: [
        scopeEvent,
        from,
        to,
        { key: "status", type: "enum", options: TICKET_STATUS_OPTS },
        { key: "channel", type: "enum", options: CHANNELS },
      ],
      columns: [
        "fecha",
        "comprador",
        "asistente",
        "precio_lista",
        "cargo_servicio",
        "total",
        "estado",
        "canal",
        "payment_id",
      ],
    },
    {
      entity: "checkins",
      filters: [
        scopeEvent,
        from,
        to,
        { key: "method", type: "enum", options: CHECKIN_METHODS },
        { key: "voided", type: "enum", options: VOIDED_OPTS },
      ],
      columns: ["entrada", "salida", "metodo", "persona", "anulado", "nota"],
    },
    {
      entity: "guestlist",
      filters: [
        scopeEvent,
        from,
        to,
        { key: "status", type: "enum", options: GUESTLIST_STATUS },
        { key: "listId", type: "fk", source: "eventGuestLists" },
      ],
      columns: ["lista", "dueno_lista", "invitado", "estado", "creado"],
    },
    {
      entity: "attendees",
      filters: [scopeEvent, from, to, { key: "method", type: "enum", options: CHECKIN_METHODS }],
      columns: ["persona", "primera_entrada", "ultima_entrada", "visitas"],
    },
    {
      entity: "reservations",
      filters: [
        scopeEvent,
        from,
        to,
        { key: "status", type: "enum", options: RESERVATION_STATUS },
      ],
      columns: ["creado", "persona", "personas", "mesa", "estado"],
    },
    {
      entity: "waitlist",
      filters: [
        scopeEvent,
        from,
        to,
        { key: "status", type: "enum", options: WAITLIST_STATUS },
      ],
      columns: ["creado", "persona", "posicion", "estado"],
    },
    {
      entity: "rsvps",
      filters: [scopeEvent, from, to],
      columns: ["persona", "creado"],
    },
  ],

  ACADEMY_OWNER: [
    {
      entity: "students",
      filters: [
        scopeAcademy,
        q,
        { key: "status", type: "enum", options: ENROLLMENT_STATUS },
        { key: "planId", type: "fk", source: "academyPlans" },
        from,
        to,
      ],
      columns: ["alumno", "plan", "estado", "inicio", "pagado_hasta"],
    },
    {
      entity: "attendance",
      filters: [
        scopeAcademy,
        from,
        to,
        { key: "seriesId", type: "fk", source: "academyClassSeries" },
        { key: "instructorId", type: "fk", source: "academyInstructors" },
      ],
      columns: ["fecha", "clase", "alumno", "instructor"],
    },
    {
      entity: "bookings",
      filters: [
        scopeAcademy,
        { key: "status", type: "enum", options: BOOKING_STATUS },
        { key: "seriesId", type: "fk", source: "academyClassSeries" },
        from,
        to,
      ],
      columns: ["fecha", "clase", "alumno", "estado", "reembolsada"],
    },
    {
      entity: "memberships",
      filters: [
        scopeAcademy,
        { key: "status", type: "enum", options: SUBSCRIPTION_STATUS },
        { key: "planId", type: "fk", source: "academyPlans" },
        from,
        to,
      ],
      columns: ["alumno", "plan", "estado", "proximo_cobro"],
    },
    {
      entity: "payments",
      filters: [
        scopeAcademy,
        { key: "status", type: "enum", options: PAYMENT_STATUSES },
        { key: "orderType", type: "enum", options: ORDER_TYPES },
        from,
        to,
      ],
      columns: ["fecha", "alumno", "tipo", "monto", "neto", "estado"],
    },
    {
      entity: "private_lessons",
      filters: [
        scopeAcademy,
        { key: "status", type: "enum", options: PRIVATE_LESSON_STATUS },
        { key: "instructorId", type: "fk", source: "academyInstructors" },
        from,
        to,
      ],
      columns: [
        "creado",
        "alumno",
        "instructor",
        "agendada",
        "precio",
        "estado",
      ],
    },
  ],

  // ADMIN: mismas entidades que /admin/browse + payouts. Las columnas se
  // definen aquí para unificar preview/export; los row mappers viven en
  // la API.
  ADMIN: [
    {
      entity: "events",
      filters: [
        q,
        { key: "status", type: "enum", options: EVENT_STATUSES },
        from,
        to,
        { key: "producerId", type: "fk", source: "producers" },
        { key: "venueId", type: "fk", source: "venues" },
      ],
      columns: ["nombre", "fecha", "estado", "productor", "local", "vendidas"],
    },
    {
      entity: "classes",
      filters: [
        { key: "academyId", type: "fk", source: "academies" },
        { key: "styleId", type: "fk", source: "styles" },
        from,
        to,
      ],
      columns: ["fecha", "estilo", "academia", "instructor", "reservas", "capacidad", "cancelada"],
    },
    {
      entity: "payments",
      filters: [
        { key: "status", type: "enum", options: PAYMENT_STATUSES },
        { key: "orderType", type: "enum", options: ORDER_TYPES },
        from,
        to,
      ],
      columns: ["fecha", "persona", "evento", "tipo", "monto", "neto", "estado"],
    },
    {
      entity: "tickets",
      filters: [
        { key: "status", type: "enum", options: TICKET_STATUS_OPTS },
        { key: "eventId", type: "fk", source: "events" },
      ],
      columns: ["evento", "fecha_evento", "asistente", "precio", "estado"],
    },
    {
      entity: "academies",
      filters: [q],
      columns: ["nombre", "alumnos", "series_activas"],
    },
    {
      entity: "venues",
      filters: [q],
      columns: ["nombre", "direccion", "arriendos"],
    },
    {
      entity: "rentals",
      filters: [
        { key: "status", type: "enum", options: RESERVATION_STATUS },
        { key: "venueId", type: "fk", source: "venues" },
      ],
      columns: ["fecha", "local", "evento", "estado"],
    },
    {
      entity: "people",
      filters: [q, { key: "role", type: "fk", source: "roles" }],
      columns: ["nombre", "email", "roles", "registro"],
    },
    {
      entity: "leads",
      filters: [
        q,
        { key: "status", type: "enum", options: LEAD_STATUS },
        { key: "intent", type: "enum", options: LEAD_INTENTS },
        from,
        to,
      ],
      columns: ["nombre", "email", "telefono", "roles", "intent", "estado", "creado"],
    },
    {
      entity: "payment-events",
      filters: [
        { key: "paymentId", type: "text" },
        { key: "type", type: "text" },
        { key: "actor", type: "text" },
        from,
        to,
      ],
      columns: ["fecha", "payment_id", "seq", "tipo", "actor"],
    },
    {
      entity: "gateway-transactions",
      filters: [
        { key: "paymentId", type: "text" },
        { key: "correlationId", type: "text" },
        { key: "endpoint", type: "text" },
        { key: "direction", type: "enum", options: GATEWAY_DIRECTIONS },
        { key: "ok", type: "enum", options: GATEWAY_OK },
        from,
        to,
      ],
      columns: ["fecha", "provider", "endpoint", "http", "ok", "payment_id"],
    },
    {
      entity: "membership-subscriptions",
      filters: [
        { key: "personId", type: "text" },
        { key: "academyId", type: "fk", source: "academies" },
        { key: "status", type: "enum", options: SUBSCRIPTION_STATUS },
        from,
        to,
      ],
      columns: ["persona", "academia", "plan", "estado", "proximo_cobro"],
    },
    {
      entity: "payouts",
      filters: [
        { key: "actorType", type: "enum", options: ACTOR_TYPES },
        { key: "status", type: "enum", options: PAYOUT_STATUS },
        from,
        to,
      ],
      columns: [
        "periodo",
        "actor",
        "bruto",
        "fee_plataforma",
        "neto",
        "estado",
        "pagada",
      ],
    },
  ],
} as const;

export type QueryEntity<R extends QueryRole> =
  (typeof QUERY_CATALOG)[R][number]["entity"];

// ─── Contratos de API ─────────────────────────────────────────────────

/** Filtros como mapa plano string→string (query-string friendly). */
export type QueryFilters = Record<string, string>;

export interface QueryRunInput {
  role: QueryRole;
  entity: string;
  filters: QueryFilters;
}

export interface QueryRunResult {
  headers: string[];
  rows: unknown[][];
  /** Total real del resultado (rows está capado para preview). */
  total: number;
  summary: string[];
}

/** params persistidos en SavedReport (validado contra el catálogo). */
export interface SavedReportParams {
  entity: string;
  filters: QueryFilters;
}

// ─── Consultas del sistema (plantillas por lente, no se persisten) ────

export interface SystemQuery {
  /** Sufijo i18n: query.system.<nameKey>. */
  nameKey: string;
  entity: string;
  /** Filtros pre-cargados (sin scope - el usuario elige al aplicar). */
  filters: QueryFilters;
}

export const SYSTEM_QUERIES: Record<QueryRole, readonly SystemQuery[]> = {
  PRODUCER: [
    { nameKey: "sales", entity: "sales", filters: {} },
    { nameKey: "checkins", entity: "checkins", filters: {} },
    { nameKey: "guestlist", entity: "guestlist", filters: {} },
  ],
  ACADEMY_OWNER: [
    { nameKey: "students", entity: "students", filters: {} },
    { nameKey: "attendance", entity: "attendance", filters: {} },
    { nameKey: "payments", entity: "payments", filters: {} },
  ],
  ADMIN: [
    { nameKey: "events", entity: "events", filters: {} },
    { nameKey: "payments", entity: "payments", filters: {} },
    { nameKey: "payouts", entity: "payouts", filters: {} },
  ],
};

/** Entidad del lente o undefined si no existe. */
export function entityDef(role: QueryRole, entity: string): EntityDef | undefined {
  return QUERY_CATALOG[role].find((e) => e.entity === entity);
}
