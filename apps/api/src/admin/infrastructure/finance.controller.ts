import {
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsDateString } from "class-validator";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { ParamsService } from "../../params/params.service";
import { PayoutSettlementService } from "../../payments/application/payout-settlement.service";
import {
  decodeClassRef,
  decodeMembershipRef,
  decodePrivateRef,
  decodeSeriesPassRef,
} from "../../payments/domain/order-ref";
import {
  CYCLE_MONTHS,
  cycleChargeClp,
  SELF_SERVE_ACADEMY_TIERS,
  producerTierParamKey,
} from "../../payments/domain/platform-tiers";
import type { BillingCycle } from "@prisma/client";
import { ApiQuery } from "@nestjs/swagger";
import { clMonthStart } from "../../common/cl-time";

class SummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

const SOCIAL_ORDER_TYPES = new Set(["TICKET", "SERIES_PASS"]);
const ACADEMY_ORDER_TYPES = new Set(["MEMBERSHIP", "WORKSHOP", "PRIVATE"]);
/** orderTypes que devengan a un actor (PLATFORM_SUB es ingreso directo). */
const ACCRUABLE_ORDER_TYPES = [
  "TICKET",
  "SERIES_PASS",
  "MEMBERSHIP",
  "WORKSHOP",
  "PRIVATE",
];
const EPOCH = new Date("2020-01-01T00:00:00Z");

type ActorType = "PRODUCER" | "ACADEMY" | "VENUE";

interface ActorRef {
  actorType: ActorType;
  actorId: string;
}

/**
 * Consola de facturación del admin (spec admin-finance-console): KPIs
 * del período, devengado no liquidado por actor y MRR SaaS. Read-only
 * sobre pagos y suscripciones; la operación del ciclo de payout usa los
 * endpoints existentes de /admin/payouts.
 *
 * - summary: GMV por segmento (social / academia / SaaS / métodos
 *   propios - la plata MANUAL nunca pasó por la pasarela), ingreso
 *   plataforma (fee neto + IVA + SaaS completo), costo real de pasarela
 *   y cola de payouts PENDING/APPROVED ("plata que transferir").
 * - accrual: pagos PAID sin PayoutLine atribuidos por actor con las
 *   mismas reglas del settlement (PayoutSettlementService con
 *   unliquidatedOnly) - "próximos pagos a liberar" incluye TODO el
 *   histórico devengado, no solo el mes.
 * - mrr: PlatformSubscription ACTIVE normalizada a mensual por ciclo;
 *   tiers "a convenir" (ENTERPRISE/PRO_BIG) van a customContracts.
 */
