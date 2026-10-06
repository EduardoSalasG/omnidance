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
import type {
  Payment,
  Payout,
  PayoutLine,
  PayoutStatus,
  Prisma,
} from "@prisma/client";
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
import { emitPaymentEvent } from "../domain/payment-ledger";

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

/** Línea de deducción calculada (antes de persistir en PayoutLine). */
interface SettlementLine {
  paymentId: string | null;
  type: string;
  amount: number;
  meta?: Record<string, unknown>;
}

interface Settlement {
  gross: number;
  platformFee: number;
  gatewayFee: number;
  net: number;
  lines: SettlementLine[];
}

const FEE_LINE_TYPES = new Set([
  "PLATFORM_FEE_NET",
  "PLATFORM_FEE_VAT",
  "OWN_METHOD_FEE_NET",
  "OWN_METHOD_FEE_VAT",
]);

/**
 * Descompone la deducción "todo incluido" de una orden MANAGED en líneas:
 * pasarela al costo real (reportado) o esperado + nuestro neto + IVA.
 * La deducción del productor es la congelada (amount − producerNetClp):
 * si la pasarela cobró distinto de lo esperado, la diferencia la absorbe
 * nuestro split neto/IVA - nunca el productor. La línea de pasarela
 * queda acotada a la deducción: una tasa 0% (promo) o por debajo del
 * costo de tarjeta significa que la plataforma absorbe el costo, no que
 * el productor lo paga.
 */
