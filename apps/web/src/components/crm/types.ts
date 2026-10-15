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
  // Desglose del score (spec academy-score-refine) - null en scores
  // previos al cambio.
  breakdown: Record<string, unknown> | null;
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
 *  Los criterios de alumnos solo valen para actorType ACADEMY (400 si no).
 *  segmentRef apunta a un ActorSegment guardado (crm-dynamic-segments). */
export type CampaignSegment = {
  tags?: string[];
  segment?: string;
  personIds?: string[];
  allStudents?: boolean;
  enrollmentStatus?: string[];
  planId?: string;
  seriesId?: string;
  segmentRef?: string;
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

/** Modelo Campaign (Prisma). result tras send:
 *  {sent, code?, audienceIds?, at}. metrics llega solo en detalle SENT
 *  (spec crm-campaign-ops). */
export type CrmCampaign = {
  id: string;
  name: string;
  segment: CampaignSegment;
  action: CampaignAction;
  status: string; // DRAFT | SCHEDULED | SENT | DONE
  scheduledAt?: string | null;
  result: {
    sent?: number;
    code?: string;
    audienceIds?: string[];
    at?: string;
  } | null;
  metrics?: {
    sent: number;
    redemptions: number | null;
    engaged: number | null;
  } | null;
  createdAt: string;
};

// ─── Triggers ───

/** CRM_TRIGGER_KEYS del service - enum cerrado, no libre. */
export const CRM_TRIGGER_KEYS = [
  "WINBACK",
  "TRIAL_EXPIRING",
  "REGULAR_NO_PRESALE",
  "ATTENDANCE_DROP",
  "SEGMENT_ENTER",
  "SEGMENT_EXIT",
] as const;
export type CrmTriggerKey = (typeof CRM_TRIGGER_KEYS)[number];

/** Keys cuyo config.days el service interpreta como umbral. */
export const TRIGGER_KEYS_WITH_DAYS: ReadonlySet<string> = new Set([
  "WINBACK",
  "TRIAL_EXPIRING",
  "ATTENDANCE_DROP",
]);

/** Keys dirigidos por evento de membresía (spec crm-dynamic-segments):
 *  config = {segmentId, action:{type,title?,body?,tag?}} - no usan
 *  days/cooldownDays (el dedup es por día + dirección). */
export const EVENT_TRIGGER_KEYS: ReadonlySet<string> = new Set([
  "SEGMENT_ENTER",
  "SEGMENT_EXIT",
]);

/** Acciones del trigger de segmento (config.action.type). */
export const SEGMENT_TRIGGER_ACTIONS = [
  "NOTIFY",
  "NOTIFY_OWNER",
  "TAG_ADD",
  "TAG_REMOVE",
] as const;
export type SegmentTriggerAction =
  (typeof SEGMENT_TRIGGER_ACTIONS)[number];

/** Modelo CrmTrigger (Prisma) - config: {days?, cooldownDays?}. */
export type CrmTrigger = {
  id: string;
  key: string;
  config: Record<string, unknown> | null;
  active: boolean;
};

/** Resultado de POST /crm/triggers/evaluate: {key: {evaluated, notified}}. */
export type TriggerEvalResult = { evaluated: number; notified: number };

// ─── Segmentos dinámicos (crm-dynamic-segments) ───

/** Condición de regla de ActorSegment ({field, op, value}). */
export type CrmRuleCondition = {
  field: string;
  op: string;
  value: string | number;
};

/** rules Json de ActorSegment: {match, conditions}. */
export type CrmSegmentRules = {
  match: "all" | "any";
  conditions: CrmRuleCondition[];
};

/** Fila de GET /crm/segments. */
export type CrmSegment = {
  id: string;
  actorType: string;
  actorId: string;
  name: string;
  rules: CrmSegmentRules;
  members: number;
  createdAt: string;
  updatedAt: string;
};

/** GET /crm/segments/:id/people. */
export type CrmSegmentPeople = {
  total: number;
  items: {
    personId: string;
    since: string;
    person: { id: string; name: string; photoUrl: string | null } | null;
  }[];
};

/** Campos de regla que el API acepta (espejo de SEGMENT_RULE_OPS del
 *  service). num = input numérico; seg = select de segmento computado;
 *  tag = input de texto. */
export const RULE_FIELDS = [
  "score",
  "attendanceRecent",
  "weeklyStreak",
  "monthsContinuous",
  "purchases",
  "earlyPurchases",
  "tenure",
  "referrals",
  "spend",
  "segment",
  "tag",
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPS: Record<RuleField, string[]> = {
  score: ["eq", "neq", "gt", "gte", "lt", "lte"],
  attendanceRecent: ["eq", "neq", "gt", "gte", "lt", "lte"],
  weeklyStreak: ["eq", "neq", "gt", "gte", "lt", "lte"],
  monthsContinuous: ["eq", "neq", "gt", "gte", "lt", "lte"],
  purchases: ["eq", "neq", "gt", "gte", "lt", "lte"],
  earlyPurchases: ["eq", "neq", "gt", "gte", "lt", "lte"],
  tenure: ["eq", "neq", "gt", "gte", "lt", "lte"],
  referrals: ["eq", "neq", "gt", "gte", "lt", "lte"],
  spend: ["eq", "neq", "gt", "gte", "lt", "lte"],
  segment: ["eq", "neq"],
  tag: ["present", "absent"],
};

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
