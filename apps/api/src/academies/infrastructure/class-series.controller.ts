import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";
import {
  AcademyMaterializeService,
  monthDates,
} from "./class-series-materialize.service";
import { pageParams, whitelist } from "./list-filters";
import { ApiQuery } from "@nestjs/swagger";

class SeriesSlotDto {
  /** Día de semana 0-6 para horario recurrente; requerido sin `date`.
      Con `date` se ignora (el persistido queda derivado de la fecha). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  /** Taller/clase única: "YYYY-MM-DD". Gana sobre weekday si vienen
      ambos; debe ser fecha válida y no pasada. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date formato YYYY-MM-DD" })
  date?: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "startTime formato HH:MM" })
  startTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "endTime formato HH:MM" })
  endTime!: string;

  /** Override docente del horario; omitido = el instructor de la serie. */
  @IsOptional()
  @IsString()
  instructorId?: string;

  /** Plantel asignado del horario (multi-profesor); primero = primario.
      El roster de la serie habilita quiénes son asignables. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructorIds?: string[];
}

class CreateSeriesDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  styleId?: string;

  @IsOptional()
  @IsString()
  levelId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  typeIds?: string[];

  @IsOptional()
  @IsString()
  instructorId?: string;

  /** Roster de profesores habilitados de la serie; el primero queda
      como primario/default (instructorId). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructorIds?: string[];

  /** Cupos por defecto de la serie (null/omitido = hereda la academia). */
  @IsOptional()
  @IsInt()
  @Min(1)
  quorum?: number;

  /** Precio CLP de la clase suelta (null/omitido = no se vende suelta). */
  @IsOptional()
  @IsInt()
  @Min(0)
  dropInPrice?: number;

  /**
   * Legacy/opcional: la serie es ilimitada hasta desactivarse (spec
   * academies/class-series) - `month` ya no es la vigencia. Si se envía
   * (import/legacy) además se materializa el resto de ese mes; si se
   * omite se persiste el mes actual como etiqueta de origen.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: "month formato YYYY-MM" })
  month?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SeriesSlotDto)
  slots!: SeriesSlotDto[];
}

/**
 * Slot extra para PATCH addSlots - mismo contrato que SeriesSlotDto:
 * cupos y modalidad son de la serie (series.quorum →
 * academy.defaultQuorum), el slot solo fija día/hora e instructor.
 */
class AddSeriesSlotDto {
  /** Día de semana 0-6 para horario recurrente; requerido sin `date`. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  /** Taller/clase única: "YYYY-MM-DD". Gana sobre weekday si vienen ambos. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date formato YYYY-MM-DD" })
  date?: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "startTime formato HH:MM" })
  startTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "endTime formato HH:MM" })
  endTime!: string;

  @IsOptional()
  @IsString()
  instructorId?: string;

  /** Plantel asignado del horario (multi-profesor); primero = primario. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructorIds?: string[];
}

/** PATCH de un horario: día/hora + plantel asignado (multi). */
class UpdateSlotDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  /** Fecha única "YYYY-MM-DD" (taller): convierte el horario a instancia
      única. Sin `date` un taller sigue taller; no hay des-conversión. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date formato YYYY-MM-DD" })
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "startTime formato HH:MM" })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "endTime formato HH:MM" })
  endTime?: string;

  /** Plantel asignado; si llega, reemplaza el conjunto (primero = primario). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructorIds?: string[];
}

class UpdateSeriesDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  styleId?: string;

  @IsOptional()
  @IsString()
  levelId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  typeIds?: string[];

  @IsOptional()
  @IsString()
  instructorId?: string;

  /** Roster de profesores habilitados; si llega, reemplaza el conjunto. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instructorIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  quorum?: number;

  /** Precio CLP de la clase suelta (null explícito = deja de venderse suelta). */
  @IsOptional()
  @IsInt()
  @Min(0)
  dropInPrice?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddSeriesSlotDto)
  addSlots?: AddSeriesSlotDto[];
}

const SERIES_INCLUDE: Prisma.ClassSeriesInclude = {
  style: { select: { id: true, name: true } },
  level: { select: { id: true, name: true } },
  types: { include: { type: { select: { id: true, name: true } } } },
  // Roster de profesores habilitados: solo ellos son asignables a los
  // horarios (spec serie habilita -> slot asigna).
  instructors: {
    include: { person: { select: { id: true, name: true } } },
  },
  slots: {
    where: { deletedAt: null },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    include: {
      types: { include: { type: { select: { id: true, name: true } } } },
      // Plantel multi-profesor (spec multi-instructor): el join es el
      // conjunto completo - instructorId sigue siendo el primario.
      instructors: {
        include: { person: { select: { id: true, name: true } } },
      },
    },
  },
};

