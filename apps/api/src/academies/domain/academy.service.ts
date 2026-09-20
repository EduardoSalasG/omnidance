import type { EnrollmentStatus } from "@prisma/client";

/**
 * Contextos mínimos (puros) — la infraestructura los arma desde Prisma.
 * No dependen de NestJS ni de PrismaService para mantener el dominio testeable.
 */
export interface PersonContext {
  id: string;
  roles: string[];
  /** Resuelto por infraestructura vía roleKeysHavePermission (admin.access). */
  isAdmin?: boolean;
}

export interface AcademyContext {
  ownerId: string;
  instructorIds: string[];
}

/** Cupos por defecto cuando ningún nivel de la cadena declara quórum. */
export const DEFAULT_CLASS_QUORUM = 20;

/**
 * Quórum efectivo de una clase (cupos). Cadena de herencia:
 * class.capacity → slot.capacity → series.quorum → academy.defaultQuorum → 20.
 */
export function effectiveCapacity(input: {
  classCapacity?: number | null;
  slotCapacity?: number | null;
  seriesQuorum?: number | null;
  academyDefaultQuorum?: number | null;
}): number {
  return (
    input.classCapacity ??
    input.slotCapacity ??
    input.seriesQuorum ??
    input.academyDefaultQuorum ??
    DEFAULT_CLASS_QUORUM
  );
}

export class InvalidEnrollmentTransitionError extends Error {
  constructor(
    public readonly from: EnrollmentStatus,
    public readonly to: EnrollmentStatus,
  ) {
    super(`transición de enrollment inválida: ${from} → ${to}`);
    this.name = "InvalidEnrollmentTransitionError";
  }
}

/**
 * Gestión operativa de la academia (ver detalle, tomar asistencia):
 * owner de la academia, instructor asignado o ADMIN de plataforma.
 */
export function canManageAcademy(
  person: PersonContext,
  academy: AcademyContext,
): boolean {
  if (person.isAdmin) return true;
  if (academy.ownerId === person.id) return true;
  return academy.instructorIds.includes(person.id);
}

/**
 * Administración de la academia (planes, enrollments, slots, dashboard,
 * listado de asistencia): solo owner o ADMIN — el instructor no administra.
 */
export function canAdministerAcademy(
  person: PersonContext,
  academy: AcademyContext,
): boolean {
  if (person.isAdmin) return true;
  return academy.ownerId === person.id;
}

/**
 * Matriz de transiciones válidas de EnrollmentStatus.
 * Schema: ACTIVE | PAUSED | TRIAL | FROZEN | ONLINE (sin CANCELLED — gap
 * reportado: la spec pedía CANCELLED; no existe en el enum actual).
 * La transición idempotente (mismo status) siempre se permite.
 */
const ENROLLMENT_TRANSITIONS: Record<
  EnrollmentStatus,
  readonly EnrollmentStatus[]
> = {
  TRIAL: ["ACTIVE", "PAUSED"],
  ACTIVE: ["PAUSED", "FROZEN", "ONLINE"],
  PAUSED: ["ACTIVE", "FROZEN"],
  FROZEN: ["ACTIVE"],
  ONLINE: ["ACTIVE", "PAUSED", "FROZEN"],
};

export function assertEnrollmentTransition(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): void {
  if (from === to) return; // idempotente
  if (!ENROLLMENT_TRANSITIONS[from].includes(to)) {
    throw new InvalidEnrollmentTransitionError(from, to);
  }
}

export interface DashboardInput {
  enrollments: { status: EnrollmentStatus }[];
  plansCount: number;
  attendanceLast30d: number;
}

export interface AcademyDashboard {
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
}

/**
 * KPIs del dashboard de la academia (spec: contadores por status +
 * asistencia de los últimos 30 días).
 */
export function computeDashboard(input: DashboardInput): AcademyDashboard {
  const studentsByStatus = {
    active: 0,
    trial: 0,
    paused: 0,
    frozen: 0,
    online: 0,
  };
  for (const e of input.enrollments) {
    switch (e.status) {
      case "ACTIVE":
        studentsByStatus.active++;
        break;
      case "TRIAL":
        studentsByStatus.trial++;
        break;
      case "PAUSED":
        studentsByStatus.paused++;
        break;
      case "FROZEN":
        studentsByStatus.frozen++;
        break;
      case "ONLINE":
        studentsByStatus.online++;
        break;
    }
  }
  return {
    studentsByStatus,
    totalStudents: input.enrollments.length,
    plansCount: input.plansCount,
    attendanceLast30d: input.attendanceLast30d,
  };
}
