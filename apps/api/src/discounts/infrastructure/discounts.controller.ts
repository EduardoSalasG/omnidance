import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { DiscountCode, DiscountCodeType } from "@prisma/client";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  DISCOUNT_CODE_TYPES,
  DiscountCodeNotFoundError,
  DiscountsService,
  DuplicateDiscountCodeError,
  InvalidDiscountCodeError,
} from "../domain/discounts.service";
import type { ListedRedemption } from "../domain/ports";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { pageParams } from "../../academies/infrastructure/list-filters";
import { ApiPropertyOptional } from "@nestjs/swagger";

class CreateDiscountCodeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsIn(DISCOUNT_CODE_TYPES)
  type!: DiscountCodeType;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  seriesId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountOff?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

/**
 * Filtros de `GET /discount-codes` - contrato compartido de la barra de
 * filtros (spec analytics/query-console): `q` sobre el código, `status`
 * derivado de expiresAt (ACTIVE|EXPIRED, whitelist → 400), `from`/`to`
 * sobre createdAt. Opcionales/aditivos; desconocidos ignorados.
 */
class ListDiscountCodesQueryDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  eventId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  seriesId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  q?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "EXPIRED"])
  @ApiPropertyOptional()
  status?: "ACTIVE" | "EXPIRED";

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  to?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  page?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  pageSize?: string;
}

function mapDomainError(e: unknown): never {
  if (e instanceof InvalidDiscountCodeError) {
    throw new BadRequestException({
      error: "INVALID_DISCOUNT_CODE",
      message: e.message,
    });
  }
  if (e instanceof DuplicateDiscountCodeError) {
    throw new ConflictException({
      error: "DUPLICATE_DISCOUNT_CODE",
      message: e.message,
    });
  }
  if (e instanceof DiscountCodeNotFoundError) {
    throw new NotFoundException(e.message);
  }
  throw e;
}

@Controller("discount-codes")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("discounts.manage")
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Post()
  async create(@Body() dto: CreateDiscountCodeDto, @Req() req: Request) {
    try {
      return await this.discounts.create(
        {
          code: dto.code,
          type: dto.type,
          eventId: dto.eventId,
          seriesId: dto.seriesId,
          percentOff: dto.percentOff,
          amountOff: dto.amountOff,
          maxUses: dto.maxUses,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
        req.person!.id,
      );
    } catch (e) {
      mapDomainError(e);
    }
  }

  @Get()
  async list(@Query() dto: ListDiscountCodesQueryDto) {
    const pg = pageParams(dto.page, dto.pageSize);
    const { items, total } = await this.discounts.list({
      eventId: dto.eventId,
      seriesId: dto.seriesId,
      q: dto.q,
      status: dto.status,
      from: dto.from ? new Date(dto.from) : undefined,
      to: dto.to ? new Date(dto.to) : undefined,
      skip: pg.skip,
      take: pg.take,
    });
    return { items, total, page: pg.page, pageSize: pg.pageSize };
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<DiscountCode> {
    try {
      return await this.discounts.detail(id);
    } catch (e) {
      mapDomainError(e);
    }
  }

  @Get(":id/redemptions")
  async redemptions(@Param("id") id: string): Promise<ListedRedemption[]> {
    try {
      return await this.discounts.listRedemptions(id);
    } catch (e) {
      mapDomainError(e);
    }
  }
}
