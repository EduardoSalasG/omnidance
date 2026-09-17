import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsDateString, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import {
  SocialDomainError,
  assertTripInput,
} from "../domain/social.service";

class CreateTripDto {
  /** Ciudad / congreso destino — persiste como Trip.destination. */
  @IsString()
  city!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  /** Si el viaje es a un congreso registrado en la plataforma. */
  @IsOptional()
  @IsString()
  eventId?: string;
}

/**
 * Trips (spec omni-dance.md §8): anuncio "voy a X ciudad/congreso" para
 * matching futuro con locales y asistentes al mismo evento.
 */
@Controller("trips")
@UseGuards(SessionGuard)
export class TripsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async create(@Body() dto: CreateTripDto, @Req() req: Request) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    try {
      assertTripInput({ destination: dto.city, startsAt, endsAt });
    } catch (e) {
      if (e instanceof SocialDomainError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }

    if (dto.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: dto.eventId },
        select: { id: true },
      });
      if (!event) {
        throw new BadRequestException("eventId no corresponde a un evento");
      }
    }

    return this.prisma.trip.create({
      data: {
        personId: req.person!.id,
        destination: dto.city,
        eventId: dto.eventId ?? null,
        startsAt,
        endsAt,
      },
    });
  }

  @Get("mine")
  mine(@Req() req: Request) {
    return this.prisma.trip.findMany({
      where: { personId: req.person!.id },
      orderBy: { startsAt: "asc" },
    });
  }
}
