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

// GET /academies/:id/attendance — personId es FK plana (sin join de nombre).
export type AttendanceItem = {
  id: string;
  personId: string;
  checkedAt: string;
  class: { id: string; date: string; classSlotId: string };
};

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
  "text-sm text-white placeholder:text-white/30 " +
  "focus:border-neon/60 focus:outline-none disabled:opacity-50";
