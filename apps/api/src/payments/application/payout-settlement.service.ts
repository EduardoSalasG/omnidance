import { Injectable } from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import {
  decodeClassRef,
  decodePrivateRef,
  decodeMembershipRef,
  decodeSeriesPassRef,
} from "../domain/order-ref";

/** Línea de deducción calculada (antes de persistir en PayoutLine). */
export interface SettlementLine {
  paymentId: string | null;
  type: string;
  amount: number;
  meta?: Record<string, unknown>;
}

export interface Settlement {
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
 * Campos del Payment que la liquidación necesita: atribución +
 * descomposición congelada del fee + costo real de pasarela.
 */
const PAYMENT_SELECT = {
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
 *
 * `unliquidatedOnly` (spec admin-finance-console): solo pagos sin
 * `PayoutLine` - es el accrual "por liberar" del admin. Misma fuente
 * de verdad que `generate`: lo que proyecta acá es lo que liquidaría
 * un payout real del actor.
 *
 * Atribución v1:
 * - PRODUCER: tickets de sus eventos + pases de sus series (refId
 *   sp_<seriesId>_<month>_<uuid> → EventSeries.producerId).
 * - ACADEMY: eventos propios (academyId sin producerId) + MEMBERSHIP
 *   (refId mem_<planId>_) + WORKSHOP (refId wks_<classId>_ →
 *   class.slot.academyId) + PRIVATE (refId pvt_<academyId>_, salvo la
 *   lección cancelada).
 * - VENUE: eventos propios (venueId sin producerId).
 * PLATFORM_SUB nunca se liquida (ingreso directo de la plataforma).
 */
@Injectable()
export class PayoutSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
  ) {}

  async compute(
    actorType: string,
    actorId: string,
    periodStart: Date,
    periodEnd: Date,
    opts?: { unliquidatedOnly?: boolean },
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
    const unliquidated = opts?.unliquidatedOnly
      ? { payoutLines: { none: {} } }
      : {};
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

      const whereQ: Prisma.PaymentWhereInput = {
        orderType: { in: ["TICKET", "MEMBERSHIP", "WORKSHOP", "PRIVATE"] },
        status: "PAID",
        createdAt: { gte: periodStart, lte: periodEnd },
        ...unliquidated,
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
      };
      const payments = await this.prisma.payment.findMany({
        where: whereQ,
        select: PAYMENT_SELECT,
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
        ...unliquidated,
      },
      select: PAYMENT_SELECT,
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
}
