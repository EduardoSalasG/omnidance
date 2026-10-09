import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";
import type { QueryFilters } from "@omnidance/shared";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { verifyPaymentChain } from "../../payments/domain/payment-ledger";
import { ADMIN_ENTITIES } from "../../query/entities/admin";
import { ApiPropertyOptional } from "@nestjs/swagger";

const TAKE = 100;

class BrowseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  q?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  status?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  orderType?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  intent?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  role?: string;

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
  producerId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  venueId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  academyId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  styleId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  eventId?: string;

  // ── Filtros de las entidades de auditoría (payment-events,
  // gateway-transactions, membership-subscriptions) ──
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  paymentId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  personId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  endpoint?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  direction?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  ok?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  type?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  actor?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  correlationId?: string;

  // payouts (el handler valida contra ACTOR_TYPES por whitelist → 400).
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  actorType?: string;
}

/** DTO → mapa plano de filtros (los handlers validan por whitelist). */
function toFilters(q: BrowseQueryDto): QueryFilters {
  return Object.fromEntries(
    Object.entries(q).filter(([, v]) => typeof v === "string" && v !== ""),
  ) as QueryFilters;
}

/**
 * Explorador de datos operacional (/admin/datos): listados livianos
 * (≤100 filas) por entidad con filtros por query string. Read-only.
 * FKs peladas (eventId/personId/producerId/ownerId) se resuelven a
 * {id,name} con lookups batch - el schema no declara esas relaciones.
 *
 * Las queries viven en el motor de consultas compartido
 * (src/query/entities/admin.ts - spec analytics/query-console): este
 * endpoint delega con scope admin (global) y devuelve el shape `objects`
 * que consume datos/page.tsx; `/query/*` usa el shape `rows` del mismo
 * handler - misma fuente, dos serializaciones.
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class BrowseController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("browse/:entity")
  async browse(@Param("entity") entity: string, @Query() q: BrowseQueryDto) {
    const handler = ADMIN_ENTITIES[entity];
    if (!handler) {
      throw new BadRequestException(
        `entidad inválida: "${entity}" (válidas: ${Object.keys(ADMIN_ENTITIES).join(", ")})`,
      );
    }
    const res = await handler.execute(this.prisma, {}, toFilters(q), {
      take: TAKE,
      total: false,
    });
    return res.objects;
  }

  /**
   * GET /admin/payments/:id/verify-chain - re-calcula el hash-chain del
   * ledger del pago (verifyPaymentChain) y reporta integridad:
   * {ok, events, firstBadSeq?}. La fila adulterada rompe la cadena en
   * seq ≥ firstBadSeq.
   */
  @Get("payments/:id/verify-chain")
  async verifyChain(@Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!payment) throw new NotFoundException("pago no encontrado");
    return verifyPaymentChain(this.prisma, id);
  }
}
