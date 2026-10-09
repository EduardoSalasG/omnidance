import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsDateString,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import type { Request } from "express";
import type { Payout, PayoutLine, PayoutStatus, Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { PayoutSettlementService } from "../application/payout-settlement.service";
import { emitPaymentEvent } from "../domain/payment-ledger";
import { ApiPropertyOptional } from "@nestjs/swagger";
const ACTOR_TYPES = ["PRODUCER", "ACADEMY", "VENUE"] as const;
const PAYOUT_STATUSES: readonly PayoutStatus[] = [
  "PENDING",
  "APPROVED",
  "PAID",
];
// Vocabularios del catálogo de consultas (packages/shared query-catalog.ts:
// ORDER_TYPES / CHANNELS) - el contrato de filtros los comparte con los
// endpoints de lista.
const ORDER_TYPES = [
  "TICKET",
  "SERIES_PASS",
  "MEMBERSHIP",
  "PRIVATE_LESSON",
  "WORKSHOP",
  "PLATFORM_SUB",
] as const;
const CHANNELS = ["PRESALE", "DOOR"] as const;

class GeneratePayoutDto {
  @IsIn(ACTOR_TYPES)
  actorType!: string;

  @IsString()
  @IsNotEmpty()
  actorId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}

class ListPayoutsQueryDto {
  @IsOptional()
  @IsIn(ACTOR_TYPES)
  @ApiPropertyOptional()
  actorType?: string;

  @IsOptional()
  @IsIn(PAYOUT_STATUSES)
  @ApiPropertyOptional()
  status?: PayoutStatus;
}

/**
 * Filtros de `GET /me/payouts` - contrato compartido de la barra de
 * filtros (spec analytics/query-console): `status` enum whitelist,
 * `orderType`/`channel` filtran liquidaciones que contienen líneas
 * cuya orden origen coincide (PayoutLine → Payment), `from`/`to`
 * solapan con el período (periodEnd >= from, periodStart <= to).
 * Opcionales/aditivos; inválido → 400; desconocido → ignorado.
 */
class MePayoutsQueryDto {
  @IsOptional()
  @IsIn(PAYOUT_STATUSES)
  @ApiPropertyOptional()
  status?: PayoutStatus;

  @IsOptional()
  @IsIn(ORDER_TYPES)
  @ApiPropertyOptional()
  orderType?: string;

  @IsOptional()
  @IsIn(CHANNELS)
  @ApiPropertyOptional()
  channel?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  to?: string;
}

class PayPayoutDto {
  /** Comprobante de la transferencia (link externo - nunca se hostea). */
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

type PayoutWithLines = Payout & { lines: PayoutLine[] };

/**
 * Liquidaciones (spec producer-fee-model, trazabilidad BIAN): cada
 * deducción del payout es una PayoutLine que rastrea a la orden que la
 * generó. net = gross − Σ líneas; la liquidación solo LEE los snapshots
 * congelados del Payment - nunca recalcula tasas.
 */
function withPayoutLines<T extends PayoutWithLines>(payout: T) {
  return payout;
}

/**
 * Liquidaciones (spec payouts): el admin genera el payout de un actor para
 * un período, lo aprueba y lo marca pagado con evidencia. Todo queda en
 * AuditLog (PAYOUT_GENERATE / PAYOUT_APPROVE / PAYOUT_PAY).
 *
 * Atribución y deducciones: ver PayoutSettlementService (spec
 * producer-fee-model + admin-finance-console `unliquidatedOnly`).
 */
@Controller("admin/payouts")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminPayoutsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: PayoutSettlementService,
  ) {}

  /**
   * Genera la liquidación del actor para el período. Idempotente: si ya
   * existe un Payout para actor+periodStart+periodEnd lo devuelve sin
   * recalcular ni auditar de nuevo.
   */
  @Post("generate")
  async generate(@Body() dto: GeneratePayoutDto, @Req() req: Request) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd < periodStart) {
      throw new BadRequestException("periodEnd debe ser >= periodStart");
    }

    const existing = await this.prisma.payout.findFirst({
      where: {
        actorType: dto.actorType,
        actorId: dto.actorId,
        periodStart,
        periodEnd,
      },
      include: { lines: true },
    });
    if (existing) return withPayoutLines(existing);

    const settlement = await this.settlement.compute(
      dto.actorType,
      dto.actorId,
      periodStart,
      periodEnd,
    );

    // Payout + líneas + eventos del ledger en una sola tx: la liquidación
    // nace completa y auditable o no nace (spec producer-fee-model).
    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: {
          actorType: dto.actorType,
          actorId: dto.actorId,
          periodStart,
          periodEnd,
          gross: settlement.gross,
          platformFee: settlement.platformFee,
          gatewayFee: settlement.gatewayFee,
          net: settlement.net,
        },
      });
      if (settlement.lines.length) {
        await tx.payoutLine.createMany({
          data: settlement.lines.map((l) => ({
            payoutId: created.id,
            paymentId: l.paymentId,
            type: l.type,
            amount: l.amount,
            meta: (l.meta ?? {}) as Prisma.InputJsonValue,
          })),
        });
      }
      // Cada orden cuyo desglose entró al payout queda evidenciada en su
      // propia cadena - el libro del pago cuenta su liquidación completa.
      const byPayment = new Map<string, string[]>();
      for (const l of settlement.lines) {
        if (!l.paymentId) continue;
        const types = byPayment.get(l.paymentId) ?? [];
        types.push(l.type);
        byPayment.set(l.paymentId, types);
      }
      for (const [paymentId, types] of byPayment) {
        await emitPaymentEvent(tx, paymentId, "PAYOUT_LINE_ASSIGNED", "admin", {
          payoutId: created.id,
          actorType: dto.actorType,
          actorId: dto.actorId,
          lineTypes: types,
        });
      }
      return tx.payout.findUniqueOrThrow({
        where: { id: created.id },
        include: { lines: true },
      });
    });
    await this.audit(req, "PAYOUT_GENERATE", payout.id, {
      actorType: dto.actorType,
      actorId: dto.actorId,
      gross: settlement.gross,
      platformFee: settlement.platformFee,
      gatewayFee: settlement.gatewayFee,
      net: settlement.net,
      lines: settlement.lines.length,
    });
    return withPayoutLines(payout);
  }

  /** Lista de payouts, filtrable por actorType/status, recientes primero. */
  @Get()
  async list(@Query() q: ListPayoutsQueryDto) {
    const payouts = await this.prisma.payout.findMany({
      where: {
        ...(q.actorType ? { actorType: q.actorType } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    });
    return payouts.map(withPayoutLines);
  }

  /** Aprueba un payout PENDING (habilita el pago). Idempotente. */
  @Post(":id/approve")
  @HttpCode(200)
  async approve(@Param("id") id: string, @Req() req: Request) {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException("payout no encontrado");
    if (payout.status === "PAID") {
      throw new ConflictException("el payout ya fue pagado");
    }
    if (payout.status === "APPROVED") return payout;

    const updated = await this.prisma.payout.update({
      where: { id },
      data: { status: "APPROVED" },
    });
    await this.audit(req, "PAYOUT_APPROVE", id, {
      prev: payout.status,
      next: "APPROVED",
    });
    return updated;
  }

  /** Marca el payout como pagado (con evidencia). Solo desde APPROVED. */
  @Post(":id/pay")
  @HttpCode(200)
  async pay(
    @Param("id") id: string,
    @Body() dto: PayPayoutDto,
    @Req() req: Request,
  ) {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException("payout no encontrado");
    if (payout.status !== "APPROVED") {
      throw new ConflictException("solo se puede pagar un payout aprobado");
    }

    const updated = await this.prisma.payout.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        evidenceUrl: dto.evidenceUrl ?? payout.evidenceUrl,
      },
    });
    await this.audit(req, "PAYOUT_PAY", id, {
      prev: "APPROVED",
      next: "PAID",
      evidenceUrl: updated.evidenceUrl,
    });
    return updated;
  }


  private audit(
    req: Request,
    action: string,
    targetId: string,
    payload: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: req.person!.id,
        action,
        targetType: "Payout",
        targetId,
        payload,
      },
    });
  }
}

