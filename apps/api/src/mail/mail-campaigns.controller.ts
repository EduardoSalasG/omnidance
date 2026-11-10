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
import { IsDateString, IsDefined, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { RolesGuard } from "../common/rbac/roles.guard";
import { RequirePermissions } from "../common/rbac/roles.decorator";
import {
  MailCampaignsService,
  type AudienceSpec,
} from "./mail-campaigns.service";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AudienceDto {
  @IsIn([
    "ALL",
    "ROLE",
    "EVENT",
    "ENROLLMENTS_EXPIRING",
    "ENROLLMENTS_EXPIRED",
    "PLATFORM_SUB_EXPIRING",
    "CLAIMS_PENDING",
  ])
  @ApiProperty({
    enum: [
      "ALL",
      "ROLE",
      "EVENT",
      "ENROLLMENTS_EXPIRING",
      "ENROLLMENTS_EXPIRED",
      "PLATFORM_SUB_EXPIRING",
      "CLAIMS_PENDING",
    ],
  })
  kind!:
    | "ALL"
    | "ROLE"
    | "EVENT"
    | "ENROLLMENTS_EXPIRING"
    | "ENROLLMENTS_EXPIRED"
    | "PLATFORM_SUB_EXPIRING"
    | "CLAIMS_PENDING";

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  roleKey?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  eventId?: string;

  /** Ventana en días para las audiencias de ciclo de vida (default 7). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @ApiPropertyOptional()
  days?: number;
}

export class CampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  htmlBody!: string;

  // Sin decoradores el pipe global (whitelist:true) recorta la propiedad
  // entera → toSpec(undefined) 500. ValidateNested+Type la preservan y
  // validan el nested; IsDefined cubre el body sin audience (400, no 500).
  @IsDefined()
  @ValidateNested()
  @Type(() => AudienceDto)
  audience!: AudienceDto;

  @IsIn(["ONCE", "CRON"])
  scheduleKind!: "ONCE" | "CRON";

  @IsOptional()
  @IsDateString()
  runAt?: string;

  @IsOptional()
  @IsString()
  cronExpr?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(["DRAFT", "SCHEDULED"])
  status?: "DRAFT" | "SCHEDULED";
}

export class CampaignPatchDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  htmlBody?: string;

  @IsOptional()
  audience?: AudienceDto;

  @IsOptional()
  @IsIn(["ONCE", "CRON"])
  scheduleKind?: "ONCE" | "CRON";

  @IsOptional()
  @IsDateString()
  runAt?: string;

  @IsOptional()
  @IsString()
  cronExpr?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(["DRAFT", "SCHEDULED"])
  status?: "DRAFT" | "SCHEDULED";
}

const toSpec = (a: AudienceDto): AudienceSpec => {
  if (a.kind === "ROLE") return { kind: "ROLE", roleKey: a.roleKey ?? "" };
  if (a.kind === "EVENT") return { kind: "EVENT", eventId: a.eventId ?? "" };
  if (a.kind === "ALL") return { kind: "ALL" };
  return { kind: a.kind, days: a.days ?? 7 };
};

/**
 * Campañas de mail del admin (spec admin-jobs-mail-campaigns): CRUD,
 * preview de audiencia, test-send, corrida manual y cancelación - todo
 * bajo admin.access y auditado.
 */
@Controller("admin/mail-campaigns")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class MailCampaignsController {
  constructor(private readonly campaigns: MailCampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Get("audience-count")
  audienceCount(@Query() q: AudienceDto) {
    return this.campaigns.audienceCount(toSpec(q));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.campaigns.get(id);
  }

  @Get(":id/runs")
  runs(@Param("id") id: string) {
    return this.campaigns.listRuns(id);
  }

  @Post()
  create(@Body() dto: CampaignDto, @Req() req: Request) {
    return this.campaigns.create(req.person!.id, {
      name: dto.name,
      subject: dto.subject,
      htmlBody: dto.htmlBody,
      audience: toSpec(dto.audience),
      scheduleKind: dto.scheduleKind,
      runAt: dto.runAt ? new Date(dto.runAt) : null,
      cronExpr: dto.cronExpr ?? null,
      timezone: dto.timezone,
      status: dto.status,
    });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: CampaignPatchDto, @Req() req: Request) {
    return this.campaigns.update(id, req.person!.id, {
      name: dto.name,
      subject: dto.subject,
      htmlBody: dto.htmlBody,
      audience: dto.audience ? toSpec(dto.audience) : undefined,
      scheduleKind: dto.scheduleKind,
      runAt: dto.runAt ? new Date(dto.runAt) : undefined,
      cronExpr: dto.cronExpr,
      timezone: dto.timezone,
      status: dto.status,
    });
  }

  @Post(":id/test")
  test(@Param("id") id: string, @Req() req: Request) {
    return this.campaigns.testSend(id, req.person!.id);
  }

  @Post(":id/run")
  run(@Param("id") id: string, @Req() req: Request) {
    return this.campaigns.runNow(id, req.person!.id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() req: Request) {
    return this.campaigns.cancel(id, req.person!.id);
  }
}
