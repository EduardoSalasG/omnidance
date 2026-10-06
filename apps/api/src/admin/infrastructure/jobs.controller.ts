import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { JobsService } from "../../jobs/jobs.service";

class UpdateJobDto {
  @IsOptional()
  @IsString()
  cronExpr?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class RunsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

/**
 * Consola de jobs programados (spec admin-jobs-mail-campaigns): lista,
 * edición de horario/timezone, pausa/reactivación, corrida manual e
 * historial - todo bajo admin.access y auditado en AuditLog.
 */
@Controller("admin/jobs")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminJobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list() {
    return this.jobs.list();
  }

  @Patch(":key")
  update(@Param("key") key: string, @Body() dto: UpdateJobDto, @Req() req: Request) {
    return this.jobs.update(key, req.person!.id, dto);
  }

  @Post(":key/run")
  run(@Param("key") key: string, @Req() req: Request) {
    return this.jobs.runNow(key, req.person!.id);
  }

  @Get(":key/runs")
  runs(@Param("key") key: string, @Query() q: RunsQueryDto) {
    return this.jobs.listRuns(key, q.take ?? 50);
  }
}
