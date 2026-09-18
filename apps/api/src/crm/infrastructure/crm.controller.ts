import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import type { Request, Response } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  RolesGuard,
  roleKeysHavePermission,
} from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { PrismaService } from "../../prisma.service";
import {
  CRM_TRIGGER_KEYS,
  CrmDomainError,
  CrmService,
  type CrmTriggerKey,
} from "../domain/crm.service";

// CRM transversal — todos los endpoints exigen el permiso crm.manage
// (PRODUCER / ACADEMY_OWNER / staff delegado) Y acceso puntual al actor
// (assertActorAccess): el productor solo ve su propio CRM, el dueño de
// academia solo el suyo; ADMIN pasa por admin.access.

class ActorRefDto {
  @IsString()
  @IsNotEmpty()
  actorType!: string;

  @IsString()
  @IsNotEmpty()
  actorId!: string;
}

class ListPeopleQueryDto {
  @IsString()
  @IsNotEmpty()
  actorType!: string;

  @IsString()
  @IsNotEmpty()
  actorId!: string;
}

class CreateTagDto extends ActorRefDto {
  @IsString()
  @IsNotEmpty()
  personId!: string;

  @IsString()
  @IsNotEmpty()
  tag!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

class CreateCampaignDto extends ActorRefDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** {tags?: string[], segment?: string, personIds?: string[]} */
  @IsObject()
  segment!: Record<string, unknown>;

  /** {type:"NOTIFY",title,body?} | {type:"DISCOUNT_CODE",percentOff?|amountOff?,maxUses?,expiresAt?} */
  @IsObject()
  action!: Record<string, unknown>;
}

class CreateTriggerDto extends ActorRefDto {
  @IsIn(CRM_TRIGGER_KEYS)
  key!: CrmTriggerKey;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

class PatchTriggerDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

function mapCrmError(e: unknown): never {
  if (e instanceof CrmDomainError) {
    if (e.code === "NOT_FOUND") throw new NotFoundException(e.message);
    if (e.code === "CONFLICT") throw new ConflictException(e.message);
    throw new BadRequestException(e.message);
  }
  throw e;
}

@Controller("crm")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("crm.manage")
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── People ───

  @Get("people")
  async listPeople(@Query() q: ListPeopleQueryDto, @Req() req: Request) {
    await this.assertActorAccess(req, q.actorType, q.actorId);
    return this.crm.listPeople(q.actorType, q.actorId);
  }

  /** Crea tag; duplicado exacto (actor+person+tag) → 200 con el existente. */
  @Post("people/tags")
  async addTag(
    @Body() dto: CreateTagDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.assertActorAccess(req, dto.actorType, dto.actorId);
    const result = await this.crm.addTag(
      dto.actorType,
      dto.actorId,
      dto.personId,
      dto.tag,
      dto.note,
    );
    if (!result.created) res.status(200);
    return result.tag;
  }

  @Delete("tags/:id")
  async deleteTag(@Param("id") id: string, @Req() req: Request) {
    const tag = await this.crm.findTag(id);
    if (!tag) throw new NotFoundException("tag no encontrado");
    await this.assertActorAccess(req, tag.actorType, tag.actorId);
    await this.crm.deleteTag(id);
    return { deleted: true, id };
  }

  // ─── Scores ───

  @Post("scores/recompute")
  @HttpCode(200)
  async recompute(@Body() dto: ActorRefDto, @Req() req: Request) {
    await this.assertActorAccess(req, dto.actorType, dto.actorId);
    return this.crm.recomputeScores(dto.actorType, dto.actorId);
  }

  // ─── Campaigns ───

  @Post("campaigns")
  async createCampaign(@Body() dto: CreateCampaignDto, @Req() req: Request) {
    await this.assertActorAccess(req, dto.actorType, dto.actorId);
    try {
      return await this.crm.createCampaign(
        dto.actorType,
        dto.actorId,
        dto.name,
        dto.segment,
        dto.action,
      );
    } catch (e) {
      mapCrmError(e);
    }
  }

