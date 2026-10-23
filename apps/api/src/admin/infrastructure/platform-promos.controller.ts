import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsNotEmpty,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import type { Request } from "express";
import type { PlatformPromo, Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";

const KINDS = ["ACADEMY", "PRODUCER"] as const;
const DISCOUNT_TYPES = ["PERCENT", "FIXED_CLP"] as const;

class CreatePromoDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Línea de la promo; omitida = aplica a ambas. */
  @IsOptional()
  @IsIn(KINDS)
  kind?: "ACADEMY" | "PRODUCER";

  @IsIn(DISCOUNT_TYPES)
  discountType!: "PERCENT" | "FIXED_CLP";

  /** Requerido si discountType=PERCENT (1-100). */
  @ValidateIf((d: CreatePromoDto) => d.discountType === "PERCENT")
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  /** Requerido si discountType=FIXED_CLP (CLP sobre el cargo del ciclo). */
  @ValidateIf((d: CreatePromoDto) => d.discountType === "FIXED_CLP")
  @IsInt()
  @Min(1)
  amountOffClp?: number;

  @IsISO8601()
  validFrom!: string;

  @IsISO8601()
  validUntil!: string;

  /** Cobros descontados por actor; omitido = ilimitado en la ventana. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCycles?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Whitelist - ambas vacías = promo global. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  academyIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  producerIds?: string[];
}

class PatchPromoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /** null explícito = la promo pasa a aplicar a ambas líneas. */
  @ValidateIf((_d: PatchPromoDto, v) => v !== undefined)
  @IsIn(KINDS)
  kind?: "ACADEMY" | "PRODUCER" | null;

  @IsOptional()
  @IsIn(DISCOUNT_TYPES)
  discountType?: "PERCENT" | "FIXED_CLP";

  /** null limpia el campo (al cambiar de tipo conviene enviarlo). */
  @ValidateIf((_d: PatchPromoDto, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number | null;

  @ValidateIf((_d: PatchPromoDto, v) => v !== undefined)
  @IsInt()
  @Min(1)
  amountOffClp?: number | null;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  /** null = ilimitado dentro de la ventana. */
  @ValidateIf((_d: PatchPromoDto, v) => v !== undefined)
  @IsInt()
  @Min(1)
  maxCycles?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Reemplazo completo de la whitelist (set semantics). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  academyIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  producerIds?: string[];
}

/** Serialización de la ficha/lista (whitelist resuelta a {id,name}). */
function promoView(promo: PlatformPromo & {
  academies: { id: string; name: string }[];
  producers: { id: string; name: string }[];
  _count?: { subscriptions: number; payments: number };
}) {
  return {
    id: promo.id,
    name: promo.name,
    kind: promo.kind,
    discountType: promo.discountType,
    percentOff: promo.percentOff,
    amountOffClp: promo.amountOffClp,
    validFrom: promo.validFrom,
    validUntil: promo.validUntil,
    maxCycles: promo.maxCycles,
    enabled: promo.enabled,
    academies: promo.academies,
    producers: promo.producers,
    subscriptionsCount: promo._count?.subscriptions ?? 0,
    discountedPayments: promo._count?.payments ?? 0,
    createdAt: promo.createdAt,
    updatedAt: promo.updatedAt,
  };
}

const LIST_INCLUDE = {
  academies: { select: { id: true, name: true } },
  producers: { select: { id: true, name: true } },
  _count: { select: { subscriptions: true, payments: true } },
} as const;

/**
 * Mantenedor de promos de suscripción (spec platform-promos): descuentos
 * admin-managed sobre el cargo del ciclo de las PlatformSubscription.
 * El billing las aplica resolviendo la vigente por actor en chargeSpec -
 * acá solo se gestiona el catálogo (crear/editar/habilitar), todo
 * auditado. No hay delete: una promo apagada (enabled=false) deja de
 * aplicar y las subs bajo ella vuelven a precio lleno al próximo ciclo
 * vía el drift-check del reconcile; borrar rompería la auditoría de los
 * Payment ya descontados.
 */
@Controller("admin/platform-promos")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminPlatformPromosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const promos = await this.prisma.platformPromo.findMany({
      include: LIST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return promos.map(promoView);
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const promo = await this.prisma.platformPromo.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!promo) throw new NotFoundException("promo no encontrada");
    return { ...promoView(promo), createdBy: promo.createdBy };
  }

  @Post()
  async create(@Body() dto: CreatePromoDto, @Req() req: Request) {
    const window = this.validateWindow(dto.validFrom, dto.validUntil);
    if (dto.kind === "ACADEMY" && (dto.producerIds?.length ?? 0) > 0) {
      throw new BadRequestException(
        "una promo solo-ACADEMY no puede listar productores en la whitelist",
      );
    }
    if (dto.kind === "PRODUCER" && (dto.academyIds?.length ?? 0) > 0) {
      throw new BadRequestException(
        "una promo solo-PRODUCER no puede listar academias en la whitelist",
      );
    }
    await this.assertActorsExist(dto.academyIds ?? [], dto.producerIds ?? []);
    const promo = await this.prisma.platformPromo.create({
      data: {
        name: dto.name.trim(),
        kind: dto.kind ?? null,
        discountType: dto.discountType,
        percentOff:
          dto.discountType === "PERCENT" ? (dto.percentOff ?? null) : null,
        amountOffClp:
          dto.discountType === "FIXED_CLP" ? (dto.amountOffClp ?? null) : null,
        validFrom: window.from,
        validUntil: window.until,
        maxCycles: dto.maxCycles ?? null,
        enabled: dto.enabled ?? true,
        academies: { connect: (dto.academyIds ?? []).map((id) => ({ id })) },
        producers: { connect: (dto.producerIds ?? []).map((id) => ({ id })) },
        createdById: req.person!.id,
      },
      include: LIST_INCLUDE,
    });
    await this.audit(req, "PLATFORM_PROMO_CREATE", promo.id, {
      name: promo.name,
      kind: promo.kind,
      discountType: promo.discountType,
      percentOff: promo.percentOff,
      amountOffClp: promo.amountOffClp,
      validFrom: promo.validFrom,
      validUntil: promo.validUntil,
      maxCycles: promo.maxCycles,
      academyIds: dto.academyIds ?? [],
      producerIds: dto.producerIds ?? [],
    });
    return promoView(promo);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: PatchPromoDto,
    @Req() req: Request,
  ) {
    const existing = await this.prisma.platformPromo.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("promo no encontrada");

    // Coherencia tipo↔valor tras el patch (el DTO permite cambiar uno
    // sin el otro - el resultado final debe quedar válido).
    const discountType = dto.discountType ?? existing.discountType;
    const percentOff =
      dto.percentOff !== undefined ? dto.percentOff : existing.percentOff;
    const amountOffClp =
      dto.amountOffClp !== undefined
        ? dto.amountOffClp
        : existing.amountOffClp;
    if (discountType === "PERCENT" && (percentOff == null || percentOff < 1 || percentOff > 100)) {
      throw new BadRequestException(
        "discountType PERCENT requiere percentOff entre 1 y 100",
      );
    }
    if (
      discountType === "FIXED_CLP" &&
      (amountOffClp == null || amountOffClp < 1)
    ) {
      throw new BadRequestException(
        "discountType FIXED_CLP requiere amountOffClp ≥ 1",
      );
    }
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : existing.validFrom;
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : existing.validUntil;
    if (validUntil.getTime() <= validFrom.getTime()) {
      throw new BadRequestException("validUntil debe ser posterior a validFrom");
    }
    const kind = dto.kind !== undefined ? dto.kind : existing.kind;
    const academyIds = dto.academyIds;
    const producerIds = dto.producerIds;
    if (
      kind === "ACADEMY" &&
      (producerIds?.length ??
        (await this.whitelistSize(id, "producers"))) > 0
    ) {
      throw new BadRequestException(
        "una promo solo-ACADEMY no puede listar productores en la whitelist",
      );
    }
    if (
      kind === "PRODUCER" &&
      (academyIds?.length ?? (await this.whitelistSize(id, "academies"))) >
        0
    ) {
      throw new BadRequestException(
        "una promo solo-PRODUCER no puede listar academias en la whitelist",
      );
    }
    await this.assertActorsExist(academyIds ?? [], producerIds ?? []);

    const promo = await this.prisma.platformPromo.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.kind !== undefined ? { kind } : {}),
        discountType,
        percentOff: discountType === "PERCENT" ? percentOff : null,
        amountOffClp: discountType === "FIXED_CLP" ? amountOffClp : null,
        validFrom,
        validUntil,
        ...(dto.maxCycles !== undefined ? { maxCycles: dto.maxCycles } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(academyIds !== undefined
          ? { academies: { set: academyIds.map((a) => ({ id: a })) } }
          : {}),
        ...(producerIds !== undefined
          ? { producers: { set: producerIds.map((p) => ({ id: p })) } }
          : {}),
      },
      include: LIST_INCLUDE,
    });
    await this.audit(req, "PLATFORM_PROMO_UPDATE", promo.id, {
      ...dto,
      discountType,
      percentOff: promo.percentOff,
      amountOffClp: promo.amountOffClp,
    } as Prisma.InputJsonValue);
    return promoView(promo);
  }

  private validateWindow(from: string, until: string) {
    const f = new Date(from);
    const u = new Date(until);
    if (Number.isNaN(f.getTime()) || Number.isNaN(u.getTime())) {
      throw new BadRequestException("validFrom/validUntil inválidas");
    }
    if (u.getTime() <= f.getTime()) {
      throw new BadRequestException("validUntil debe ser posterior a validFrom");
    }
    return { from: f, until: u };
  }

  private async whitelistSize(
    promoId: string,
    rel: "academies" | "producers",
  ): Promise<number> {
    const row = await this.prisma.platformPromo.findUniqueOrThrow({
      where: { id: promoId },
      select: { _count: { select: { [rel]: true } } },
    });
    return rel === "academies"
      ? row._count.academies
      : row._count.producers;
  }

  /** Los ids de la whitelist deben existir (400 honesto, no 500 de FK). */
  private async assertActorsExist(
    academyIds: string[],
    producerIds: string[],
  ): Promise<void> {
    const [academies, producers] = await Promise.all([
      academyIds.length
        ? this.prisma.academy.count({ where: { id: { in: academyIds } } })
        : Promise.resolve(0),
      producerIds.length
        ? this.prisma.person.count({ where: { id: { in: producerIds } } })
        : Promise.resolve(0),
    ]);
    if (academies !== academyIds.length) {
      throw new BadRequestException("hay academias de la whitelist que no existen");
    }
    if (producers !== producerIds.length) {
      throw new BadRequestException("hay productores de la whitelist que no existen");
    }
  }

  private audit(
    req: Request,
    action: string,
    targetId: string,
    payload: unknown,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: req.person!.id,
        action,
        targetType: "PlatformPromo",
        targetId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
