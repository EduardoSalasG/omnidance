import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { EVENT_RECENT_LOOKBACK_MS } from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";
import {
  SocialDomainError,
  assertPracticeInput,
} from "../domain/social.service";

class CreatePracticeDto {
  @IsString()
  name!: string;

  /** Opcional (spec omni-dance.md §8): práctica sin local — parque/plaza. */
  @IsOptional()
  @IsString()
  venueId?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** id o nombre de Style — se materializa como ScheduleBlock del evento. */
  @IsOptional()
  @IsString()
  style?: string;
}

/**
 * Prácticas sociales (spec omni-dance.md §8): micro-eventos creados por
 * cualquier bailarín — Event type=PRACTICA, status=PUBLISHED, hostId=creador.
 */
@Controller("practices")
export class PracticesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @UseGuards(SessionGuard)
  async create(@Body() dto: CreatePracticeDto, @Req() req: Request) {
    const hostId = req.person!.id;
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    try {
      assertPracticeInput({
        name: dto.name,
        startsAt,
        endsAt,
        capacity: dto.capacity ?? null,
      });
    } catch (e) {
      if (e instanceof SocialDomainError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    // venueId opcional: si viene, debe existir; si no, la práctica queda
    // sin local (parque/plaza) → Event.venueId = null.
    if (dto.venueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.venueId },
        select: { id: true },
      });
      if (!venue) throw new NotFoundException("venue no encontrado");
    }

    // style: id directo o match por nombre → ScheduleBlock con el estilo foco
    let styleId: string | null = null;
    if (dto.style) {
      const style =
        (await this.prisma.style.findUnique({ where: { id: dto.style } })) ??
        (await this.prisma.style.findFirst({ where: { name: dto.style } }));
      if (!style) throw new BadRequestException("style no encontrado");
      styleId = style.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          type: "PRACTICA",
          status: "PUBLISHED",
          hostId,
          venueId: dto.venueId ?? null,
          name: dto.name,
          startsAt,
          endsAt,
          capacity: dto.capacity ?? null,
        },
      });
      if (styleId) {
        await tx.scheduleBlock.create({
          data: { eventId: event.id, startsAt, endsAt, styleId },
        });
      }
      return event;
    });
  }

  /** Prácticas publicadas próximas — mismo shape público que GET /events. */
  @Get()
  list() {
    return this.prisma.event.findMany({
      where: {
        type: "PRACTICA",
        status: { in: ["PUBLISHED", "LIVE"] },
        startsAt: { gte: new Date(Date.now() - EVENT_RECENT_LOOKBACK_MS) },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        hostId: true,
        capacity: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        doorPrice: true,
        series: { select: { name: true } },
        venue: { select: { name: true, address: true } },
      },
    });
  }
}
