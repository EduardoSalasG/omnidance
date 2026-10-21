import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";

/**
 * Descubrimiento por ciudad (spec multipais-foundation, requisito
 * "Descubrimiento por ciudad"): lista de ciudades activas + detalle
 * con academias, socials/eventos y prácticas de la ciudad. Todo
 * agregado/público de actor - la base de la landing "¿dónde bailar
 * en X?" y del "cerca de mí" (geohash).
 */
@Controller("cities")
@UseGuards(SessionGuard)
export class CitiesController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /cities - ciudades con conteos de oferta activa. */
  @Get()
  async list() {
    const cities = await this.prisma.city.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        country: { select: { code: true, name: true } },
        _count: {
          select: { venues: true, academies: true, events: true },
        },
      },
    });
    return cities.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      timezone: c.timezone,
      country: c.country,
      venues: c._count.venues,
      academies: c._count.academies,
      events: c._count.events,
    }));
  }

  /**
   * GET /cities/:slug - detalle de ciudad: academias aprobadas,
   * próximos eventos publicados y prácticas abiertas.
   */
  @Get(":slug")
  async detail(@Param("slug") slug: string) {
    const city = await this.prisma.city.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        country: { select: { code: true, name: true } },
      },
    });
    if (!city) throw new NotFoundException("ciudad no encontrada");

    const now = new Date();
    const [academies, events, practices] = await Promise.all([
      this.prisma.academy.findMany({
        where: { cityId: city.id, reviewStatus: "APPROVED", active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          photoUrl: true,
          instagram: true,
          address: true,
        },
      }),
      this.prisma.event.findMany({
        where: {
          cityId: city.id,
          status: "PUBLISHED",
          type: { not: "PRACTICA" },
          startsAt: { gte: now },
        },
        orderBy: { startsAt: "asc" },
        take: 30,
        select: {
          id: true,
          name: true,
          startsAt: true,
          endsAt: true,
          genres: true,
          presalePrice: true,
          doorPrice: true,
          currency: true,
          venue: { select: { name: true } },
          venueText: true,
          series: { select: { name: true } },
        },
      }),
      this.prisma.event.findMany({
        where: {
          cityId: city.id,
          status: "PUBLISHED",
          type: "PRACTICA",
          startsAt: { gte: now },
        },
        orderBy: { startsAt: "asc" },
        take: 20,
        select: {
          id: true,
          name: true,
          startsAt: true,
          venueText: true,
          venue: { select: { name: true } },
        },
      }),
    ]);

    return { ...city, academies, events, practices };
  }
}
