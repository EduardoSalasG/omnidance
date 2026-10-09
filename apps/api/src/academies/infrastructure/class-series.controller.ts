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
import { whitelist } from "./list-filters";

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
   * status = active|inactive (whitelist → 400), styleId exacto.
   */
  @Get(":id/series")
  async list(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("styleId") styleId?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "schedule");
    const statusF = whitelist(status, ["active", "inactive"] as const, "status");
    const term = q?.trim();
    return this.prisma.classSeries.findMany({
      where: {
        academyId: id,
        ...(term ? { name: { contains: term, mode: "insensitive" } } : {}),
        ...(statusF ? { active: statusF === "active" } : {}),
        ...(styleId ? { styleId } : {}),
      },
      orderBy: [{ month: "desc" }, { name: "asc" }],
      include: SERIES_INCLUDE,
    });
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
        const slot = await tx.classSlot.create({
          data: {
            academyId: id,
            seriesId: series.id,
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime,
            instructorId: s.instructorId ?? dto.instructorId ?? null,
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
            slot = await tx.classSlot.create({
              data: {
                academyId: id,
                seriesId,
                weekday: s.weekday,
                startTime: s.startTime,
                endTime: s.endTime,
                instructorId:
                  s.instructorId ?? series.instructorId ?? null,
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
   * Desactiva la serie y cancela las clases futuras - las reservas
   * BOOKED/WAITLIST pasan a CANCELLED (el alumno lo ve en "mis reservas").
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
        data: { active: false },
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
