import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsDateString, IsOptional, IsString } from "class-validator";
import type { Prisma } from "@prisma/client";
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

  /**
   * Matching de viajes (spec omni-dance.md §8): trips de OTRAS personas que
   * coinciden por destination (contains, case-insensitive) o eventId. Con
   * from/to solo trips cuyo rango [startsAt,endsAt] solape [from,to].
   * Requiere al menos destination o eventId. Límite 50.
   */
  @Get("matches")
  async matches(
    @Req() req: Request,
    @Query("destination") destination?: string,
    @Query("eventId") eventId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    if (!destination?.trim() && !eventId) {
      throw new BadRequestException("requiere destination o eventId");
    }

    const fromDate = from ? new Date(from) : undefined;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException("from inválido");
    }
    const toDate = to ? new Date(to) : undefined;
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("to inválido");
    }

    const matchOr: Prisma.TripWhereInput[] = [];
    if (destination?.trim()) {
      matchOr.push({
        destination: { contains: destination.trim(), mode: "insensitive" },
      });
    }
    if (eventId) matchOr.push({ eventId });

    const where: Prisma.TripWhereInput = {
      personId: { not: req.person!.id },
      OR: matchOr,
    };
    // Solape de rangos: [startsAt,endsAt] ∩ [from,to] ≠ ∅
    if (fromDate) where.endsAt = { gte: fromDate };
    if (toDate) where.startsAt = { lte: toDate };

    const trips = await this.prisma.trip.findMany({
      where,
      orderBy: { startsAt: "asc" },
      take: 50,
    });

    // Trip.personId es escalar → join manual
    const people = await this.prisma.person.findMany({
      where: { id: { in: [...new Set(trips.map((t) => t.personId))] } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));

    return trips.map((t) => ({
      id: t.id,
      destination: t.destination,
      eventId: t.eventId,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      person: byId.get(t.personId) ?? null,
    }));
  }
}
