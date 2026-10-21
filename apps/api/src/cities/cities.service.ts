import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { FeatureFlagsService } from "../features/feature-flags.service";
import {
  PUBLIC_FEED_SELECT,
  approvedProducerIds,
  mapPublicFeed,
  publicProducerWhere,
} from "../common/event-feed";

const CITY_LANDING_FLAG = "city_landing";
// Guía editorial (spec city-guides): el flag city_guides gatea que la
// guía viaje en la ficha pública - OFF → ni `guide` ni hasGuide:true.
const CITY_GUIDES_FLAG = "city_guides";
const GUIDE_SECTION_KEYS = ["intro", "nightlife", "practical"] as const;
/** Radio de "cerca de mí" (spec city-discovery): default 25km, máx 200. */
const NEAR_DEFAULT_KM = 25;
const NEAR_MAX_KM = 200;
/** Tope defensivo de la lista de la landing - el feed no acota. */
const UPCOMING_TAKE = 50;

/** Haversine en km entre dos coordenadas geográficas. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type CityWithDistance = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
};

/**
 * Descubrimiento por ciudad (spec city-discovery): directorio público,
 * landing por slug y "cerca de mí". Todo detrás del flag `city_landing`
 * - apagado → 404 (fail-closed, la superficie no existe).
 *
 * "Actividad" = eventos futuros PUBLISHED (startsAt > ahora) de
 * productores aprobados o sin productor - el mismo universo de la
 * cartelera pública, sin excluir prácticas: `Event.cityId` se
 * desnormalizó justamente para que las prácticas sin Venue cuenten.
 */