@Controller("admin/finance")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
    private readonly settlement: PayoutSettlementService,
  ) {}

  @Get("summary")
  @ApiQuery({ name: "from", required: false })
  async summary(@Query("from") from?: string, @Query("to") to?: string) {
    const periodEnd = to ? new Date(to) : new Date();
    const periodStart = from ? new Date(from) : clMonthStart(periodEnd);

    const [payments, queue] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          status: "PAID",
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        select: {
          amount: true,
          orderType: true,
          gateway: true,
          platformFeeNetClp: true,
          platformFeeVatClp: true,
          gatewayFeeClp: true,
        },
      }),
      this.prisma.payout.findMany({
        where: { status: { in: ["PENDING", "APPROVED"] } },
        select: { status: true, net: true },
      }),
    ]);

    const gmv = { social: 0, academy: 0, saas: 0, ownMethod: 0 };
    let feeNet = 0;
    let feeVat = 0;
    let gatewayCost = 0;
    for (const p of payments) {
      if (p.gateway === "MANUAL") {
        // La plata pasó por afuera - solo el fee devengado cuenta.
        gmv.ownMethod += p.amount;
      } else if (p.orderType === "PLATFORM_SUB") {
        gmv.saas += p.amount;
      } else if (SOCIAL_ORDER_TYPES.has(p.orderType)) {
        gmv.social += p.amount;
      } else if (ACADEMY_ORDER_TYPES.has(p.orderType)) {
        gmv.academy += p.amount;
      }
      feeNet += p.platformFeeNetClp ?? 0;
      feeVat += p.platformFeeVatClp ?? 0;
      gatewayCost += p.gatewayFeeClp ?? 0;
    }

    const bucket = (status: string) => {
      const rows = queue.filter((p) => p.status === status);
      return {
        count: rows.length,
        net: rows.reduce((a, p) => a + p.net, 0),
      };
    };
    return {
      period: { from: periodStart, to: periodEnd },
      gmv,
      platformRevenue: {
        net: feeNet,
        vat: feeVat,
        saas: gmv.saas,
        total: feeNet + feeVat + gmv.saas,
      },
      gatewayCost,
      pendingPayout: {
        pending: bucket("PENDING"),
        approved: bucket("APPROVED"),
      },
    };
  }

  /**
   * Devengado no liquidado: actores con pagos PAID sin PayoutLine.
   * La proyección de deducciones usa el settlement real (misma fuente
   * de verdad que generate) sobre todo el histórico devengado.
   */
  @Get("accrual")
  async accrual() {
    // 1. Pagos no liquidados → resolver a qué actor pertenecen.
    const payments = await this.prisma.payment.findMany({
      where: {
        status: "PAID",
        payoutLines: { none: {} },
        orderType: { in: ACCRUABLE_ORDER_TYPES },
      },
      select: {
        id: true,
        orderType: true,
        eventId: true,
        refId: true,
        createdAt: true,
      },
    });
    if (!payments.length) return [];

    const [events, series, plans, classes] = await Promise.all([
      this.prisma.event.findMany({
        select: { id: true, producerId: true, academyId: true, venueId: true },
      }),
      this.prisma.eventSeries.findMany({
        select: { id: true, producerId: true },
      }),
      this.prisma.membershipPlan.findMany({
        select: { id: true, academyId: true },
      }),
      this.prisma.class.findMany({
        select: { id: true, slot: { select: { academyId: true } } },
      }),
    ]);
    const eventById = new Map(events.map((e) => [e.id, e]));
    const seriesById = new Map(series.map((s) => [s.id, s]));
    const planById = new Map(plans.map((p) => [p.id, p]));
    const classById = new Map(classes.map((c) => [c.id, c]));

    const actorOf = (p: (typeof payments)[number]): ActorRef | null => {
      switch (p.orderType) {
        case "TICKET": {
          const e = p.eventId ? eventById.get(p.eventId) : undefined;
          if (!e) return null;
          if (e.producerId)
            return { actorType: "PRODUCER", actorId: e.producerId };
          if (e.academyId)
            return { actorType: "ACADEMY", actorId: e.academyId };
          if (e.venueId) return { actorType: "VENUE", actorId: e.venueId };
          return null;
        }
        case "SERIES_PASS": {
          const s = seriesById.get(
            decodeSeriesPassRef(p.refId)?.seriesId ?? "",
          );
          return s ? { actorType: "PRODUCER", actorId: s.producerId } : null;
        }
        case "MEMBERSHIP": {
          const plan = planById.get(
            decodeMembershipRef(p.refId)?.planId ?? "",
          );
          return plan
            ? { actorType: "ACADEMY", actorId: plan.academyId }
            : null;
        }
        case "WORKSHOP": {
          const c = classById.get(decodeClassRef(p.refId)?.classId ?? "");
          return c
            ? { actorType: "ACADEMY", actorId: c.slot.academyId }
            : null;
        }
        case "PRIVATE": {
          const academyId = decodePrivateRef(p.refId)?.academyId;
          return academyId
            ? { actorType: "ACADEMY", actorId: academyId }
            : null;
        }
        default:
          return null;
      }
    };

    const byActor = new Map<
      string,
      ActorRef & { oldestPaymentAt: Date; paymentCount: number }
    >();
    for (const p of payments) {
      const actor = actorOf(p);
      if (!actor) continue;
      const key = `${actor.actorType}:${actor.actorId}`;
      const existing = byActor.get(key);
      if (existing) {
        existing.paymentCount++;
        if (p.createdAt < existing.oldestPaymentAt)
          existing.oldestPaymentAt = p.createdAt;
      } else {
        byActor.set(key, {
          ...actor,
          oldestPaymentAt: p.createdAt,
          paymentCount: 1,
        });
      }
    }

    // 2. Proyección por actor con el settlement real (misma fuente de
    // verdad que generate) + nombres para la UI.
    const now = new Date();
    const rows = await Promise.all(
      [...byActor.values()].map(async (a) => {
        const s = await this.settlement.compute(
          a.actorType,
          a.actorId,
          EPOCH,
          now,
          { unliquidatedOnly: true },
        );
        const receivable = s.lines
          .filter((l) => l.type.startsWith("OWN_METHOD_"))
          .reduce((acc, l) => acc + l.amount, 0);
        return {
          ...a,
          gross: s.gross,
          estimatedNet: s.net,
          ownMethodReceivable: receivable,
        };
      }),
    );

    const [people, academies, venues] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          id: {
            in: rows
              .filter((r) => r.actorType === "PRODUCER")
              .map((r) => r.actorId),
          },
        },
        select: { id: true, name: true },
      }),
      this.prisma.academy.findMany({
        where: {
          id: {
            in: rows
              .filter((r) => r.actorType === "ACADEMY")
              .map((r) => r.actorId),
          },
        },
        select: { id: true, name: true },
      }),
      this.prisma.venue.findMany({
        where: {
          id: {
            in: rows
              .filter((r) => r.actorType === "VENUE")
              .map((r) => r.actorId),
          },
        },
        select: { id: true, name: true },
      }),
    ]);
    const nameOf = (r: { actorType: ActorType; actorId: string }) =>
      r.actorType === "PRODUCER"
        ? (people.find((p) => p.id === r.actorId)?.name ?? r.actorId)
        : r.actorType === "ACADEMY"
          ? (academies.find((a) => a.id === r.actorId)?.name ?? r.actorId)
          : (venues.find((v) => v.id === r.actorId)?.name ?? r.actorId);

    return rows
      .map((r) => ({ ...r, actorName: nameOf(r) }))
      .sort((a, b) => b.estimatedNet - a.estimatedNet);
  }

  /**
   * MRR de las suscripciones de plataforma (academias + Producer Pro):
   * precio del tier en PlatformParam normalizado a mensual por ciclo.
   * Tiers "a convenir" (ENTERPRISE / PRO_BIG) → customContracts, fuera
   * del MRR. Funnel de estados no-ACTIVE aparte.
   */
  @Get("mrr")
  async mrr() {
    const subs = await this.prisma.platformSubscription.findMany({
      where: { status: { not: "CANCELED" } },
      select: {
        id: true,
        kind: true,
        academyId: true,
        producerId: true,
        tierCode: true,
        billingCycle: true,
        status: true,
        nextInvoiceAt: true,
        promoId: true,
        planChargeClp: true,
      },
    });

    const active = subs.filter((s) => s.status === "ACTIVE");
    const paramKeys = active.map((s) =>
      this.tierParamKey(s.kind, s.tierCode),
    );
    const prices = new Map(
      await Promise.all(
        [...new Set(paramKeys.filter((k): k is string => k != null))].map(
          async (k) => [k, await this.params.getNumber(k, 0)] as const,
        ),
      ),
    );

    const subscriptions = subs.map((s) => {
      const paramKey =
        s.status === "ACTIVE"
          ? this.tierParamKey(s.kind, s.tierCode)
          : null;
      const monthlyBase =
        paramKey == null ? null : (prices.get(paramKey) ?? 0);
      // Precio efectivo (spec platform-promos): si la sub está en un plan
      // con promo, el cargo horneado en el plan remoto (planChargeClp) es
      // la verdad del próximo cobro; si no, el cargo del param.
      // Subs legacy (planChargeClp null) caen al precio del param.
      const charge =
        s.planChargeClp != null
          ? s.planChargeClp
          : monthlyBase != null && monthlyBase > 0
            ? cycleChargeClp(monthlyBase, s.billingCycle as BillingCycle)
            : null;
      const monthly =
        charge == null || charge <= 0
          ? null
          : Math.round(charge / CYCLE_MONTHS[s.billingCycle as BillingCycle]);
      return {
        id: s.id,
        kind: s.kind,
        actorId: s.academyId ?? s.producerId ?? "",
        actorName: "", // se resuelve abajo
        tierCode: s.tierCode,
        billingCycle: s.billingCycle,
        status: s.status,
        monthlyAmount: monthly,
        nextInvoiceAt: s.nextInvoiceAt,
        promoId: s.promoId,
      };
    });

    const [academies, people] = await Promise.all([
      this.prisma.academy.findMany({
        where: {
          id: { in: subs.map((s) => s.academyId).filter((x): x is string => !!x) },
        },
        select: { id: true, name: true },
      }),
      this.prisma.person.findMany({
        where: {
          id: {
            in: subs
              .map((s) => s.producerId)
              .filter((x): x is string => !!x),
          },
        },
        select: { id: true, name: true },
      }),
    ]);
    for (const s of subscriptions) {
      const sub = subs.find((x) => x.id === s.id)!;
      s.actorName = sub.academyId
        ? (academies.find((a) => a.id === sub.academyId)?.name ??
          sub.academyId)
        : (people.find((p) => p.id === sub.producerId)?.name ??
          sub.producerId ??
          "");
    }

    const funnel: Record<string, number> = {};
    for (const s of subs) funnel[s.status] = (funnel[s.status] ?? 0) + 1;

    const byTier = new Map<string, { kind: string; tierCode: string; count: number; monthlyAmount: number }>();
    let mrr = 0;
    for (const s of subscriptions) {
      if (s.status !== "ACTIVE" || s.monthlyAmount == null) continue;
      mrr += s.monthlyAmount;
      const key = `${s.kind}:${s.tierCode}`;
      const row = byTier.get(key) ?? {
        kind: s.kind,
        tierCode: s.tierCode,
        count: 0,
        monthlyAmount: 0,
      };
      row.count++;
      row.monthlyAmount += s.monthlyAmount;
      byTier.set(key, row);
    }

    return {
      mrr,
      arr: mrr * 12,
      customContracts: active.filter(
        (s) =>
          this.tierParamKey(s.kind, s.tierCode) == null,
      ).length,
      byTier: [...byTier.values()],
      funnel,
      subscriptions,
    };
  }

  /**
   * Param de precio mensual base del tier (`academy_tier.<tier>_monthly_clp`
   * / `producer_tier.<key>_monthly_clp`); null si el tier es "a convenir"
   * (ENTERPRISE / PRO_BIG / FREE) - va a customContracts fuera del MRR.
   */
  private tierParamKey(
    kind: string,
    tierCode: string,
  ): string | null {
    if (kind === "ACADEMY") {
      if (!SELF_SERVE_ACADEMY_TIERS.has(tierCode)) return null;
      return `academy_tier.${tierCode.toLowerCase()}_monthly_clp`;
    }
    const key = producerTierParamKey(tierCode);
    return key ? `producer_tier.${key}_monthly_clp` : null;
  }
}
