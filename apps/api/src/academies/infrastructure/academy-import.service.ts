import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Academy } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { AuthService } from "../../auth/domain/auth.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import { studentInviteEmailHtml } from "./invite-emails";

/** Magic link largo - el alumno abre el correo días después. */
const INVITE_TOKEN_TTL = "7d";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Match case/accent-insensitive para nombres de plan/estilo/nivel. */
export function normLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

export type StudentRowStatus = "imported" | "updated" | "invited" | "error";
export interface StudentRowResult {
  row: number;
  email: string;
  status: StudentRowStatus;
  detail: string;
}

export type ScheduleRowStatus = "ok" | "warn" | "error";
export interface ScheduleRowResult {
  row: number;
  serie: string;
  status: ScheduleRowStatus;
  detail: string;
}

/**
 * Carga masiva CSV para migración de academias (spec academy-bulk-import):
 * alumnos (nómina con vigencias pagadas afuera) y horario semanal
 * (series + slots + materialización de clases del mes). Reporte por
 * fila - un error no aborta el archivo.
 */
@Injectable()
export class AcademyImportService {
  private readonly logger = new Logger(AcademyImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /**
   * Alumnos: `email,nombre,telefono?,plan,pagado_hasta?`.
   * Person inexistente → stub + invitación magic link. Enrollment:
   * si existe se actualiza (endsAt = max, planId = declarado); si no,
   * se crea ACTIVE con la vigencia importada.
   */
  async importStudents(
    academy: Academy,
    rows: Record<string, string>[],
  ): Promise<StudentRowResult[]> {
    const plans = await this.prisma.membershipPlan.findMany({
      where: { academyId: academy.id, active: true },
      select: { id: true, name: true },
    });
    const planByName = new Map(plans.map((p) => [normLabel(p.name), p]));

    const results: StudentRowResult[] = [];
    for (const [i, r] of rows.entries()) {
      const row = i + 2; // header es la fila 1 del CSV
      const email = r.email.trim().toLowerCase();
      const name = r.nombre?.trim() ?? "";
      const planName = r.plan?.trim() ?? "";
      try {
        if (!EMAIL_RE.test(email)) throw new RowError("email inválido");
        if (!name) throw new RowError("nombre requerido");
        const plan = planByName.get(normLabel(planName));
        if (!plan) {
          throw new RowError(`plan "${planName}" no existe en la academia`);
        }
        const endsAt = parsePaidThrough(r.pagado_hasta);

        let person = await this.prisma.person.findUnique({
          where: { email },
          select: { id: true, name: true },
        });
        const isNewPerson = !person;
        if (!person) {
          const phone = r.telefono?.trim() || null;
          try {
            person = await this.prisma.person.create({
              data: { email, name, phone },
              select: { id: true, name: true },
            });
          } catch (e) {
            // Person.phone es @unique - si el teléfono ya está en otra
            // cuenta se crea el stub igual, sin teléfono.
            if (!isUniqueViolation(e)) throw e;
            person = await this.prisma.person.create({
              data: { email, name },
              select: { id: true, name: true },
            });
          }
        }

        const existing = await this.prisma.enrollment.findFirst({
          where: { academyId: academy.id, personId: person.id },
          select: { id: true, endsAt: true },
        });
        if (existing) {
          const nextEnds =
            endsAt && (!existing.endsAt || endsAt > existing.endsAt)
              ? endsAt
              : existing.endsAt;
          await this.prisma.enrollment.update({
            where: { id: existing.id },
            data: { planId: plan.id, endsAt: nextEnds },
          });
        } else {
          await this.prisma.enrollment.create({
            data: {
              academyId: academy.id,
              personId: person.id,
              planId: plan.id,
              status: "ACTIVE",
              endsAt,
            },
          });
        }

        if (isNewPerson) {
          const sent = await this.sendStudentInvite(
            email,
            name,
            academy.name,
          );
          results.push({
            row,
            email,
            status: "invited",
            detail: sent
              ? `cuenta creada + invitación enviada (plan ${plan.name})`
              : `cuenta creada; invitación NO enviada - reintentar`,
          });
        } else {
          results.push({
            row,
            email,
            status: existing ? "updated" : "imported",
            detail: existing
              ? `inscripción actualizada (plan ${plan.name})`
              : `inscripción creada (plan ${plan.name})`,
          });
        }
      } catch (e) {
        results.push({
          row,
          email: email || `fila ${row}`,
          status: "error",
          detail: e instanceof RowError ? e.message : "error interno",
        });
        if (!(e instanceof RowError)) {
          this.logger.error(`importStudents fila ${row}: ${e}`);
        }
      }
    }
    return results;
  }

  /**
   * Horario: `serie,estilo?,nivel?,dia_semana,hora_inicio,hora_fin,
   * capacidad?,instructor_email?,mes?`. Agrupa por serie+mes → upsert
   * ClassSeries + slots dedup (weekday+start+end) + materializa los
   * Class del mes igual que POST /series.
   */
  async importSchedule(
    academy: Academy,
    rows: Record<string, string>[],
  ): Promise<ScheduleRowResult[]> {
    const [styles, levels, instructors] = await Promise.all([
      this.prisma.style.findMany({ select: { id: true, name: true } }),
      this.prisma.classLevel.findMany({ select: { id: true, name: true } }),
      this.prisma.academyInstructor.findMany({
        where: { academyId: academy.id },
        select: { personId: true },
      }),
    ]);
    const styleByName = new Map(styles.map((s) => [normLabel(s.name), s]));
    const levelByName = new Map(levels.map((l) => [normLabel(l.name), l]));
    const instructorIds = new Set(instructors.map((i) => i.personId));

    const defaultMonth = new Date().toISOString().slice(0, 7);
    const results: ScheduleRowResult[] = [];

    // Primera pasada: validar y agrupar por serie+mes (una serie por
    // grupo - el orden de filas define el orden de los slots).
    interface ParsedRow {
      row: number;
      serie: string;
      month: string;
      styleId: string | null;
      levelId: string | null;
      weekday: number;
      startTime: string;
      endTime: string;
      capacity: number | null;
      instructorId: string | null;
      warn: string | null;
    }
    const groups = new Map<string, ParsedRow[]>();

    for (const [i, r] of rows.entries()) {
      const row = i + 2;
      const serie = r.serie?.trim() ?? "";
      try {
        if (!serie) throw new RowError("serie requerida");
        const month = r.mes?.trim() || defaultMonth;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
          throw new RowError(`mes "${r.mes}" inválido (YYYY-MM)`);
        }
        const weekday = parseWeekday(r.dia_semana);
        if (weekday === null) {
          throw new RowError(
            `dia_semana "${r.dia_semana}" inválido (0-6 o nombre en español)`,
          );
        }
        const startTime = r.hora_inicio?.trim() ?? "";
        const endTime = r.hora_fin?.trim() ?? "";
        if (!/^\d{2}:\d{2}$/.test(startTime)) {
          throw new RowError(`hora_inicio "${startTime}" inválida (HH:MM)`);
        }
        if (!/^\d{2}:\d{2}$/.test(endTime)) {
          throw new RowError(`hora_fin "${endTime}" inválida (HH:MM)`);
        }
        if (startTime >= endTime) {
          throw new RowError("hora_inicio debe ser menor que hora_fin");
        }
        let capacity: number | null = null;
        if (r.capacidad?.trim()) {
          const n = Number(r.capacidad);
          if (!Number.isInteger(n) || n < 1) {
            throw new RowError(`capacidad "${r.capacidad}" inválida`);
          }
          capacity = n;
        }
        let styleId: string | null = null;
        if (r.estilo?.trim()) {
          const s = styleByName.get(normLabel(r.estilo));
          if (!s) throw new RowError(`estilo "${r.estilo}" no existe`);
          styleId = s.id;
        }
        let levelId: string | null = null;
        if (r.nivel?.trim()) {
          const l = levelByName.get(normLabel(r.nivel));
          if (!l) throw new RowError(`nivel "${r.nivel}" no existe`);
          levelId = l.id;
        }
        let instructorId: string | null = null;
        let warn: string | null = null;
        const instEmail = r.instructor_email?.trim().toLowerCase();
        if (instEmail) {
          const p = await this.prisma.person.findUnique({
            where: { email: instEmail },
            select: { id: true },
          });
          if (p && instructorIds.has(p.id)) {
            instructorId = p.id;
          } else {
            warn = `instructor ${instEmail} no encontrado - slot sin instructor`;
          }
        }
        const key = `${normLabel(serie)}|${month}`;
        const parsed: ParsedRow = {
          row,
          serie,
          month,
          styleId,
          levelId,
          weekday,
          startTime,
          endTime,
          capacity,
          instructorId,
          warn,
        };
        groups.set(key, [...(groups.get(key) ?? []), parsed]);
      } catch (e) {
        results.push({
          row,
          serie: serie || `fila ${row}`,
          status: "error",
          detail: e instanceof RowError ? e.message : "error interno",
        });
        if (!(e instanceof RowError)) {
          this.logger.error(`importSchedule fila ${row}: ${e}`);
        }
      }
    }

    // Segunda pasada: por grupo upsert serie + slots + clases.
    for (const parsedRows of groups.values()) {
      const first = parsedRows[0];
      const series = await this.upsertSeries(academy.id, first);
      const existingSlots = await this.prisma.classSlot.findMany({
        where: { seriesId: series.id },
        select: {
          id: true,
          weekday: true,
          startTime: true,
          endTime: true,
          classes: { select: { date: true } },
        },
      });
      const slotKey = (x: { weekday: number; startTime: string; endTime: string }) =>
        `${x.weekday}|${x.startTime}|${x.endTime}`;
      const byKey = new Map(existingSlots.map((s) => [slotKey(s), s]));
      const dates = monthDates(series.month);

      for (const p of parsedRows) {
        try {
          let slot = byKey.get(slotKey(p));
          if (!slot) {
            const created = await this.prisma.classSlot.create({
              data: {
                academyId: academy.id,
                seriesId: series.id,
                weekday: p.weekday,
                startTime: p.startTime,
                endTime: p.endTime,
                capacity: p.capacity,
                instructorId: p.instructorId,
              },
              select: {
                id: true,
                weekday: true,
                startTime: true,
                endTime: true,
                instructorId: true,
              },
            });
            slot = { ...created, classes: [] };
            byKey.set(slotKey(p), slot);
            // Materializa los Class del mes para el slot nuevo.
            const classDates = dates.filter(
              (d) => d.getUTCDay() === p.weekday,
            );
            if (classDates.length) {
              await this.prisma.class.createMany({
                data: classDates.map((date) => ({
                  classSlotId: slot!.id,
                  date,
                  instructorId: created.instructorId,
                })),
              });
            }
          }
          results.push({
            row: p.row,
            serie: p.serie,
            status: p.warn ? "warn" : "ok",
            detail:
              p.warn ??
              `slot ${dayName(p.weekday)} ${p.startTime}-${p.endTime} en "${series.name}" (${series.month})`,
          });
        } catch (e) {
          results.push({
            row: p.row,
            serie: p.serie,
            status: "error",
            detail: "error interno al crear el horario",
          });
          this.logger.error(`importSchedule fila ${p.row}: ${e}`);
        }
      }
    }

    return results.sort((a, b) => a.row - b.row);
  }

