import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { MembershipSubscription, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { emitPaymentEvent } from "../domain/payment-ledger";
import {
  isFlowInvoicePaid,
  PAYMENT_GATEWAY,
  type FlowSubscription,
  type PaymentGateway,
  type SubscriptionProvider,
} from "../domain/ports";
import { PaymentSettlementService } from "./payment-settlement.service";
import { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";

// PlanType recurrente → interval_count de Flow (interval=3 mensual fijo):
// MONTHLY cobra cada mes, QUARTERLY cada 3, SEMIANNUAL cada 6.
// SINGLE/CLASS_PACK/PERIOD/TRIAL no son suscribibles (pago único / staff).
const INTERVAL_COUNT: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
};

export type SubscribeResult =
  | { kind: "needs_card"; registerUrl: string; subscriptionId: string }
  | { kind: "subscribed"; subscriptionId: string };

export type CustomerReturnResult =
  | { ok: true; academyId: string }
  | { ok: false; academyId: string | null };

// Shape público de una suscripción (lo que ve el dueño) — la academy viene
// por la relación del plan (MembershipSubscription.academyId es columna
// pelada, sin relación propia).
const SUB_SELECT = {
  id: true,
  status: true,
  nextInvoiceAt: true,
  canceledAt: true,
  createdAt: true,
  plan: {
    select: {
      id: true,
      name: true,
      type: true,
      price: true,
      academy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.MembershipSubscriptionSelect;

type SubRow = Prisma.MembershipSubscriptionGetPayload<{
  select: typeof SUB_SELECT;
}>;

function toPublicSub(s: SubRow) {
  return {
    id: s.id,
    status: s.status,
    nextInvoiceAt: s.nextInvoiceAt,
    canceledAt: s.canceledAt,
    createdAt: s.createdAt,
    plan: {
      id: s.plan.id,
      name: s.plan.name,
      type: s.plan.type,
      price: s.plan.price,
    },
    academy: s.plan.academy,
  };
}

/**
 * Suscripciones recurrentes de planes de academia sobre el motor nativo
 * de Flow (SubscriptionProvider). El primer cobro lo ejecuta Flow al
 * `subscription/create` (subscription_start = hoy); las renovaciones se
 * liquidan acá vía `reconcileSubscription` — cada invoice pagado genera
 * un Payment `mem_<planId>_<invoiceId>` que pasa por
 * `PaymentSettlementService.settleMembership` (misma fuente de verdad
 * que el checkout manual: extiende endsAt, emite eventos, notifica).
 *
 * Solo funciona con el gateway FLOW — el stub no implementa
 * SubscriptionProvider (declarado en el puerto).
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly apiUrl = process.env.API_URL ?? "http://localhost:4000";

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly params: ParamsService,
    private readonly settlement: PaymentSettlementService,
    private readonly notifications: NotificationsService,
    private readonly gatewayTx: GatewayTransactionsService,
  ) {}

  /**
   * Port opcional: solo Flow implementa SubscriptionProvider. El check
   * por name evita depender del adapter concreto (hexagonal).
   */
  private flow(): SubscriptionProvider {
    if (this.gateway.name !== "FLOW") {
      throw new BadRequestException("suscripciones requieren gateway Flow");
    }
    return this.gateway as unknown as SubscriptionProvider;
  }

  /**
   * Checkout de suscripción: valida plan recurrente + consentimiento
   * explícito, materializa lazy el plan espejo y el customer en Flow, y
   * decide por tarjeta registrada:
   *  - sin tarjeta → crea la sub PENDING_CARD + registerUrl del
   *    disclaimer de Flow (customer-return la reanuda al volver);
   *  - con tarjeta → subscription/create directo (Flow cobra el primer
   *    período de inmediato) → ACTIVE + reconcile best-effort del primer
   *    invoice si ya figura pagado.
   */
  async subscribe(
    personId: string,
    planId: string,
    acceptRecurring: boolean,
  ): Promise<SubscribeResult> {
    if (acceptRecurring !== true) {
      throw new BadRequestException("debes aceptar el cobro recurrente");
    }
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: planId },
      include: { academy: true },
    });
    if (!plan || !plan.active || !plan.academy.active) {
      throw new NotFoundException("plan no disponible");
    }
    const intervalCount = INTERVAL_COUNT[plan.type];
    if (!intervalCount) {
      throw new BadRequestException("este plan no admite cobro recurrente");
    }

    // Una suscripción viva por plan: re-suscribir con tarjeta registrada
    // crearía una segunda suscripción en Flow → doble cobro real.
    const existing = await this.prisma.membershipSubscription.findFirst({
      where: {
        personId,
        planId: plan.id,
        status: { in: ["ACTIVE", "CANCEL_PENDING", "PENDING_CARD"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing && existing.status !== "PENDING_CARD") {
      throw new ConflictException("ya tienes una suscripción a este plan");
    }

    const correlationId = randomUUID();
    const flow = this.flow();

    // Plan espejo en Flow — lazy create en el primer subscribe.
    let flowPlanId = plan.flowPlanId;
    if (!flowPlanId) {
      flowPlanId = `omni_${plan.id}`;
      const fee = await this.params.getNumber(
        "service_fee.membership_clp",
        500,
      );
      await flow.ensurePlan(
        {
          planId: flowPlanId,
          name: `${plan.academy.name} — ${plan.name}`,
          amount: plan.price + fee,
          intervalCount,
        },
        { correlationId },
      );
      await this.prisma.membershipPlan.update({
        where: { id: plan.id },
        data: { flowPlanId },
      });
    }

    // Customer en Flow — lazy create; sin email no se puede registrar.
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
    });
    let customerId = person.flowCustomerId;
    if (!customerId) {
      if (!person.email) {
        throw new BadRequestException(
          "necesitas un email en tu cuenta para suscribirte",
        );
      }
      const c = await flow.createCustomer(
        { email: person.email, name: person.name, externalId: personId },
        { correlationId },
      );
      customerId = c.customerId;
      await this.prisma.person.update({
        where: { id: personId },
        data: { flowCustomerId: customerId },
      });
    }

    // Un intento PENDING_CARD anterior se reemplaza por el nuevo (la
    // tarjeta pudo quedar registrada entremedio — getCustomer decide).
    if (existing) {
      await this.prisma.membershipSubscription.update({
        where: { id: existing.id },
        data: { status: "CANCELED", canceledAt: new Date() },
      });
    }
    const sub = await this.prisma.membershipSubscription.create({
      data: { personId, planId: plan.id, academyId: plan.academyId },
    });

    const customer = await flow.getCustomer(customerId, { correlationId });
    if (!customer.creditCardType) {
      const { registerUrl } = await flow.registerCustomerCard(
        {
          customerId,
          returnUrl: `${this.apiUrl}/api/payments/flow/customer-return`,
        },
        { correlationId },
      );
      return { kind: "needs_card", registerUrl, subscriptionId: sub.id };
    }

    const fs = await flow.createSubscription(
      {
        planId: flowPlanId,
        customerId,
        subscriptionStart: new Date().toISOString().slice(0, 10),
      },
      { correlationId },
    );
    const active = await this.prisma.membershipSubscription.update({
      where: { id: sub.id },
      data: {
        flowSubscriptionId: fs.subscriptionId,
        status: "ACTIVE",
        nextInvoiceAt: fs.next_invoice_date
          ? new Date(fs.next_invoice_date)
          : null,
      },
    });

    // El primer invoice puede venir ya pagado en la respuesta — el settle
    // materializa el Enrollment sin esperar al polling/webhook.
    try {
      await this.reconcileSubscription(active, fs, "system");
    } catch (e) {
      this.logger.error(
        `reconcile post-subscribe sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }

    await this.notifications.notifySafe(personId, {
      category: "TRANSACTIONAL",
      type: "membership.subscription_started",
      title: "Tu suscripción está activa",
      body: `${plan.name} · ${plan.academy.name}`,
      data: {
        subscriptionId: sub.id,
        planId: plan.id,
        academyId: plan.academyId,
      },
    });
    return { kind: "subscribed", subscriptionId: sub.id };
  }

  /**
   * Retorno del disclaimer de registro de tarjeta (Flow hace POST del
   * browser a url_return con {token}). Público: registra el inbound en
   * GatewayTransaction y, si el registro quedó OK, reanuda la
   * suscripción PENDING_CARD más reciente del customer → ACTIVE.
   * Nunca lanza por estados esperados — el controller traduce a redirect.
   */
  async customerReturn(token: string): Promise<CustomerReturnResult> {
    const correlationId = randomUUID();
    await this.gatewayTx.record({
      provider: "FLOW",
      direction: "INBOUND_WEBHOOK",
      endpoint: "customer/register-return",
      correlationId,
      requestBody: { token },
      ok: true,
    });
    const flow = this.flow();
    const reg = await flow.getRegisterStatus(token, { correlationId });
    if (reg.status !== 1 || !reg.customerId) {
      return { ok: false, academyId: null };
    }
    const person = await this.prisma.person.findFirst({
      where: { flowCustomerId: reg.customerId },
      select: { id: true },
    });
    if (!person) return { ok: false, academyId: null };
    const sub = await this.prisma.membershipSubscription.findFirst({
      where: { personId: person.id, status: "PENDING_CARD" },
      orderBy: { createdAt: "desc" },
      include: {
        plan: {
          select: {
            flowPlanId: true,
            name: true,
            academy: { select: { name: true } },
          },
        },
      },
    });
    if (!sub) return { ok: false, academyId: null };
    if (!sub.plan.flowPlanId) {
      return { ok: false, academyId: sub.academyId };
    }

    const fs = await flow.createSubscription(
      {
        planId: sub.plan.flowPlanId,
        customerId: reg.customerId,
        subscriptionStart: new Date().toISOString().slice(0, 10),
      },
      { correlationId },
    );
    const active = await this.prisma.membershipSubscription.update({
      where: { id: sub.id },
      data: {
        flowSubscriptionId: fs.subscriptionId,
        status: "ACTIVE",
        nextInvoiceAt: fs.next_invoice_date
          ? new Date(fs.next_invoice_date)
          : null,
      },
    });
    try {
      await this.reconcileSubscription(active, fs, "system");
    } catch (e) {
      this.logger.error(
        `reconcile post-customer-return sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    await this.notifications.notifySafe(person.id, {
      category: "TRANSACTIONAL",
      type: "membership.subscription_started",
      title: "Tu suscripción está activa",
      body: `${sub.plan.name} · ${sub.plan.academy.name}`,
      data: { subscriptionId: sub.id, academyId: sub.academyId },
    });
    return { ok: true, academyId: sub.academyId };
  }

  /**
   * urlCallback de los Flow-plans (plans/create lo registró): Flow avisa
   * eventos de suscripción (cobro, mora, cancelación). Registramos el
   * inbound y disparamos reconcileAll fire-and-forget — el endpoint
   * responde 200 siempre (si no, Flow reintenta y repetiría el barrido);
   * el cron diario (T7) es la red de seguridad real.
   */
  async subscriptionWebhook(token: string | null): Promise<void> {
    await this.gatewayTx.record({
      provider: "FLOW",
      direction: "INBOUND_WEBHOOK",
      endpoint: "subscription/callback",
      correlationId: randomUUID(),
      requestBody: { token },
      ok: true,
    });
    void this.reconcileAll().catch((e) =>
      this.logger.error(
        `reconcileAll post-webhook falló: ${e instanceof Error ? e.message : e}`,
      ),
    );
  }

  /** Suscripciones del usuario autenticado (más reciente primero). */
  async listMine(personId: string) {
    const subs = await this.prisma.membershipSubscription.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      select: SUB_SELECT,
    });
    return subs.map(toPublicSub);
  }

  /**
   * Detalle para el dueño con refresh activo contra Flow (mismo patrón
   * que GET /payments/:id): subscription/get → reconcile de invoices
   * pagados + sync de estado. Si Flow no responde se devuelve el estado
   * local — el cron sigue reconciliando.
   */
  async getForOwner(personId: string, id: string) {
    const sub = await this.prisma.membershipSubscription.findUnique({
      where: { id },
    });
    if (!sub || sub.personId !== personId) {
      throw new NotFoundException("suscripción no encontrada");
    }
    if (sub.flowSubscriptionId && this.gateway.name === "FLOW") {
      try {
        const fs = await this.flow().getSubscription(
          sub.flowSubscriptionId,
          { correlationId: randomUUID() },
        );
        await this.reconcileSubscription(sub, fs);
      } catch (e) {
        this.logger.error(
          `refresh sub ${id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    const fresh = await this.prisma.membershipSubscription.findUnique({
      where: { id },
      select: SUB_SELECT,
    });
    return fresh ? toPublicSub(fresh) : null;
  }

  /**
   * Cancelación por el dueño: Flow at_period_end=1 (conserva el acceso
   * hasta el fin del período ya pagado). Idempotente: CANCEL_PENDING /
   * CANCELED responden OK sin volver a llamar a Flow. Una PENDING_CARD
   * nunca llegó a Flow → cancelación local directa.
   */
  async cancel(personId: string, id: string) {
    const sub = await this.prisma.membershipSubscription.findUnique({
      where: { id },
    });
    if (!sub || sub.personId !== personId) {
      throw new NotFoundException("suscripción no encontrada");
    }
    if (sub.status === "CANCELED" || sub.status === "CANCEL_PENDING") {
      return { ok: true, status: sub.status, subscriptionId: sub.id };
    }

    if (!sub.flowSubscriptionId) {
      await this.prisma.membershipSubscription.update({
        where: { id: sub.id },
        data: { status: "CANCELED", canceledAt: new Date() },
      });
      return { ok: true, status: "CANCELED", subscriptionId: sub.id };
    }

    await this.flow().cancelSubscription(sub.flowSubscriptionId, {
      correlationId: randomUUID(),
    });
    await this.prisma.membershipSubscription.update({
      where: { id: sub.id },
      data: { status: "CANCEL_PENDING", canceledAt: new Date() },
    });

    // Evidencia en el ledger del último pago de la suscripción (los
    // payments de renovación comparten refId mem_<planId>_*).
    const lastPayment = await this.prisma.payment.findFirst({
      where: {
        personId,
        orderType: "MEMBERSHIP",
        refId: { startsWith: `mem_${sub.planId}_` },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (lastPayment) {
      await emitPaymentEvent(
        this.prisma,
        lastPayment.id,
        "SUBSCRIPTION_CANCELED",
        "user",
        {
          subscriptionId: sub.id,
          flowSubscriptionId: sub.flowSubscriptionId,
          planId: sub.planId,
        },
      );
    }

    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: sub.planId },
      select: { name: true, academy: { select: { name: true } } },
    });
    await this.notifications.notifySafe(personId, {
      category: "TRANSACTIONAL",
      type: "membership.subscription_canceled",
      title: "Suscripción cancelada",
      body: plan
        ? `${plan.name} · ${plan.academy.name} — conservas el acceso hasta el fin del período pagado`
        : "Conservas el acceso hasta el fin del período pagado",
      data: {
        subscriptionId: sub.id,
        planId: sub.planId,
        academyId: sub.academyId,
      },
    });
    return { ok: true, status: "CANCEL_PENDING", subscriptionId: sub.id };
  }

  /**
   * Barrido de todas las suscripciones vivas (webhook fast-path + cron
   * T7). Cada sub se reconcilia con su propio correlationId; una que
   * falle no aborta el resto — queda loggeada y la reintenta el próximo
   * barrido.
   */
  async reconcileAll(): Promise<{ checked: number; settled: number }> {
    if (this.gateway.name !== "FLOW") return { checked: 0, settled: 0 };
    const flow = this.flow();
    const subs = await this.prisma.membershipSubscription.findMany({
      where: {
        flowSubscriptionId: { not: null },
        status: { in: ["ACTIVE", "CANCEL_PENDING"] },
      },
    });
    let settled = 0;
    for (const sub of subs) {
      try {
        const fs = await flow.getSubscription(sub.flowSubscriptionId!, {
          correlationId: randomUUID(),
        });
        settled += await this.reconcileSubscription(sub, fs);
      } catch (e) {
        this.logger.error(
          `reconcile sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return { checked: subs.length, settled };
  }

  /**
   * Reconcile de una suscripción contra su estado remoto en Flow —
   * compartido por el polling de GET /subscriptions/:id, el webhook y el
   * cron (T7 le agrega reminder/morose encima).
   *
   * Invoices pagados (isFlowInvoicePaid): dedup por lastInvoiceId y por
   * Payment.refId `mem_<planId>_<invoiceId>` (único — retry seguro);
   * cada uno nuevo crea el Payment PENDING + ORDER_CREATED en el ledger
   * y pasa por settleMembership (kind "renewal" → RENEWAL_SETTLED).
   *
   * Sync de estado: nextInvoiceAt desde next_invoice_date;
   * cancel_at_period_end → CANCEL_PENDING; status 4 → CANCELED.
   * Devuelve cuántos invoices se liquidaron en esta pasada.
   */
  async reconcileSubscription(
    sub: MembershipSubscription,
    fs: FlowSubscription,
    actor = "reconcile",
  ): Promise<number> {
    let settled = 0;
    const paidInvoices = (fs.invoices ?? []).filter(isFlowInvoicePaid);
    if (paidInvoices.length) {
      // Fallback de monto si la invoice no trae amount (raro — Flow lo
      // reporta): precio del plan + cargo de servicio vigente.
      const plan = await this.prisma.membershipPlan.findUnique({
        where: { id: sub.planId },
        select: { price: true },
      });
      for (const inv of paidInvoices) {
        const invId = String(inv.id);
        if (invId === sub.lastInvoiceId) continue;
        const refId = `mem_${sub.planId}_${invId}`;
        const exists = await this.prisma.payment.findFirst({
          where: { refId },
          select: { id: true },
        });
        if (exists) {
          await this.markInvoice(sub.id, invId);
          sub.lastInvoiceId = invId;
          continue;
        }
        const amount =
          inv.amount > 0
            ? inv.amount
            : (plan?.price ?? 0) +
              (await this.params.getNumber(
                "service_fee.membership_clp",
                500,
              ));
        const payment = await this.prisma.payment.create({
          data: {
            orderType: "MEMBERSHIP",
            refId,
            personId: sub.personId,
            amount,
            fee: 0, // costo pasarela: lo persiste el settle (paymentData.fee)
            net: amount,
            gateway: "FLOW",
            gatewayRef:
              inv.payment?.flowOrder != null
                ? String(inv.payment.flowOrder)
                : null,
          },
        });
        await emitPaymentEvent(
          this.prisma,
          payment.id,
          "ORDER_CREATED",
          actor,
          { refId, invoiceId: invId, subscriptionId: sub.id },
        );
        await this.settlement.settleMembership(payment, {
          actor,
          kind: "renewal",
          gatewayData: inv.payment?.paymentData,
        });
        settled++;
        await this.markInvoice(sub.id, invId);
        sub.lastInvoiceId = invId;
      }
    }

    const nextInvoiceAt = fs.next_invoice_date
      ? new Date(fs.next_invoice_date)
      : null;
    let status = sub.status;
    let canceledAt = sub.canceledAt;
    if (fs.status === 4) {
      status = "CANCELED";
      canceledAt ??= new Date();
    } else if (fs.cancel_at_period_end === 1 && status === "ACTIVE") {
      status = "CANCEL_PENDING";
      canceledAt ??= new Date();
    }
    if (
      status !== sub.status ||
      (nextInvoiceAt?.getTime() ?? null) !==
        (sub.nextInvoiceAt?.getTime() ?? null)
    ) {
      await this.prisma.membershipSubscription.update({
        where: { id: sub.id },
        data: { status, nextInvoiceAt, canceledAt },
      });
    }
    return settled;
  }

  private async markInvoice(
    subId: string,
    invoiceId: string,
  ): Promise<void> {
    await this.prisma.membershipSubscription.update({
      where: { id: subId },
      data: { lastInvoiceId: invoiceId },
    });
  }
}
