import { Injectable, Logger } from "@nestjs/common";
import { Gender, type Academy, type Prisma } from "@prisma/client";
import { InvalidPhoneError, normalizePhone } from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { emitActivity } from "../../common/activity-log";
import {
  AcademyMaterializeService,
  monthDates,
} from "./class-series-materialize.service";
import { AcademyInvitesService } from "./academy-invites.service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Match case/accent-insensitive para nombres de plan/estilo/nivel. */
function normLabel(s: string): string {
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

type StudentRowStatus = "invited" | "resent" | "skipped" | "error";
export interface StudentRowResult {
  row: number;
  email: string;
  status: StudentRowStatus;
  detail: string;
}

type ScheduleRowStatus = "ok" | "warn" | "error";
export interface ScheduleRowResult {
  row: number;
  serie: string;
  status: ScheduleRowStatus;
  detail: string;
}

export interface ImportRunOptions {
  /** Vista previa: misma tubería sin escrituras ni envíos. */
  dryRun?: boolean;
  /** Staff/owner que corre el import (invite.invitedById + run.createdById). */
  createdById: string;
  fileName?: string;
}

export interface StudentsImportResult {
  total: number;
  invited: number;
  resent: number;
  skipped: number;
  errors: { row: number; message: string }[];
  results: StudentRowResult[];
  runId: string | null;
}

export interface ScheduleImportResult {
  total: number;
  ok: number;
  warn: number;
  errors: { row: number; message: string }[];
  results: ScheduleRowResult[];
  runId: string | null;
}

/**
 * Carga masiva CSV (spec academies/bulk-import): alumnos = canal de
 * invitación (AcademyInvite, nunca Enrollment - change
 * academy-import-invites) y horario semanal (series + slots +
 * materialización sobre la ventana rodante). Reporte por fila - un
 * error no aborta el archivo; `dryRun` valida sin escribir; cada
 * corrida real persiste AcademyImportRun para el historial.
 */
@Injectable()
export class AcademyImportService {
  private readonly logger = new Logger(AcademyImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materialize: AcademyMaterializeService,
    private readonly notifications: NotificationsService,
    private readonly invites: AcademyInvitesService,
  ) {}

  /**
   * Alumnos (change academy-import-invites): el import es canal de
   * INVITACIÓN - por fila válida crea/actualiza la Person stub con los
   * campos presentes y aplica el patrón AcademyInvite (spec
   * academies/student-invites). NUNCA escribe Enrollment: la
   * inscripción nace cuando la persona compra su plan o el staff la
   * liquida. Skip: email con Enrollment ACTIVE en la academia (ya es
   * alumno vigente; igual actualiza campos de Person) y email
   * duplicado dentro de la planilla. Columnas legacy `plan`/
   * `pagado_hasta` se ignoran.
   */
  async importStudents(
    academy: Academy,
    rows: Record<string, string>[],
    opts: ImportRunOptions,
  ): Promise<StudentsImportResult> {
    // País de la academia (spec multipais-phone): defaultCountry para
    // normalizar la columna `telefono` a E.164. Sin ciudad → CL.
    const academyCountry = academy.cityId
      ? ((
          await this.prisma.city.findUnique({
            where: { id: academy.cityId },
            select: { country: { select: { code: true } } },
          })
        )?.country.code ?? "CL")
      : "CL";

    const seen = new Set<string>();
    const results: StudentRowResult[] = [];
    for (const [i, r] of rows.entries()) {
      const row = i + 2; // header es la fila 1 del CSV
      const email = r.email.trim().toLowerCase();
      const name = r.nombre?.trim() ?? "";
      try {
        if (!EMAIL_RE.test(email)) throw new RowError("email inválido");
        if (!name) throw new RowError("nombre requerido");
        if (seen.has(email)) {
          results.push({
            row,
            email,
            status: "skipped",
            detail: "email duplicado en la planilla",
          });
          continue;
        }
        seen.add(email);
        const nationalId = normNationalId(r.rut || r.dni || r.documento);
        const birthDate = parseBirthDate(r.fecha_nacimiento);
        const gender = parseGender(r.sexo);
        // Spec multipais-phone: `telefono` se normaliza a E.164 con el
        // país de la academia; fila inválida = error de fila.
        const rawPhone = r.telefono?.trim() ?? "";
        const phoneFields = rowPhone(rawPhone, academyCountry);

        let person = await this.prisma.person.findUnique({
          where: { email },
          select: { id: true, name: true },
        });
        if (person && !opts.dryRun) {
          // Update por email: solo se setean los campos presentes en la
          // fila - celda vacía conserva el dato previo.
          const data: Prisma.PersonUpdateInput = {};
          if (rawPhone) {
            data.phone = phoneFields.phone;
            data.phoneCountryCode = phoneFields.phoneCountryCode;
          }
          if (nationalId) data.nationalId = nationalId;
          if (birthDate) data.birthDate = birthDate;
          if (gender) data.gender = gender;
          if (Object.keys(data).length) {
            try {
              await this.prisma.person.update({
                where: { id: person.id },
                data,
              });
            } catch (e) {
              if (!isUniqueViolation(e)) throw e;
              delete data.phone;
              delete data.phoneCountryCode;
              if (Object.keys(data).length) {
                await this.prisma.person.update({
                  where: { id: person.id },
                  data,
                });
              }
            }
          }
        } else if (!person && !opts.dryRun) {
          try {
            person = await this.prisma.person.create({
              data: {
                email,
                name,
                phone: phoneFields.phone,
                phoneCountryCode: phoneFields.phoneCountryCode,
                nationalId,
                birthDate,
                gender,
              },
              select: { id: true, name: true },
            });
          } catch (e) {
            // Person.phone es @unique - si el teléfono ya está en otra
            // cuenta se crea el stub igual, sin teléfono.
            if (!isUniqueViolation(e)) throw e;
            person = await this.prisma.person.create({
              data: { email, name, nationalId, birthDate, gender },
              select: { id: true, name: true },
            });
          }
          // Línea de vida admin (spec platform-trials §5b): alta por
          // importación masiva de alumnos.
          await emitActivity(this.prisma, {
            type: "person.registered",
            personId: person.id,
            refType: "Person",
            refId: person.id,
            data: { via: "academy.import" },
          });
        }

        // Ya es alumno vigente → skip del flujo de invitación (la
        // actualización de Person de arriba igual aplica - el roster
        // sigue sirviendo para sincronizar datos).
        if (person) {
          const active = await this.prisma.enrollment.findFirst({
            where: {
              academyId: academy.id,
              personId: person.id,
              status: "ACTIVE",
            },
            select: { id: true },
          });
          if (active) {
            results.push({
              row,
              email,
              status: "skipped",
              detail: "ya tiene inscripción vigente",
            });
            continue;
          }
        }

        const outcome = await this.invites.sendInvite(academy, {
          email,
          name,
          invitedById: opts.createdById,
          dryRun: opts.dryRun,
        });
        const who = outcome.personExists
          ? " (cuenta existente: mail + push)"
          : " (cuenta nueva)";
        if (outcome.resent) {
          results.push({
            row,
            email,
            status: "resent",
            detail: opts.dryRun
              ? "se reenviará la invitación pendiente"
              : "invitación reenviada",
          });
        } else {
          results.push({
            row,
            email,
            status: "invited",
            detail: opts.dryRun
              ? `se enviará invitación${who}`
              : outcome.sent
                ? `invitación enviada${who}`
                : "invitación creada; mail NO enviado - reintentar",
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

    const counts = { invited: 0, resent: 0, skipped: 0, error: 0 };
    for (const r of results) counts[r.status]++;
    const runId = await this.persistRun(academy.id, "students", opts, {
      total: rows.length,
      counts,
      results,
    });
    return {
      total: rows.length,
      invited: counts.invited,
      resent: counts.resent,
      skipped: counts.skipped,
      errors: results
        .filter((r) => r.status === "error")
        .map((r) => ({ row: r.row, message: r.detail })),
      results,
      runId,
    };
  }

  /**
   * Historial de corridas (spec academies/bulk-import): la corrida real
   * deja AcademyImportRun con conteos + resultados por fila; dryRun no
   * deja rastro.
   */
  private async persistRun(
    academyId: string,
    kind: "students" | "schedule",
    opts: ImportRunOptions,
    payload: {
      total: number;
      counts: Record<string, number>;
      results: unknown;
    },
  ): Promise<string | null> {
    if (opts.dryRun) return null;
    const run = await this.prisma.academyImportRun.create({
      data: {
        academyId,
        kind,
        fileName: opts.fileName ?? null,
        total: payload.total,
        counts: payload.counts as Prisma.InputJsonValue,
        results: payload.results as Prisma.InputJsonValue,
        createdById: opts.createdById,
      },
      select: { id: true },
    });
    return run.id;
  }

  /**
   * Horario: `serie,estilo?,nivel?,dia_semana,hora_inicio,hora_fin,
   * capacidad?,instructor_email?,mes?`. Agrupa por serie → upsert
   * ClassSeries + slots dedup (weekday+start+end) + materializa los
   * Class de la ventana rodante (hoy → fin del mes siguiente; la serie
   * es ilimitada - spec academies/class-series). `mes` es legacy: se
   * valida y queda como etiqueta de origen; `capacidad` alimenta el
   * quórum de la serie (los cupos ya no son por slot).
   */
  async importSchedule(
    academy: Academy,
    rows: Record<string, string>[],
    opts: ImportRunOptions,
  ): Promise<ScheduleImportResult> {
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

    // Primera pasada: validar y agrupar por serie (una serie por grupo
    // - el orden de filas define el orden de los slots). `mes` solo
    // fija la etiqueta de origen y la ventana extra a materializar.
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
        const key = normLabel(serie);
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
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rolling = this.materialize.rollingDates();
    for (const parsedRows of groups.values()) {
      const first = parsedRows[0];
      // `capacidad` del CSV alimenta el quórum de la serie (los cupos
      // ya no son por slot) - toma la primera fila que lo declare.
      const quorum =
        parsedRows.find((r) => r.capacity !== null)?.capacity ?? null;
      const series = await this.upsertSeries(
        academy.id,
        first,
        quorum,
        opts.dryRun,
      );
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
      // Ventana rodante + el resto del mes declarado en el CSV (dedup
      // por timestamp) - igual que POST /series con month legacy.
      const dates = [
        ...new Map(
          [
            ...rolling,
            ...monthDates(first.month).filter((d) => d >= today),
          ].map((d) => [d.getTime(), d]),
        ).values(),
      ];

      // Instructores asignados por slots NUEVOS del import (spec
      // academies/class-series): una notificación por instructor por
      // serie, post-import (un slot existente no re-asigna).
      const assigned = new Set<string>();

      for (const p of parsedRows) {
        try {
          let slot = byKey.get(slotKey(p));
          if (!slot && opts.dryRun) {
            // Vista previa: el slot se crearía en la corrida real.
            byKey.set(slotKey(p), {
              id: "dry",
              weekday: p.weekday,
              startTime: p.startTime,
              endTime: p.endTime,
              classes: [],
            });
          } else if (!slot) {
            if (p.instructorId) assigned.add(p.instructorId);
            const created = await this.prisma.classSlot.create({
              data: {
                academyId: academy.id,
                seriesId: series.id,
                weekday: p.weekday,
                startTime: p.startTime,
                endTime: p.endTime,
                instructorId: p.instructorId,
                // El primario también entra al plantel (join = conjunto).
                ...(p.instructorId
                  ? {
                      instructors: {
                        create: [{ personId: p.instructorId }],
                      },
                    }
                  : {}),
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
            // Materializa los Class de la ventana para el slot nuevo.
            await this.materialize.materializeSlot(
              this.prisma,
              created,
              dates,
            );
          }
          results.push({
            row: p.row,
            serie: p.serie,
            status: p.warn ? "warn" : "ok",
            detail:
              p.warn ??
              `${opts.dryRun ? "se crearía " : ""}slot ${dayName(p.weekday)} ${p.startTime}-${p.endTime} en "${series.name}"`,
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

      // Aviso de asignación - una vez por instructor por serie
      // (el instructor de serie del CSV también entra al slot vía
      // p.instructorId; el que no declaró slot propio queda en la
      // serie sin aviso - su asignación es la serie completa).
      const firstRow = parsedRows[0];
      if (firstRow.instructorId) assigned.add(firstRow.instructorId);
      if (opts.dryRun) continue;
      for (const personId of assigned) {
        await this.notifications.notifySafe(personId, {
          category: "SOCIAL",
          type: "class.instructor_assigned",
          title: "Te asignaron una clase",
          body: `${series.name} · ${academy.name}`,
          data: { seriesId: series.id, academyId: academy.id },
        });
      }
    }

    const sorted = results.sort((a, b) => a.row - b.row);
    const counts = { ok: 0, warn: 0, error: 0 };
    for (const r of sorted) counts[r.status]++;
    const runId = await this.persistRun(academy.id, "schedule", opts, {
      total: rows.length,
      counts,
      results: sorted,
    });
    return {
      total: rows.length,
      ok: counts.ok,
      warn: counts.warn,
      errors: sorted
        .filter((r) => r.status === "error")
        .map((r) => ({ row: r.row, message: r.detail })),
      results: sorted,
      runId,
    };
  }

  private async upsertSeries(
    academyId: string,
    p: {
      serie: string;
      month: string;
      styleId: string | null;
      levelId: string | null;
      instructorId: string | null;
    },
    quorum: number | null,
    dryRun?: boolean,
  ) {
    const existing = await this.prisma.classSeries.findFirst({
      where: { academyId, name: p.serie },
      select: { id: true, name: true, month: true },
    });
    if (existing) return existing;
    if (dryRun) {
      // Vista previa: la serie se crearía - stub solo-lectura.
      return { id: "dry", name: p.serie, month: p.month };
    }
    return this.prisma.classSeries.create({
      data: {
        academyId,
        name: p.serie,
        month: p.month,
        styleId: p.styleId,
        levelId: p.levelId,
        instructorId: p.instructorId,
        quorum,
      },
      select: { id: true, name: true, month: true },
    });
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

/** `telefono` de la fila → E.164 + país; inválido = error de fila. */
function rowPhone(
  raw: string,
  defaultCountry: string,
): { phone: string | null; phoneCountryCode: string | null } {
  if (!raw) return { phone: null, phoneCountryCode: null };
  try {
    const normalized = normalizePhone(raw, defaultCountry);
    return {
      phone: normalized?.e164 ?? null,
      phoneCountryCode: normalized?.countryCode ?? null,
    };
  } catch (e) {
    if (e instanceof InvalidPhoneError) {
      throw new RowError("teléfono inválido");
    }
    throw e;
  }
}

/**
 * Documento del alumno → `Person.nationalId`: trim + uppercase siempre;
 * si calza formato chileno (solo dígitos, puntos, guion, K final) se
 * quitan los separadores. Sin validación de dígito verificador - es
 * dato administrativo, no clave de dedup.
 */
function normNationalId(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  return /^[\d.-]+[\dK]$/.test(upper)
    ? upper.replace(/[.-]/g, "")
    : upper;
}

/** "dd/mm/yyyy" o "yyyy-mm-dd" → mediodía UTC (día estable en cualquier TZ). */
function parseBirthDate(raw: string | undefined): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const lat = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [+iso[1], +iso[2], +iso[3]];
  } else if (lat) {
    [d, m, y] = [+lat[1], +lat[2], +lat[3]];
  } else {
    throw new RowError(
      `fecha_nacimiento "${s}" inválida (DD/MM/YYYY o YYYY-MM-DD)`,
    );
  }
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new RowError(`fecha_nacimiento "${s}" inválida`);
  }
  return date;
}

const GENDER_ALIASES: Record<string, Gender> = {
  m: Gender.M,
  masculino: Gender.M,
  male: Gender.M,
  hombre: Gender.M,
  f: Gender.F,
  femenino: Gender.F,
  female: Gender.F,
  mujer: Gender.F,
  otro: Gender.OTHER,
  other: Gender.OTHER,
  x: Gender.OTHER,
  nb: Gender.OTHER,
  "no binario": Gender.OTHER,
};

function parseGender(raw: string | undefined): Gender | null {
  const s = raw?.trim();
  if (!s) return null;
  const gender = GENDER_ALIASES[normLabel(s)];
  if (!gender) throw new RowError(`sexo "${s}" inválido (m/f/otro)`);
  return gender;
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

