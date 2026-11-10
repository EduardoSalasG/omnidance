import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import {
  decodeClassRef,
  decodeMembershipRef,
  decodePrivateRef,
} from "../domain/order-ref";
import { PlatformChargesService } from "./platform-charges.service";
import { clMonthStart } from "../../common/cl-time";

const ACADEMY_ORDER_TYPES = ["MEMBERSHIP", "WORKSHOP", "PRIVATE"] as const;
const PAGE = 200;

/**
 * Facturación mes vencido del take BYO (spec academy-byo-collections):
 * Omnidance nunca recauda ventas de academias - la cuenta propia cobra
 * y el take congelado por orden (Payment.academyTakeClp =
 * amount × academy_fee.net_pct) se factura a la academia al cierre del
 * mes como neto + IVA en un `AcademyCollectionsStatement`.
 *
 * Ciclo:
 * 1. `emitForPeriod` agrega las órdenes BYO gateway-PAID del período en
 *    statements idempotentes (@@unique academyId+period), marca cada
 *    Payment con academyStatementId (una orden jamás se factura dos
 *    veces) y dispara el cobro por PLATFORM_CHARGE
 *    (PlatformChargesService.collect sobre el medio registrado del
 *    owner - degrada a link de pago).
 * 2. `reconcile` marca PAID los statements cuyo cobro saldó (el settle
 *    también lo hace al vuelo), libera `Academy.collectionsBlockedAt`
 *    cuando no quedan vencidas, y bloquea las academias con statements
 *    PENDING pasada la gracia (`dueAt` = emisión +
 *    academy_billing.grace_days) - el checkout BYO de sus alumnos
 *    rechaza órdenes por pasarela; el claim manual sigue.
 *
 * Atribución por refId (Payment no tiene columna de academia - misma
 * regla del payout viejo): mem_<planId>_ → plan.academyId;
 * wks_<classId>_ → class.slot.academyId; pvt_<academyId>_ → directo.
 */
@Injectable()
export class AcademyCollectionsService {
  private readonly logger = new Logger(AcademyCollectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
    private readonly charges: PlatformChargesService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Mes calendario CL cerrado más reciente ("YYYY-MM" + bordes). */
  static closedMonth(now = new Date()): {
    period: string;
    periodStart: Date;
    periodEnd: Date;
  } {
    const cur = clMonthStart(now);
    const periodStart = new Date(
      Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 1, 1),
    );
    const periodEnd = new Date(cur.getTime() - 1);
    const period = periodStart.toISOString().slice(0, 7);
    return { period, periodStart, periodEnd };
  }