/**
 * Series de clases recurrentes (spec academies/class-series): la serie
 * es ilimitada hasta desactivarse - las instancias Class se materializan
 * sobre una ventana rodante hoy → fin del mes siguiente, extendida por
 * el job diario academies.class_materialization. Gestión por capacidad
 * `schedule` (owner/ADMIN/staff con el flag - spec academy-staff-roles).
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class ClassSeriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly notifications: NotificationsService,
    private readonly materialize: AcademyMaterializeService,
  ) {}

  /**
   * Lista las series de la academia (gestión). Filtros del contrato
   * compartido (spec analytics/query-console): q = nombre contiene,
   * status = active|inactive (whitelist → 400), styleId/levelId/typeId
   * exactos. Las series con borrado lógico (deletedAt) nunca salen acá -
   * solo las ve analítica.
   */
  @Get(":id/series")
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "styleId", required: false })
  @ApiQuery({ name: "levelId", required: false })
  @ApiQuery({
    name: "typeId",
    required: false,
    description: "Multiselect - CSV de ClassType ids (OR).",
  })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  async list(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("styleId") styleId?: string,
    @Query("levelId") levelId?: string,
    @Query("typeId") typeId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "schedule", "classes");
    const statusF = whitelist(status, ["active", "inactive"] as const, "status");
    const pg = pageParams(page, pageSize);
    const term = q?.trim();
    const where = {
      academyId: id,
      deletedAt: null,
      ...(term ? { name: { contains: term, mode: "insensitive" as const } } : {}),
      ...(statusF ? { active: statusF === "active" } : {}),
      ...(styleId ? { styleId } : {}),
      ...(levelId ? { levelId } : {}),
      // typeId es multiselect (CSV): la serie calza si tiene CUALQUIERA
      // de las modalidades elegidas.
      ...(typeId?.trim()
        ? {
            types: {
              some: {
                typeId: {
                  in: typeId.split(",").map((v) => v.trim()).filter(Boolean),
                },
              },
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.classSeries.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip: pg.skip,
        take: pg.take,
        include: SERIES_INCLUDE,
      }),
      this.prisma.classSeries.count({ where }),
    ]);
    return { items, total, page: pg.page, pageSize: pg.pageSize };
  }

  /**
   * Insights del módulo Clases (spec academy-console-v3): promedio de
   * asistencia por clase dictada, clases semanales promedio por alumno
   * (ventana de 28 días) y top/bottom 5 series por asistencia histórica.
   * Declarado antes de :seriesId - "insights" sería capturado como id.
   */
  @Get(":id/series/insights")
  async insights(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "schedule", "insights");
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const monthAgo = new Date(todayUTC.getTime() - 28 * 86_400_000);

    const [pastClasses, attByClass, att28] = await Promise.all([
      // Clases ya dictadas de series vivas (deletedAt las saca de la
      // consola - su historial solo le sirve a analítica).
      this.prisma.class.findMany({
        where: {
          cancelled: false,
          date: { lte: todayUTC },
          slot: { academyId: id, series: { deletedAt: null } },
        },
        select: { id: true, slot: { select: { seriesId: true } } },
      }),
      this.prisma.attendance.groupBy({
        by: ["classId"],
        where: {
          class: {
            slot: { academyId: id, series: { deletedAt: null } },
            date: { lte: todayUTC },
          },
        },
        _count: { _all: true },
      }),
      // Clases asistidas por alumno en 28 días → promedio semanal.
      this.prisma.attendance.groupBy({
        by: ["personId"],
        where: {
          class: {
            slot: { academyId: id },
            date: { gte: monthAgo, lte: todayUTC },
          },
        },
        _count: { _all: true },
      }),
    ]);

    const attCount = new Map(attByClass.map((g) => [g.classId, g._count._all]));
    const totalAttendance = attByClass.reduce((a, g) => a + g._count._all, 0);
    const avgAttendancePerClass = pastClasses.length
      ? Math.round((totalAttendance / pastClasses.length) * 10) / 10
      : null;

    const attendees = att28.length;
    const avgWeeklyClassesPerStudent = attendees
      ? Math.round(
          (att28.reduce((a, g) => a + g._count._all, 0) / attendees / 4) * 10,
        ) / 10
      : null;

    // Asistencia histórica por serie (solo con clases dictadas - una
    // serie nueva sin pasadas no compite por "menor asistencia").
    const bySeries = new Map<string, number>();
    for (const c of pastClasses) {
      const sid = c.slot.seriesId;
      bySeries.set(sid, (bySeries.get(sid) ?? 0) + (attCount.get(c.id) ?? 0));
    }
    const ranked = [...bySeries.entries()].sort((a, b) => b[1] - a[1]);
    const seriesIds = [
      ...new Set([...ranked.slice(0, 5), ...ranked.slice(-5)].map(([sid]) => sid)),
    ];
    const names = seriesIds.length
      ? await this.prisma.classSeries.findMany({
          where: { id: { in: seriesIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    const row = ([seriesId, count]: [string, number]) => ({
      seriesId,
      name: nameById.get(seriesId) ?? null,
      attendance: count,
    });

    return {
      avgAttendancePerClass,
      avgWeeklyClassesPerStudent,
      topSeries: ranked.slice(0, 5).map(row),
      bottomSeries: ranked.slice(-5).reverse().map(row),
    };
  }

  /**
   * Detalle de una serie de la academia. Las eliminadas (deletedAt)
   * responden 404 - fuera de la consola solo existen para analítica.
   */
  @Get(":id/series/:seriesId")
  async detail(
    @Param("id") id: string,
    @Param("seriesId") seriesId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "schedule", "classes");
    const series = await this.prisma.classSeries.findFirst({
      where: { id: seriesId, academyId: id, deletedAt: null },
      include: SERIES_INCLUDE,
    });
    if (!series) throw new NotFoundException("serie no encontrada");
    return series;
  }

  /**
   * Instancias de la serie para el detalle de la consola: próximas con
   * sus reservas y pasadas con su asistencia, con el profesor efectivo
   * (clase > slot > serie).
   */
  @Get(":id/series/:seriesId/classes")
  @ApiQuery({ name: "take", required: false })
  async seriesClasses(
    @Param("id") id: string,
    @Param("seriesId") seriesId: string,
    @Req() req: Request,
    @Query("take") take?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "schedule", "classes");
    const series = await this.prisma.classSeries.findFirst({
      where: { id: seriesId, academyId: id, deletedAt: null },
      select: { id: true, instructorId: true },
    });
    if (!series) throw new NotFoundException("serie no encontrada");

    const limit = Math.min(Math.max(Number(take) || 50, 1), 200);
    const now = new Date();
    const CLASS_INCLUDE = {
      instructors: {
        include: { person: { select: { id: true, name: true } } },
      },
      slot: {
        select: {
          startTime: true,
          endTime: true,
          instructorId: true,
          instructors: {
            include: { person: { select: { id: true, name: true } } },
          },
        },
      },
      _count: {
        select: {
          bookings: { where: { status: "BOOKED" as const } },
          attendances: true,
        },
      },
    } satisfies Prisma.ClassInclude;

    const [upcoming, past] = await Promise.all([
      this.prisma.class.findMany({
        where: {
          slot: { seriesId },
          date: { gte: now },
          cancelled: false,
        },
        orderBy: { date: "asc" },
        take: limit,
        include: CLASS_INCLUDE,
      }),
      this.prisma.class.findMany({
        where: { slot: { seriesId }, date: { lt: now } },
        orderBy: { date: "desc" },
        take: limit,
        include: CLASS_INCLUDE,
      }),
    ]);

    // instructorId es FK plana en class/slot/series - join manual.
    const instructorIds = [
      ...new Set(
        [...upcoming, ...past]
          .map(
            (c) =>
              c.instructorId ?? c.slot.instructorId ?? series.instructorId,
          )
          .filter((x): x is string => !!x),
      ),
    ];
    const people = instructorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true },
        })
      : [];
    const personName = new Map(people.map((p) => [p.id, p.name]));

    const toRow = (c: (typeof upcoming)[number]) => {
      const instructorId =
        c.instructorId ?? c.slot.instructorId ?? series.instructorId;
      // Plantel (multi-instructor): primario primero + co-profes de
      // clase y slot, sin duplicar.
      const rosterMap = new Map<
        string,
        { id: string; name: string | null }
      >();
      for (const i of [
        ...(c.slot.instructors ?? []),
        ...(c.instructors ?? []),
      ]) {
        rosterMap.set(i.person.id, i.person);
      }
      rosterMap.delete(instructorId ?? "");
      const instructors = [
        ...(instructorId
          ? [
              {
                id: instructorId,
                name: personName.get(instructorId) ?? null,
              },
            ]
          : []),
        ...rosterMap.values(),
      ];
      return {
        id: c.id,
        date: c.date,
        startTime: c.slot.startTime,
        endTime: c.slot.endTime,
        cancelled: c.cancelled,
        instructorName: instructorId
          ? (personName.get(instructorId) ?? null)
          : null,
        instructors,
        bookedCount: c._count.bookings,
        attendanceCount: c._count.attendances,
      };
    };
    return { upcoming: upcoming.map(toRow), past: past.map(toRow) };
  }

  /**
   * Crea serie + tipos + slots y materializa los Class de la ventana
   * rodante (hoy → fin del mes siguiente; el job diario la extiende).
   * `month` es opcional/legacy: se persiste como etiqueta de origen y
   * si llega explícito además se materializa el resto de ese mes.
   * Transacción única - si falla no queda nada a medias.
   */
  @Post(":id/series")
  async create(
    @Param("id") id: string,
    @Body() dto: CreateSeriesDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "schedule", "classes");
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const month =
      dto.month ??
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    if (dto.month && monthDates(dto.month).length === 0) {
      throw new BadRequestException("month inválido");
    }
    // Ventana rodante + el resto del mes explícito si un cliente legacy
    // lo pide (dedup por timestamp - un día puede caer en ambas).
    const dates = uniqueDates([
      ...this.materialize.rollingDates(now),
      ...(dto.month
        ? monthDates(dto.month).filter((d) => d >= today)
        : []),
    ]);
    // Programación por slot: con `date` queda taller de fecha única
    // (oneOffDate + weekday derivado); sin ella, recurrente (weekday
    // requerido como siempre). Validado antes de abrir la transacción.
    const slotPlans = dto.slots.map((s) => ({
      dto: s,
      schedule: resolveSlotSchedule(s.date, s.weekday, today),
    }));

    const created = await this.prisma.$transaction(async (tx) => {
      const series = await tx.classSeries.create({
        data: {
          academyId: id,
          name: dto.name,
          description: dto.description ?? null,
          styleId: dto.styleId ?? null,
          levelId: dto.levelId ?? null,
          instructorId: dto.instructorIds?.[0] ?? dto.instructorId ?? null,
          quorum: dto.quorum ?? null,
          dropInPrice: dto.dropInPrice ?? null,
          month,
          types: dto.typeIds?.length
            ? { create: dto.typeIds.map((typeId) => ({ typeId })) }
            : undefined,
          // Roster habilitado de la serie (spec serie habilita -> slot
          // asigna): dedup contra el primario por si viene repetido.
          ...(dto.instructorIds?.length
            ? {
                instructors: {
                  create: [...new Set(dto.instructorIds)].map((personId) => ({
                    personId,
                  })),
                },
              }
            : dto.instructorId
              ? { instructors: { create: [{ personId: dto.instructorId }] } }
              : {}),
        },
      });

      for (const { dto: s, schedule } of slotPlans) {
        // Cupos y modalidad son de la serie (spec academies/class-series)
        // - el slot solo fija día/hora e instructor override.
        // Plantel del horario: lista explícita > override singular >
        // default de la serie. El roster serie-habilita en la UI; el API
        // auto-union al roster para compat (import/legacy).
        const roster = s.instructorIds?.length
          ? [...new Set(s.instructorIds)]
          : s.instructorId
            ? [s.instructorId]
            : [];
        const slotInstructorId = roster[0] ?? dto.instructorId ?? null;
        const slot = await tx.classSlot.create({
          data: {
            academyId: id,
            seriesId: series.id,
            weekday: schedule.weekday,
            oneOffDate: schedule.oneOffDate,
            startTime: s.startTime,
            endTime: s.endTime,
            instructorId: slotInstructorId,
            // El primario también entra al plantel (join = conjunto).
            ...(roster.length
              ? { instructors: { create: roster.map((personId) => ({ personId })) } }
              : slotInstructorId
                ? { instructors: { create: [{ personId: slotInstructorId }] } }
                : {}),
          },
        });
        if (roster.length) {
          await tx.classSeriesInstructor.createMany({
            data: roster.map((personId) => ({ seriesId: series.id, personId })),
            skipDuplicates: true,
          });
        }
        await this.materialize.materializeSlot(tx, slot, dates);
      }

      return tx.classSeries.findUniqueOrThrow({
        where: { id: series.id },
        include: SERIES_INCLUDE,
      });
    });

    // Aviso de asignación (spec academies/class-series): instructor de
    // la serie + override explícito de cada slot. Un slot sin
    // instructorId propio hereda el de la serie - ya notificado si el
    // de la serie también era él (Set deduplica).
    const assigned = new Set(
      [dto.instructorId, ...dto.slots.map((s) => s.instructorId)].filter(
        (x): x is string => !!x,
      ),
    );
    await this.notifyInstructorAssigned(id, created, assigned);
    return created;
  }

  /**
   * Edita metadatos de la serie. Si active pasa a true sobre una serie
   * inactiva, rematerializa las clases de la ventana rodante (descancela
   * las que existen y crea las que falten, sin duplicar) y avisa a los
   * alumnos con enrollment ACTIVE vía notificación class.series.resumed.
   *
   * addSlots agrega horarios a la serie: por cada uno crea el ClassSlot
   * (o reutiliza uno idéntico weekday+startTime+endTime para no duplicar
   * ante reintentos) y materializa las fechas de la ventana rodante
   * (hoy → fin del mes siguiente) que caigan en ese weekday.
   */
  @Patch(":id/series/:seriesId")
  async update(
    @Param("id") id: string,
    @Param("seriesId") seriesId: string,
    @Body() dto: UpdateSeriesDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "schedule", "classes");
    const prev = await this.findSeriesOr404(id, seriesId);
    const reactivated = dto.active === true && !prev.active;
    // Asignaciones nuevas de instructor (spec academies/class-series):
    // el de la serie si cambia + instructor explícito de slots nuevos.
    const newAssignees = new Set<string>();

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.typeIds) {
        await tx.classSeriesType.deleteMany({ where: { seriesId } });
        if (dto.typeIds.length) {
          await tx.classSeriesType.createMany({
            data: dto.typeIds.map((typeId) => ({ seriesId, typeId })),
          });
        }
      }
      if (dto.instructorIds !== undefined) {
        await tx.classSeriesInstructor.deleteMany({ where: { seriesId } });
        if (dto.instructorIds.length) {
          await tx.classSeriesInstructor.createMany({
            data: [...new Set(dto.instructorIds)].map((personId) => ({
              seriesId,
              personId,
            })),
          });
        }
      }
      const series = await tx.classSeries.update({
        where: { id: seriesId },
        data: {
          name: dto.name,
          description: dto.description,
          styleId: dto.styleId,
          levelId: dto.levelId,
          instructorId:
            dto.instructorIds !== undefined
              ? (dto.instructorIds[0] ?? null)
              : dto.instructorId,
          quorum: dto.quorum,
          dropInPrice: dto.dropInPrice,
          active: dto.active,
          // Reactivar una serie eliminada lógicamente la restaura (PATCH
          // active:true es el único camino de vuelta, vía analítica/API).
          ...(dto.active === true ? { deletedAt: null } : {}),
        },
        include: SERIES_INCLUDE,
      });

      // Ventana rodante (hoy → fin del mes siguiente) - la serie ya no
      // está acotada a series.month, el job diario la extiende.
      const futureDates = this.materialize.rollingDates();
      const todayUtc = futureDates[0];

      if (dto.addSlots?.length) {
        // Copia mutable para dedup contra slots recién creados en este PATCH.
        const known = [...series.slots];
        for (const s of dto.addSlots) {
          if (s.startTime >= s.endTime) {
            throw new BadRequestException(
              "startTime debe ser menor que endTime",
            );
          }
          // `date` lo hace taller de fecha única; sin ella, recurrente
          // por weekday (requerido, igual que en create).
          const schedule = resolveSlotSchedule(s.date, s.weekday, todayUtc);
          // El dedup distingue modalidad: un taller deduplica por su
          // fecha, un recurrente por su weekday.
          const key = (x: {
            weekday: number;
            oneOffDate?: Date | null;
            startTime: string;
            endTime: string;
          }) =>
            `${x.oneOffDate ? `o${x.oneOffDate.getTime()}` : `w${x.weekday}`}|${x.startTime}|${x.endTime}`;
          const cand = {
            weekday: schedule.weekday,
            oneOffDate: schedule.oneOffDate,
            startTime: s.startTime,
            endTime: s.endTime,
          };
          let slot = known.find((x) => key(x) === key(cand)) ?? null;
          if (!slot) {
            const roster = s.instructorIds?.length
              ? [...new Set(s.instructorIds)]
              : s.instructorId
                ? [s.instructorId]
                : [];
            const slotInstructorId =
              roster[0] ?? s.instructorId ?? series.instructorId ?? null;
            // Solo el override explícito es "asignación nueva" - el
            // instructor heredado de la serie ya fue avisado (o no
            // cambió con este PATCH).
            for (const pid of roster.length ? roster : s.instructorId ? [s.instructorId] : []) {
              newAssignees.add(pid);
            }
            slot = await tx.classSlot.create({
              data: {
                academyId: id,
                seriesId,
                weekday: schedule.weekday,
                oneOffDate: schedule.oneOffDate,
                startTime: s.startTime,
                endTime: s.endTime,
                instructorId: slotInstructorId,
                ...(roster.length
                  ? {
                      instructors: {
                        create: roster.map((personId) => ({ personId })),
                      },
                    }
                  : slotInstructorId
                    ? {
                        instructors: {
                          create: [{ personId: slotInstructorId }],
                        },
                      }
                    : {}),
              },
            });
            if (roster.length) {
              await tx.classSeriesInstructor.createMany({
                data: roster.map((personId) => ({ seriesId, personId })),
                skipDuplicates: true,
              });
            }
            known.push(slot);
          }
          await this.materialize.materializeSlot(tx, slot, futureDates);
        }
      }

      if (reactivated) {
        for (const slot of series.slots) {
          await this.materialize.materializeSlot(tx, slot, futureDates);
        }
      }

      // Re-fetch: si addSlots agregó horarios, `series.slots` quedó stale.
      return tx.classSeries.findUniqueOrThrow({
        where: { id: seriesId },
        include: SERIES_INCLUDE,
      });
    });

    if (
      dto.instructorId &&
      dto.instructorId !== prev.instructorId
    ) {
      newAssignees.add(dto.instructorId);
    }
    if (reactivated) {
      // Best-effort post-commit: un fallo del centro no revierte la serie.
      await this.notifySeriesResumed(id, updated);
    }
    await this.notifyInstructorAssigned(id, updated, newAssignees);
    return updated;
  }

  /**
   * Avisa a cada instructor recién asignado a la serie (best-effort
   * post-commit). type class.instructor_assigned + data con seriesId /
   * academyId para deeplink al módulo de clases del instructor.
   */
  private async notifyInstructorAssigned(
    academyId: string,
    series: { id: string; name: string },
    personIds: Set<string>,
  ): Promise<void> {
    if (!personIds.size) return;
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { name: true },
    });
    await Promise.all(
      [...personIds].map((personId) =>
        this.notifications.notifySafe(personId, {
          category: "SOCIAL",
          type: "class.instructor_assigned",
          title: "Te asignaron una clase",
          body: `${series.name} · ${academy?.name ?? ""}`.trim(),
          data: { seriesId: series.id, academyId },
        }),
      ),
    );
  }

  /**
   * Avisa a cada Person con enrollment ACTIVE que la serie retomó sus
   * clases. Dedup: se salta quienes ya tienen una notificación no leída
   * class.series.resumed de esta misma serie (reactivaciones repetidas).
   */
  private async notifySeriesResumed(
    academyId: string,
    series: { id: string; name: string },
  ): Promise<void> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { academyId, status: "ACTIVE" },
      select: { personId: true },
    });
    const personIds = [...new Set(enrollments.map((e) => e.personId))];
    if (!personIds.length) return;

    const already = await this.prisma.notification.findMany({
      where: {
        personId: { in: personIds },
        type: "class.series.resumed",
        readAt: null,
        data: { path: ["seriesId"], equals: series.id },
      },
      select: { personId: true },
    });
    const skip = new Set(already.map((n) => n.personId));

    await Promise.all(
      personIds
        .filter((p) => !skip.has(p))
        .map((personId) =>
          this.notifications.notifySafe(personId, {
            category: "SOCIAL",
            type: "class.series.resumed",
            title: `${series.name} retomó sus clases`,
            data: { seriesId: series.id, academyId, seriesName: series.name },
          }),
        ),
    );
  }

  /**
   * Borrado lógico: la serie se desactiva, se oculta de la consola
   * (deletedAt) y sus clases futuras se cancelan - las reservas
   * BOOKED/WAITLIST pasan a CANCELLED (el alumno lo ve en "mis reservas").
   * Sigue existiendo para analítica; PATCH {active:true} la restaura.
   */
  @Delete(":id/series/:seriesId")
  @HttpCode(200)
  async deactivate(
    @Param("id") id: string,
    @Param("seriesId") seriesId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "schedule", "classes");
    await this.findSeriesOr404(id, seriesId);

    return this.prisma.$transaction(async (tx) => {
      const futureClasses = await tx.class.findMany({
        where: {
          date: { gte: new Date() },
          cancelled: false,
          slot: { seriesId },
        },
        select: { id: true },
      });
      const classIds = futureClasses.map((c) => c.id);
      await tx.class.updateMany({
        where: { id: { in: classIds } },
        data: { cancelled: true },
      });
      // Cancelación del lado de la academia → el crédito siempre se
      // devuelve (refunded:true), nunca quema la cuota del alumno.
      await tx.classBooking.updateMany({
        where: { classId: { in: classIds }, status: { in: ["BOOKED", "WAITLIST"] } },
        data: { status: "CANCELLED", cancelledAt: new Date(), refunded: true },
      });
      return tx.classSeries.update({
        where: { id: seriesId },
        data: { active: false, deletedAt: new Date() },
      });
    });
  }

  /** Detalle de un horario: datos + plantel + roster habilitado de la
      serie (para el multiselect de asignación). */
  @Get(":id/slots/:slotId")
  async getSlot(
    @Param("id") id: string,
    @Param("slotId") slotId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "schedule");
    const slot = await this.prisma.classSlot.findFirst({
      where: { id: slotId, academyId: id, deletedAt: null },
      include: {
        instructors: { include: { person: { select: { id: true, name: true } } } },
        series: {
          select: {
            id: true,
            name: true,
            instructors: {
              include: { person: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!slot) throw new NotFoundException("horario no encontrado");
    return slot;
  }

  /** Edita un horario: día/hora y plantel asignado (multi). Los
      instructorIds se auto-unen al roster de la serie (la UI solo
      ofrece los habilitados). */
  @Patch(":id/slots/:slotId")
  async updateSlot(
    @Param("id") id: string,
    @Param("slotId") slotId: string,
    @Body() dto: UpdateSlotDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "schedule", "classes");
    const slot = await this.prisma.classSlot.findFirst({
      where: { id: slotId, academyId: id, deletedAt: null },
    });
    if (!slot) throw new NotFoundException("horario no encontrado");

    const startTime = dto.startTime ?? slot.startTime;
    const endTime = dto.endTime ?? slot.endTime;
    if (startTime >= endTime) {
      throw new BadRequestException("startTime debe ser menor que endTime");
    }
    const roster = dto.instructorIds
      ? [...new Set(dto.instructorIds)]
      : null;

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    // `date` (re)programa el horario como taller de fecha única: gana
    // sobre weekday y el día persistido queda derivado de la fecha.
    // PATCH sin `date` no des-convierte un taller a recurrente.
    let oneOffDate: Date | undefined;
    if (dto.date !== undefined) {
      const parsed = parseOneOffDate(dto.date);
      if (!parsed) throw new BadRequestException("date inválida");
      if (parsed < todayUtc) {
        throw new BadRequestException("date no puede ser una fecha pasada");
      }
      oneOffDate = parsed;
    }
    const effectiveOneOff = oneOffDate ?? slot.oneOffDate;
    const effectiveWeekday = effectiveOneOff
      ? effectiveOneOff.getUTCDay()
      : (dto.weekday ?? slot.weekday);
    // Cambio de weekday recurrente o de fecha de taller corre la misma
    // cascada: cancela las instancias futuras del esquema viejo (con
    // refund de reservas) y materializa el nuevo.
    const scheduleChanged =
      effectiveWeekday !== slot.weekday ||
      effectiveOneOff?.getTime() !== slot.oneOffDate?.getTime();

    return this.prisma.$transaction(async (tx) => {
      if (scheduleChanged) {
        // Las instancias futuras del día viejo ya no corresponden al
        // horario: misma cascada que deleteSlot - se cancelan y sus
        // reservas se liberan (el alumno nunca pierde crédito por una
        // decisión de la academia). Las pasadas quedan como historial.
        const stale = await tx.class.findMany({
          where: {
            classSlotId: slotId,
            cancelled: false,
            date: { gte: todayUtc },
          },
          select: { id: true },
        });
        const staleIds = stale.map((c) => c.id);
        if (staleIds.length) {
          await tx.class.updateMany({
            where: { id: { in: staleIds } },
            data: { cancelled: true },
          });
          await tx.classBooking.updateMany({
            where: {
              classId: { in: staleIds },
              status: { in: ["BOOKED", "WAITLIST"] },
            },
            data: {
              status: "CANCELLED",
              cancelledAt: now,
              refunded: true,
            },
          });
        }
      }

      if (roster !== null) {
        await tx.classSlotInstructor.deleteMany({ where: { slotId } });
        if (roster.length) {
          await tx.classSlotInstructor.createMany({
            data: roster.map((personId) => ({ slotId, personId })),
          });
          await tx.classSeriesInstructor.createMany({
            data: roster.map((personId) => ({
              seriesId: slot.seriesId,
              personId,
            })),
            skipDuplicates: true,
          });
        }
      }

      const updated = await tx.classSlot.update({
        where: { id: slotId },
        data: {
          // En un taller el weekday queda derivado de oneOffDate (dato
          // informativo); en recurrente es el weekday del payload.
          // `oneOffDate` solo se escribe si llegó `date` (undefined no toca).
          weekday: effectiveWeekday,
          oneOffDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          ...(roster !== null ? { instructorId: roster[0] ?? null } : {}),
        },
        include: {
          instructors: {
            include: { person: { select: { id: true, name: true } } },
          },
        },
      });

      if (scheduleChanged) {
        // Materializa el esquema nuevo en la ventana rodante (idempotente:
        // revive canceladas de cascada y crea solo las fechas faltantes).
        await this.materialize.materializeSlot(
          tx,
          {
            id: updated.id,
            weekday: updated.weekday,
            oneOffDate: updated.oneOffDate,
            instructorId: updated.instructorId,
            instructors: (updated.instructors ?? []).map((i) => ({
              personId: i.personId,
            })),
          },
          this.materialize.rollingDates(now),
        );
      }

      // El materializador solo escribe el plantel en clases NUEVAS - sin
      // este sync las instancias ya creadas (o revividas) de la ventana
      // quedan con el plantel viejo. Se reescribe solo lo futuro/vigente:
      // el historial conserva quién dio la clase ese día.
      if (roster !== null || scheduleChanged) {
        const effective =
          roster ?? (updated.instructors ?? []).map((i) => i.personId);
        const upcoming = await tx.class.findMany({
          where: {
            classSlotId: slotId,
            cancelled: false,
            date: { gte: todayUtc },
          },
          select: { id: true },
        });
        const classIds = upcoming.map((c) => c.id);
        if (classIds.length) {
          await tx.classInstructor.deleteMany({
            where: { classId: { in: classIds } },
          });
          if (effective.length) {
            await tx.classInstructor.createMany({
              data: classIds.flatMap((classId) =>
                effective.map((personId) => ({ classId, personId })),
              ),
            });
          }
          await tx.class.updateMany({
            where: { id: { in: classIds } },
            data: {
              instructorId:
                roster !== null
                  ? (roster[0] ?? null)
                  : updated.instructorId,
            },
          });
        }
      }
      return updated;
    });
  }

  /**
   * Elimina un horario de la serie - las clases futuras de ese slot se
   * cancelan y sus reservas se liberan.
   */
  @Delete(":id/slots/:slotId")
  @HttpCode(200)
  async deleteSlot(
    @Param("id") id: string,
    @Param("slotId") slotId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "schedule", "classes");
    const slot = await this.prisma.classSlot.findFirst({
      where: { id: slotId, academyId: id, deletedAt: null },
    });
    if (!slot) throw new NotFoundException("horario no encontrado");

    return this.prisma.$transaction(async (tx) => {
      const future = await tx.class.findMany({
        where: { classSlotId: slotId, date: { gte: new Date() } },
        select: { id: true },
      });
      const ids = future.map((c) => c.id);
      await tx.class.updateMany({
        where: { id: { in: ids } },
        data: { cancelled: true },
      });
      await tx.classBooking.updateMany({
        where: { classId: { in: ids }, status: { in: ["BOOKED", "WAITLIST"] } },
        data: { status: "CANCELLED", cancelledAt: new Date(), refunded: true },
      });
      // Class.slot es Restrict: con cualquier clase asociada (pasada o
      // futura) el hard delete rompe por FK - el horario queda con
      // borrado lógico y el historial intacto. Sin clases, delete real.
      const anyClasses = await tx.class.count({
        where: { classSlotId: slotId },
      });
      if (anyClasses > 0) {
        return tx.classSlot.update({
          where: { id: slotId },
          data: { deletedAt: new Date() },
        });
      }
      return tx.classSlot.delete({ where: { id: slotId } });
    });
  }

  /**
   * Cancela una instancia individual de la serie (feriado, profe
   * enfermo) sin tocar el horario ni el resto de las fechas: marca
   * cancelled + cancelledAt - el timestamp la distingue de la baja por
   * cascada (serie/horario la dejan null) y materializeSlot no la revive.
   * Las reservas BOOKED/WAITLIST se liberan con refunded (el alumno
   * nunca pierde crédito por una decisión de la academia). Idempotente:
   * re-cancelar responde OK sin efecto extra. 404 si la clase no es de
   * la academia o ya ocurrió (date < hoy UTC, misma frontera que la
   * cascada de updateSlot).
   */
  @Post(":id/classes/:classId/cancel")
  @HttpCode(200)
  async cancelClass(
    @Param("id") id: string,
    @Param("classId") classId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "schedule", "classes");
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, slot: { academyId: id } },
      select: { id: true, date: true },
    });
    if (!cls || cls.date < todayUtc) {
      throw new NotFoundException("clase no encontrada");
    }
    return this.prisma.$transaction(async (tx) => {
      // updateMany con cancelled:false: el re-cancel no reescribe
      // cancelledAt (idempotencia) y las reservas ya CANCELLED quedan
      // fuera por el filtro de estado.
      await tx.class.updateMany({
        where: { id: classId, cancelled: false },
        data: { cancelled: true, cancelledAt: now },
      });
      await tx.classBooking.updateMany({
        where: { classId, status: { in: ["BOOKED", "WAITLIST"] } },
        data: { status: "CANCELLED", cancelledAt: now, refunded: true },
      });
      return tx.class.findUniqueOrThrow({ where: { id: classId } });
    });
  }

  private async findSeriesOr404(academyId: string, seriesId: string) {
    const series = await this.prisma.classSeries.findFirst({
      where: { id: seriesId, academyId },
    });
    if (!series) throw new NotFoundException("serie no encontrada");
    return series;
  }
}

