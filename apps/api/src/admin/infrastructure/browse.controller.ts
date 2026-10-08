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

const TAKE = 100;

class BrowseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  orderType?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  producerId?: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsString()
  academyId?: string;

  @IsOptional()
  @IsString()
  styleId?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  // ── Filtros de las entidades de auditoría (payment-events,
  // gateway-transactions, membership-subscriptions) ──
  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  endpoint?: string;

  @IsOptional()
  @IsString()
  direction?: string;

  @IsOptional()
  @IsString()
  ok?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  actor?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;

  // payouts (el handler valida contra ACTOR_TYPES por whitelist → 400).
  @IsOptional()
  @IsString()
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
