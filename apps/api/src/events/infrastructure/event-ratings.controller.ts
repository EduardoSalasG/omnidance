import {
  Body,
  ConflictException,
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
import { IsInt, IsOptional, Max, Min } from "class-validator";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";

// Ventana post-evento para evaluar: hasta ~24h después de endsAt (spec §5).
const RATING_WINDOW_MS = 24 * 60 * 60 * 1000;
// k-anonymity: los promedios solo se exponen con ≥3 evaluaciones totales.
const EXPOSURE_THRESHOLD = 3;

// Dimensiones 1-5, todas opcionales; sin texto libre (spec: solo puntajes).
class RateEventDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  music?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  occupation?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  organization?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  floorComfort?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  lightingSound?: number;
}

const RATING_DIMS = [
  "music",
  "occupation",
  "organization",
  "floorComfort",
  "temperature",
  "lightingSound",
] as const;
type RatingDim = (typeof RATING_DIMS)[number];

type PersonCtx = { id: string; roles: string[] };

@Controller("events")
@UseGuards(SessionGuard)
export class EventRatingsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluar el evento — requiere check-in válido del rater y estar dentro
   * de la ventana post-evento. Upsert por (eventId, raterId): re-enviar
   * edita la evaluación previa.
   */
  @Post(":id/ratings")
  @HttpCode(200)
  async rate(
    @Param("id") eventId: string,
    @Body() dto: RateEventDto,
    @Req() req: Request,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, endsAt: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const checkin = await this.prisma.checkin.findFirst({
      where: { eventId, personId: req.person!.id, voidedAt: null },
      select: { id: true },
    });
    if (!checkin) {
      throw new ForbiddenException(
        "necesitas un check-in válido en el evento para evaluarlo",
      );
    }

    if (Date.now() > event.endsAt.getTime() + RATING_WINDOW_MS) {
      throw new ConflictException("la ventana de evaluación ya cerró");
    }

    const dims = Object.fromEntries(
      RATING_DIMS.map((d) => [d, dto[d] ?? null]),
    ) as Record<RatingDim, number | null>;
    // En update solo se tocan las dimensiones enviadas — editar una no
    // borra las que el rater ya había evaluado antes.
    const patch = Object.fromEntries(
      RATING_DIMS.filter((d) => dto[d] != null).map((d) => [d, dto[d]]),
    );

    return this.prisma.eventRating.upsert({
      where: {
        eventId_raterId: { eventId, raterId: req.person!.id },
      },
      create: { eventId, raterId: req.person!.id, ...dims },
      update: patch,
    });
  }

  /**
   * Resumen agregado para el productor del evento (o admin). Cada dimensión
   * se atribuye al actor responsable: music→DJ, occupation/organization→
   * productor, floorComfort/temperature/lightingSound→venue.
   * Nunca expone evaluaciones individuales ni al evaluador (spec §5).
   */
  @Get(":id/ratings/summary")
  async summary(@Param("id") eventId: string, @Req() req: Request) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, producerId: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    this.assertProducerOrAdmin(event, req.person!);

    const ratings = await this.prisma.eventRating.findMany({
      where: { eventId },
      select: {
        music: true,
        occupation: true,
        organization: true,
        floorComfort: true,
        temperature: true,
        lightingSound: true,
      },
    });

    const count = ratings.length;
    if (count < EXPOSURE_THRESHOLD) {
      return { exposed: false, count, byActor: null };
    }

    const agg = (dim: RatingDim) => {
      const values = ratings
        .map((r) => r[dim])
        .filter((v): v is number => v != null);
      return {
        avg: values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null,
        count: values.length,
      };
    };

    return {
      exposed: true,
      count,
      byActor: {
        dj: { music: agg("music") },
        producer: {
          occupation: agg("occupation"),
          organization: agg("organization"),
        },
        venue: {
          floorComfort: agg("floorComfort"),
          temperature: agg("temperature"),
          lightingSound: agg("lightingSound"),
        },
      },
    };
  }

  /** productor del evento o ADMIN de plataforma. */
  private assertProducerOrAdmin(
    event: { producerId: string | null },
    person: PersonCtx,
  ): void {
    if (person.roles.includes("ADMIN")) return;
    if (event.producerId === person.id) return;
    throw new ForbiddenException(
      "solo el productor del evento o un admin puede ver el resumen",
    );
  }
}