/** Dedup por timestamp (medianoche UTC) - la ventana rodante y un mes
 *  explícito legacy pueden superponerse. */
function uniqueDates(dates: Date[]): Date[] {
  return [...new Map(dates.map((d) => [d.getTime(), d])).values()];
}

/**
 * Programación de un slot en create/addSlots: con `date` "YYYY-MM-DD"
 * queda de fecha única (oneOffDate a medianoche UTC + weekday derivado,
 * informativo) y no puede ser pasada; sin ella es recurrente semanal y
 * `weekday` sigue siendo requerido.
 */
function resolveSlotSchedule(
  date: string | undefined,
  weekday: number | undefined,
  todayUtc: Date,
): { weekday: number; oneOffDate: Date | null } {
  if (date !== undefined) {
    const oneOffDate = parseOneOffDate(date);
    if (!oneOffDate) throw new BadRequestException("date inválida");
    if (oneOffDate < todayUtc) {
      throw new BadRequestException("date no puede ser una fecha pasada");
    }
    return { weekday: oneOffDate.getUTCDay(), oneOffDate };
  }
  if (weekday === undefined) {
    throw new BadRequestException("weekday requerido para horario recurrente");
  }
  return { weekday, oneOffDate: null };
}

/**
 * Parsea "YYYY-MM-DD" a medianoche UTC (misma convención que Class.date).
 * null si el formato o la fecha de calendario no son válidos (Date.UTC
 * desborda: 2026-02-30 caería en marzo sin este chequeo).
 */
function parseOneOffDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const parsed = new Date(Date.UTC(y, mo - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== mo - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return null;
  }
  return parsed;
}
