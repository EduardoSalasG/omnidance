// Tipos y helpers compartidos de la consola /academia.
// Contratos verificados contra:
//   apps/api/src/academies/infrastructure/academies.controller.ts
//   apps/api/src/academies/infrastructure/attendance.controller.ts

export const PLAN_TYPES = [
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "SINGLE",
  "CLASS_PACK",
  "PERIOD",
  "TRIAL",
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

// Espejo de ENROLLMENT_STATUSES del controller (CANCELLED no existe en el enum).
export const ENROLLMENT_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "TRIAL",
  "FROZEN",
  "ONLINE",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export type Academy = {
  id: string;
  name: string;
  ownerId: string;
  active: boolean;
  createdAt: string;
  // Quórum default de la academia (PATCH /academies/:id/settings).
  // Opcional hasta que el backend exponga la columna en GET /academies/mine.
  defaultQuorum?: number | null;
  // Perfil público editable vía PATCH /academies/:id/settings.
  description?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  instagram?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  // Precio de la clase particular vendida como producto (PATCH settings;
  // null = no se vende). El owner asigna instructor+fecha post-compra.
  privateLessonPrice?: number | null;
  // Suscripción SaaS de la plataforma (spec academy-saas-billing):
  // GET /academies/mine devuelve la fila completa - tier/ciclo, trial,
  // gracia y bloqueo por mora alimentan el banner de la consola.
  tier?: string | null;
  billingCycle?: string | null;
  trialEndsAt?: string | null;
  billingGraceUntil?: string | null;
  billingBlockedAt?: string | null;
};

export type AcademyDashboard = {
  studentsByStatus: {
    active: number;
    trial: number;
    paused: number;
    frozen: number;
    online: number;
  };
  totalStudents: number;
  plansCount: number;
  attendanceLast30d: number;
  // Spec §13: "asistencia de hoy, clases del día" en el dashboard.
  attendanceToday: number;
  todayClasses: TodayClass[];
  // Insights de retención (spec academies/owner-insights): vigencias
  // dentro de academy.insights.expiring_days y cumpleaños dentro de
  // academy.insights.birthday_days (PlatformParam, defaults 14/30).
  expiringEnrollments: ExpiringEnrollment[];
  upcomingBirthdays: UpcomingBirthday[];
};

// Inscripción con vigencia próxima a terminar (GET dashboard).
export type ExpiringEnrollment = {
  personId: string;
  personName: string | null;
  planName: string | null;
  status: EnrollmentStatus;
  endsAt: string;
};

// Cumpleaños próximo de un alumno - `date` es día/mes de celebración
// (este año o el siguiente); el año de nacimiento nunca se expone.
export type UpcomingBirthday = {
  personId: string;
  name: string;
  date: string;
  daysUntil: number;
};

// Clase del día en el dashboard de la academia (GET /academies/:id/dashboard).
export type TodayClass = {
  id: string;
  startTime: string; // "19:00"
  endTime: string;
  seriesName: string | null;
  instructorName: string | null;
  bookedCount: number;
  capacity: number | null;
};

export type MembershipPlan = {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  classCount: number | null;
  // Cuota semanal del plan (planes por tiempo); null = ilimitado.
  weeklyClasses: number | null;
  periodDays: number | null;
  description: string[];
  active: boolean;
  // Espejo en Flow (omni_<id>) - presente cuando algún subscribe lo
  // materializó; si existe, PATCH no permite cambiar `type`.
  flowPlanId?: string | null;
};

// GET /academies/:id/students - person viene del join manual del controller;
// la API devuelve `startsAt` (mapeo de la columna startedAt). plan es nullable.
export type Student = {
  id: string;
  person: { id: string; name: string | null; email: string | null };
  plan: { name: string } | null;
  status: EnrollmentStatus;
  startsAt: string | null;
  /** "Pagado hasta" - vigencia del plan; null = sin fecha registrada. */
  endsAt: string | null;
};

// GET /academies/:id/series - espejo del SERIES_INCLUDE del controller
// (style/level/types via join, slots ordenados por weekday+startTime).
export type NamedRef = { id: string; name: string };
export type SeriesStyle = NamedRef & { genre: string };
export type SeriesLevel = NamedRef & { order: number };

export type SeriesSlot = {
  id: string;
  weekday: number; // 0-6, domingo = 0
  startTime: string; // "19:00"
  endTime: string;
  capacity: number;
  instructorId: string | null;
  // Modalidad propia del horario - vacío = hereda los types de la serie.
  types: { type: NamedRef }[];
};

export type Series = {
  id: string;
  name: string;
  description: string | null;
  month: string; // "YYYY-MM"
  active: boolean;
  instructorId: string | null;
  // Override de quórum por serie (PATCH acepta quorum; null = hereda el
  // defaultQuorum de la academia). Opcional hasta que el backend lo exponga.
  quorum?: number | null;
  // CLP - precio de la clase suelta (null = no se vende suelta).
  dropInPrice?: number | null;
  style: NamedRef | null;
  level: NamedRef | null;
  types: { type: NamedRef }[];
  slots: SeriesSlot[];
};

// GET /academies/:id solo devuelve personIds; los nombres se cosechan
// del directorio GET /academies (mismo patrón que private-lessons).
export type AcademyInstructor = { personId: string; name: string | null };

// GET /academies/:id/slots - todo slot pertenece a una serie (invariante
// de schema); capacity null = hereda el quórum de la serie/academia.
export type ClassSlot = {
  id: string;
  weekday: number; // 0-6, domingo = 0
  startTime: string; // "19:00"
  endTime: string;
  capacity: number | null;
  series: { id: string; name: string };
  types: { type: { id: string; name: string } }[];
};

// GET /academies/:id/attendance - person viene del join manual del controller
// (Attendance.personId es FK plana en schema); personId se mantiene por compat.
export type AttendanceItem = {
  id: string;
  personId: string;
  person: { id: string; name: string | null; email: string | null };
  checkedAt: string;
  class: { id: string; date: string; classSlotId: string };
};

// ─── consola de instructor + quórum (contratos nuevos) ───

// GET /classes/teaching - clases asignadas al instructor (próximas ~30d),
// cross-academia: por eso el ítem trae academyName y no se filtra por la
// academia seleccionada del gate.
export type TeachingClass = {
  id: string;
  date: string; // ISO - medianoche UTC (mismo manejo que /clases)
  startTime: string; // "19:00"
  endTime: string;
  academyName: string;
  seriesName: string | null;
  styleName: string | null;
  levelName: string | null;
  instructorName: string | null;
  quorum: number;
  bookedCount: number;
  waitlistCount: number;
};

// GET /classes/:id/roster - detalle de la clase + reservas y espera.
export type ClassRoster = {
  class: {
    id: string;
    date: string; // ISO - medianoche UTC
    startTime: string;
    endTime: string;
    seriesName: string | null;
    styleName: string | null;
    levelName: string | null;
    instructor: { id: string; name: string | null } | null;
  };
  quorum: number;
  booked: { personId: string; name: string | null; createdAt: string }[];
  waitlist: { personId: string; name: string | null; createdAt: string }[];
};

// GET /academies/:id/students/:personId - perfil del alumno con historial.
// status es string libre del server: attended|booked|cancelled en history,
// BOOKED|WAITLIST en upcoming (casing distinto en cada lista, por contrato).
export type StudentProfile = {
  person: { id: string; name: string | null };
  plan: { name: string } | null;
  enrollmentStatus: string;
  enrollmentStartedAt: string | null;
  enrollmentEndsAt: string | null;
  history: {
    classId: string;
    date: string;
    seriesName: string | null;
    styleName: string | null;
    status: string;
  }[];
  upcoming: {
    classId: string;
    date: string;
    seriesName: string | null;
    status: string;
  }[];
};

// Día calendario de una Class (date llega a medianoche UTC - formatear en
// UTC para que el día no se corra en zonas negativas; mismo fmt que /clases).
export const classDayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// Vigencia del enrollment (startedAt/endsAt llegan como ISO real, no
// medianoche UTC - formatear en zona local, distinto de classDayFmt).
export const planDateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Cumpleaños (date llega a medianoche UTC - formatear en UTC para que
// el día no se corra; solo día/mes, el año nunca se muestra).
export const birthdayFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// Fallback visible cuando el API no entrega nombre (personId crudo).
export function shortId(id: string): string {
  return id.slice(0, 8);
}

// <input type="date"> trabaja en fecha local YYYY-MM-DD; endsAt llega ISO.
export const toDateInput = (iso: string) => {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// Un "YYYY-MM-DD" del input se manda como mediodía local - si se envía
// crudo el server lo parsea como medianoche UTC y el día se corre en
// zonas negativas (CLT = UTC-3/-4).
export const fromDateInput = (v: string) =>
  new Date(`${v}T12:00:00`).toISOString();

/**
 * Extrae `message` de una respuesta de error de NestJS
 * (string o string[] de class-validator). null → el caller usa fallback i18n.
 */
export async function readError(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "message" in body) {
      const msg = (body as { message: unknown }).message;
      if (typeof msg === "string" && msg.length > 0) return msg;
      if (Array.isArray(msg)) {
        const parts = msg.filter(
          (m): m is string => typeof m === "string" && m.length > 0,
        );
        if (parts.length > 0) return parts.join(" · ");
      }
    }
  } catch {
    // Body no-JSON (proxy caído, HTML de error) - fallback del catálogo.
  }
  return null;
}

// Inputs compactos dark-first; min-h-11 = touch target 44px.
export const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-3 " +
  "text-sm text-white placeholder:text-white/50 " +
  "focus:border-neon/60 focus-visible:ring-2 focus-visible:ring-neon/50 disabled:opacity-50";
