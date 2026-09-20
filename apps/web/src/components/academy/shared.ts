// Tipos y helpers compartidos de la consola /academia.
// Contratos verificados contra:
//   apps/api/src/academies/infrastructure/academies.controller.ts
//   apps/api/src/academies/infrastructure/attendance.controller.ts

export const PLAN_TYPES = ["MONTHLY", "CLASS_PACK", "PERIOD", "TRIAL"] as const;
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
};

export type MembershipPlan = {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  classCount: number | null;
  periodDays: number | null;
  active: boolean;
};

// GET /academies/:id/students — person viene del join manual del controller;
// la API devuelve `startsAt` (mapeo de la columna startedAt). plan es nullable.
export type Student = {
  id: string;
  person: { id: string; name: string | null; email: string | null };
  plan: { name: string } | null;
  status: EnrollmentStatus;
  startsAt: string | null;
};

export type ClassSlot = {
  id: string;
  weekday: number; // 0-6, domingo = 0
  startTime: string; // "19:00"
  endTime: string;
  capacity: number;
};

// GET /academies/:id/attendance — person viene del join manual del controller
// (Attendance.personId es FK plana en schema); personId se mantiene por compat.
export type AttendanceItem = {
  id: string;
  personId: string;
  person: { id: string; name: string | null; email: string | null };
  checkedAt: string;
  class: { id: string; date: string; classSlotId: string };
};

// ─── consola de instructor + quórum (contratos nuevos) ───

// GET /classes/teaching — clases asignadas al instructor (próximas ~30d),
// cross-academia: por eso el ítem trae academyName y no se filtra por la
// academia seleccionada del gate.
export type TeachingClass = {
  id: string;
  date: string; // ISO — medianoche UTC (mismo manejo que /clases)
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

// GET /classes/:id/roster — detalle de la clase + reservas y espera.
export type ClassRoster = {
  class: {
    id: string;
    date: string; // ISO — medianoche UTC
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

// GET /academies/:id/students/:personId — perfil del alumno con historial.
// status es string libre del server: attended|booked|cancelled en history,
// BOOKED|WAITLIST en upcoming (casing distinto en cada lista, por contrato).
export type StudentProfile = {
  person: { id: string; name: string | null };
  plan: { name: string } | null;
  enrollmentStatus: string;
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

// Día calendario de una Class (date llega a medianoche UTC — formatear en
// UTC para que el día no se corra en zonas negativas; mismo fmt que /clases).
export const classDayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

// Fallback visible cuando el API no entrega nombre (personId crudo).
export function shortId(id: string): string {
  return id.slice(0, 8);
}

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
    // Body no-JSON (proxy caído, HTML de error) — fallback del catálogo.
  }
  return null;
}

// Inputs compactos dark-first; min-h-11 = touch target 44px.
export const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-3 " +
  "text-sm text-white placeholder:text-white/50 " +
  "focus:border-neon/60 focus-visible:ring-2 focus-visible:ring-neon/50 disabled:opacity-50";