  private async upsertSeries(academyId: string, p: {
    serie: string;
    month: string;
    styleId: string | null;
    levelId: string | null;
    instructorId: string | null;
  }) {
    const existing = await this.prisma.classSeries.findFirst({
      where: { academyId, name: p.serie, month: p.month },
      select: { id: true, name: true, month: true },
    });
    if (existing) return existing;
    return this.prisma.classSeries.create({
      data: {
        academyId,
        name: p.serie,
        month: p.month,
        styleId: p.styleId,
        levelId: p.levelId,
        instructorId: p.instructorId,
      },
      select: { id: true, name: true, month: true },
    });
  }

  private async sendStudentInvite(
    email: string,
    name: string,
    academyName: string,
  ): Promise<boolean> {
    try {
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      const token = await this.auth.createMagicToken(
        email,
        false,
        INVITE_TOKEN_TTL,
      );
      const link = `${webUrl}/api/auth/verify?token=${token}`;
      await this.mailer.send(
        email,
        `${academyName} ya está en Omnidance - activa tu cuenta`,
        studentInviteEmailHtml({ personName: name, academyName, link }),
      );
      return true;
    } catch (e) {
      this.logger.error(
        `invitación alumno falló (${email}): ${
          e instanceof Error ? e.message : e
        }`,
      );
      return false;
    }
  }
}