@Injectable()
export class CitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Gate del flag - 404 si está apagado (spec). */
  private async assertEnabled() {
    if (!(await this.flags.isEnabled(CITY_LANDING_FLAG))) {
      throw new NotFoundException();
    }
  }

  /** Where base de "actividad": futuros publicados de cartelera pública. */
  private activityWhere(
    approvedIds: string[],
    cityIds?: string[],
  ): Prisma.EventWhereInput {
    return {
      status: "PUBLISHED" as const,
      startsAt: { gt: new Date() },
      ...(cityIds ? { cityId: { in: cityIds } } : {}),
      AND: [publicProducerWhere(approvedIds)],
    };
  }

  /**
   * GET /cities - ciudades con al menos un evento futuro publicado,
   * ordenadas por actividad descendente (nombre como desempate).
   */
  async list() {
    await this.assertEnabled();
    const approved = await approvedProducerIds(this.prisma);
    const grouped = await this.prisma.event.groupBy({
      by: ["cityId"],
      where: this.activityWhere(approved),
      _count: { _all: true },
    });
    const counts = new Map(
      grouped
        .filter((g): g is typeof g & { cityId: string } => g.cityId != null)
        .map((g) => [g.cityId, g._count._all]),
    );
    if (!counts.size) return [];

    const cities = await this.prisma.city.findMany({
      where: { id: { in: [...counts.keys()] } },
      select: {
        id: true,
        slug: true,
        name: true,
        country: { select: { code: true, name: true } },
      },
    });
    return cities
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        country: c.country,
        upcomingEvents: counts.get(c.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.upcomingEvents - a.upcomingEvents ||
          a.name.localeCompare(b.name, "es"),
      );
  }

  /**
   * GET /cities/:slug - ficha de ciudad: coordenadas, próximos eventos
   * (shape del feed público), venues activos y la guía editorial
   * (spec city-guides): `guide` viaja solo si el flag city_guides está
   * ON y al menos una sección tiene texto - hasGuide sigue ese mismo
   * criterio (guía vacía o flag OFF → false, sin `guide`). 404 con
   * slug inexistente.
   */
  async detail(slug: string) {
    await this.assertEnabled();
    const city = await this.prisma.city.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        lat: true,
        lng: true,
        country: { select: { code: true, name: true } },
        guide: {
          select: { intro: true, nightlife: true, practical: true },
        },
      },
    });
    if (!city) throw new NotFoundException("ciudad no encontrada");

    const approved = await approvedProducerIds(this.prisma);
    const [events, venues] = await Promise.all([
      this.prisma.event.findMany({
        where: this.activityWhere(approved, [city.id]),
        orderBy: { startsAt: "asc" },
        take: UPCOMING_TAKE,
        select: PUBLIC_FEED_SELECT,
      }),
      this.prisma.venue.findMany({
        where: { cityId: city.id, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    const { guide, ...rest } = city;
    const guidesOn = await this.flags.isEnabled(CITY_GUIDES_FLAG);
    const sections = guide
      ? {
          intro: guide.intro ?? "",
          nightlife: guide.nightlife ?? "",
          practical: guide.practical ?? "",
        }
      : null;
    const hasGuide =
      guidesOn &&
      sections != null &&
      GUIDE_SECTION_KEYS.some((s) => sections[s].trim().length > 0);
    return {
      ...rest,
      upcomingEvents: mapPublicFeed(events),
      venues,
      hasGuide,
      // `guide` solo existe en el payload cuando hay contenido visible -
      // flag OFF o guía vacía → la key ni siquiera viaja (spec).
      ...(hasGuide ? { guide: sections } : {}),
    };
  }

  /**
   * GET /events/near?lat&lng&radiusKm - "cerca de mí": resuelve las
   * ciudades dentro del radio por haversine sobre City.lat/lng (en
   * memoria - son pocas ciudades) y devuelve los eventos futuros
   * publicados de esas ciudades, ordenados por distancia de la ciudad
   * y luego por fecha. Sin ciudades en radio → events vacío +
   * nearestCity de sugerencia (nunca error). Sin lat/lng válidas → 400.
   */
  async nearEvents(lat: number, lng: number, radiusKm?: number) {
    await this.assertEnabled();
    if (
      !isFinite(lat) ||
      !isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new BadRequestException("lat/lng fuera de rango");
    }
    const radius = Math.min(
      NEAR_MAX_KM,
      radiusKm && radiusKm > 0 ? radiusKm : NEAR_DEFAULT_KM,
    );

    const cities = await this.prisma.city.findMany({
      where: { lat: { not: null }, lng: { not: null } },
      select: { id: true, slug: true, name: true, lat: true, lng: true },
    });
    const byDistance: CityWithDistance[] = cities
      .filter(
        (c): c is typeof c & { lat: number; lng: number } =>
          c.lat != null && c.lng != null,
      )
      .map((c) => ({
        ...c,
        distanceKm: haversineKm(lat, lng, c.lat, c.lng),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const inRange = byDistance.filter((c) => c.distanceKm <= radius);
    const nearest = byDistance[0];

    const nearestCity = () =>
      nearest
        ? {
            name: nearest.name,
            slug: nearest.slug,
            distanceKm: Math.round(nearest.distanceKm),
          }
        : undefined;

    if (!inRange.length) {
      return { events: [], nearestCity: nearestCity() };
    }

    const approved = await approvedProducerIds(this.prisma);
    const distByCity = new Map(inRange.map((c) => [c.id, c.distanceKm]));
    const rows = await this.prisma.event.findMany({
      where: this.activityWhere(
        approved,
        inRange.map((c) => c.id),
      ),
      select: { ...PUBLIC_FEED_SELECT, cityId: true },
    });

    // Orden: ciudad más cercana primero, dentro de cada ciudad por fecha.
    const cleaned = rows
      .sort(
        (a, b) =>
          (distByCity.get(a.cityId ?? "") ?? 0) -
            (distByCity.get(b.cityId ?? "") ?? 0) ||
          a.startsAt.getTime() - b.startsAt.getTime(),
      )
      .map(({ cityId: _cityId, ...e }) => e);
    const events = mapPublicFeed(cleaned);

    return events.length
      ? { events }
      : { events, nearestCity: nearestCity() };
  }
}
