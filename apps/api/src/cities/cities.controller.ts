import {
  Controller,
  Get,
  Param,
  Query,
} from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { CitiesService } from "./cities.service";

/**
 * Query de GET /events/near - lat/lng llegan como string en la query y
 * el ValidationPipe global (transform) los castea a número; inválidos
 * → NaN → IsNumber rechaza con 400. radiusKm es opcional (default 25
 * en el service; el spec lo acota a máx 200).
 */
class NearEventsQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  radiusKm?: number;
}

/**
 * "Cerca de mí" (spec city-discovery): eventos futuros publicados de
 * las ciudades dentro del radio. Vive bajo el prefijo events/ - se
 * registra ANTES que EventsController (CitiesModule va primero en
 * app.module) porque su @Get(":id") capturaría "near" como id.
 * Público, gated por flag city_landing (OFF → 404, vía service).
 */
@Controller("events")
export class EventsNearController {
  constructor(private readonly cities: CitiesService) {}

  @Get("near")
  @ApiQuery({ name: "lat", required: true })
  @ApiQuery({ name: "lng", required: true })
  @ApiQuery({ name: "radiusKm", required: false })
  near(@Query() dto: NearEventsQueryDto) {
    return this.cities.nearEvents(dto.lat, dto.lng, dto.radiusKm);
  }
}

/**
 * Directorio y landing pública de ciudades (spec city-discovery).
 * Sin SessionGuard: es superficie de descubrimiento - el front la
 * consume anónimo (landing marketing) y logueado. OFF el flag → 404.
 */
@Controller("cities")
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  /**
   * GET /cities/catalog - catálogo geográfico completo para selects de
   * formularios (alta de academia, moneda del evento): países con su
   * moneda y sus ciudades. Sin flag city_landing - es catálogo de
   * formulario, no la superficie de descubrimiento.
   * Debe declararse antes de @Get(":slug").
   */
  @Get("catalog")
  catalog() {
    return this.cities.catalog();
  }

  /** GET /cities - ciudades con actividad próxima, ordenadas por count. */
  @Get()
  list() {
    return this.cities.list();
  }

  /** GET /cities/:slug - ficha de ciudad para la landing. */
  @Get(":slug")
  detail(@Param("slug") slug: string) {
    return this.cities.detail(slug);
  }
}
