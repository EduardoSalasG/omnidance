import {
  Body,
  ConflictException,
  Controller,
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
 * materializa la Class si no existe — así el 409 de duplicado equivale a
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
    await this.access.requireManage(id, req.person!); // owner/instructor/admin

    const slot = await this.prisma.classSlot.findFirst({
      where: { id: dto.slotId, academyId: id },
    });
    if (!slot) throw new NotFoundException("slot no encontrado en la academia");

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

  @Get(":id/attendance")
  @UseGuards(SessionGuard)
  async list(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    await this.access.requireAdminister(id, req.person!); // solo owner/admin
    const gte = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const lte = to ? new Date(to) : new Date();
    lte.setUTCHours(23, 59, 59, 999);
    const rows = await this.prisma.attendance.findMany({
      where: {
        class: {
          slot: { academyId: id },
          date: { gte, lte },
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
    // Attendance.personId es FK plana (sin relación en schema) — join manual,
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