function managedSettlementLines(
  p: Pick<
    Payment,
    | "id"
    | "amount"
    | "producerNetClp"
    | "platformFeeRate"
    | "gatewayFeeExpected"
    | "gatewayFeeClp"
  >,
  ivaPct: number,
): SettlementLine[] {
  const deduction = p.amount - (p.producerNetClp ?? p.amount);
  const gatewayReal = Math.min(
    p.gatewayFeeClp ?? p.gatewayFeeExpected ?? 0,
    deduction,
  );
  const ourGross = Math.max(0, deduction - gatewayReal);
  const net = Math.round(ourGross / (1 + ivaPct / 100));
  const meta = {
    orderAmount: p.amount,
    rate: p.platformFeeRate,
    gatewayFeeExpected: p.gatewayFeeExpected,
    gatewayFeeReal: p.gatewayFeeClp,
  };
  const lines: SettlementLine[] = [];
  if (gatewayReal > 0) {
    lines.push({
      paymentId: p.id,
      type: "GATEWAY_FEE_PASSTHROUGH",
      amount: gatewayReal,
      meta,
    });
  }
  if (net > 0) {
    lines.push({
      paymentId: p.id,
      type: "PLATFORM_FEE_NET",
      amount: net,
      meta,
    });
  }
  if (ourGross - net > 0) {
    lines.push({
      paymentId: p.id,
      type: "PLATFORM_FEE_VAT",
      amount: ourGross - net,
      meta,
    });
  }
  return lines;
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
      include: { lines: true },
    });
    if (existing) return withPayoutLines(existing);

    const settlement = await this.computeSettlement(
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

  /**
   * Campos del Payment que la liquidación necesita: atribución +
   * descomposición congelada del fee + costo real de pasarela.
   */
  private static readonly PAYMENT_SELECT = {
    id: true,
    orderType: true,
    eventId: true,
    refId: true,
    amount: true,
    fee: true,
    gateway: true,
    feeMode: true,
    platformFeeRate: true,
    platformFeeNetClp: true,
    platformFeeVatClp: true,
    gatewayFeeExpected: true,
    gatewayFeeClp: true,
    producerNetClp: true,
  } as const;

  /**
   * Devengado del actor en el período como líneas auditables (spec
   * producer-fee-model): la liquidación solo lee snapshots congelados.
   * - MANAGED: deducción all-in% descompuesta (pasarela + neto + IVA).
   * - OWN_METHOD/OWN_GATEWAY: no entra al gross (plata ajena); su
   *   comisión devengada se netea como líneas OWN_METHOD_*.
   * - FREE: no devenga. Legacy (feeMode null): regla vieja fee + pct.
   * - ACADEMY: solo pasarela al costo (real o estimada por param).
   */
  private async computeSettlement(
    actorType: string,
    actorId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Settlement> {
    const empty: Settlement = {
      gross: 0,
      platformFee: 0,
      gatewayFee: 0,
      net: 0,
      lines: [],
    };
    const [ivaPct, passthroughPct] = await Promise.all([
      this.params.getNumber("tax.iva_pct", 19),
      this.params.getNumber("gateway_fee.academy_passthrough_pct", 3.19),
    ]);
    const accrue = (
      acc: Settlement,
      lines: SettlementLine[],
      gross: number,
    ) => {
      acc.gross += gross;
      for (const l of lines) {
        acc.lines.push(l);
        if (l.type === "GATEWAY_FEE_PASSTHROUGH") acc.gatewayFee += l.amount;
        else if (FEE_LINE_TYPES.has(l.type)) acc.platformFee += l.amount;
      }
    };

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
      // decodifica al plan o a la clase (slot → academyId).
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
        return empty;
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
        select: AdminPayoutsController.PAYMENT_SELECT,
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
      const acc: Settlement = { ...empty, lines: [] };
      for (const p of payments) {
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
        // Plata cobrada por métodos propios (MANUAL) nunca pasó por la
        // pasarela: no infla el gross ni devenga pasarela (academias no
        // pagan comisión por venta - modelo SaaS).
        if (p.gateway === "MANUAL") continue;
        if (actorType === "ACADEMY") {
          // Modelo SaaS: solo el costo de pasarela al costo real (si lo
          // reportó) o estimado por param - línea por orden, no agregada.
          const gateway =
            p.gatewayFeeClp ?? Math.round((p.amount * passthroughPct) / 100);
          accrue(
            acc,
            gateway > 0
              ? [
                  {
                    paymentId: p.id,
                    type: "GATEWAY_FEE_PASSTHROUGH",
                    amount: gateway,
                    meta: {
                      orderAmount: p.amount,
                      estimated: p.gatewayFeeClp == null,
                    },
                  },
                ]
              : [],
            p.amount,
          );
        } else {
          // VENUE: regla legacy (fee real + platformFeePct del evento).
          const lines: SettlementLine[] = [];
          if (p.fee > 0) {
            lines.push({
              paymentId: p.id,
              type: "GATEWAY_FEE_PASSTHROUGH",
              amount: p.fee,
              meta: { orderAmount: p.amount, legacy: true },
            });
          }
          const pct = pctByEvent.get(p.eventId ?? "") ?? 0;
          const fee = Math.round((p.amount * pct) / 100);
          if (fee > 0) {
            lines.push({
              paymentId: p.id,
              type: "PLATFORM_FEE_NET",
              amount: fee,
              meta: { orderAmount: p.amount, rate: pct, legacy: true },
            });
          }
          accrue(acc, lines, p.amount);
        }
      }
      acc.net = acc.gross - acc.platformFee - acc.gatewayFee;
      return acc;
    }
    if (actorType !== "PRODUCER") return empty;

    const [events, series] = await Promise.all([
      this.prisma.event.findMany({
        where: { producerId: actorId },
        select: { id: true, platformFeePct: true },
      }),
      this.prisma.eventSeries.findMany({
        where: { producerId: actorId },
        select: { id: true },
      }),
    ]);
    const eventIds = new Set(events.map((e) => e.id));
    const seriesIds = new Set(series.map((s) => s.id));
    const pctByEvent = new Map(
      events.map((e) => [e.id, e.platformFeePct]),
    );

    const payments = await this.prisma.payment.findMany({
      where: {
        orderType: { in: ["TICKET", "SERIES_PASS"] },
        status: "PAID",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: AdminPayoutsController.PAYMENT_SELECT,
    });

    const acc: Settlement = { ...empty, lines: [] };
    for (const p of payments) {
      const isTicket = p.orderType === "TICKET";
      const belongs = isTicket
        ? p.eventId != null && eventIds.has(p.eventId)
        : seriesIds.has(decodeSeriesPassRef(p.refId)?.seriesId ?? "");
      if (!belongs) continue;

      if (p.feeMode === "MANAGED") {
        accrue(
          acc,
          managedSettlementLines(p, ivaPct),
          p.gateway === "MANUAL" ? 0 : p.amount,
        );
      } else if (p.feeMode === "OWN_METHOD" || p.feeMode === "OWN_GATEWAY") {
        // Métodos/pasarela propios del actor: la plata nunca pasó por
        // nosotros - no entra al gross, pero su comisión devengada se
        // netea contra este payout (spec netting).
        const meta = {
          orderAmount: p.amount,
          rate: p.platformFeeRate,
          feeMode: p.feeMode,
        };
        const lines: SettlementLine[] = [];
        if ((p.platformFeeNetClp ?? 0) > 0) {
          lines.push({
            paymentId: p.id,
            type: "OWN_METHOD_FEE_NET",
            amount: p.platformFeeNetClp!,
            meta,
          });
        }
        if ((p.platformFeeVatClp ?? 0) > 0) {
          lines.push({
            paymentId: p.id,
            type: "OWN_METHOD_FEE_VAT",
            amount: p.platformFeeVatClp!,
            meta,
          });
        }
        accrue(acc, lines, 0);
      } else if (p.feeMode === "FREE") {
        acc.gross += p.amount; // 0 - registro sin deducción
      } else if (p.gateway === "MANUAL") {
        continue; // venta propia legacy sin snapshot: plata ajena, no entra
      } else {
        // Legacy (pre-modelo): regla vieja fee real + platformFeePct del
        // evento (o del productor/global para pases y eventos sin override).
        const pct =
          (isTicket ? pctByEvent.get(p.eventId ?? "") : undefined) ??
          (await this.legacyProducerPct(actorId));
        const lines: SettlementLine[] = [];
        if (p.fee > 0) {
          lines.push({
            paymentId: p.id,
            type: "GATEWAY_FEE_PASSTHROUGH",
            amount: p.fee,
            meta: { orderAmount: p.amount, legacy: true },
          });
        }
        const fee = Math.round((p.amount * pct) / 100);
        if (fee > 0) {
          lines.push({
            paymentId: p.id,
            type: "PLATFORM_FEE_NET",
            amount: fee,
            meta: { orderAmount: p.amount, rate: pct, legacy: true },
          });
        }
        accrue(acc, lines, p.amount);
      }
    }
    acc.net = acc.gross - acc.platformFee - acc.gatewayFee;
    return acc;
  }

  /** % legacy para pagos sin snapshot (evento → productor → global). */
  private async legacyProducerPct(actorId: string): Promise<number> {
    const [producerParams, globalPct] = await Promise.all([
      this.params.getProducerParams(actorId),
      this.params.getNumber("platform_fee.default_pct", 0),
    ]);
    return producerParams?.platformFeePct ?? globalPct;
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
      include: { lines: true },
    });
    return payouts.map(withPayoutLines);
  }
}
