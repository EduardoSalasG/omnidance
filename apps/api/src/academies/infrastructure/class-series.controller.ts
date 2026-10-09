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
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

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
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "startTime formato HH:MM" })
  startTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "endTime formato HH:MM" })
  endTime!: string;

  @IsOptional()
  @IsString()
  instructorId?: string;
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
  slots: {
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
    await this.access.requireCapability(id, req.person!, "schedule");
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
    await this.access.requireCapability(id, req.person!, "schedule");
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
    await this.access.requireCapability(id, req.person!, "schedule");
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
    await this.access.requireCapability(id, req.person!, "schedule");
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
    await this.access.requireCapabilityWrite(id, req.person!, "schedule");
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

    return this.prisma.$transaction(async (tx) => {
      const series = await tx.classSeries.create({
        data: {
          academyId: id,
          name: dto.name,
          description: dto.description ?? null,
          styleId: dto.styleId ?? null,
          levelId: dto.levelId ?? null,
          instructorId: dto.instructorId ?? null,
          quorum: dto.quorum ?? null,
          dropInPrice: dto.dropInPrice ?? null,
          month,
          types: dto.typeIds?.length
            ? { create: dto.typeIds.map((typeId) => ({ typeId })) }
            : undefined,
        },
      });

      for (const s of dto.slots) {
        // Cupos y modalidad son de la serie (spec academies/class-series)
        // - el slot solo fija día/hora e instructor override.
        const slotInstructorId = s.instructorId ?? dto.instructorId ?? null;
        const slot = await tx.classSlot.create({
          data: {
            academyId: id,
            seriesId: series.id,
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime,
            instructorId: slotInstructorId,
            // El primario también entra al plantel (join = conjunto).
            ...(slotInstructorId
              ? { instructors: { create: [{ personId: slotInstructorId }] } }
              : {}),
          },
        });
        await this.materialize.materializeSlot(tx, slot, dates);
      }

      return tx.classSeries.findUnique({
        where: { id: series.id },
        include: SERIES_INCLUDE,
      });
    });
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
    await this.access.requireCapabilityWrite(id, req.person!, "schedule");
    const prev = await this.findSeriesOr404(id, seriesId);
    const reactivated = dto.active === true && !prev.active;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.typeIds) {
        await tx.classSeriesType.deleteMany({ where: { seriesId } });
        if (dto.typeIds.length) {
          await tx.classSeriesType.createMany({
            data: dto.typeIds.map((typeId) => ({ seriesId, typeId })),
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
          instructorId: dto.instructorId,
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

      if (dto.addSlots?.length) {
        // Copia mutable para dedup contra slots recién creados en este PATCH.
        const known = [...series.slots];
        for (const s of dto.addSlots) {
          if (s.startTime >= s.endTime) {
            throw new BadRequestException(
              "startTime debe ser menor que endTime",
            );
          }
          const key = (x: {
            weekday: number;
            startTime: string;
            endTime: string;
          }) => `${x.weekday}|${x.startTime}|${x.endTime}`;
          let slot = known.find((x) => key(x) === key(s)) ?? null;
          if (!slot) {
            const slotInstructorId =
              s.instructorId ?? series.instructorId ?? null;
            slot = await tx.classSlot.create({
              data: {
                academyId: id,
                seriesId,
                weekday: s.weekday,
                startTime: s.startTime,
                endTime: s.endTime,
                instructorId: slotInstructorId,
                ...(slotInstructorId
                  ? {
                      instructors: {
                        create: [{ personId: slotInstructorId }],
                      },
                    }
                  : {}),
              },
            });
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

    if (reactivated) {
      // Best-effort post-commit: un fallo del centro no revierte la serie.
      await this.notifySeriesResumed(id, updated);
    }
    return updated;
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
    await this.access.requireCapabilityWrite(id, req.person!, "schedule");
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
    await this.access.requireCapabilityWrite(id, req.person!, "schedule");
    const slot = await this.prisma.classSlot.findFirst({
      where: { id: slotId, academyId: id },
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
      return tx.classSlot.delete({ where: { id: slotId } });
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