class RowError extends Error {}

/** Prisma P2002 (unique constraint) sin importar el tipo cliente. */
function isUniqueViolation(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    (e as { code?: string }).code === "P2002"
  );
}

/** "YYYY-MM-DD" → endsAt al mediodía UTC (mañana en Chile): el día completo queda cubierto. */
function parsePaidThrough(raw: string | undefined): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new RowError(`pagado_hasta "${s}" inválido (YYYY-MM-DD)`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  if (Number.isNaN(d.getTime())) {
    throw new RowError(`pagado_hasta "${s}" inválido`);
  }
  return d;
}

function parseWeekday(raw: string | undefined): number | null {
  const s = raw?.trim().toLowerCase();
  if (!s) return null;
  if (/^[0-6]$/.test(s)) return Number(s);
  return WEEKDAYS[normLabel(s)] ?? null;
}

function dayName(w: number): string {
  return (
    [
      "domingo",
      "lunes",
      "martes",
      "miércoles",
      "jueves",
      "viernes",
      "sábado",
    ][w] ?? String(w)
  );
}

/** Días calendario del mes "YYYY-MM" (UTC) - igual que class-series. */
function monthDates(month: string): Date[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return [];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, i) => new Date(Date.UTC(y, m - 1, i + 1)),
  );
}
