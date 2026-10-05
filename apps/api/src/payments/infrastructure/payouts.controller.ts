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
import type { Payout, PayoutStatus, Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { ParamsService } from "../../params/params.service";
import {
  decodeClassRef,
  decodePrivateRef,
  decodeMembershipRef,
  decodeSeriesPassRef,
} from "../domain/order-ref";

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
  /** Comprobante de la transferencia (link externo - nunca se hostea). */
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

/**
 * Desglose explícito de la liquidación (spec academy-saas-billing): cada
 * deducción del bruto sale como línea tipada - nunca escondida en `net`.
 * - GATEWAY_FEE_PASSTHROUGH: costo Flow que absorbe la academia
 *   (gateway_fee.academy_passthrough_pct) - solo payouts ACADEMY.
 * - PLATFORM_FEE: comisión de plataforma (platformFeePct) - payouts
 *   PRODUCER/VENUE y legados ACADEMY generados antes del modelo SaaS.
 */
function payoutLines(payout: Payout): { type: string; amount: number }[] {
  const lines: { type: string; amount: number }[] = [];
  if (payout.platformFee > 0) {
    lines.push({ type: "PLATFORM_FEE", amount: payout.platformFee });
  }
  if (payout.gatewayFee > 0) {
    lines.push({ type: "GATEWAY_FEE_PASSTHROUGH", amount: payout.gatewayFee });
  }
  return lines;
}

/** Payout + desglose de deducciones para el breakdown del response. */
function withPayoutLines<T extends Payout>(payout: T) {
  return { ...payout, lines: payoutLines(payout) };
}

/**
 * Liquidaciones (spec payouts): el admin genera el payout de un actor para
 * un período, lo aprueba y lo marca pagado con evidencia. Todo queda en
 * AuditLog (PAYOUT_GENERATE / PAYOUT_APPROVE / PAYOUT_PAY).
 *
 * Cálculo v1:
 * - PRODUCER: tickets de sus eventos + pases de sus series.
 *   · Tickets: payments PAID con orderType TICKET cuyo eventId apunta a un
 *     Event del productor.
 *   · Pases de serie: payments PAID con orderType SERIES_PASS cuyo refId
 *     (sp_<seriesId>_<month>_<uuid>) decodifica a una EventSeries del
 *     productor - no hay columna de serie en Payment, el refId es la fuente.
 * - ACADEMY: Σ Payment.amount de payments PAID con orderType TICKET cuyo
 *   eventId apunta a un Event con academyId = actorId AND producerId = null
 *   (eventos producidos directamente por la academia - si hay productor,
 *   el productor ya devenga) + payments PAID con orderType MEMBERSHIP cuyo
 *   refId (mem_<planId>_<uuid>) decodifica a un MembershipPlan de la
 *   academia (venta de planes online) + payments PAID con orderType
 *   WORKSHOP cuyo refId (wks_<classId>_<uuid>) decodifica a una Class de
 *   la academia (venta de clases sueltas/talleres).
 * - VENUE: mismo patrón con venueId = actorId AND producerId = null.
 * - SERIES_PASS nunca aplica a ACADEMY/VENUE (EventSeries.producerId es
 *   required - siempre hay productor que devenga); MEMBERSHIP y WORKSHOP
 *   solo a ACADEMY.
 * gross = Σ amount.
 * - PRODUCER/VENUE (legacy): net = gross − Σ fee − platformFeePct.
 * - ACADEMY (modelo SaaS, spec academy-saas-billing): net = gross −
 *   GATEWAY_FEE_PASSTHROUGH (gross × gateway_fee.academy_passthrough_pct)
 *   - sin platformFee: la academia monetiza vía su suscripción.
 * Toda deducción se expone como línea tipada en `lines[]` del response
 * (GATEWAY_FEE_PASSTHROUGH / PLATFORM_FEE) y persiste en
 * Payout.gatewayFee / Payout.platformFee.
 */
@Controller("admin/payouts")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminPayoutsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
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
    });
    if (existing) return withPayoutLines(existing);

    const { gross, net, platformFee, gatewayFee } =
      await this.computeSettlement(
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
        platformFee,
        gatewayFee,
        net,
      },
    });
    await this.audit(req, "PAYOUT_GENERATE", payout.id, {
      actorType: dto.actorType,
      actorId: dto.actorId,
      gross,
      platformFee,
      gatewayFee,
      net,
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

  /**
   * Devengado del actor en el período (regla v1 del JSDoc de clase).
   * PRODUCER: Σ Payment.amount de tickets de sus eventos + pases de sus
   * series; ACADEMY/VENUE: tickets de sus eventos sin productor
   * (producerId = null - si hay productor, él ya devenga); ACADEMY suma
   * además las ventas MEMBERSHIP de sus planes (refId → plan). SERIES_PASS
   * no aplica a ACADEMY/VENUE porque EventSeries.producerId es required.
   * net = gross − Σ fee.
   *
   * Modelo SaaS (spec academy-saas-billing): la liquidación ACADEMY ya no
   * descuenta platformFee ni el fee real por pago - la academia paga su
   * suscripción de plataforma y absorbe el costo Flow como línea
   * explícita GATEWAY_FEE_PASSTHROUGH = round(gross ×
   * gateway_fee.academy_passthrough_pct / 100), calculada desde el param
   * (no del Payment.fee efectivo). VENUE y PRODUCER conservan la regla
   * legacy (Σ fee + platformFeePct).
   */
  private async computeSettlement(
    actorType: string,
    actorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    gross: number;
    net: number;
    platformFee: number;
    gatewayFee: number;
  }> {
    if (actorType === "ACADEMY" || actorType === "VENUE") {
      const events = await this.prisma.event.findMany({
        where:
          actorType === "ACADEMY"
            ? { academyId: actorId, producerId: null }
            : { venueId: actorId, producerId: null },
        select: { id: true, platformFeePct: true },
      });
      const globalPct = await this.params.getNumber(
        "platform_fee.default_pct",
        0,
      );
      const pctByEvent = new Map(
        events.map((e) => [e.id, e.platformFeePct ?? globalPct]),
      );

      // MEMBERSHIP + WORKSHOP (solo ACADEMY): la orden no tiene columna
      // de academia - el refId (mem_<planId>_<uuid> / wks_<classId>_<uuid>)
      // decodifica al plan o a la clase (slot → academyId). Ni planes ni
      // clases sueltas tienen fee propio → % global.
      const [planIds, classIds] =
        actorType === "ACADEMY"
          ? [
              new Set(
                (
                  await this.prisma.membershipPlan.findMany({
                    where: { academyId: actorId },
                    select: { id: true },
                  })
                ).map((p) => p.id),
              ),
              new Set(
                (
                  await this.prisma.class.findMany({
                    where: { slot: { academyId: actorId } },
                    select: { id: true },
                  })
                ).map((c) => c.id),
              ),
            ]
          : [new Set<string>(), new Set<string>()];
      // ACADEMY nunca corta aquí: una orden PRIVATE (pvt_<academyId>_)
      // puede pertenecerle aunque no tenga eventos/planes/clases.
      if (
        actorType !== "ACADEMY" &&
        !events.length &&
        !planIds.size &&
        !classIds.size
      ) {
        return { gross: 0, net: 0, platformFee: 0, gatewayFee: 0 };
      }

      const payments = await this.prisma.payment.findMany({
        where: {
          orderType: { in: ["TICKET", "MEMBERSHIP", "WORKSHOP", "PRIVATE"] },
          status: "PAID",
          createdAt: { gte: periodStart, lte: periodEnd },
          OR: [
            ...(events.length
              ? [{ eventId: { in: events.map((e) => e.id) } }]
              : []),
            ...(planIds.size ? [{ orderType: "MEMBERSHIP" }] : []),
            ...(classIds.size ? [{ orderType: "WORKSHOP" }] : []),
            // PRIVATE: el refId decodifica directo a academyId - se filtra
            // en el loop (no cabe en el OR sin columna de academia).
            ...(actorType === "ACADEMY" ? [{ orderType: "PRIVATE" }] : []),
          ],
        },
        select: {
          id: true,
          orderType: true,
          eventId: true,
          refId: true,
          amount: true,
          fee: true,
        },
      });
      // Una particular cancelada (alumno u owner) no devenga: la academia
      // debe devolver el pago fuera de la app (Flow) - liquidarla igual
      // le pagaría dos veces.
      const privateIds = payments
        .filter((p) => p.orderType === "PRIVATE")
        .map((p) => p.id);
      const cancelledLessons = new Set(
        (
          await this.prisma.privateLesson.findMany({
            where: {
              paymentId: { in: privateIds },
              status: "CANCELLED",
            },
            select: { paymentId: true },
          })
        ).map((l) => l.paymentId),
      );
      let gross = 0;
      let fees = 0;
      let platformFee = 0;
      for (const p of payments) {
        const isAcademyLine =
          p.orderType === "MEMBERSHIP" ||
          p.orderType === "WORKSHOP" ||
          p.orderType === "PRIVATE";
        const belongs =
          p.orderType === "MEMBERSHIP"
            ? planIds.has(decodeMembershipRef(p.refId)?.planId ?? "")
            : p.orderType === "WORKSHOP"
              ? classIds.has(decodeClassRef(p.refId)?.classId ?? "")
              : p.orderType === "PRIVATE"
                ? decodePrivateRef(p.refId)?.academyId === actorId &&
                  !cancelledLessons.has(p.id)
                : p.eventId != null && pctByEvent.has(p.eventId);
        if (!belongs) continue;
        gross += p.amount;
        fees += p.fee;
        const pct = isAcademyLine
          ? globalPct
          : (pctByEvent.get(p.eventId ?? "") ?? 0);
        platformFee += Math.round((p.amount * pct) / 100);
      }
      if (actorType === "ACADEMY") {
        // Modelo SaaS: el payout de la academia no descuenta platformFee
        // ni el fee real por pago - solo el costo de pasarela como línea
        // explícita GATEWAY_FEE_PASSTHROUGH, tasa por param.
        const passthroughPct = await this.params.getNumber(
          "gateway_fee.academy_passthrough_pct",
          3.19,
        );
        const gatewayFee = Math.round((gross * passthroughPct) / 100);
        return {
          gross,
          net: gross - gatewayFee,
          platformFee: 0,
          gatewayFee,
        };
      }
      return {
        gross,
        net: gross - fees - platformFee,
        platformFee,
        gatewayFee: 0,
      };
    }
    if (actorType !== "PRODUCER") {
      return { gross: 0, net: 0, platformFee: 0, gatewayFee: 0 };
    }

    const [events, series, producerParams, globalPct] = await Promise.all([
      this.prisma.event.findMany({
        where: { producerId: actorId },
        select: { id: true, platformFeePct: true },
      }),
      this.prisma.eventSeries.findMany({
        where: { producerId: actorId },
        select: { id: true },
      }),
      this.params.getProducerParams(actorId),
      this.params.getNumber("platform_fee.default_pct", 0),
    ]);
    const eventIds = new Set(events.map((e) => e.id));
    const seriesIds = new Set(series.map((s) => s.id));
    // % efectivo por evento: override del evento → default del productor →
    // param global. Los pases de serie usan el default del productor.
    const pctByEvent = new Map(
      events.map((e) => [
        e.id,
        e.platformFeePct ?? producerParams?.platformFeePct ?? globalPct,
      ]),
    );
    const passPct = producerParams?.platformFeePct ?? globalPct;

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
    let platformFee = 0;
    for (const p of payments) {
      const isTicket = p.orderType === "TICKET";
      const belongs = isTicket
        ? p.eventId != null && eventIds.has(p.eventId)
        : seriesIds.has(decodeSeriesPassRef(p.refId)?.seriesId ?? "");
      if (!belongs) continue;
      gross += p.amount;
      fees += p.fee;
      const pct = isTicket
        ? (pctByEvent.get(p.eventId ?? "") ?? 0)
        : passPct;
      platformFee += Math.round((p.amount * pct) / 100);
    }
    return {
      gross,
      net: gross - fees - platformFee,
      platformFee,
      gatewayFee: 0,
    };
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
  async mine(@Req() req: Request) {
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
    const where: Prisma.PayoutWhereInput = or.length > 1 ? { OR: or } : or[0];
    const payouts = await this.prisma.payout.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return payouts.map(withPayoutLines);
  }
}
