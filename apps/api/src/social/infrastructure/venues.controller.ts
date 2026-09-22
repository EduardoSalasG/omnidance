import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { EventStatus } from "@prisma/client";
import { PrismaService } from "../../prisma.service";

/**
 * Directorio público de venues activos — el front lo usa para selects
 * (crear práctica, filtrar eventos), el mapa de /eventos y el perfil
 * público del local. Sin datos sensibles: solo lo que ya se expone
 * vía GET /events → event.venue.
 */
@Controller("venues")
export class VenuesController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/venues → venues activos por nombre. lat/lng/logo/hours alimentan el mapa y el perfil. */
  @Get()
  async list() {
    const venues = await this.prisma.venue.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        address: true,
        capacity: true,
        lat: true,
        lng: true,
        logoUrl: true,
        hours: true,
      },
    });
    // Orden en JS (localeCompare) — Postgres collation y JS difieren en
    // espacios/mayúsculas y el contrato del endpoint es orden por nombre.
    return venues.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * GET /api/venues/:id → perfil público + próximos eventos PUBLISHED.
   * `?days=N` limita el horizonte (default 30, cap 90) — mismo criterio
   * que el listado público de /events.
   */
  @Get(":id")
  async detail(@Param("id") id: string, @Query("days") days?: string) {
    const horizonDays = Math.min(
      90,
      Math.max(1, Number.parseInt(days ?? "30", 10) || 30),
    );
    const venue = await this.prisma.venue.findFirst({
      where: { id, active: true },
      select: {
        id: true,
        name: true,
        address: true,
        capacity: true,
        lat: true,
        lng: true,
        logoUrl: true,
        hours: true,
      },
    });
    if (!venue) throw new NotFoundException("Local no encontrado");

    const events = await this.prisma.event.findMany({
      where: {
        venueId: id,
        status: EventStatus.PUBLISHED,
        // Las prácticas no se vinculan a locales (venueText libre) —
        // defensa por si quedara una fila legada con venueId.
        type: { not: "PRACTICA" },
        startsAt: {
          gte: new Date(),
          lte: new Date(Date.now() + horizonDays * 86_400_000),
        },
      },
      orderBy: { startsAt: "asc" },
      take: 20,
      select: {
        id: true,
        name: true,
        startsAt: true,
        genres: true,
        genreMix: true,
        presalePrice: true,
        doorPrice: true,
        series: { select: { name: true, genres: true, genreMix: true } },
      },
    });

    return {
      ...venue,
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        startsAt: e.startsAt,
        genres: e.genres.length ? e.genres : (e.series?.genres ?? []),
        genreMix: e.genreMix ?? e.series?.genreMix ?? null,
        presalePrice: e.presalePrice,
        doorPrice: e.doorPrice,
      })),
    };
  }
}
