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
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import type { Request } from "express";
import type { PayoutStatus, Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { decodeSeriesPassRef } from "../domain/order-ref";

const ACTOR_TYPES = ["PRODUCER", "ACADEMY", "VENUE"] as const;
const PAYOUT_STATUSES: readonly PayoutStatus[] = [
  "PENDING",
  "APPROVED",
  "PAID",
];

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
  actorType?: string;

  @IsOptional()
  @IsIn(PAYOUT_STATUSES)
  status?: PayoutStatus;
}

class PayPayoutDto {
  /** Comprobante de la transferencia (link externo — nunca se hostea). */
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

/**
 * Liquidaciones (spec payouts): el admin genera el payout de un actor para
 * un período, lo aprueba y lo marca pagado con evidencia. Todo queda en
 * AuditLog (PAYOUT_GENERATE / PAYOUT_APPROVE / PAYOUT_PAY).
 *
 * Cálculo v1 — solo PRODUCER devenga:
 * - Tickets: payments PAID con orderType TICKET cuyo eventId apunta a un
 *   Event del productor.
 * - Pases de serie: payments PAID con orderType SERIES_PASS cuyo refId
 *   (sp_<seriesId>_<month>_<uuid>) decodifica a una EventSeries del
 *   productor — no hay columna de serie en Payment, el refId es la fuente.
 * gross = Σ amount; net = gross − Σ fee (costo pasarela).
 */
@Controller("admin/payouts")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminPayoutsController {
  constructor(private readonly prisma: PrismaService) {}

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
    });
    if (existing) return existing;

    const { gross, net } = await this.computeSettlement(
      dto.actorType,
      dto.actorId,
      periodStart,
      periodEnd,
    );

    const payout = await this.prisma.payout.create({
      data: {
        actorType: dto.actorType,
        actorId: dto.actorId,
        periodStart,
        periodEnd,
        gross,
        net,
      },
    });
    await this.audit(req, "PAYOUT_GENERATE", payout.id, {
      actorType: dto.actorType,
      actorId: dto.actorId,
      gross,
      net,
    });
    return payout;
  }

  /** Lista de payouts, filtrable por actorType/status, recientes primero. */
  @Get()
  list(@Query() q: ListPayoutsQueryDto) {
    return this.prisma.payout.findMany({
      where: {
        ...(q.actorType ? { actorType: q.actorType } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
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

  /**
   * Devengado del actor en el período. PRODUCER: Σ Payment.amount de tickets
   * de sus eventos + pases de sus series; net = gross − Σ fee.
   * ACADEMY/VENUE quedan en 0 en v1 (su reparto no está definido aún).
   */
  private async computeSettlement(
    actorType: string,
    actorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ gross: number; net: number }> {
    if (actorType !== "PRODUCER") {
      return { gross: 0, net: 0 };
    }

    const [events, series] = await Promise.all([
      this.prisma.event.findMany({
        where: { producerId: actorId },
        select: { id: true },
      }),
      this.prisma.eventSeries.findMany({
        where: { producerId: actorId },
        select: { id: true },
      }),
    ]);
    const eventIds = new Set(events.map((e) => e.id));
    const seriesIds = new Set(series.map((s) => s.id));

    const payments = await this.prisma.payment.findMany({
      where: {
        orderType: { in: ["TICKET", "SERIES_PASS"] },
        status: "PAID",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        orderType: true,
        eventId: true,
        refId: true,
        amount: true,
        fee: true,
      },
    });

    let gross = 0;
    let fees = 0;
    for (const p of payments) {
      const belongs =
        p.orderType === "TICKET"
          ? p.eventId != null && eventIds.has(p.eventId)
          : seriesIds.has(decodeSeriesPassRef(p.refId)?.seriesId ?? "");
      if (!belongs) continue;
      gross += p.amount;
      fees += p.fee;
    }
    return { gross, net: gross - fees };
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
 * liquidaciones son actorType PRODUCER + actorId = su personId.
 * Requiere crm.manage (grant del rol PRODUCER); payouts de
 * academias/venues quedan fuera de v1.
 */
@Controller("me/payouts")
@UseGuards(SessionGuard, RolesGuard)
export class MePayoutsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("crm.manage")
  mine(@Req() req: Request) {
    return this.prisma.payout.findMany({
      where: { actorType: "PRODUCER", actorId: req.person!.id },
      orderBy: { createdAt: "desc" },
    });
  }
}
