import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
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
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import type { Request } from "express";
import type { AcademyPromo } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";

const DISCOUNT_TYPES = ["PERCENT", "FIXED_CLP"] as const;

class CreateAcademyPromoDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(DISCOUNT_TYPES)
  discountType!: "PERCENT" | "FIXED_CLP";

  /** Requerido si discountType=PERCENT (1-100). */
  @ValidateIf((d: CreateAcademyPromoDto) => d.discountType === "PERCENT")
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  /** Requerido si discountType=FIXED_CLP (CLP sobre el cobro del plan). */
  @ValidateIf((d: CreateAcademyPromoDto) => d.discountType === "FIXED_CLP")
  @IsInt()
  @Min(1)
  amountOffClp?: number;

  @IsISO8601()
  validFrom!: string;

  @IsISO8601()
  validUntil!: string;

  /** Cobros descontados por alumno; omitido = ilimitado en la ventana. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCycles?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Scope a planes - vacío = todos los de la academia. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  planIds?: string[];

  /**
   * Whitelist de personas - vacía = cualquier persona. Admite personas
   * no inscritas (preventa: el primer cobro ya sale con descuento).
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  personIds?: string[];
}

class PatchAcademyPromoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(DISCOUNT_TYPES)
  discountType?: "PERCENT" | "FIXED_CLP";

  /** null limpia el campo (al cambiar de tipo conviene enviarlo). */
  @ValidateIf((_d: PatchAcademyPromoDto, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number | null;

  @ValidateIf((_d: PatchAcademyPromoDto, v) => v !== undefined)
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
  @ValidateIf((_d: PatchAcademyPromoDto, v) => v !== undefined)
  @IsInt()
  @Min(1)
  maxCycles?: number | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Reemplazo completo de scopes (set semantics). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  planIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  personIds?: string[];
}

type PromoRow = AcademyPromo & {
  plans: { id: string; name: string }[];
  persons: { id: string; name: string }[];
  _count?: { subscriptions: number; payments: number };
};

/** Serialización de la ficha/lista (scopes resueltos a {id,name}). */
function promoView(promo: PromoRow) {
  return {
    id: promo.id,
    name: promo.name,
    discountType: promo.discountType,
    percentOff: promo.percentOff,
    amountOffClp: promo.amountOffClp,
    validFrom: promo.validFrom,
    validUntil: promo.validUntil,
    maxCycles: promo.maxCycles,
    enabled: promo.enabled,
    plans: promo.plans,
    persons: promo.persons,
    subscriptionsCount: promo._count?.subscriptions ?? 0,
    discountedPayments: promo._count?.payments ?? 0,
    createdAt: promo.createdAt,
    updatedAt: promo.updatedAt,
  };
}

const LIST_INCLUDE = {
  plans: { select: { id: true, name: true } },
  persons: { select: { id: true, name: true } },
  _count: { select: { subscriptions: true, payments: true } },
} as const;

/**
 * Mantenedor de promos de membresía de la academia (spec member-promos):
 * descuentos sobre el cobro de sus MembershipPlan (becas, descuentos por
 * alumno, preventa). Es herramienta de precio disponible en TODOS los
 * tiers - no se gatea por feature de tier; el acceso lo da la capacidad
 * `plans` (owner/ADMIN/staff delegado), misma familia que administra los
 * planes. No hay delete: una promo apagada (enabled=false) deja de
 * aplicar y las subs bajo ella vuelven a precio lleno al próximo ciclo
 * vía el drift-check del reconcile; borrar rompería la auditoría de los
 * Payment ya descontados.
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyPromosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
  ) {}

  @Get(":id/promos")
  async list(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "plans");
    const promos = await this.prisma.academyPromo.findMany({
      where: { academyId: id },
      include: LIST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return promos.map(promoView);
  }

  /**
   * Búsqueda de personas para la whitelist (spec member-promos): la
   * whitelist admite personas NO inscritas (preventa), así que la
   * búsqueda es global por nombre/email/teléfono - devuelve solo
   * {id, name} (el picker no expone contacto).
   */
  @Get(":id/promos/people-search")
  async peopleSearch(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("q") q?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "plans");
    const term = q?.trim() ?? "";
    if (term.length < 2) return [];
    return this.prisma.person.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { phone: { contains: term } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 10,
    });
  }

  @Get(":id/promos/:promoId")
  async detail(
    @Param("id") id: string,
    @Param("promoId") promoId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "plans");
    const promo = await this.prisma.academyPromo.findFirst({
      where: { id: promoId, academyId: id },
      include: {
        ...LIST_INCLUDE,
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!promo) throw new NotFoundException("promo no encontrada");
    return { ...promoView(promo), createdBy: promo.createdBy };
  }

  @Post(":id/promos")
  async create(
    @Param("id") id: string,
    @Body() dto: CreateAcademyPromoDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "plans");
    const window = this.validateWindow(dto.validFrom, dto.validUntil);
    await this.assertScopesExist(id, dto.planIds ?? [], dto.personIds ?? []);
    const promo = await this.prisma.academyPromo.create({
      data: {
        academyId: id,
        name: dto.name.trim(),
        discountType: dto.discountType,
        percentOff:
          dto.discountType === "PERCENT" ? (dto.percentOff ?? null) : null,
        amountOffClp:
          dto.discountType === "FIXED_CLP" ? (dto.amountOffClp ?? null) : null,
        validFrom: window.from,
        validUntil: window.until,
        maxCycles: dto.maxCycles ?? null,
        enabled: dto.enabled ?? true,
        plans: { connect: (dto.planIds ?? []).map((pid) => ({ id: pid })) },
        persons: {
          connect: (dto.personIds ?? []).map((pid) => ({ id: pid })),
        },
        createdById: req.person!.id,
      },
      include: LIST_INCLUDE,
    });
    return promoView(promo);
  }

  @Patch(":id/promos/:promoId")
  async update(
    @Param("id") id: string,
    @Param("promoId") promoId: string,
    @Body() dto: PatchAcademyPromoDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "plans");
    const existing = await this.prisma.academyPromo.findFirst({
      where: { id: promoId, academyId: id },
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
    if (
      discountType === "PERCENT" &&
      (percentOff == null || percentOff < 1 || percentOff > 100)
    ) {
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
    const validFrom = dto.validFrom
      ? new Date(dto.validFrom)
      : existing.validFrom;
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : existing.validUntil;
    if (validUntil.getTime() <= validFrom.getTime()) {
      throw new BadRequestException(
        "validUntil debe ser posterior a validFrom",
      );
    }
    await this.assertScopesExist(id, dto.planIds ?? [], dto.personIds ?? []);

    const promo = await this.prisma.academyPromo.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        discountType,
        percentOff: discountType === "PERCENT" ? percentOff : null,
        amountOffClp: discountType === "FIXED_CLP" ? amountOffClp : null,
        validFrom,
        validUntil,
        ...(dto.maxCycles !== undefined ? { maxCycles: dto.maxCycles } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.planIds !== undefined
          ? { plans: { set: dto.planIds.map((pid) => ({ id: pid })) } }
          : {}),
        ...(dto.personIds !== undefined
          ? { persons: { set: dto.personIds.map((pid) => ({ id: pid })) } }
          : {}),
      },
      include: LIST_INCLUDE,
    });
    return promoView(promo);
  }

  private validateWindow(from: string, until: string) {
    const f = new Date(from);
    const u = new Date(until);
    if (Number.isNaN(f.getTime()) || Number.isNaN(u.getTime())) {
      throw new BadRequestException("validFrom/validUntil inválidas");
    }
    if (u.getTime() <= f.getTime()) {
      throw new BadRequestException(
        "validUntil debe ser posterior a validFrom",
      );
    }
    return { from: f, until: u };
  }

  /**
   * Los planes deben pertenecer a la academia y las personas existir
   * (400 honesto, no 500 de FK). Las personas NO necesitan inscripción -
   * la whitelist abierta a no-inscritos es la preventa del spec.
   */
  private async assertScopesExist(
    academyId: string,
    planIds: string[],
    personIds: string[],
  ): Promise<void> {
    const [plans, persons] = await Promise.all([
      planIds.length
        ? this.prisma.membershipPlan.count({
            where: { id: { in: planIds }, academyId },
          })
        : Promise.resolve(0),
      personIds.length
        ? this.prisma.person.count({
            where: { id: { in: personIds }, deletedAt: null },
          })
        : Promise.resolve(0),
    ]);
    if (plans !== planIds.length) {
      throw new BadRequestException(
        "hay planes del scope que no existen en esta academia",
      );
    }
    if (persons !== personIds.length) {
      throw new BadRequestException(
        "hay personas de la whitelist que no existen",
      );
    }
  }
}
