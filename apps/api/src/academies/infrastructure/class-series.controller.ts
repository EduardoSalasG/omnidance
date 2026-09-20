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

  /** Opcional: null/omitido = el slot hereda el quórum de serie/academia. */
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

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

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: "month formato YYYY-MM" })
  month!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SeriesSlotDto)
  slots!: SeriesSlotDto[];
}

/**
 * Slot extra para PATCH addSlots — mismo contrato que SeriesSlotDto;
 * capacity opcional: si falta queda null y el slot hereda el quórum
 * efectivo (series.quorum → academy.defaultQuorum → 20).
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
  @IsInt()
  @Min(1)
  capacity?: number;

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
  slots: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
};

/**
 * Series de clases recurrentes mensuales (omni-dance §academias):
 * una serie agrupa 1+ horarios semanales; al crearla se materializan
 * las instancias Class de ese mes para que los alumnos puedan reservar.
 * Gestión restringida a owner/ADMIN vía AcademyAccess.requireAdminister.
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class ClassSeriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly notifications: NotificationsService,
  ) {}

  /** Lista las series de la academia (gestión). */
  @Get(":id/series")
  async list(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.classSeries.findMany({
      where: { academyId: id },
      orderBy: [{ month: "desc" }, { name: "asc" }],
      include: SERIES_INCLUDE,
    });
  }

  /**
   * Crea serie + tipos + slots y materializa los Class del mes.
   * Transacción única — si falla no queda nada a medias.
   */
  @Post(":id/series")
  async create(
    @Param("id") id: string,
    @Body() dto: CreateSeriesDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
    const dates = monthDates(dto.month);
    if (dates.length === 0) {
      throw new BadRequestException("month inválido");
    }

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
          month: dto.month,
          types: dto.typeIds?.length
            ? { create: dto.typeIds.map((typeId) => ({ typeId })) }
            : undefined,
        },
      });

      for (const s of dto.slots) {
        const slot = await tx.classSlot.create({
          data: {
            academyId: id,
            seriesId: series.id,
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime,
            capacity: s.capacity ?? null, // null = hereda serie/academia
            styleId: dto.styleId ?? null,
            instructorId: s.instructorId ?? dto.instructorId ?? null,
          },
        });
        // getUTCDay — las fechas se generan a medianoche UTC; con getDay()
        // (hora local) en Chile cada clase quedaría un día corrida.
        const classDates = dates.filter((d) => d.getUTCDay() === s.weekday);
        if (classDates.length) {
          await tx.class.createMany({
            data: classDates.map((date) => ({
              classSlotId: slot.id,
              date,
              instructorId: slot.instructorId,
            })),
          });
        }
      }

      return tx.classSeries.findUnique({
        where: { id: series.id },
        include: SERIES_INCLUDE,
      });
    });
  }

  /**
   * Edita metadatos de la serie. Si active pasa a true sobre una serie
   * inactiva, rematerializa las clases futuras del mes (descancela las que
   * existen y crea las que falten, sin duplicar) y avisa a los alumnos con
   * enrollment ACTIVE vía notificación class.series.resumed.
   *
   * addSlots agrega horarios a la serie: por cada uno crea el ClassSlot
   * (o reutiliza uno idéntico weekday+startTime+endTime para no duplicar
   * ante reintentos) y materializa solo las fechas restantes del mes de la
   * serie (date >= hoy UTC) que caigan en ese weekday.
   */
  @Patch(":id/series/:seriesId")
  async update(
    @Param("id") id: string,
    @Param("seriesId") seriesId: string,
    @Body() dto: UpdateSeriesDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
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
          active: dto.active,
        },
        include: SERIES_INCLUDE,
      });

      // Fechas restantes del mes de la serie (medianoche UTC, como create).
      const now = new Date();
      const futureDates = monthDates(prev.month).filter(
        (d) => d >= new Date(now.toISOString().slice(0, 10)),
      );

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
                capacity: s.capacity ?? null, // null = hereda serie/academia
                styleId: series.styleId,
                instructorId:
                  s.instructorId ?? series.instructorId ?? null,
              },
            });
            known.push(slot);
          }
          await this.materializeSlot(tx, slot, futureDates);
        }
      }

      if (reactivated) {
        for (const slot of series.slots) {
          await this.materializeSlot(tx, slot, futureDates);
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
   * Materializa instancias Class de un slot para las fechas dadas:
   * descancela las existentes y crea solo las faltantes (sin duplicar
   * slot+date). getUTCDay — las fechas vienen a medianoche UTC.
   */
  private async materializeSlot(
    tx: Prisma.TransactionClient,
    slot: { id: string; weekday: number; instructorId: string | null },
    dates: Date[],
  ): Promise<void> {
    const wanted = dates.filter((d) => d.getUTCDay() === slot.weekday);
    if (!wanted.length) return;
    const existing = await tx.class.findMany({
      where: { classSlotId: slot.id, date: { in: wanted } },
      select: { id: true, date: true, cancelled: true },
    });
    const byTime = new Map(existing.map((c) => [c.date.getTime(), c]));
    const toRevive = existing.filter((c) => c.cancelled).map((c) => c.id);
    if (toRevive.length) {
      await tx.class.updateMany({
        where: { id: { in: toRevive } },
        data: { cancelled: false },
      });
    }
    const missing = wanted.filter((d) => !byTime.has(d.getTime()));
    if (missing.length) {
      await tx.class.createMany({
        data: missing.map((date) => ({
          classSlotId: slot.id,
          date,
          instructorId: slot.instructorId,
        })),
      });
    }
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
   * Desactiva la serie y cancela las clases futuras — las reservas
   * BOOKED/WAITLIST pasan a CANCELLED (el alumno lo ve en "mis reservas").
   */
  @Delete(":id/series/:seriesId")
  @HttpCode(200)
  async deactivate(
    @Param("id") id: string,
    @Param("seriesId") seriesId: string,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
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
      await tx.classBooking.updateMany({
        where: { classId: { in: classIds }, status: { in: ["BOOKED", "WAITLIST"] } },
        data: { status: "CANCELLED" },
      });
      return tx.classSeries.update({
        where: { id: seriesId },
        data: { active: false },
      });
    });
  }

  /**
   * Elimina un horario de la serie — las clases futuras de ese slot se
   * cancelan y sus reservas se liberan.
   */
  @Delete(":id/slots/:slotId")
  @HttpCode(200)
  async deleteSlot(
    @Param("id") id: string,
    @Param("slotId") slotId: string,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
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
        data: { status: "CANCELLED" },
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

/** Días calendario del mes "YYYY-MM" (UTC) para materializar clases. */
function monthDates(month: string): Date[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return [];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, i) => new Date(Date.UTC(y, m - 1, i + 1)),
  );
}
