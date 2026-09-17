import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";

class SetAvailabilityDto {
  @IsBoolean()
  available!: boolean;

  /** Hasta cuándo sigue disponible (ISO) — null = sin expiración. */
  @IsOptional()
  @IsDateString()
  until?: string;

  /** Comuna / zona donde está disponible. */
  @IsOptional()
  @IsString()
  location?: string;
}

/**
 * "Estoy disponible para bailar" (spec omni-dance.md §8): toggle por persona
 * (AvailabilityToggle.personId @@unique) + feed público de disponibles vigentes.
 */
@Controller("availability")
export class AvailabilityController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert del toggle propio. until/location no enviados se limpian (null):
   * el toggle representa el estado completo declarado por la persona.
   */
  @Post()
  @UseGuards(SessionGuard)
  set(@Body() dto: SetAvailabilityDto, @Req() req: Request) {
    const personId = req.person!.id;
    const until = dto.until ? new Date(dto.until) : null;
    const location = dto.location ?? null;
    return this.prisma.availabilityToggle.upsert({
      where: { personId },
      create: { personId, available: dto.available, until, location },
      update: { available: dto.available, until, location },
    });
  }

  /**
   * Feed público: disponibles vigentes (available=true y sin until o until
   * futuro) → [{person:{id,name,photoUrl}, location, until, updatedAt}].
   */
  @Get()
  async feed() {
    const toggles = await this.prisma.availabilityToggle.findMany({
      where: {
        available: true,
        OR: [{ until: null }, { until: { gt: new Date() } }],
      },
      orderBy: { updatedAt: "desc" },
    });

    // AvailabilityToggle.personId es escalar (sin relación) → join manual
    const people = await this.prisma.person.findMany({
      where: { id: { in: toggles.map((t) => t.personId) } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));

    return toggles.map((t) => {
      const person = byId.get(t.personId);
      return {
        person: {
          id: t.personId,
          name: person?.name ?? "?",
          photoUrl: person?.photoUrl ?? null,
        },
        location: t.location,
        until: t.until,
        updatedAt: t.updatedAt,
      };
    });
  }
}
