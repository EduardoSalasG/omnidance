// @omnidance/shared — enums, constantes y tipos compartidos front/back

// ─── Roles ───────────────────────────────────────────────
export const USER_ROLES = [
  "DANCER",
  "DJ",
  "PRODUCER",
  "STAFF",
  "VENUE_MANAGER",
  "ACADEMY_OWNER",
  "INSTRUCTOR",
  "ADMIN",
  "SUPPORT",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_STATUSES = [
  "PENDING",
  "SANDBOX",
  "APPROVED",
  "REJECTED",
] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

// ─── Eventos ─────────────────────────────────────────────
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

// ─── Pases y tickets ─────────────────────────────────────
export const PASS_TYPES = [
  "PAID",
  "ARTIST",
  "STAFF",
  "COMP",
  "LIST",
  "FREE_WINDOW",
] as const;
export type PassType = (typeof PASS_TYPES)[number];

export const TICKET_STATUSES = [
  "ACTIVE",
  "USED",
  "TRANSFERRED",
  "CANCELLED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// ─── Sesiones de baile ───────────────────────────────────
export const SESSION_STATUSES = [
  "INVITED",
  "CONFIRMED",
  "DECLINED",
  "DISCARDED",
  "EXPIRED",
  "RATED",
  "CLOSED",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const DANCE_ROLES = ["LEADER", "FOLLOWER", "SWITCH"] as const;
export type DanceRole = (typeof DANCE_ROLES)[number];

// ─── Ratings ─────────────────────────────────────────────
export const SESSION_RATING_DIMS = [
  "global",
  "connection",
  "comfort",
  "musicality",
] as const;

export const EVENT_RATING_DIMS = [
  "music", // → DJ
  "occupation", // → productor
  "organization", // → productor
  "floorComfort", // → venue
  "temperature", // → venue
  "lightingSound", // → venue
] as const;

// ─── Academias ───────────────────────────────────────────
export const ENROLLMENT_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "TRIAL",
  "FROZEN",
  "ONLINE",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const PLAN_TYPES = ["MONTHLY", "CLASS_PACK", "PERIOD", "TRIAL"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

// ─── Dinero ──────────────────────────────────────────────
export const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYOUT_STATUSES = ["PENDING", "APPROVED", "PAID"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const DISCOUNT_CODE_TYPES = [
  "CUMPLEANOS",
  "CORTESIA",
  "CASO_BORDE_PUERTA",
  "CAMPAIGN",
  "WINBACK",
  "STAFF_COMP",
] as const;
export type DiscountCodeType = (typeof DISCOUNT_CODE_TYPES)[number];

export const ENTITY_TYPES = ["PERSONA", "EMPRESA"] as const;

// ─── Gamificación ────────────────────────────────────────
export const STREAK_TYPES = [
  "SERIES",
  "PRODUCER",
  "VENUE",
  "WEEKLY_OUT",
  "MONTHLY_OUT",
  "WITH_FRIEND",
  "STYLE",
  "CLASS",
  "CONTRIBUTION",
] as const;
export type StreakType = (typeof STREAK_TYPES)[number];

export const BADGE_CATEGORIES = [
  "PASSPORT",
  "MILESTONE",
  "CONDUCT",
  "ROLE_STYLE",
  "SOCIAL",
  "SPECIAL_EVENT",
  "NEWBIE_PADRINO",
  "CONTRIBUTION",
  "TEMPORARY_STATUS",
] as const;

// ─── CRM ─────────────────────────────────────────────────
export const SEGMENTS = ["CORE", "AT_RISK", "NEW", "BRINGS_PEOPLE"] as const;
export type Segment = (typeof SEGMENTS)[number];

// ─── Notificaciones ──────────────────────────────────────
export const NOTIFICATION_CATEGORIES = [
  "SOCIAL",
  "TRANSACTIONAL",
  "MARKETING",
  "OPERATIONAL",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// ─── Constantes de negocio ───────────────────────────────
export const SERVICE_FEE = {
  PRESALE_CLP: 500,
  DOOR_APP_CLP: 700,
  DOOR_CASH_REGISTRATION_CLP: 0, // gratis en lanzamiento
} as const;

export const PRIME_TIME = {
  WINDOW_START: "23:00",
  REVEAL_AT: "00:00",
  GRACE_UNTIL: "00:30",
  THRESHOLD_PCT_OF_CAPACITY: 0.2, // ~20% del aforo
  HAPPY_HOUR_MINUTES: 30,
} as const;

export const SESSION_RULES = {
  INVITE_COOLDOWN_MINUTES: 4, // duración típica de una canción
  CONFIRM_GRACE_HOURS: 24, // cierre del evento + 24h
  QR_ROTATION_SECONDS: 30,
  MIN_RATINGS_TO_SHOW_SCORE: 5,
  BAYESIAN_C: 10,
  DECAY_WINDOW_DAYS: 90,
} as const;
