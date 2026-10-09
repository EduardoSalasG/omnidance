import type { EnrollmentStatus } from "@prisma/client";

/**
 * Contextos mínimos (puros) - la infraestructura los arma desde Prisma.
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
  /** Colaboradores delegados (spec academy-staff-roles). */
  staff?: AcademyStaffContext[];
}

/**
 * Capacidades delegables de la consola de academia (spec
 * academy-staff-roles). Cada flag de `AcademyStaff` abre una familia de
 * endpoints; el owner las tiene todas implícitas.
 */
export type AcademyCapability =
  | "students"
  | "payments"
  | "plans"
  | "schedule"
  | "profile"
  | "team"
  | "billing";

export const ACADEMY_CAPABILITIES: readonly AcademyCapability[] = [
  "students",
  "payments",
  "plans",
  "schedule",
  "profile",
  "team",
  "billing",
];

export interface AcademyStaffContext {
  personId: string;
  caps: Record<AcademyCapability, boolean>;
}

/** Cupos por defecto cuando ningún nivel de la cadena declara quórum. */
export const DEFAULT_CLASS_QUORUM = 20;

/**
 * Inicio real de la clase: Class.date (medianoche UTC del día) +
 * slot.startTime "HH:mm". El check "la clase ya pasó", el corte de
 * devolución y la venta de clase suelta operan sobre este instante -
 * no sobre la medianoche del día.
 */
export function classStart(date: Date, startTime: string): Date {
  const [h, m] = startTime.split(":").map(Number);
  return new Date(date.getTime() + ((h || 0) * 60 + (m || 0)) * 60_000);
}

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
 * Gestión operativa de la academia (ver detalle, tomar asistencia,
 * listado de alumnos): owner, instructor asignado, colaborador staff
 * (cualquier flag - spec academy-staff-roles) o ADMIN de plataforma.
 */
export function canManageAcademy(
  person: PersonContext,
  academy: AcademyContext,
): boolean {
  if (person.isAdmin) return true;
  if (academy.ownerId === person.id) return true;
  if (academy.staff?.some((s) => s.personId === person.id)) return true;
  return academy.instructorIds.includes(person.id);
}

/**
 * Administración de la academia (planes, enrollments, slots, dashboard,
 * listado de asistencia): solo owner o ADMIN - el instructor no administra.
 */
export function canAdministerAcademy(
  person: PersonContext,
  academy: AcademyContext,
): boolean {
  if (person.isAdmin) return true;
  return academy.ownerId === person.id;
}

/**
 * Acceso por capacidad delegada (spec academy-staff-roles): owner y
 * ADMIN pasan siempre; un colaborador pasa solo si su fila staff tiene
 * el flag de la capacidad pedida. El instructor no tiene capacidades.
 */
export function canAcademy(
  person: PersonContext,
  academy: AcademyContext,
  cap: AcademyCapability,
): boolean {
  if (canAdministerAcademy(person, academy)) return true;
  const row = academy.staff?.find((s) => s.personId === person.id);
  return row?.caps[cap] === true;
}

/**
 * Miembro del equipo (owner, staff con cualquier flag, ADMIN): gates de
 * lectura operativa como el dashboard - no expone una capacidad concreta.
 */
export function isAcademyStaff(
  person: PersonContext,
  academy: AcademyContext,
): boolean {
  if (canAdministerAcademy(person, academy)) return true;
  return academy.staff?.some((s) => s.personId === person.id) === true;
}

/**
 * Matriz de transiciones válidas de EnrollmentStatus.
 * Schema: ACTIVE | PAUSED | TRIAL | FROZEN | ONLINE (sin CANCELLED - gap
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

export interface ActiveStudentsKpis {
  // Personas únicas con plan vigente este mes (spec
  // academies/owner-insights: alumnos activos = personas, no
  // enrollments - quien paga 2 planes cuenta 1).
  activeStudentsMonth: number;
  // Mismo criterio sobre la ventana MTD del mes anterior (el estado
  // actual del enrollment aproxima el histórico - no hay log).
  activeStudentsMonthPrev: number;
  // % entero sobre activos únicos; null sin base. OTHER/sin declarar
  // cuentan en el denominador - M + F puede no sumar 100.
  pctMenMonth: number | null;
  pctWomenMonth: number | null;
  pctMenMonthPrev: number | null;
  pctWomenMonthPrev: number | null;
}

/**
 * KPIs de alumnos activos + composición por género (spec
 * academies/owner-insights). `nowIds`/`prevIds` traen un personId por
 * enrollment que calza la ventana - la deduplicación por persona se
 * hace acá. `genderById` resuelve el gender declarado de cada persona.
 */
export function computeActiveStudentsKpis(input: {
  nowIds: string[];
  prevIds: string[];
  genderById: ReadonlyMap<string, string | null>;
}): ActiveStudentsKpis {
  const nowSet = [...new Set(input.nowIds)];
  const prevSet = [...new Set(input.prevIds)];
  const pct = (ids: string[], gender: "M" | "F"): number | null =>
    ids.length === 0
      ? null
      : Math.round(
          (ids.filter((id) => input.genderById.get(id) === gender).length /
            ids.length) *
            100,
        );
  return {
    activeStudentsMonth: nowSet.length,
    activeStudentsMonthPrev: prevSet.length,
    pctMenMonth: pct(nowSet, "M"),
    pctWomenMonth: pct(nowSet, "F"),
    pctMenMonthPrev: pct(prevSet, "M"),
    pctWomenMonthPrev: pct(prevSet, "F"),
  };
}

export interface UpcomingBirthday {
  personId: string;
  name: string;
  // Cumpleaños de este año (o del siguiente si ya pasó) - día/mes de
  // celebración; el año de nacimiento nunca se expone.
  date: Date;
  daysUntil: number;
}

/**
 * Cumpleaños próximos de los alumnos (spec academies/owner-insights):
 * día/mes de `birthDate` dentro de `windowDays` desde `todayUTC`
 * (medianoche UTC, misma convención que Class.date). El 29-feb en año
 * no bisiesto cae al 1-mar por overflow de Date.UTC - aceptable como
 * fecha de celebración.
 */
export function computeUpcomingBirthdays(
  persons: { id: string; name: string; birthDate: Date | null }[],
  todayUTC: Date,
  windowDays: number,
): UpcomingBirthday[] {
  const todayMs = todayUTC.getTime();
  const year = todayUTC.getUTCFullYear();
  const out: UpcomingBirthday[] = [];
  for (const p of persons) {
    if (!p.birthDate) continue;
    const month = p.birthDate.getUTCMonth();
    const day = p.birthDate.getUTCDate();
    let bday = Date.UTC(year, month, day);
    if (bday < todayMs) bday = Date.UTC(year + 1, month, day);
    const daysUntil = Math.round((bday - todayMs) / 86_400_000);
    if (daysUntil > windowDays) continue;
    out.push({
      personId: p.id,
      name: p.name,
      date: new Date(bday),
      daysUntil,
    });
  }
  return out.sort(
    (a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name, "es"),
  );
}