  /**
   * Emite el statement del período para cada academia con devengado
   * sin facturar. Idempotente por (academyId, period): re-correr no
   * duplica ni recalcula; las órdenes que lleguen PAID tarde quedan
   * para el statement del período de su createdAt en el próximo run
   * (academyStatementId null las deja elegibles).
   */
  async emitForPeriod(
    period: string,
    periodStart: Date,
    periodEnd: Date,
    actor = "cron",
  ): Promise<{ emitted: number; skipped: number }> {
    const [ivaPct, graceDays, takeRate] = await Promise.all([
      this.params.getNumber("tax.iva_pct", 19),
      this.params.getNumber("academy_billing.grace_days", 5),
      this.params.getNumber("academy_fee.net_pct", 1.0),
    ]);
    // Órdenes BYO con take congelado, PAID, aún no facturadas.
    const payments = await this.prisma.payment.findMany({
      where: {
        orderType: { in: [...ACADEMY_ORDER_TYPES] },
        status: "PAID",
        gatewayAccountId: { not: null },
        academyTakeClp: { not: null },
        academyStatementId: null,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        id: true,
        orderType: true,
        refId: true,
        amount: true,
        academyTakeClp: true,
        currency: true,
      },
    });
    if (!payments.length) return { emitted: 0, skipped: 0 };

    const [plans, classes] = await Promise.all([
      this.prisma.membershipPlan.findMany({
        select: { id: true, academyId: true },
      }),
      this.prisma.class.findMany({
        select: { id: true, slot: { select: { academyId: true } } },
      }),
    ]);
    const planAcademy = new Map(plans.map((p) => [p.id, p.academyId]));
    const classAcademy = new Map(
      classes.map((c) => [c.id, c.slot.academyId]),
    );
    const academyOf = (p: (typeof payments)[number]): string | null =>
      p.orderType === "MEMBERSHIP"
        ? (planAcademy.get(decodeMembershipRef(p.refId)?.planId ?? "") ??
          null)
        : p.orderType === "WORKSHOP"
          ? (classAcademy.get(decodeClassRef(p.refId)?.classId ?? "") ??
            null)
          : (decodePrivateRef(p.refId)?.academyId ?? null);

    const byAcademy = new Map<string, typeof payments>();
    for (const p of payments) {
      const academyId = academyOf(p);
      if (!academyId) continue;
      const arr = byAcademy.get(academyId) ?? [];
      arr.push(p);
      byAcademy.set(academyId, arr);
    }

    let emitted = 0;
    let skipped = 0;
    const dueAt = new Date(Date.now() + graceDays * 24 * 60 * 60_000);
    for (const [academyId, rows] of byAcademy) {
      const takeNet = rows.reduce((a, p) => a + (p.academyTakeClp ?? 0), 0);
      const gross = rows.reduce((a, p) => a + p.amount, 0);
      const vat = Math.round((takeNet * ivaPct) / 100);
      try {
        const statement = await this.prisma.$transaction(async (tx) => {
          const st = await tx.academyCollectionsStatement.create({
            data: {
              academyId,
              period,
              periodStart,
              periodEnd,
              orderCount: rows.length,
              grossClp: gross,
              takeRate,
              takeNetClp: takeNet,
              takeVatClp: vat,
              totalClp: takeNet + vat,
              currency:
                rows.every((r) => r.currency === rows[0].currency)
                  ? rows[0].currency
                  : "CLP",
              dueAt,
            },
          });
          await tx.payment.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { academyStatementId: st.id },
          });
          return st;
        });
        emitted += 1;
        await this.chargeOwner(statement.id, actor);
      } catch (e) {
        // @@unique(academyId, period): statement ya emitido por otro
        // run/instancia - las órdenes quedan libres para su statement.
        skipped += 1;
        this.logger.warn(
          `emit statement ${academyId}/${period}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return { emitted, skipped };
  }

  /**
   * Cobra el statement sobre el medio registrado del owner
   * (PLATFORM_CHARGE). El vínculo paymentId queda aunque el outcome sea
   * PENDING (link) - el webhook/polling lo salda y el reconcile libera.
   */
  private async chargeOwner(statementId: string, actor: string) {
    const st = await this.prisma.academyCollectionsStatement.findUnique({
      where: { id: statementId },
      include: { academy: { select: { ownerId: true, name: true } } },
    });
    if (!st || st.paymentId) return;
    try {
      const res = await this.charges.collect({
        personId: st.academy.ownerId,
        amount: st.totalClp,
        subject: `Cobranza automatizada ${st.period} - ${st.academy.name}`,
        actor,
        currency: st.currency,
      });
      await this.prisma.academyCollectionsStatement.update({
        where: { id: st.id },
        data: { paymentId: res.paymentId },
      });
      await this.notifications.notifySafe(st.academy.ownerId, {
        category: "TRANSACTIONAL",
        type: "academy.collections_statement",
        title: "Liquidación de cobranza emitida",
        body: `${st.academy.name} · período ${st.period} · neto $${st.takeNetClp.toLocaleString("es-CL")} + IVA`,
        data: { statementId: st.id, period: st.period, totalClp: st.totalClp },
      });
    } catch (e) {
      // Sin medio de cobro registrado: el statement queda PENDING sin
      // payment - el reconcile lo vuelve a intentar en el próximo run
      // hasta que venza la gracia y bloquee la cobranza BYO.
      this.logger.warn(
        `collect statement ${st.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * Reconcile diario: PAID de statements saldados, liberación de
   * bloqueos sin deuda vencida y bloqueo por statements vencidos.
   */
  async reconcile(actor = "cron"): Promise<{
    paid: number;
    blocked: number;
    released: number;
    recollect: number;
  }> {
    const out = { paid: 0, blocked: 0, released: 0, recollect: 0 };
    const now = new Date();
    const pending = await this.prisma.academyCollectionsStatement.findMany({
      where: { status: "PENDING" },
      include: { payment: { select: { id: true, status: true } } },
    });
    const overdueAcademies = new Set<string>();
    for (const st of pending) {
      if (st.payment?.status === "PAID") {
        await this.prisma.academyCollectionsStatement.update({
          where: { id: st.id },
          data: { status: "PAID", paidAt: now },
        });
        out.paid += 1;
        continue;
      }
      if (st.dueAt <= now) {
        overdueAcademies.add(st.academyId);
        continue;
      }
      // PENDING sin payment (collect falló al emitir): reintenta una
      // vez por run mientras siga en gracia.
      if (!st.paymentId) {
        await this.chargeOwner(st.id, actor);
        out.recollect += 1;
      }
    }
    for (const academyId of overdueAcademies) {
      const updated = await this.prisma.academy.updateMany({
        where: { id: academyId, collectionsBlockedAt: null },
        data: { collectionsBlockedAt: now },
      });
      if (updated.count > 0) {
        out.blocked += 1;
        const academy = await this.prisma.academy.findUnique({
          where: { id: academyId },
          select: { ownerId: true, name: true },
        });
        if (academy) {
          await this.notifications.notifySafe(academy.ownerId, {
            category: "OPERATIONAL",
            type: "academy.collections_blocked",
            title: "Cobranza online en pausa",
            body: `${academy.name}: liquidación de take vencida - tus alumnos solo pueden pagar por comprobante hasta regularizar`,
            data: { academyId },
          });
        }
      }
    }
    // Liberación: academia bloqueada sin statements vencidos impagos.
    const blocked = await this.prisma.academy.findMany({
      where: { collectionsBlockedAt: { not: null } },
      select: { id: true },
    });
    for (const b of blocked) {
      if (overdueAcademies.has(b.id)) continue;
      const stillOverdue = await this.prisma.academyCollectionsStatement.count(
        {
          where: { academyId: b.id, status: "PENDING", dueAt: { lte: now } },
        },
      );
      if (stillOverdue === 0) {
        await this.prisma.academy.update({
          where: { id: b.id },
          data: { collectionsBlockedAt: null },
        });
        out.released += 1;
      }
    }
    return out;
  }

  /**
   * Hook del settle PLATFORM_CHARGE (spec academy-byo-collections): un
   * cobro PAID que salda un statement lo marca PAID al vuelo - el
   * desbloqueo real lo hace reconcile (puede haber otras vencidas).
   * Best-effort fuera de la tx del settle.
   */
  async onPlatformChargePaid(paymentId: string): Promise<void> {
    try {
      const st = await this.prisma.academyCollectionsStatement.findFirst({
        where: { paymentId, status: "PENDING" },
      });
      if (!st) return;
      await this.prisma.academyCollectionsStatement.update({
        where: { id: st.id },
        data: { status: "PAID", paidAt: new Date() },
      });
      // Libera al vuelo si no quedan statements vencidos impagos.
      const overdue = await this.prisma.academyCollectionsStatement.count({
        where: {
          academyId: st.academyId,
          status: "PENDING",
          dueAt: { lte: new Date() },
        },
      });
      if (overdue === 0) {
        await this.prisma.academy.updateMany({
          where: { id: st.academyId, collectionsBlockedAt: { not: null } },
          data: { collectionsBlockedAt: null },
        });
      }
    } catch {
      /* observador - el reconcile lo resuelve en el próximo barrido */
    }
  }

  // ─── Consultas para consola / admin ─────────────────────────────────

  async listForAcademy(academyId: string) {
    return this.prisma.academyCollectionsStatement.findMany({
      where: { academyId },
      orderBy: { period: "desc" },
      take: 24,
      include: { payment: { select: { id: true, status: true } } },
    });
  }

  /** Statement del período + sus órdenes (estado de cuenta detallado). */
  async getStatement(academyId: string, period: string) {
    const st = await this.prisma.academyCollectionsStatement.findUnique({
      where: { academyId_period: { academyId, period } },
      include: { payment: { select: { id: true, status: true } } },
    });
    if (!st) throw new NotFoundException("liquidación no encontrada");
    const ops = await this.prisma.payment.findMany({
      where: { academyStatementId: st.id },
      orderBy: { createdAt: "asc" },
      take: PAGE,
    });
    return { ...st, operations: ops.map(this.opRow) };
  }

  /**
   * Vista previa del período en curso (aún no emitido): devengado BYO
   * sin facturar - la consola lo muestra como "en curso".
   */
  async previewOpen(academyId: string) {
    const periodStart = clMonthStart(new Date());
    const payments = await this.academyByoPayments(academyId, periodStart, new Date());
    const net = payments.reduce((a, p) => a + (p.academyTakeClp ?? 0), 0);
    const ivaPct = await this.params.getNumber("tax.iva_pct", 19);
    const vat = Math.round((net * ivaPct) / 100);
    return {
      period: periodStart.toISOString().slice(0, 7),
      orderCount: payments.length,
      grossClp: payments.reduce((a, p) => a + p.amount, 0),
      takeNetClp: net,
      takeVatClp: vat,
      totalClp: net + vat,
      operations: payments.map(this.opRow),
    };
  }

  /** Órdenes BYO PAID de la academia en el rango (con take). */
  private async academyByoPayments(
    academyId: string,
    from: Date,
    to: Date,
  ) {
    const [plans, classes] = await Promise.all([
      this.prisma.membershipPlan.findMany({
        where: { academyId },
        select: { id: true },
      }),
      this.prisma.class.findMany({
        where: { slot: { academyId } },
        select: { id: true },
      }),
    ]);
    const or: Prisma.PaymentWhereInput[] = [
      ...plans.map((p) => ({ refId: { startsWith: `mem_${p.id}_` } })),
      ...classes.map((c) => ({ refId: { startsWith: `wks_${c.id}_` } })),
      { refId: { startsWith: `pvt_${academyId}_` } },
    ];
    if (!or.length) return [];
    return this.prisma.payment.findMany({
      where: {
        orderType: { in: [...ACADEMY_ORDER_TYPES] },
        status: "PAID",
        gatewayAccountId: { not: null },
        academyTakeClp: { not: null },
        createdAt: { gte: from, lte: to },
        OR: or,
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  }

  private opRow = (p: Payment) => ({
    id: p.id,
    refId: p.refId,
    orderType: p.orderType,
    amount: p.amount,
    takeClp: p.academyTakeClp,
    takeRate: p.academyTakeRate,
    currency: p.currency,
    gateway: p.gateway,
    paidAt: p.gatewayPaidAt ?? p.createdAt,
  });

  /** Listado cross-academy para /admin/finanzas. */
  async listAdmin(opts?: { academyId?: string; status?: string }) {
    return this.prisma.academyCollectionsStatement.findMany({
      where: {
        ...(opts?.academyId ? { academyId: opts.academyId } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        academy: { select: { id: true, name: true, collectionsBlockedAt: true } },
        payment: { select: { id: true, status: true } },
      },
    });
  }

  /** Emisión manual del período (admin / reproducción del cierre). */
  async emitClosedMonth(actor: string) {
    const { period, periodStart, periodEnd } =
      AcademyCollectionsService.closedMonth();
    return this.emitForPeriod(period, periodStart, periodEnd, actor);
  }
}
