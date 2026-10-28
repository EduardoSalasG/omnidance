import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";

// Price book de tiers SaaS (spec multipais-currency): TierPrice es la
// fuente del cargo por ciclo en cada país (chargeSpec resuelve actor →
// CL → param legacy). Admin gestiona el libro; el resolver nunca
// inventa una fila faltante.
const KINDS = ["ACADEMY", "PRODUCER"] as const;
const CYCLES = ["MONTHLY", "SEMIANNUAL", "ANNUAL"] as const;
// Tiers con precio autogestionado (ENTERPRISE/PRO_BIG son "a convenir" y
// no viven en el price book). SOCIAL_PASS usa el mismo libro.
const TIER_CODES = [
  "COBROS",
  "STUDIO",
  "PRO",
  "PRO_STARTER",
  "PRO_GROWTH",
  "PRO_BIG",
  "ENTERPRISE",
  "SOCIAL_PASS",
] as const;

class CreateTierPriceDto {
  @IsIn(TIER_CODES)
  tierCode!: string;

  @IsIn(KINDS)
  kind!: "ACADEMY" | "PRODUCER";

  @IsIn(CYCLES)
  billingCycle!: "MONTHLY" | "SEMIANNUAL" | "ANNUAL";

  /** ISO-3166 alpha-2 del mercado (CL, ES, MX…). */
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  /** Cargo del ciclo en unidad menor de `currency` (≥0). */
  @IsInt()
  @Min(0)
  price!: number;

  @IsISO4217CurrencyCode()
  currency!: string;

  /** Nombre público del tier (desacoplado del tierCode persistido). */
  @IsOptional()
  @IsString()
  displayName?: string;
}

class UpdateTierPriceDto {
  /** Solo el cargo y su moneda son editables - la clave no se renumera. */
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

@Controller("admin/tier-prices")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminTierPricesController {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /admin/tier-prices` - listado del price book ordenado. */
  @Get()
  async list(
    @Query("countryCode") countryCode?: string,
    @Query("kind") kind?: string,
  ) {
    const items = await this.prisma.tierPrice.findMany({
      where: {
        ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}),
        ...(kind ? { kind: kind as "ACADEMY" | "PRODUCER" } : {}),
      },
      orderBy: [
        { countryCode: "asc" },
        { kind: "asc" },
        { tierCode: "asc" },
        { billingCycle: "asc" },
      ],
    });
    return { items };
  }

  /**
   * `POST /admin/tier-prices` - alta de una fila; la clave única es
   * (tierCode, kind, billingCycle, countryCode) → 409 si ya existe.
   */
  @Post()
  async create(@Body() dto: CreateTierPriceDto) {
    const country = await this.prisma.country.findUnique({
      where: { code: dto.countryCode },
      select: { code: true },
    });
    if (!country) {
      throw new BadRequestException("countryCode no es un país registrado");
    }
    const existing = await this.prisma.tierPrice.findFirst({
      where: {
        tierCode: dto.tierCode,
        kind: dto.kind,
        billingCycle: dto.billingCycle,
        countryCode: dto.countryCode,
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        "ya existe un precio para ese tier/ciclo/país",
      );
    }
    return this.prisma.tierPrice.create({
      data: {
        tierCode: dto.tierCode,
        kind: dto.kind,
        billingCycle: dto.billingCycle,
        countryCode: dto.countryCode,
        price: dto.price,
        currency: dto.currency.toUpperCase(),
        ...(dto.displayName ? { displayName: dto.displayName } : {}),
      },
    });
  }

  /** `PUT /admin/tier-prices/:id` - precio/moneda de una fila. */
  @Put(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateTierPriceDto) {
    const row = await this.prisma.tierPrice.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) throw new NotFoundException("tier price no encontrado");
    return this.prisma.tierPrice.update({
      where: { id },
      data: {
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.currency ? { currency: dto.currency.toUpperCase() } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName || null }
          : {}),
      },
    });
  }
}
