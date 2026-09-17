import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { DanceRole } from "@prisma/client";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";

class CreatePartnerRequestDto {
  /** Style.id opcional — si viene debe existir (el feed hace join manual). */
  @IsOptional()
  @IsString()
  styleId?: string;

  @IsOptional()
  @IsEnum(DanceRole)
  role?: DanceRole;

  /** Autodeclarado: principiante/intermedio/avanzado (texto libre v1). */
  @IsOptional()
  @IsString()
  level?: string;

  /** Comuna / zona. */
  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * Busco pareja de práctica (spec omni-dance.md §8): feed público de
 * solicitudes OPEN; el dueño cierra la suya cuando ya no busca.
 * PracticePartnerRequest no tiene @relation a Person/Style → joins manuales.
 */
@Controller("partner-requests")
export class PartnerRequestsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Crear solicitud — status OPEN por default. */
  @Post()
  @UseGuards(SessionGuard)
  async create(@Body() dto: CreatePartnerRequestDto, @Req() req: Request) {
    if (dto.styleId) {
      const style = await this.prisma.style.findUnique({
        where: { id: dto.styleId },
        select: { id: true },
      });
      if (!style) throw new BadRequestException("style no encontrado");
    }

    return this.prisma.practicePartnerRequest.create({
      data: {
        personId: req.person!.id,
        styleId: dto.styleId ?? null,
        role: dto.role ?? null,
        level: dto.level ?? null,
        location: dto.location ?? null,
        note: dto.note ?? null,
      },
    });
  }

  /**
   * Feed público de solicitudes OPEN, más recientes primero:
   * [{id, person:{id,name,photoUrl}, styleId, style:{name}|null, role,
   *   level, location, note, createdAt}]
   */
  @Get()
  async feed() {
    const requests = await this.prisma.practicePartnerRequest.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });

    const personIds = [...new Set(requests.map((r) => r.personId))];
    const styleIds = [
      ...new Set(
        requests.map((r) => r.styleId).filter((s): s is string => s != null),
      ),
    ];
    const [people, styles] = await Promise.all([
      this.prisma.person.findMany({
        where: { id: { in: personIds } },
        select: { id: true, name: true, photoUrl: true },
      }),
      this.prisma.style.findMany({
        where: { id: { in: styleIds } },
        select: { id: true, name: true },
      }),
    ]);
    const personById = new Map(people.map((p) => [p.id, p]));
    const styleById = new Map(styles.map((s) => [s.id, s]));

    return requests.map((r) => {
      const person = personById.get(r.personId);
      const style = r.styleId ? styleById.get(r.styleId) : undefined;
      return {
        id: r.id,
        person: {
          id: r.personId,
          name: person?.name ?? "?",
          photoUrl: person?.photoUrl ?? null,
        },
        styleId: r.styleId,
        style: style ? { name: style.name } : null,
        role: r.role,
        level: r.level,
        location: r.location,
        note: r.note,
        createdAt: r.createdAt,
      };
    });
  }

  /** Cerrar la solicitud — solo el dueño (403 si no). */
  @Post(":id/close")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async close(@Param("id") id: string, @Req() req: Request) {
    const request = await this.prisma.practicePartnerRequest.findUnique({
      where: { id },
    });
    if (!request) throw new NotFoundException("solicitud no encontrada");
    if (request.personId !== req.person!.id) {
      throw new ForbiddenException("solo el dueño puede cerrar la solicitud");
    }
    return this.prisma.practicePartnerRequest.update({
      where: { id },
      data: { status: "CLOSED" },
    });
  }
}