/**
 * Payouts del actor autenticado. El productor ES la persona: sus
 * liquidaciones son actorType PRODUCER + actorId = su personId. Además se
 * incluyen los payouts ACADEMY de las academias que posee
 * (Academy.ownerId = personId) y los payouts VENUE de los venues que
 * posee (Venue.ownerId = personId, fijado por admin/seed).
 * Requiere crm.manage (grant del rol PRODUCER).
 */
@Controller("me/payouts")
@UseGuards(SessionGuard, RolesGuard)
export class MePayoutsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("crm.manage")
  async mine(@Req() req: Request, @Query() dto: MePayoutsQueryDto) {
    const personId = req.person!.id;
    const [academies, venues] = await Promise.all([
      this.prisma.academy.findMany({
        where: { ownerId: personId },
        select: { id: true },
      }),
      this.prisma.venue.findMany({
        where: { ownerId: personId },
        select: { id: true },
      }),
    ]);
    const or: Prisma.PayoutWhereInput[] = [
      { actorType: "PRODUCER", actorId: personId },
    ];
    if (academies.length) {
      or.push({
        actorType: "ACADEMY",
        actorId: { in: academies.map((a) => a.id) },
      });
    }
    if (venues.length) {
      or.push({
        actorType: "VENUE",
        actorId: { in: venues.map((v) => v.id) },
      });
    }
    const where: Prisma.PayoutWhereInput = {
      ...(or.length > 1 ? { OR: or } : or[0]),
      ...(dto.status ? { status: dto.status } : {}),
      // orderType/channel miran la orden origen de cada línea de deducción
      // (PayoutLine.paymentId es nullable - ajustes manuales no calzan).
      ...(dto.orderType || dto.channel
        ? {
            lines: {
              some: {
                payment: {
                  ...(dto.orderType ? { orderType: dto.orderType } : {}),
                  ...(dto.channel ? { channel: dto.channel } : {}),
                },
              },
            },
          }
        : {}),
      // from/to solapan con el período liquidado (no con createdAt).
      ...(dto.from || dto.to
        ? {
            AND: [
              ...(dto.from
                ? [{ periodEnd: { gte: new Date(dto.from) } }]
                : []),
              ...(dto.to
                ? [{ periodStart: { lte: new Date(dto.to) } }]
                : []),
            ],
          }
        : {}),
    };
    const payouts = await this.prisma.payout.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    });
    return payouts.map(withPayoutLines);
  }
}
