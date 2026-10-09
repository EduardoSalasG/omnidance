import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsISO8601, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";
import { filterDate } from "./list-filters";
import { ApiQuery } from "@nestjs/swagger";

class RecordAttendanceDto {
  @IsString()
  slotId!: string;

  @IsString()
  personId!: string;

  @IsOptional()
  @IsISO8601()
  date?: string;
}

/**
 * Asistencia a clases de la academia.
 * Schema real: Attendance cuelga de Class (instancia de ClassSlot en una
 * fecha), unique (classId, personId). El endpoint recibe slotId + date y
 * materializa la Class si no existe - así el 409 de duplicado equivale a
 * misma slot + persona + fecha.
 */
@Controller("academies")
export class AttendanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
  ) {}

  @Post(":id/attendance")
  @UseGuards(SessionGuard)
  async record(
    @Param("id") id: string,
    @Body() dto: RecordAttendanceDto,
    @Req() req: Request,
  ) {
    // owner/instructor/admin - mutación de consola: academia bloqueada
    // por mora (billingBlockedAt) → 403 billing.blocked (S3).
    await this.access.requireManageWrite(id, req.person!);

    const slot = await this.prisma.classSlot.findFirst({
      where: { id: dto.slotId, academyId: id },
      select: {
        id: true,
        instructorId: true,
        series: { select: { instructorId: true } },
      },
    });
    if (!slot) throw new NotFoundException("slot no encontrado en la academia");

    // Solo quien imparte la clase (instructor del slot > serie) o un
    // admin de plataforma marca presente - el owner no (spec
    // academies/class-series).
    const instructorId = slot.instructorId ?? slot.series.instructorId;
    const isAdmin = await this.access.isPlatformAdmin(req.person!);
    if (!isAdmin && req.person!.id !== instructorId) {
      throw new ForbiddenException(
        "solo el profesor de la clase puede marcar asistencia",
      );
    }

    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
    });
    if (!person) throw new NotFoundException("persona no encontrada");

    const day = dto.date ? new Date(dto.date) : new Date();
    day.setUTCHours(0, 0, 0, 0);

    const cls =
      (await this.prisma.class.findFirst({
        where: { classSlotId: slot.id, date: day },
      })) ??
      (await this.prisma.class.create({
        data: { classSlotId: slot.id, date: day },
      }));

    const existing = await this.prisma.attendance.findUnique({
      where: { classId_personId: { classId: cls.id, personId: dto.personId } },
    });
    if (existing) {
      throw new ConflictException({
        error: "DUPLICATE_ATTENDANCE",
        message: "asistencia ya registrada para ese slot/persona/fecha",
        attendance: existing,
      });
    }

    return this.prisma.attendance.create({
      data: { classId: cls.id, personId: dto.personId },
    });
  }

  /**
   * Listado de asistencias. Filtros del contrato compartido (spec
   * analytics/query-console, entidad `attendance`): from/to = días
   * inclusivos sobre class.date (default últimos 30d), seriesId del slot,
   * instructorId = override de la clase o default del slot (misma
   * semántica del engine). Fecha inválida → 400.
   */
  @Get(":id/attendance")
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiQuery({ name: "seriesId", required: false })
  @ApiQuery({ name: "instructorId", required: false })
  @UseGuards(SessionGuard)
  async list(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("seriesId") seriesId?: string,
    @Query("instructorId") instructorId?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "students"); // solo owner/admin
    const gte = filterDate(from, "from") ?? new Date(Date.now() - 30 * 86400000);
    const lte = filterDate(to, "to") ?? new Date();
    lte.setUTCHours(23, 59, 59, 999);
    const rows = await this.prisma.attendance.findMany({
      where: {
        class: {
          slot: { academyId: id, ...(seriesId ? { seriesId } : {}) },
          date: { gte, lte },
          // instructorId matchea el override de la clase o el default
          // del slot cuando la clase no tiene override.
          ...(instructorId
            ? {
                OR: [
                  { instructorId },
                  {
                    instructorId: null,
                    slot: { instructorId },
                  },
                ],
              }
            : {}),
        },
      },
      orderBy: { checkedAt: "desc" },
      select: {
        id: true,
        personId: true,
        checkedAt: true,
        class: { select: { id: true, date: true, classSlotId: true } },
      },
    });
    // Attendance.personId es FK plana (sin relación en schema) - join manual,
    // mismo patrón que GET /academies/:id/students. personId se mantiene por compat.
    const people = await this.prisma.person.findMany({
      where: { id: { in: rows.map((r) => r.personId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      person: byId.get(r.personId) ?? {
        id: r.personId,
        name: null,
        email: null,
      },
    }));
  }
}
