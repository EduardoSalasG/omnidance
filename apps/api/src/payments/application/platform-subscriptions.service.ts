import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  Academy,
  AcademyTier,
  BillingCycle,
  PlatformSubscription,
  PlatformSubKind,
  Prisma,
  ProducerProTier,
} from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { emitPaymentEvent } from "../domain/payment-ledger";
import {
  decodeSeriesPassRef,
  encodePlatformSubRef,
} from "../domain/order-ref";
import {
  ACADEMY_TIER_RANK,
  ACADEMY_TIERS,
  CYCLE_LABEL,
  CYCLE_MONTHS,
  platformPlanId,
  PRODUCER_PRO_TIERS,
  PRODUCER_TIER_RANK,
  producerTierParamKey,
  SELF_SERVE_ACADEMY_TIERS,
  SELF_SERVE_PRODUCER_TIERS,
} from "../domain/platform-tiers";
import {
  isFlowInvoicePaid,
  PAYMENT_GATEWAY,
  type FlowSubscription,
  type PaymentGateway,
  type SubscriptionProvider,
} from "../domain/ports";
import { PaymentSettlementService } from "./payment-settlement.service";
import { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";
import { ensureFlowCustomer } from "./flow-customer";
import {
  PENDING_CARD_TTL_MS,
  REMINDER_WINDOW_MS,
} from "./subscriptions.service";

// Estados "vivos" de una PlatformSubscription — mismo ciclo de vida que
// MembershipSubscription (PENDING_CARD → ACTIVATING → ACTIVE →
// CANCEL_PENDING → CANCELED).
const LIVE_STATUSES = [
  "ACTIVE",
  "CANCEL_PENDING",
  "PENDING_CARD",
  "ACTIVATING",
] as const;

// Precio mensual-equivalente por defecto si el param no existe (mismos
// valores que el seed — getNumber recibe fallback, nunca hardcode en la
// respuesta).
const ACADEMY_MAX_FALLBACK = Number.MAX_SAFE_INTEGER;

/** Plan Flow + cargo por ciclo resueltos desde PlatformParam. */
interface ChargeSpec {
  planId: string;
  name: string;
  /** Monto del cargo por ciclo = mensual-equivalente × meses del ciclo. */
  amount: number;
  intervalCount: number;
}

export type PlatformSubscribeResult =
  | { kind: "needs_card"; paymentUrl: string; subscriptionId: string }
  | { kind: "subscribed"; subscriptionId: string };

export type PlatformCustomerReturn =
  | {
      ok: true;
      kind: PlatformSubKind;
      academyId: string | null;
      producerId: string | null;
    }
  | { ok: false };

/**
 * Suscripciones DE la plataforma (spec academy-saas-billing): la academia
 * paga su tier SaaS y el productor paga Producer Pro. Replica el ciclo de
 * `SubscriptionsService` (membresías de alumnos) sobre el modelo
 * `PlatformSubscription` — mismo motor Flow (customer + plan espejo +
 * subscription/create), mismo claim anti-doble-cobro, mismo reconcile de
 * invoices y misma dedup de mora/reminder.
 *
 * Diferencias deliberadas respecto a membresías:
 * - El plan espejo es compartido por (kind, tier, ciclo):
 *   `plat_academy_<tier>_<cycle>` / `plat_producer_<tier>_<cycle>` —
 *   los tiers son catálogo de plataforma (params), no planes por academia.
 * - El monto del cargo = precio mensual-equivalente del param × meses del
 *   ciclo (semestral −2% / anual −4% ya vienen en `academy_tier.*_clp`).
 * - El Payment de cada invoice usa `orderType PLATFORM_SUB` y refId
 *   `platsub_<subId>_<invoiceId>`; el settle vive en
 *   `PaymentSettlementService.settlePlatformSub` (desbloquea la academia
 *   / restaura proTier — los pagos son INGRESO de la plataforma, no
 *   devengo del actor, por eso no entran a payouts).
 * - El retorno del disclaimer de tarjeta usa un endpoint propio
 *   (`/api/payments/flow/platform-customer-return`): el token de Flow se
 *   consume una sola vez, así que cada dominio resuelve sus pendientes en
 *   su propio callback sin ambigüedad.
 * - Upgrade de tier = swap inmediato (cancel remota inmediata + create en
 *   el plan nuevo — cobra el ciclo completo nuevo; prorateo manual v1).
 *   Downgrade/cambio de ciclo = `pendingTierCode`/`pendingBillingCycle` +
 *   cancel remota a fin de período; el reconcile recrea la sub en el plan
 *   pendiente cuando Flow la reporta cancelada (status 4).
 */
@Injectable()
export class PlatformSubscriptionsService {
  private readonly logger = new Logger(PlatformSubscriptionsService.name);
  private readonly apiUrl = process.env.API_URL ?? "http://localhost:4000";

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly params: ParamsService,
    private readonly settlement: PaymentSettlementService,
    private readonly notifications: NotificationsService,
    private readonly gatewayTx: GatewayTransactionsService,
  ) {}

  /** Capability check por presencia de métodos (hexagonal, como membership). */
  private supportsSubscriptions(): boolean {
    return (
      typeof (this.gateway as Partial<SubscriptionProvider>)
        .createSubscription === "function"
    );
  }

  private provider(): SubscriptionProvider {
    if (!this.supportsSubscriptions()) {
      throw new BadRequestException(
        "este gateway no soporta suscripciones",
      );
    }
    return this.gateway as unknown as SubscriptionProvider;
  }

  // ─── Catálogo (params) ────────────────────────────────────────────

  /** Alumnos activos de la academia (misma definición que el CRM). */
  private async countActiveStudents(academyId: string): Promise<number> {
    return this.prisma.enrollment.count({
      where: {
        academyId,
        status: { in: ["ACTIVE", "TRIAL", "ONLINE"] },
      },
    });
  }

  private async academyMaxStudents(tier: string): Promise<number> {
    return this.params.getNumber(
      `academy_tier.${tier.toLowerCase()}_max_students`,
      ACADEMY_MAX_FALLBACK,
    );
  }

  /**
   * Media de ventas brutas del productor en los últimos 90 días
   * (TICKET con eventId propio + SERIES_PASS de sus series — la misma
   * definición de devengo que usan los payouts) ÷ 3 = mensual.
   */
  async producerMonthlyGross(producerId: string): Promise<number> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60_000);
    const [events, series] = await Promise.all([
      this.prisma.event.findMany({
        where: { producerId },
        select: { id: true },
      }),
      this.prisma.eventSeries.findMany({
        where: { producerId },
        select: { id: true },
      }),
    ]);
    const eventIds = new Set(events.map((e) => e.id));
    const seriesIds = new Set(series.map((s) => s.id));
    const payments = await this.prisma.payment.findMany({
      where: {
        status: "PAID",
        orderType: { in: ["TICKET", "SERIES_PASS"] },
        createdAt: { gte: since },
      },
      select: { orderType: true, eventId: true, refId: true, amount: true },
    });
    let gross = 0;
    for (const p of payments) {
      const belongs =
        p.orderType === "TICKET"
          ? p.eventId != null && eventIds.has(p.eventId)
          : seriesIds.has(decodeSeriesPassRef(p.refId)?.seriesId ?? "");
      if (belongs) gross += p.amount;
    }
    return Math.round(gross / 3);
  }

  /** Tier Pro que califica una facturación mensual (null = PRO_BIG manual). */
  private async producerTierForGross(
    monthlyGross: number,
  ): Promise<ProducerProTier | null> {
    const [starterMax, growthMax] = await Promise.all([
      this.params.getNumber("producer_tier.starter_max_monthly_clp", 2500000),
      this.params.getNumber("producer_tier.growth_max_monthly_clp", 8000000),
    ]);
    if (monthlyGross <= starterMax) return "PRO_STARTER";
    if (monthlyGross <= growthMax) return "PRO_GROWTH";
    return null;
  }

  /**
   * Resuelve el plan Flow + monto del cargo para (kind, tier, ciclo) desde
   * PlatformParam. Lanza 400 si el tier no tiene precio autogestionado.
   */
  private async chargeSpec(
    kind: PlatformSubKind,
    tierCode: string,
    cycle: BillingCycle,
  ): Promise<ChargeSpec> {
    const months = CYCLE_MONTHS[cycle];
    let monthly = 0;
    let label: string;
    if (kind === "ACADEMY") {
      monthly = await this.params.getNumber(
        `academy_tier.${tierCode.toLowerCase()}_${cycle.toLowerCase()}_clp`,
        0,
      );
      label = `OmniDance Academia ${tierCode} (${CYCLE_LABEL[cycle]})`;
    } else {
      const key = producerTierParamKey(tierCode);
      if (key) {
        monthly = await this.params.getNumber(
          `producer_tier.${key}_${cycle.toLowerCase()}_clp`,
          0,
        );
      }
      label = `OmniDance Producer Pro ${tierCode} (${CYCLE_LABEL[cycle]})`;
    }
    if (monthly <= 0) {
      throw new BadRequestException(
        `el tier ${tierCode} no tiene precio autogestionado — contratación manual`,
      );
    }
    return {
      planId: platformPlanId(kind, tierCode, cycle),
      name: label,
      amount: monthly * months,
      intervalCount: months,
    };
  }

  // ─── Contratación ─────────────────────────────────────────────────

  /**
   * `POST /academies/:id/subscribe` — el owner contrata tier + ciclo.
   * Verifica el límite de alumnos activos ANTES de crear nada (400
   * `tier_limit` con copy honesto), serializa la elección de la fila
   * PENDING_CARD con advisory lock por persona (mismo invariante que
   * membresías: el retorno del disclaimer resuelve la pendiente más
   * reciente del pagador — no puede haber dos vivas) y deriva al flujo de
   * tarjeta de Flow o al `subscription/create` directo.
   */
  async subscribeAcademy(
    personId: string,
    academy: Academy,
    input: { tier: string; cycle: BillingCycle; acceptRecurring?: boolean },
  ): Promise<PlatformSubscribeResult> {
    if (input.acceptRecurring !== true) {
      throw new BadRequestException("debes aceptar el cobro recurrente");
    }
    if (!SELF_SERVE_ACADEMY_TIERS.has(input.tier)) {
      throw new BadRequestException(
        "el tier ENTERPRISE es de contratación manual — contacta a ventas",
      );
    }
    const [activeStudents, max] = await Promise.all([
      this.countActiveStudents(academy.id),
      this.academyMaxStudents(input.tier),
    ]);
    if (activeStudents > max) {
      throw new BadRequestException({
        error: "tier_limit",
        message: `Tu academia tiene ${activeStudents} alumnos activos y el plan ${input.tier} permite hasta ${max} — depura alumnos o elige un tier mayor`,
        active: activeStudents,
        max,
        tier: input.tier,
      });
    }
    const charge = await this.chargeSpec("ACADEMY", input.tier, input.cycle);
    this.provider(); // fail-fast si el gateway no tiene motor de subs
    const sub = await this.prisma.$transaction((tx) =>
      this.pickOrCreatePendingSub(tx, personId, {
        kind: "ACADEMY",
        academyId: academy.id,
        tierCode: input.tier,
        billingCycle: input.cycle,
      }),
    );
    return this.runSubscribeFlow(sub, charge, randomUUID(), academy.name);
  }

  /**
   * `POST /producers/:id/pro/subscribe` — el productor contrata Pro; el
   * tier se calcula por su facturación (media bruta de 90d ÷ 3) contra
   * `producer_tier.*_max_monthly_clp`. Sobre el tope GROWTH → 400
   * `tier_limit` (PRO_BIG es "a convenir").
   */
  async subscribeProducer(
    personId: string,
    input: { cycle: BillingCycle; acceptRecurring?: boolean },
  ): Promise<PlatformSubscribeResult> {
    if (input.acceptRecurring !== true) {
      throw new BadRequestException("debes aceptar el cobro recurrente");
    }
    const monthlyGross = await this.producerMonthlyGross(personId);
    const tier = await this.producerTierForGross(monthlyGross);
    if (!tier || !SELF_SERVE_PRODUCER_TIERS.has(tier)) {
      const max = await this.params.getNumber(
        "producer_tier.growth_max_monthly_clp",
        8000000,
      );
      throw new BadRequestException({
        error: "tier_limit",
        message:
          "tu facturación supera el máximo autogestionado — contacta a ventas (PRO_BIG)",
        monthlyGross,
        max,
      });
    }
    const charge = await this.chargeSpec("PRODUCER", tier, input.cycle);
    this.provider();
    const sub = await this.prisma.$transaction((tx) =>
      this.pickOrCreatePendingSub(tx, personId, {
        kind: "PRODUCER",
        producerId: personId,
        tierCode: tier,
        billingCycle: input.cycle,
      }),
    );
    return this.runSubscribeFlow(sub, charge, randomUUID(), "Producer Pro");
  }

  /**
   * Elección/creación de la fila PENDING_CARD bajo advisory lock
   * `platsub:<personId>` (espejo de `sub:<personId>` de membresías):
   * - reutiliza la PENDING_CARD fresca del MISMO scope (academia o
   *   productor) — actualiza tier/ciclo si el retry pidió otro plan;
   * - 409 si ya hay una sub ACTIVE/CANCEL_PENDING de ese scope (el cambio
   *   va por PATCH);
   * - cancela las PENDING_CARD vencidas y las de otros scopes del mismo
   *   pagador, y la ACTIVATING expirada del scope (crash del intento).
   * Todo cancel es condicional por status esperado — si la fila se movió
   * entremedio (customer-return la claimeó) se aborta con 409.
   */
  private async pickOrCreatePendingSub(
    tx: Prisma.TransactionClient,
    personId: string,
    create: {
      kind: PlatformSubKind;
      academyId?: string;
      producerId?: string;
      tierCode: string;
      billingCycle: BillingCycle;
    },
  ): Promise<PlatformSubscription> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platsub:${personId}`}))`;
    const live = await tx.platformSubscription.findMany({
      where: { personId, status: { in: [...LIVE_STATUSES] } },
      orderBy: { createdAt: "desc" },
    });
    const sameScope = live.find((s) =>
      create.kind === "ACADEMY"
        ? s.academyId === create.academyId
        : s.producerId === create.producerId,
    );
    const fresh =
      sameScope != null &&
      Date.now() - sameScope.createdAt.getTime() < PENDING_CARD_TTL_MS;
    const reuse =
      sameScope?.status === "PENDING_CARD" && fresh ? sameScope : null;
    if (sameScope && !reuse) {
      const replaceable =
        sameScope.status === "PENDING_CARD" ||
        sameScope.status === "ACTIVATING";
      if (!replaceable || fresh) {
        throw new ConflictException(
          "ya existe una suscripción activa — gestiona el cambio con PATCH /subscription",
        );
      }
    }
    const now = new Date();
    for (const s of live) {
      if (s.status !== "PENDING_CARD" || s.id === reuse?.id) continue;
      const canceled = await tx.platformSubscription.updateMany({
        where: { id: s.id, status: "PENDING_CARD" },
        data: { status: "CANCELED", canceledAt: now },
      });
      if (canceled.count === 0) {
        throw new ConflictException(
          "la suscripción está siendo procesada — reintenta en unos segundos",
        );
      }
    }
    if (sameScope?.status === "ACTIVATING") {
      const canceled = await tx.platformSubscription.updateMany({
        where: { id: sameScope.id, status: "ACTIVATING" },
        data: { status: "CANCELED", canceledAt: now },
      });
      if (canceled.count === 0) {
        throw new ConflictException(
          "la suscripción está siendo procesada — reintenta en unos segundos",
        );
      }
    }
    if (reuse) {
      if (
        reuse.tierCode !== create.tierCode ||
        reuse.billingCycle !== create.billingCycle
      ) {
        return tx.platformSubscription.update({
          where: { id: reuse.id },
          data: {
            tierCode: create.tierCode,
            billingCycle: create.billingCycle,
          },
        });
      }
      return reuse;
    }
    return tx.platformSubscription.create({
      data: {
        kind: create.kind,
        academyId: create.academyId ?? null,
        producerId: create.producerId ?? null,
        personId,
        tierCode: create.tierCode,
        billingCycle: create.billingCycle,
      },
    });
  }

  /**
   * Tramo común post-fila: plan espejo (ensurePlan) + customer lazy +
   * decisión por tarjeta. Sin tarjeta → needs_card con la URL del
   * disclaimer (retorna por `platform-customer-return`); con tarjeta →
   * claim PENDING_CARD→ACTIVATING + subscription/create + reconcile del
   * primer invoice (Flow cobra el período al crear).
   */
  private async runSubscribeFlow(
    sub: PlatformSubscription,
    charge: ChargeSpec,
    correlationId: string,
    scopeName: string,
  ): Promise<PlatformSubscribeResult> {
    const provider = this.provider();
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
      },
      { correlationId },
    );
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      sub.personId,
      { correlationId },
    );
    const customer = await provider.getCustomer(customerId, { correlationId });
    if (!customer.creditCardType) {
      const { registerUrl } = await provider.registerCustomerCard(
        {
          customerId,
          returnUrl: `${this.apiUrl}/api/payments/flow/platform-customer-return`,
        },
        { correlationId },
      );
      return {
        kind: "needs_card",
        paymentUrl: registerUrl,
        subscriptionId: sub.id,
      };
    }

    // Claim atómico PENDING_CARD → ACTIVATING (misma regla que
    // membresías): cubre la carrera contra platform-customer-return.
    const claimed = await this.prisma.platformSubscription.updateMany({
      where: { id: sub.id, status: "PENDING_CARD" },
      data: { status: "ACTIVATING" },
    });
    if (claimed.count === 0) {
      const cur = await this.prisma.platformSubscription.findUnique({
        where: { id: sub.id },
        select: { status: true },
      });
      if (cur?.status === "ACTIVE") {
        return { kind: "subscribed", subscriptionId: sub.id };
      }
      throw new ConflictException(
        cur?.status === "CANCELED"
          ? "la suscripción fue cancelada — vuelve a intentarlo"
          : "la suscripción está siendo procesada — reintenta en unos segundos",
      );
    }

    const { active, fs } = await this.createFlowSubscription(sub.id, {
      flowPlanId: charge.planId,
      customerId,
      correlationId,
    });
    try {
      await this.reconcileSubscription(active, fs, "system");
    } catch (e) {
      this.logger.error(
        `reconcile post-subscribe platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (active.status === "ACTIVE") {
      await this.applyEntitlement(active);
      await this.notifyStarted(active, scopeName);
    }
    return { kind: "subscribed", subscriptionId: sub.id };
  }

  /**
   * subscription/create de Flow sobre una platsub claimeada (ACTIVATING)
   * + persistencia del resultado — mismo contrato que el de membresías:
   * reversa del claim si Flow falla, persistencia temprana del id remoto,
   * coerción defensiva de status (string "4"), compensación de la remota
   * huérfana (cancel inmediato) si la transición local no aplica.
   */
  private async createFlowSubscription(
    subId: string,
    p: { flowPlanId: string; customerId: string; correlationId: string },
  ): Promise<{ active: PlatformSubscription; fs: FlowSubscription }> {
    const provider = this.provider();
    let fs: FlowSubscription;
    try {
      fs = await provider.createSubscription(
        {
          planId: p.flowPlanId,
          customerId: p.customerId,
          subscriptionStart: new Date().toISOString().slice(0, 10),
        },
        { correlationId: p.correlationId },
      );
    } catch (e) {
      // Reversa del claim ACTIVATING → la fila queda PENDING_CARD para
      // que el retry (nuevo subscribe o customer-return) la retome.
      await this.prisma.platformSubscription
        .updateMany({
          where: { id: subId, status: "ACTIVATING" },
          data: { status: "PENDING_CARD" },
        })
        .catch(() => {});
      throw e;
    }

    // Persistencia temprana del id remoto (mismo motivo que membresías:
    // el sweep de huérfanas la rastrea aunque muera el proceso acá).
    await this.prisma.platformSubscription
      .update({
        where: { id: subId },
        data: { flowSubscriptionId: fs.subscriptionId },
      })
      .catch(() => {});

    const remoteStatus = fs.status == null ? null : Number(fs.status);
    if (remoteStatus != null && remoteStatus !== 1 && remoteStatus !== 4) {
      this.logger.warn(
        `subscription/create platsub ${subId}: status remoto inesperado ${String(fs.status)} — queda ACTIVE y el reconcile corrige`,
      );
    }
    const nextStatus = remoteStatus === 4 ? "CANCELED" : "ACTIVE";
    const transition = await this.prisma.platformSubscription
      .updateMany({
        where: { id: subId, status: "ACTIVATING" },
        data: {
          flowSubscriptionId: fs.subscriptionId,
          status: nextStatus,
          nextInvoiceAt: fs.next_invoice_date
            ? new Date(fs.next_invoice_date)
            : null,
          ...(nextStatus === "CANCELED" ? { canceledAt: new Date() } : {}),
        },
      })
      .catch(() => ({ count: 0 }));
    if (transition.count === 0) {
      // La fila se movió entremedio (cancel concurrente, crash+retry) o
      // el update falló: la sub Flow quedó huérfana → cancel inmediata.
      await provider
        .cancelSubscription(fs.subscriptionId, {
          correlationId: p.correlationId,
          immediate: true,
        })
        .catch((ce) =>
          this.logger.error(
            `compensación cancel Flow sub ${fs.subscriptionId} (platsub ${subId}): ${ce instanceof Error ? ce.message : ce}`,
          ),
        );
      throw new ConflictException(
        "la suscripción cambió de estado durante la activación",
      );
    }
    const active =
      await this.prisma.platformSubscription.findUniqueOrThrow({
        where: { id: subId },
      });
    return { active, fs };
  }

  /**
   * Retorno del disclaimer de tarjeta para subs de plataforma —
   * `POST /api/payments/flow/platform-customer-return` (Flow POSTea el
   * browser con {token}). Endpoint propio porque el token de
   * getRegisterStatus se consume una vez: cada dominio resuelve sus
   * pendientes en su callback. Reanuda la PENDING_CARD más reciente del
   * pagador → ACTIVATING → subscription/create → ACTIVE.
   */
  async customerReturn(token: string): Promise<PlatformCustomerReturn> {
    const correlationId = randomUUID();
    await this.gatewayTx.record({
      provider: this.gateway.name,
      direction: "INBOUND_WEBHOOK",
      endpoint: "platform-customer/register-return",
      correlationId,
      requestBody: { token },
      ok: true,
    });
    const provider = this.provider();
    const reg = await provider.getRegisterStatus(token, { correlationId });
    if (reg.status !== 1 || !reg.customerId) {
      return { ok: false };
    }
    const person = await this.prisma.person.findFirst({
      where: { flowCustomerId: reg.customerId },
      select: { id: true },
    });
    if (!person) return { ok: false };
    const sub = await this.prisma.platformSubscription.findFirst({
      where: { personId: person.id, status: "PENDING_CARD" },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) return { ok: false };

    const claimed = await this.prisma.platformSubscription.updateMany({
      where: { id: sub.id, status: "PENDING_CARD" },
      data: { status: "ACTIVATING" },
    });
    if (claimed.count === 0) {
      const cur = await this.prisma.platformSubscription.findUnique({
        where: { id: sub.id },
        select: { status: true },
      });
      return cur?.status === "ACTIVE"
        ? {
            ok: true,
            kind: sub.kind,
            academyId: sub.academyId,
            producerId: sub.producerId,
          }
        : { ok: false };
    }

    // El plan espejo se deriva de tier/ciclo (compartido por el tier) —
    // ensurePlan es idempotente por si aún no existe.
    const charge = await this.chargeSpec(
      sub.kind,
      sub.tierCode,
      sub.billingCycle,
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
      },
      { correlationId },
    );
    const { active, fs } = await this.createFlowSubscription(sub.id, {
      flowPlanId: charge.planId,
      customerId: reg.customerId,
      correlationId,
    });
    try {
      await this.reconcileSubscription(active, fs, "system");
    } catch (e) {
      this.logger.error(
        `reconcile post-platform-return platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (active.status === "ACTIVE") {
      await this.applyEntitlement(active);
      await this.notifyStarted(
        active,
        sub.kind === "ACADEMY" ? "academia" : "Producer Pro",
      );
    }
    return {
      ok: true,
      kind: sub.kind,
      academyId: sub.academyId,
      producerId: sub.producerId,
    };
  }

  // ─── Cambio de plan ───────────────────────────────────────────────

  /**
   * `PATCH /academies/:id/subscription` — cambio de tier y/o ciclo.
   * - PENDING_CARD: edita la fila directo (aún no hay cargo).
   * - Upgrade de tier (rank mayor): inmediato — cancel remota inmediata +
   *   subscription/create en el plan nuevo (cobra el ciclo completo;
   *   prorateo manual v1 según design).
   * - Downgrade o cambio de ciclo: persiste `pendingTierCode`/
   *   `pendingBillingCycle` y cancela la remota a fin de período — el
   *   reconcile la recrea en el plan pendiente cuando Flow la reporta
   *   cancelada (cobra el nuevo plan desde el próximo ciclo).
   * - PATCH de vuelta al plan vigente con un cambio pendiente: el pending
   *   queda = actual → el swap recrea el mismo plan al fin de ciclo
   *   (la cancel remota a fin de período no se puede deshacer).
   */
  async updateAcademySubscription(
    personId: string,
    academy: Academy,
    input: { tier?: string; cycle?: BillingCycle },
  ): Promise<PlatformSubscription> {
    const sub = await this.prisma.platformSubscription.findFirst({
      where: {
        academyId: academy.id,
        kind: "ACADEMY",
        status: { in: [...LIVE_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) {
      throw new NotFoundException(
        "la academia no tiene suscripción — usa POST /subscribe",
      );
    }
    if (input.tier === undefined && input.cycle === undefined) {
      throw new BadRequestException("envía tier y/o cycle");
    }
    const targetTier = input.tier ?? sub.tierCode;
    const targetCycle = input.cycle ?? sub.billingCycle;
    if (!SELF_SERVE_ACADEMY_TIERS.has(targetTier)) {
      throw new BadRequestException(
        "el tier ENTERPRISE es de contratación manual — contacta a ventas",
      );
    }
    // Spec: la verificación del límite aplica al suscribir y al bajar de
    // tier — se valida SIEMPRE el tier destino (en un upgrade nunca
    // rechaza porque el máximo solo sube).
    const [activeStudents, max] = await Promise.all([
      this.countActiveStudents(academy.id),
      this.academyMaxStudents(targetTier),
    ]);
    if (activeStudents > max) {
      throw new BadRequestException({
        error: "tier_limit",
        message: `Tu academia tiene ${activeStudents} alumnos activos y el plan ${targetTier} permite hasta ${max}`,
        active: activeStudents,
        max,
        tier: targetTier,
      });
    }

    if (sub.status === "PENDING_CARD") {
      return this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { tierCode: targetTier, billingCycle: targetCycle },
      });
    }
    if (sub.status === "ACTIVATING") {
      throw new ConflictException(
        "la suscripción está siendo procesada — reintenta en unos segundos",
      );
    }

    const isUpgrade =
      (ACADEMY_TIER_RANK[targetTier as AcademyTier] ?? -1) >
      (ACADEMY_TIER_RANK[sub.tierCode as AcademyTier] ?? -1);
    if (isUpgrade) {
      return this.swapPlanNow(sub, targetTier, targetCycle, academy.name);
    }
    const samePlan =
      targetTier === sub.tierCode && targetCycle === sub.billingCycle;
    if (samePlan && !sub.pendingTierCode) {
      return sub; // no-op: mismo plan vigente y nada pendiente
    }
    // Downgrade / cambio de ciclo — o PATCH de vuelta al plan vigente
    // con un cambio pendiente: el pending queda = actual (la cancel
    // remota a fin de período ya no se puede deshacer; el swap recrea
    // el mismo plan al fin del ciclo → continuidad del cobro).
    return this.schedulePlanChange(sub, targetTier, targetCycle);
  }

  /**
   * Upgrade inmediato: crea la sub Flow nueva (cobra ya), cancela la
   * remota anterior de inmediato y conmuta la fila local. La transición
   * es condicional por el status leído al entrar — si la fila se movió
   * entremedio, la remota nueva se compensa con cancel inmediata.
   */
  private async swapPlanNow(
    sub: PlatformSubscription,
    targetTier: string,
    targetCycle: BillingCycle,
    scopeName: string,
  ): Promise<PlatformSubscription> {
    const provider = this.provider();
    const correlationId = randomUUID();
    const charge = await this.chargeSpec(sub.kind, targetTier, targetCycle);
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
      },
      { correlationId },
    );
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      sub.personId,
      { correlationId },
    );
    // Crear ANTES de cancelar la vieja: si el create falla la sub actual
    // sigue intacta y cobrando (nada cambió). El remote viejo se captura
    // antes del persist temprano — escribir la fila no debe pisar el id
    // que aún hay que cancelar.
    const oldRemoteId = sub.flowSubscriptionId;
    const fs = await provider.createSubscription(
      {
        planId: charge.planId,
        customerId,
        subscriptionStart: new Date().toISOString().slice(0, 10),
      },
      { correlationId },
    );
    // Persistencia temprana del id remoto — si muere el proceso, el sweep
    // la encuentra en la auditoría de subscription/create.
    await this.prisma.platformSubscription
      .update({
        where: { id: sub.id },
        data: { flowSubscriptionId: fs.subscriptionId },
      })
      .catch(() => {});
    if (oldRemoteId) {
      try {
        await provider.cancelSubscription(oldRemoteId, {
          correlationId,
          immediate: true,
        });
      } catch (e) {
        // La nueva ya cobró — no puede quedar huérfana cobrando en
        // paralelo: compensación best-effort, restaurar el puntero al
        // remote viejo (su cancelación falló → sigue vivo) y propagar.
        await provider
          .cancelSubscription(fs.subscriptionId, {
            correlationId,
            immediate: true,
          })
          .catch(() => {});
        await this.prisma.platformSubscription
          .update({
            where: { id: sub.id },
            data: { flowSubscriptionId: oldRemoteId },
          })
          .catch(() => {});
        throw e;
      }
    }
    const remoteStatus = fs.status == null ? null : Number(fs.status);
    const nextStatus = remoteStatus === 4 ? "CANCELED" : "ACTIVE";
    const transition = await this.prisma.platformSubscription
      .updateMany({
        where: { id: sub.id, status: sub.status },
        data: {
          tierCode: targetTier,
          billingCycle: targetCycle,
          flowSubscriptionId: fs.subscriptionId,
          status: nextStatus,
          nextInvoiceAt: fs.next_invoice_date
            ? new Date(fs.next_invoice_date)
            : null,
          lastInvoiceId: null,
          reminderSentFor: null,
          pendingTierCode: null,
          pendingBillingCycle: null,
          canceledAt: nextStatus === "CANCELED" ? new Date() : null,
        },
      })
      .catch(() => ({ count: 0 }));
    if (transition.count === 0) {
      await provider
        .cancelSubscription(fs.subscriptionId, {
          correlationId,
          immediate: true,
        })
        .catch(() => {});
      throw new ConflictException(
        "la suscripción cambió de estado durante la actualización",
      );
    }
    const updated =
      await this.prisma.platformSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
    try {
      await this.reconcileSubscription(updated, fs, "system");
    } catch (e) {
      this.logger.error(
        `reconcile post-upgrade platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (updated.status === "ACTIVE") {
      await this.applyEntitlement(updated);
      await this.notifications.notifySafe(sub.personId, {
        category: "TRANSACTIONAL",
        type:
          sub.kind === "ACADEMY"
            ? "academy.subscription_changed"
            : "producer.pro_changed",
        title: "Plan actualizado",
        body: `${scopeName} · ahora estás en ${targetTier} (${CYCLE_LABEL[targetCycle]})`,
        data: {
          subscriptionId: sub.id,
          academyId: sub.academyId,
          producerId: sub.producerId,
          tier: targetTier,
          cycle: targetCycle,
        },
      });
    }
    return updated;
  }

  /**
   * Downgrade / cambio de ciclo: persiste el cambio pendiente y (si la
   * remota sigue activa) la cancela a fin de período — el reconcile la
   * recrea en el plan pendiente cuando Flow la reporta cancelada. Si la
   * sub ya estaba CANCEL_PENDING solo se actualizan los campos pendientes
   * (PATCH sobre una sub cancelada por el usuario = "reanudar con otro
   * plan al fin del ciclo").
   */
  private async schedulePlanChange(
    sub: PlatformSubscription,
    targetTier: string,
    targetCycle: BillingCycle,
  ): Promise<PlatformSubscription> {
    if (sub.status === "ACTIVE" && sub.flowSubscriptionId) {
      await this.provider().cancelSubscription(sub.flowSubscriptionId, {
        correlationId: randomUUID(),
      });
    }
    const updated = await this.prisma.platformSubscription.update({
      where: { id: sub.id },
      data: {
        pendingTierCode: targetTier,
        pendingBillingCycle: targetCycle,
        status: sub.status === "ACTIVE" ? "CANCEL_PENDING" : sub.status,
        canceledAt:
          sub.status === "ACTIVE" ? new Date() : (sub.canceledAt ?? new Date()),
      },
    });
    await this.notifications.notifySafe(sub.personId, {
      category: "TRANSACTIONAL",
      type:
        sub.kind === "ACADEMY"
          ? "academy.subscription_change_scheduled"
          : "producer.pro_change_scheduled",
      title: "Cambio de plan agendado",
      body: `${targetTier} (${CYCLE_LABEL[targetCycle]}) se aplica al inicio del próximo ciclo`,
      data: {
        subscriptionId: sub.id,
        academyId: sub.academyId,
        producerId: sub.producerId,
        pendingTier: targetTier,
        pendingCycle: targetCycle,
        nextInvoiceAt: sub.nextInvoiceAt?.toISOString() ?? null,
      },
    });
    return updated;
  }

  // ─── Cancelación ──────────────────────────────────────────────────

  /**
   * Cancelación owner — efecto al fin del período ya pagado (Flow
   * at_period_end=1), igual que membresías. Idempotente; una
   * PENDING_CARD nunca llegó a Flow → cancelación local. Limpia un
   * cambio pendiente (cancelar manda sobre el downgrade agendado).
   */
  async cancelAcademySubscription(academyId: string) {
    const sub = await this.prisma.platformSubscription.findFirst({
      where: {
        academyId,
        kind: "ACADEMY",
        status: { in: [...LIVE_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) {
      throw new NotFoundException("la academia no tiene suscripción");
    }
    return this.cancelSub(sub, {
      type: "academy.subscription_canceled",
      title: "Suscripción cancelada",
      body: "Tu plan sigue activo hasta el fin del período pagado",
    });
  }

  async cancelProducerSubscription(personId: string) {
    const sub = await this.prisma.platformSubscription.findFirst({
      where: {
        producerId: personId,
        kind: "PRODUCER",
        status: { in: [...LIVE_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) {
      throw new NotFoundException("no tienes suscripción Producer Pro");
    }
    return this.cancelSub(sub, {
      type: "producer.pro_canceled",
      title: "Producer Pro cancelado",
      body: "Las herramientas Pro siguen activas hasta el fin del período pagado",
    });
  }

  private async cancelSub(
    sub: PlatformSubscription,
    notice: { type: string; title: string; body: string },
  ) {
    if (sub.status === "CANCELED" || sub.status === "CANCEL_PENDING") {
      return { ok: true, status: sub.status, subscriptionId: sub.id };
    }
    const clearPending = {
      pendingTierCode: null,
      pendingBillingCycle: null,
    } as const;
    if (!sub.flowSubscriptionId) {
      await this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { status: "CANCELED", canceledAt: new Date(), ...clearPending },
      });
      return { ok: true, status: "CANCELED", subscriptionId: sub.id };
    }
    await this.provider().cancelSubscription(sub.flowSubscriptionId, {
      correlationId: randomUUID(),
    });
    await this.prisma.platformSubscription.update({
      where: { id: sub.id },
      data: { status: "CANCEL_PENDING", canceledAt: new Date(), ...clearPending },
    });

    // Evidencia en el ledger del último pago de la suscripción (mismo
    // anchor que membresías usa sobre los pagos mem_*).
    const lastPayment = await this.prisma.payment.findFirst({
      where: {
        personId: sub.personId,
        orderType: "PLATFORM_SUB",
        refId: { startsWith: `platsub_${sub.id}_` },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (lastPayment) {
      await this.prisma.$transaction((tx) =>
        emitPaymentEvent(
          tx,
          lastPayment.id,
          "SUBSCRIPTION_CANCELED",
          "person",
          {
            subscriptionId: sub.id,
            flowSubscriptionId: sub.flowSubscriptionId,
            kind: sub.kind,
          },
        ),
      );
    }
    await this.notifications.notifySafe(sub.personId, {
      category: "TRANSACTIONAL",
      type: notice.type,
      title: notice.title,
      body: notice.body,
      data: {
        subscriptionId: sub.id,
        academyId: sub.academyId,
        producerId: sub.producerId,
      },
    });
    return { ok: true, status: "CANCEL_PENDING", subscriptionId: sub.id };
  }

  // ─── Vistas ───────────────────────────────────────────────────────

  /**
   * `GET /academies/:id/billing` — estado de la suscripción de la
   * academia para el owner: tier/ciclo vigentes, alumnos activos vs
   * límite del tier, próxima facturación, trial, gracia restante,
   * bloqueo e invoices (los Payment PLATFORM_SUB de sus suscripciones).
   * Hace refresh activo contra Flow como `getForOwner` de membresías —
   * cubre sandbox/dev donde el webhook no llega.
   */
  async academyBillingView(academy: Academy) {
    const subs = await this.prisma.platformSubscription.findMany({
      where: { academyId: academy.id, kind: "ACADEMY" },
      orderBy: { createdAt: "desc" },
    });
    let current =
      subs.find((s) => (LIVE_STATUSES as readonly string[]).includes(s.status)) ??
      subs[0] ??
      null;
    if (
      current?.flowSubscriptionId &&
      (current.status === "ACTIVE" || current.status === "CANCEL_PENDING") &&
      this.supportsSubscriptions()
    ) {
      try {
        const fs = await this.provider().getSubscription(
          current.flowSubscriptionId,
          { correlationId: randomUUID() },
        );
        await this.reconcileSubscription(current, fs);
        current =
          (await this.prisma.platformSubscription.findUnique({
            where: { id: current.id },
          })) ?? current;
      } catch (e) {
        this.logger.error(
          `refresh platsub ${current.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    const [activeStudents, invoices] = await Promise.all([
      this.countActiveStudents(academy.id),
      subs.length
        ? this.prisma.payment.findMany({
            where: {
              orderType: "PLATFORM_SUB",
              OR: subs.map((s) => ({
                refId: { startsWith: `platsub_${s.id}_` },
              })),
            },
            orderBy: { createdAt: "desc" },
            take: 24,
            select: {
              id: true,
              refId: true,
              amount: true,
              status: true,
              createdAt: true,
              gatewayRef: true,
              gatewayMedia: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const effectiveTier = academy.tier ?? current?.tierCode ?? null;
    const maxStudents = effectiveTier
      ? await this.academyMaxStudents(effectiveTier)
      : null;
    const now = Date.now();
    const graceDaysLeft =
      academy.billingGraceUntil != null &&
      academy.billingGraceUntil.getTime() > now
        ? Math.ceil(
            (academy.billingGraceUntil.getTime() - now) / (24 * 60 * 60_000),
          )
        : null;
    return {
      tier: academy.tier,
      cycle: academy.billingCycle,
      status: current?.status ?? null,
      subscriptionId: current?.id ?? null,
      pendingTier: current?.pendingTierCode ?? null,
      pendingCycle: current?.pendingBillingCycle ?? null,
      activeStudents,
      maxStudents:
        maxStudents === ACADEMY_MAX_FALLBACK || maxStudents == null
          ? null
          : maxStudents,
      nextInvoiceAt: current?.nextInvoiceAt ?? null,
      trialEndsAt: academy.trialEndsAt,
      graceDaysLeft,
      blocked: academy.billingBlockedAt != null,
      blockedAt: academy.billingBlockedAt,
      invoices,
    };
  }

  /**
   * `GET /producers/:id/pro` — estado Producer Pro: tier vigente
   * (`Person.proTier`), suscripción, facturación media 90d vs límite del
   * tier y próxima facturación. Refresh activo igual que billing.
   */
  async producerProView(personId: string) {
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { proTier: true },
    });
    const subs = await this.prisma.platformSubscription.findMany({
      where: { producerId: personId, kind: "PRODUCER" },
      orderBy: { createdAt: "desc" },
    });
    let current =
      subs.find((s) => (LIVE_STATUSES as readonly string[]).includes(s.status)) ??
      subs[0] ??
      null;
    if (
      current?.flowSubscriptionId &&
      (current.status === "ACTIVE" || current.status === "CANCEL_PENDING") &&
      this.supportsSubscriptions()
    ) {
      try {
        const fs = await this.provider().getSubscription(
          current.flowSubscriptionId,
          { correlationId: randomUUID() },
        );
        await this.reconcileSubscription(current, fs);
        current =
          (await this.prisma.platformSubscription.findUnique({
            where: { id: current.id },
          })) ?? current;
      } catch (e) {
        this.logger.error(
          `refresh platsub ${current.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    const monthlyGross = await this.producerMonthlyGross(personId);
    const tierKey = producerTierParamKey(
      current?.tierCode ?? person.proTier,
    );
    const maxGross = tierKey
      ? await this.params.getNumber(
          `producer_tier.${tierKey}_max_monthly_clp`,
          0,
        )
      : null;
    return {
      proTier: person.proTier,
      status: current?.status ?? null,
      subscriptionId: current?.id ?? null,
      tier: current?.tierCode ?? null,
      cycle: current?.billingCycle ?? null,
      pendingTier: current?.pendingTierCode ?? null,
      pendingCycle: current?.pendingBillingCycle ?? null,
      monthlyGross,
      maxGross,
      nextInvoiceAt: current?.nextInvoiceAt ?? null,
      canceledAt: current?.canceledAt ?? null,
    };
  }

  // ─── Webhook + reconcile ──────────────────────────────────────────

  /**
   * Segundo consumidor del `subscription/callback` de Flow: el INBOUND ya
   * quedó auditado por `SubscriptionsService.subscriptionWebhook` (mismo
   * endpoint comparte urlCallback entre todos los Flow-plans); acá solo
   * el gating anti-amplificación por token + el barrido fire-and-forget.
   */
  async subscriptionWebhook(token: string | null): Promise<void> {
    if (typeof token !== "string" || token.trim() === "") return;
    void this.reconcileAll().catch((e) =>
      this.logger.error(
        `reconcileAll platsub post-webhook falló: ${e instanceof Error ? e.message : e}`,
      ),
    );
  }

  /**
   * Barrido de las PlatformSubscription vivas — mismo gatillado que
   * membresías (webhook fast-path + cron T7 + refresh de las vistas).
   * El sweep de huérfanas NO se duplica acá: corre en
   * `SubscriptionsService.reconcileAll` sobre la auditoría compartida de
   * `subscription/create` y ya cubre ambas tablas.
   */
  async reconcileAll(
    actor = "reconcile",
  ): Promise<{ checked: number; settled: number }> {
    if (!this.supportsSubscriptions()) return { checked: 0, settled: 0 };
    const provider = this.provider();
    const subs = await this.prisma.platformSubscription.findMany({
      where: {
        flowSubscriptionId: { not: null },
        status: { in: ["ACTIVE", "CANCEL_PENDING"] },
      },
    });
    let settled = 0;
    for (const sub of subs) {
      try {
        const fs = await provider.getSubscription(sub.flowSubscriptionId!, {
          correlationId: randomUUID(),
        });
        settled += await this.reconcileSubscription(sub, fs, actor);
      } catch (e) {
        this.logger.error(
          `reconcile platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return { checked: subs.length, settled };
  }

  /**
   * Reconcile de una PlatformSubscription contra Flow — espejo de
   * `SubscriptionsService.reconcileSubscription`:
   * - invoices pagadas → Payment `platsub_<subId>_<invoiceId>` +
   *   `settlePlatformSub` (RENEWAL_SETTLED — desbloquea academia /
   *   restaura proTier). Dedup por lastInvoiceId + refId único; Payment
   *   PENDING huérfano reintenta el settle.
   * - sync de estado: next_invoice_date → nextInvoiceAt;
   *   cancel_at_period_end → CANCEL_PENDING; status 4 → CANCELED — o, si
   *   hay cambio de plan pendiente, swap a la nueva sub Flow.
   * - reminder del cobro del día siguiente (misma ventana 24h y dedup
   *   reminderSentFor).
   * - mora (morose=1): ACADEMY → `billingGraceUntil` = now +
   *   `academy_billing.grace_days` (el BLOQUEO efectivo lo hace el job de
   *   S3) + notify `academy.billing_grace`; PRODUCER → notify
   *   `producer.pro_renewal_failed` (S5 decide la degradación de
   *   features). Ambos emiten RENEWAL_FAILED en el último Payment de la
   *   sub, una vez por episodio (dedup por invoiceId impaga más antigua).
   */
  async reconcileSubscription(
    sub: PlatformSubscription,
    fs: FlowSubscription,
    actor = "reconcile",
  ): Promise<number> {
    let settled = 0;
    const paidInvoices = (fs.invoices ?? []).filter(isFlowInvoicePaid);
    for (const inv of paidInvoices) {
      const invId = String(inv.id);
      if (invId === sub.lastInvoiceId) continue;
      const refId = encodePlatformSubRef(sub.id, invId);
      const exists = await this.prisma.payment.findFirst({
        where: { refId },
      });
      if (exists) {
        // Retry del settle que falló post-create (mismo caso I2 que
        // membresías): la invoice cobrada sin efectos se retoma acá.
        if (exists.status === "PENDING") {
          await this.settlement.settlePlatformSub(exists, {
            actor,
            kind: "renewal",
            gatewayData: inv.payment?.paymentData,
          });
          settled++;
        }
        await this.markInvoice(sub.id, invId);
        sub.lastInvoiceId = invId;
        continue;
      }
      const amount =
        inv.amount > 0 ? inv.amount : await this.fallbackAmount(sub);
      const payment = await this.prisma.payment.create({
        data: {
          orderType: "PLATFORM_SUB",
          refId,
          personId: sub.personId,
          amount,
          fee: 0,
          net: amount,
          gateway: this.gateway.name,
          gatewayRef:
            inv.payment?.flowOrder != null
              ? String(inv.payment.flowOrder)
              : null,
        },
      });
      await this.prisma.$transaction((tx) =>
        emitPaymentEvent(tx, payment.id, "ORDER_CREATED", actor, {
          refId,
          invoiceId: invId,
          subscriptionId: sub.id,
          kind: sub.kind,
        }),
      );
      await this.settlement.settlePlatformSub(payment, {
        actor,
        kind: "renewal",
        gatewayData: inv.payment?.paymentData,
      });
      settled++;
      await this.markInvoice(sub.id, invId);
      sub.lastInvoiceId = invId;
    }

    const nextInvoiceAt = fs.next_invoice_date
      ? new Date(fs.next_invoice_date)
      : null;
    let status = sub.status;
    let canceledAt = sub.canceledAt;
    const remoteStatus = fs.status == null ? null : Number(fs.status);
    if (remoteStatus === 4) {
      if (sub.pendingTierCode && sub.pendingBillingCycle) {
        // La remota vieja terminó su período → swap al plan pendiente:
        // subscription/create cobra el primer ciclo del plan nuevo hoy.
        // Si falla, la fila queda CANCEL_PENDING y el próximo barrido
        // reintenta (nunca se pierde el cambio pedido).
        try {
          const swapped = await this.applyPendingPlanChange(sub, actor);
          if (swapped) return settled;
        } catch (e) {
          this.logger.error(
            `swap de plan pendiente platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
          );
          return settled;
        }
      }
      status = "CANCELED";
      canceledAt ??= new Date();
    } else if (
      Number(fs.cancel_at_period_end) === 1 &&
      status === "ACTIVE"
    ) {
      status = "CANCEL_PENDING";
      canceledAt ??= new Date();
    }
    if (
      status !== sub.status ||
      (nextInvoiceAt?.getTime() ?? null) !==
        (sub.nextInvoiceAt?.getTime() ?? null)
    ) {
      await this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { status, nextInvoiceAt, canceledAt },
      });
      sub.status = status;
    }

    const now = Date.now();
    // Reminder del cobro del día siguiente (misma ventana/dedup que
    // membresías) — solo en ACTIVE: una CANCEL_PENDING no tiene próximo
    // cobro real aunque Flow siga reportando la fecha.
    if (
      status === "ACTIVE" &&
      nextInvoiceAt != null &&
      nextInvoiceAt.getTime() > now &&
      nextInvoiceAt.getTime() <= now + REMINDER_WINDOW_MS &&
      sub.reminderSentFor?.getTime() !== nextInvoiceAt.getTime()
    ) {
      await this.notifications.notifySafe(sub.personId, {
        category: "TRANSACTIONAL",
        type:
          sub.kind === "ACADEMY"
            ? "academy.billing_reminder"
            : "producer.pro_renewal_reminder",
        title: "Renovación mañana",
        body: `Se cobrará el próximo período de tu suscripción ${sub.tierCode}`,
        data: {
          subscriptionId: sub.id,
          academyId: sub.academyId,
          producerId: sub.producerId,
          nextInvoiceAt: nextInvoiceAt.toISOString(),
        },
      });
      await this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { reminderSentFor: nextInvoiceAt },
      });
      sub.reminderSentFor = nextInvoiceAt;
    }

    // Enforcement suave Producer Pro: al liquidar una renovación se
    // re-evalúa la facturación — si supera el tope del tier vigente se
    // agenda el tier superior para el próximo ciclo (pending + cancel de
    // la remota a fin de período) y se avisa una vez por tier requerido.
    if (
      settled > 0 &&
      sub.kind === "PRODUCER" &&
      status === "ACTIVE" &&
      sub.producerId
    ) {
      await this.enforceProducerTier(sub);
    }

    // Mora: Flow reporta morose=1 con la invoice impaga en invoices[].
    if (Number(fs.morose) === 1) {
      await this.handleMorose(sub, fs, actor);
    }
    return settled;
  }

  /**
   * Swap al plan pendiente cuando la remota vieja quedó CANCELED (fin de
   * período del downgrade/cambio de ciclo). Crea la Flow sub en el plan
   * pendiente (cobra el primer ciclo ya = inicio del nuevo ciclo) y
   * conmuta la fila: tierCode/billingCycle toman el pending, los campos
   * pending se limpian y la sub vuelve ACTIVE.
   */
  private async applyPendingPlanChange(
    sub: PlatformSubscription,
    actor: string,
  ): Promise<boolean> {
    const tier = sub.pendingTierCode;
    const cycle = sub.pendingBillingCycle;
    if (!tier || !cycle) return false;
    const provider = this.provider();
    const correlationId = randomUUID();
    const charge = await this.chargeSpec(sub.kind, tier, cycle);
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
      },
      { correlationId },
    );
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      sub.personId,
      { correlationId },
    );
    const fs = await provider.createSubscription(
      {
        planId: charge.planId,
        customerId,
        subscriptionStart: new Date().toISOString().slice(0, 10),
      },
      { correlationId },
    );
    // Persistencia temprana del id remoto — el sweep de huérfanas la
    // rastrea aunque muera el proceso antes del updateMany.
    await this.prisma.platformSubscription
      .update({
        where: { id: sub.id },
        data: { flowSubscriptionId: fs.subscriptionId },
      })
      .catch(() => {});
    const remoteStatus = fs.status == null ? null : Number(fs.status);
    const transition = await this.prisma.platformSubscription
      .updateMany({
        where: { id: sub.id, status: sub.status },
        data: {
          tierCode: tier,
          billingCycle: cycle,
          flowSubscriptionId: fs.subscriptionId,
          status: remoteStatus === 4 ? "CANCELED" : "ACTIVE",
          nextInvoiceAt: fs.next_invoice_date
            ? new Date(fs.next_invoice_date)
            : null,
          lastInvoiceId: null,
          reminderSentFor: null,
          pendingTierCode: null,
          pendingBillingCycle: null,
          canceledAt: null,
        },
      })
      .catch(() => ({ count: 0 }));
    if (transition.count === 0) {
      await provider
        .cancelSubscription(fs.subscriptionId, {
          correlationId,
          immediate: true,
        })
        .catch(() => {});
      throw new ConflictException(
        "la suscripción cambió de estado durante el cambio de plan",
      );
    }
    const updated =
      await this.prisma.platformSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
    try {
      await this.reconcileSubscription(updated, fs, actor);
    } catch (e) {
      this.logger.error(
        `reconcile post-swap platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (updated.status === "ACTIVE") {
      await this.applyEntitlement(updated);
      await this.notifications.notifySafe(sub.personId, {
        category: "TRANSACTIONAL",
        type:
          sub.kind === "ACADEMY"
            ? "academy.subscription_changed"
            : "producer.pro_changed",
        title: "Cambio de plan aplicado",
        body: `Ahora estás en ${tier} (${CYCLE_LABEL[cycle]})`,
        data: {
          subscriptionId: sub.id,
          academyId: sub.academyId,
          producerId: sub.producerId,
          tier,
          cycle,
        },
      });
    }
    return true;
  }

  /**
   * Producer Pro por encima del tope de su tier: agenda el tier que
   * califica por facturación para el próximo ciclo y avisa una vez por
   * tier requerido (dedup por subscriptionId + requiredTier). Si ya está
   * por encima del máximo autogestionado (PRO_BIG) solo avisa — la
   * contratación es manual. Nunca corta la venta ni las features en curso.
   */
  private async enforceProducerTier(
    sub: PlatformSubscription,
  ): Promise<void> {
    if (!sub.producerId) return;
    const monthlyGross = await this.producerMonthlyGross(sub.producerId);
    const required = await this.producerTierForGross(monthlyGross);
    const requiredRank = required
      ? PRODUCER_TIER_RANK[required]
      : PRODUCER_TIER_RANK.PRO_BIG;
    const currentRank =
      PRODUCER_TIER_RANK[sub.tierCode as ProducerProTier] ?? -1;
    if (requiredRank <= currentRank) return;
    const already = await this.prisma.notification.findFirst({
      where: {
        personId: sub.personId,
        type: "producer.pro_upgrade_required",
        AND: [
          { data: { path: ["subscriptionId"], equals: sub.id } },
          { data: { path: ["requiredTier"], equals: required ?? "PRO_BIG" } },
        ],
      },
      select: { id: true },
    });
    if (already) return;
    if (required) {
      // Tier autogestionado: se agenda como cambio pendiente + cancel de
      // la remota a fin de período (mismo mecanismo del downgrade).
      const cycle = sub.billingCycle;
      await this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { pendingTierCode: required, pendingBillingCycle: cycle },
      });
      if (sub.flowSubscriptionId) {
        await this.provider()
          .cancelSubscription(sub.flowSubscriptionId, {
            correlationId: randomUUID(),
          })
          .catch((e) =>
            this.logger.error(
              `cancel para upgrade suave platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
            ),
          );
      }
    }
    await this.notifications.notifySafe(sub.personId, {
      category: "TRANSACTIONAL",
      type: "producer.pro_upgrade_required",
      title: "Tu plan Pro quedó corto",
      body: required
        ? `Tu facturación supera el tope de ${sub.tierCode} — al próximo ciclo pasas a ${required}`
        : "Tu facturación supera el máximo autogestionado — contacta a ventas (PRO_BIG)",
      data: {
        subscriptionId: sub.id,
        producerId: sub.producerId,
        currentTier: sub.tierCode,
        requiredTier: required ?? "PRO_BIG",
        monthlyGross,
      },
    });
  }

  /**
   * Mora reportada por Flow (morose=1). ACADEMY: deja
   * `billingGraceUntil` = ahora + `academy_billing.grace_days` (solo si
   * no hay una gracia vigente — la primera detección gana; el bloqueo del
   * día siguiente al vencimiento lo ejecuta el job de S3) + aviso al
   * owner. PRODUCER: solo aviso (la degradación de features Pro es de
   * S5). Ambos emiten RENEWAL_FAILED sobre el último Payment de la sub —
   * una vez por episodio (dedup por la invoice impaga más antigua).
   */
  private async handleMorose(
    sub: PlatformSubscription,
    fs: FlowSubscription,
    actor: string,
  ): Promise<void> {
    const unpaid = (fs.invoices ?? [])
      .filter((inv) => !isFlowInvoicePaid(inv))
      .sort((a, b) => a.id - b.id)[0];
    const invoiceId = unpaid != null ? String(unpaid.id) : null;
    const type =
      sub.kind === "ACADEMY"
        ? "academy.billing_grace"
        : "producer.pro_renewal_failed";
    const already = await this.prisma.notification.findFirst({
      where: {
        personId: sub.personId,
        type,
        AND: [
          { data: { path: ["subscriptionId"], equals: sub.id } },
          ...(invoiceId
            ? [{ data: { path: ["invoiceId"], equals: invoiceId } }]
            : []),
        ],
      },
      select: { id: true },
    });
    let graceDays: number | null = null;
    if (sub.kind === "ACADEMY" && sub.academyId) {
      graceDays = await this.params.getNumber("academy_billing.grace_days", 5);
      // Solo fija la gracia si no hay una vigente — extenderla en cada
      // barrido convertiría la gracia en permanente mientras dure la mora.
      await this.prisma.academy.updateMany({
        where: {
          id: sub.academyId,
          OR: [
            { billingGraceUntil: null },
            { billingGraceUntil: { lt: new Date() } },
          ],
        },
        data: {
          billingGraceUntil: new Date(Date.now() + graceDays * 24 * 60 * 60_000),
        },
      });
    }
    if (already) return;
    const lastPayment = await this.prisma.payment.findFirst({
      where: {
        personId: sub.personId,
        orderType: "PLATFORM_SUB",
        refId: { startsWith: `platsub_${sub.id}_` },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (lastPayment) {
      await this.prisma.$transaction((tx) =>
        emitPaymentEvent(tx, lastPayment.id, "RENEWAL_FAILED", actor, {
          subscriptionId: sub.id,
          kind: sub.kind,
          invoiceId,
          morose: true,
        }),
      );
    }
    await this.notifications.notifySafe(sub.personId, {
      category: "TRANSACTIONAL",
      type,
      title: "Cobro fallido",
      body:
        sub.kind === "ACADEMY"
          ? `Tienes ${graceDays ?? 5} días para regularizar antes del bloqueo — revisa tu tarjeta`
          : "Reintentaremos el cobro de Producer Pro — revisa tu tarjeta",
      data: {
        subscriptionId: sub.id,
        academyId: sub.academyId,
        producerId: sub.producerId,
        invoiceId,
        graceDays,
      },
    });
  }

  // ─── helpers internos ─────────────────────────────────────────────

  /**
   * Proyección del tier contratado sobre la entidad del dominio: academy
   * → `tier`/`billingCycle`; productor → `Person.proTier`. Corre al
   * activar/cambiar la sub y dentro de cada RENEWAL_SETTLED.
   */
  private async applyEntitlement(sub: PlatformSubscription): Promise<void> {
    if (
      sub.kind === "ACADEMY" &&
      sub.academyId &&
      ACADEMY_TIERS.has(sub.tierCode)
    ) {
      await this.prisma.academy.update({
        where: { id: sub.academyId },
        data: {
          tier: sub.tierCode as AcademyTier,
          billingCycle: sub.billingCycle,
        },
      });
    }
    if (
      sub.kind === "PRODUCER" &&
      sub.producerId &&
      PRODUCER_PRO_TIERS.has(sub.tierCode)
    ) {
      await this.prisma.person.update({
        where: { id: sub.producerId },
        data: { proTier: sub.tierCode as ProducerProTier },
      });
    }
  }

  private async notifyStarted(
    sub: PlatformSubscription,
    scopeName: string,
  ): Promise<void> {
    await this.notifications.notifySafe(sub.personId, {
      category: "TRANSACTIONAL",
      type:
        sub.kind === "ACADEMY"
          ? "academy.subscription_started"
          : "producer.pro_started",
      title: "Suscripción activa",
      body: `${scopeName} · ${sub.tierCode} (${CYCLE_LABEL[sub.billingCycle]})`,
      data: {
        subscriptionId: sub.id,
        academyId: sub.academyId,
        producerId: sub.producerId,
        tier: sub.tierCode,
        cycle: sub.billingCycle,
      },
    });
  }

  /** Monto de respaldo si la invoice no trae amount (precio del param). */
  private async fallbackAmount(sub: PlatformSubscription): Promise<number> {
    try {
      const charge = await this.chargeSpec(
        sub.kind,
        sub.tierCode,
        sub.billingCycle,
      );
      return charge.amount;
    } catch {
      return 0;
    }
  }

  private async markInvoice(
    subId: string,
    invoiceId: string,
  ): Promise<void> {
    await this.prisma.platformSubscription.update({
      where: { id: subId },
      data: { lastInvoiceId: invoiceId },
    });
  }
}
