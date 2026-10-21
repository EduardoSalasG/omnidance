import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { FeatureFlagsService } from "../../features/feature-flags.service";

class SetFeatureFlagDto {
  @IsBoolean()
  enabled!: boolean;
}

/**
 * Consola /admin/funcionalidades (spec feature-flags-admin): lista el
 * catálogo de flags y flippea `enabled` con auditoría. Sin alta/baja por
 * API - el catálogo lo define el seed (un flag sin consumer no sirve).
 */
@Controller("admin/feature-flags")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminFeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  list() {
    return this.flags.list();
  }

  @Patch(":key")
  setEnabled(
    @Param("key") key: string,
    @Body() dto: SetFeatureFlagDto,
    @Req() req: Request,
  ) {
    return this.flags.setEnabled(key, dto.enabled, req.person!.id);
  }
}