  @Post("campaigns/:id/send")
  @HttpCode(200)
  async sendCampaign(@Param("id") id: string, @Req() req: Request) {
    const campaign = await this.crm.getCampaign(id);
    if (!campaign) throw new NotFoundException("campaña no encontrada");
    await this.assertActorAccess(req, campaign.actorType, campaign.actorId);
    try {
      return await this.crm.sendCampaign(id);
    } catch (e) {
      mapCrmError(e);
    }
  }

  @Get("campaigns")
  async listCampaigns(@Query() q: ListPeopleQueryDto, @Req() req: Request) {
    await this.assertActorAccess(req, q.actorType, q.actorId);
    return this.crm.listCampaigns(q.actorType, q.actorId);
  }

  // ─── Triggers ───

  @Get("triggers")
  async listTriggers(@Query() q: ListPeopleQueryDto, @Req() req: Request) {
    await this.assertActorAccess(req, q.actorType, q.actorId);
    return this.crm.listTriggers(q.actorType, q.actorId);
  }

  @Post("triggers")
  async createTrigger(@Body() dto: CreateTriggerDto, @Req() req: Request) {
    await this.assertActorAccess(req, dto.actorType, dto.actorId);
    try {
      return await this.crm.createTrigger(
        dto.actorType,
        dto.actorId,
        dto.key,
        dto.config,
      );
    } catch (e) {
      mapCrmError(e);
    }
  }

  @Patch("triggers/:id")
  async patchTrigger(
    @Param("id") id: string,
    @Body() dto: PatchTriggerDto,
    @Req() req: Request,
  ) {
    const trigger = await this.crm.getTrigger(id);
    if (!trigger) throw new NotFoundException("trigger no encontrado");
    await this.assertActorAccess(req, trigger.actorType, trigger.actorId);
    return this.crm.updateTrigger(id, {
      active: dto.active,
      config: dto.config,
    });
  }

  @Post("triggers/evaluate")
  @HttpCode(200)
  async evaluateTriggers(@Body() dto: ActorRefDto, @Req() req: Request) {
    await this.assertActorAccess(req, dto.actorType, dto.actorId);
    return this.crm.evaluateTriggers(dto.actorType, dto.actorId);
  }

  /**
   * Evaluación manual de TODOS los triggers activos de la plataforma —
   * la misma corrida del cron diario (CrmTriggersScheduler 09:00).
   * No hay actor que scopear con assertActorAccess: además del
   * crm.manage del guard de clase exige admin.access.
   */
  @Post("triggers/evaluate-all")
  @HttpCode(200)
  async evaluateAllTriggers(@Req() req: Request) {
    const caller = req.person!;
    if (
      !(await roleKeysHavePermission(this.prisma, caller.roles, [
        "admin.access",
      ]))
    ) {
      throw new ForbiddenException(
        "evaluate-all es una operación de plataforma — requiere admin.access",
      );
    }
    return this.crm.evaluateAllActiveTriggers();
  }

  // ─── Autorización por actor ───

  /**
   * Acceso al CRM de un actor (además del permiso crm.manage del guard):
   * - PRODUCER → el caller es el propio productor (actorId = personId).
   * - ACADEMY  → el caller es owner de la academia (actorId = academyId).
   * - o rol con permiso admin.access (soporte/plataforma).
   */
  private async assertActorAccess(
    req: Request,
    actorType: string,
    actorId: string,
  ): Promise<void> {
    const caller = req.person!;
    if (actorType === "PRODUCER" && caller.id === actorId) return;
    if (actorType === "ACADEMY") {
      const owned = await this.prisma.academy.findFirst({
        where: { id: actorId, ownerId: caller.id },
        select: { id: true },
      });
      if (owned) return;
    }
    if (
      await roleKeysHavePermission(this.prisma, caller.roles, ["admin.access"])
    ) {
      return;
    }
    throw new ForbiddenException("sin acceso al CRM de este actor");
  }
}
