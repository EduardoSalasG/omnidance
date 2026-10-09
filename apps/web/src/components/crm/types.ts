// Tipos del CRM transversal - verificados contra
// apps/api/src/crm/infrastructure/crm.controller.ts y domain/crm.service.ts.
// Todos los endpoints exigen actorType + actorId (query en GET, body en POST).

export type ActorType = "PRODUCER" | "ACADEMY";

/** Actor CRM cuyo universo de personas se está gestionando. */
export type CrmActor = {
  actorType: ActorType;
  actorId: string;
  label: string;
};

// ─── People / tags ───

/** ActorTag (schema.prisma) - el tag es un string libre por persona. */
export type CrmTag = {
  id: string;
  personId: string;
  tag: string;
  note: string | null;
  createdAt: string;
};

/** Fila de GET /crm/people (CrmPersonRow del service). */
export type CrmPersonRow = {
  personId: string;
  score: number | null;
  segment: string | null;
  computedAt: string | null;
  person: { id: string; name: string; photoUrl: string | null } | null;
  tags: CrmTag[];
};

/** Envelope paginado de GET /crm/people (spec academy-console-v3):
 * segmentCounts/allTags describen el universo completo (stats + opciones),
 * items es solo la página pedida. */
export type CrmPeoplePage = {
  items: CrmPersonRow[];
  total: number;
  page: number;
  pageSize: number;
  segmentCounts: Record<string, number>;
  allTags: string[];
};

/** Orden aceptado por GET /crm/people (default score_desc). */
export const PEOPLE_SORTS = ["score_desc", "score_asc", "name_asc"] as const;
export type PeopleSort = (typeof PEOPLE_SORTS)[number];

// ─── Contacto (ficha) ───

/** Item de actividad reciente de GET /crm/people/:personId. */
export type CrmRecentItem = {
  type: "CHECKIN" | "PAYMENT" | "ENROLLMENT" | "ATTENDANCE";
  at: string;
  label: string;
  amount?: number;
  status?: string;
};

/** Respuesta de GET /crm/people/:personId (spec crm-console-v1). */
export type CrmPersonDetail = {
  personId: string;
  person: { id: string; name: string; photoUrl: string | null } | null;
  score: number | null;
  segment: string | null;
  computedAt: string | null;
  tags: CrmTag[];
  activity: {
    attendance: number;
    spend: number;
    referrals: number;
    firstAt: string | null;
    lastAt: string | null;
  } | null;
  recent: CrmRecentItem[];
};

// ─── Campaigns ───

/** CampaignSegment del service - los criterios presentes se unen (OR).
 *  Los criterios de alumnos solo valen para actorType ACADEMY (400 si no). */
export type CampaignSegment = {
  tags?: string[];
  segment?: string;
  personIds?: string[];
  allStudents?: boolean;
  enrollmentStatus?: string[];
  planId?: string;
  seriesId?: string;
};

export type CampaignAction =
  | { type: "NOTIFY"; title: string; body?: string }
  | {
      type: "DISCOUNT_CODE";
      percentOff?: number;
      amountOff?: number;
      maxUses?: number;
      expiresAt?: string;
    };

/** Modelo Campaign (Prisma). result queda tras send: {sent, code?, at}. */
export type CrmCampaign = {
  id: string;
  name: string;
  segment: CampaignSegment;
  action: CampaignAction;
  status: string; // DRAFT | SENT | DONE
  result: { sent?: number; code?: string; at?: string } | null;
  createdAt: string;
};

// ─── Triggers ───

/** CRM_TRIGGER_KEYS del service - enum cerrado, no libre. */
export const CRM_TRIGGER_KEYS = [
  "WINBACK",
  "TRIAL_EXPIRING",
  "REGULAR_NO_PRESALE",
  "ATTENDANCE_DROP",
] as const;
export type CrmTriggerKey = (typeof CRM_TRIGGER_KEYS)[number];

/** Keys cuyo config.days el service interpreta como umbral. */
export const TRIGGER_KEYS_WITH_DAYS: ReadonlySet<string> = new Set([
  "WINBACK",
  "TRIAL_EXPIRING",
  "ATTENDANCE_DROP",
]);

/** Modelo CrmTrigger (Prisma) - config: {days?, cooldownDays?}. */
export type CrmTrigger = {
  id: string;
  key: string;
  config: Record<string, unknown> | null;
  active: boolean;
};

/** Resultado de POST /crm/triggers/evaluate: {key: {evaluated, notified}}. */
export type TriggerEvalResult = { evaluated: number; notified: number };

// ─── Constantes y helpers ───

/** Segmentos que produce computeSegment (service). null → "NONE" en UI. */
export const SEGMENTS = ["NEW", "AT_RISK", "BRINGS_PEOPLE", "CORE"] as const;

export function actorKey(a: CrmActor): string {
  return `${a.actorType}:${a.actorId}`;
}

export function actorQuery(a: CrmActor): string {
  return `actorType=${a.actorType}&actorId=${encodeURIComponent(a.actorId)}`;
}

export function actorBody(a: CrmActor): { actorType: string; actorId: string } {
  return { actorType: a.actorType, actorId: a.actorId };
}
