import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { AdminCityGuidesService } from "../application/city-guides.service";

/** Tope por sección (spec city-guides) - mismo límite en el editor web. */
const SECTION_MAX = 8000;

class UpdateCityGuideDto {
  @IsOptional()
  @IsString()
  @MaxLength(SECTION_MAX)
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SECTION_MAX)
  nightlife?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SECTION_MAX)
  practical?: string;
}

/**
 * Consola /admin/ciudades (spec city-guides): lista el estado editorial
 * de cada ciudad y edita las 3 secciones de su guía. Todo detrás del
 * flag city_guides (OFF → 404, vía service) y con auditoría
 * CITY_GUIDE_UPDATE en cada PUT.
 */
@Controller("admin/city-guides")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminCityGuidesController {
  constructor(private readonly guides: AdminCityGuidesService) {}

  /** GET /admin/city-guides - ciudades con estado vacía/borrador/completa. */
  @Get()
  list() {
    return this.guides.list();
  }

  /** GET /admin/city-guides/:cityId - contenido + último editor. */
  @Get(":cityId")
  detail(@Param("cityId") cityId: string) {
    return this.guides.detail(cityId);
  }

  /** PUT /admin/city-guides/:cityId - upsert de secciones + auditoría. */
  @Put(":cityId")
  update(
    @Param("cityId") cityId: string,
    @Body() dto: UpdateCityGuideDto,
    @Req() req: Request,
  ) {
    return this.guides.update(cityId, dto, req.person!.id);
  }
}
