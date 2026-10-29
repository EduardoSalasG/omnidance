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
import { academyFeeBreakdown } from "../../common/fee-breakdown";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { emitPaymentEvent } from "../domain/payment-ledger";
import {
  type BillingWebhookEvent,
  type PaymentGateway,
  type RemoteSubscription,
  type SubscriptionProvider,
} from "../domain/ports";
import { remoteFromBillingEvent } from "../domain/billing-event";
import {
  GatewayRegistry,
  PAYMENT_GATEWAYS,
  supportsCurrency,
} from "../domain/gateway-registry";
import { PaymentSettlementService } from "./payment-settlement.service";
import { GatewayTransactionsService } from "../infrastructure/gateway-transactions.service";
import { ensureFlowCustomer } from "./flow-customer";
import { AcademyPromosService } from "./academy-promos.service";
import {
  academyPromoPlanId,
  membershipBasePlanId,
  promoChargeClp,
} from "../domain/academy-promos";

// PlanType recurrente → interval_count de Flow (interval=3 mensual fijo):
// MONTHLY cobra cada mes, QUARTERLY cada 3, SEMIANNUAL cada 6.
// SINGLE/CLASS_PACK/PERIOD/TRIAL no son suscribibles (pago único / staff).
const INTERVAL_COUNT: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
};

// PENDING_CARD/ACTIVATING más vieja que esto se considera intento
// muerto (crash del request o abandono del disclaimer) y se reemplaza;
// una fresca del mismo plan se reutiliza (idempotencia del retry).
// Exportada: PlatformSubscriptionsService aplica la misma política.
export const PENDING_CARD_TTL_MS = 15 * 60_000;

// Grace del orphan sweep: un subscription/create auditado más joven que
// esto puede ser un request en vuelo (aún no persiste flowSubscriptionId)
// - no es candidato a huérfana hasta que la ventana haya pasado.
const ORPHAN_SWEEP_GRACE_MS = 2 * 60_000;

// Ventana del reminder pre-cobro: avisa el día anterior (nextInvoiceAt
// dentro de las próximas 24h, nunca por cobros ya pasados).
// Exportada: PlatformSubscriptionsService aplica la misma política.
export const REMINDER_WINDOW_MS = 24 * 60 * 60_000;

type SubscribeResult =
  | { kind: "needs_card"; registerUrl: string; subscriptionId: string }
  | { kind: "subscribed"; subscriptionId: string };

type CustomerReturnResult =
  | { ok: true; academyId: string }
  | { ok: false; academyId: string | null };

// Shape público de una suscripción (lo que ve el dueño) - la academy viene
// por la relación del plan (MembershipSubscription.academyId es columna
// pelada, sin relación propia).
const SUB_SELECT = {
  id: true,
  status: true,
  currency: true,
  nextInvoiceAt: true,
  canceledAt: true,
  createdAt: true,
  plan: {
    select: {
      id: true,
      name: true,
      type: true,
      price: true,
      currency: true,
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
    currency: s.currency,
    nextInvoiceAt: s.nextInvoiceAt,
    canceledAt: s.canceledAt,
    createdAt: s.createdAt,
    plan: {
      id: s.plan.id,
      name: s.plan.name,
      type: s.plan.type,
      price: s.plan.price,
      currency: s.plan.currency,
    },
    academy: s.plan.academy,
  };
}

/**
 * Suscripciones recurrentes de planes de academia sobre el motor nativo
 * de Flow (SubscriptionProvider). El primer cobro lo ejecuta Flow al
 * `subscription/create` (subscription_start = hoy); las renovaciones se
 * liquidan acá vía `reconcileSubscription` - cada invoice pagado genera
 * un Payment `mem_<planId>_<invoiceId>` que pasa por
 * `PaymentSettlementService.settleMembership` (misma fuente de verdad
 * que el checkout manual: extiende endsAt, emite eventos, notifica).
 *
 * Funciona con cualquier gateway que implemente SubscriptionProvider
 * (Flow en sandbox/prod; StubGateway en dev - simula el motor completo
 * en memoria, ver stub.gateway.ts).
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly apiUrl = process.env.API_URL ?? "http://localhost:4000";

  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
    private readonly settlement: PaymentSettlementService,
    private readonly notifications: NotificationsService,
    private readonly gatewayTx: GatewayTransactionsService,
    private readonly academyPromos: AcademyPromosService,
    @Inject(PAYMENT_GATEWAYS)
    private readonly gateways: GatewayRegistry,
  ) {}

  /**
   * Provider de suscripciones (spec subscription-port-generic): el
   * param `payments.subscription_gateway` se resuelve contra el
   * GatewayRegistry; capability check por presencia de métodos, nunca
   * por name - cualquier adapter que implemente SubscriptionProvider
   * vale (Flow; StubGateway en dev), sin depender del concreto.
   * null = el provider resuelto no tiene motor de suscripciones
   * (p.ej. MercadoPago): los flujos fallan explícito, jamás caen en
   * silencio a otro provider.
   */
  private async subscriptionGateway(
    currency = "CLP",
  ): Promise<PaymentGateway | null> {
    const cur = currency.toUpperCase();
    if (cur === "CLP") {
      const name = await this.params.get("payments.subscription_gateway");
      const gw = this.gateways.resolve(
        typeof name === "string" ? name : null,
      );
      return typeof (gw as Partial<SubscriptionProvider>)
        .createSubscription === "function"
        ? gw
        : null;
    }
    // Otra moneda (spec multipais-currency): se ignora el param - el
    // primer adaptador registrado con motor de suscripciones que
    // soporte la moneda gana. Ninguno → error explícito, jamás caer en
    // silencio a un provider de CLP.
    for (const name of this.gateways.names()) {
      const gw = this.gateways.get(name);
      if (
        gw &&
        typeof (gw as Partial<SubscriptionProvider>).createSubscription ===
          "function" &&
        supportsCurrency(gw, cur)
      ) {
        return gw;
      }
    }
    return null;
  }

  /** Provider resuelto + su nombre (para auditoría y Payment.gateway). */
  private async provider(currency = "CLP"): Promise<{
    provider: SubscriptionProvider;
    name: string;
  }> {
    const gw = await this.subscriptionGateway(currency);
    if (!gw) {
      throw new BadRequestException(
        currency.toUpperCase() === "CLP"
          ? "el proveedor de suscripciones configurado no tiene motor de suscripciones"
          : `la moneda ${currency.toUpperCase()} no tiene proveedor de suscripciones registrado`,
      );
    }
    return {
      provider: gw as unknown as SubscriptionProvider,
      name: gw.name,
    };
  }

  /**
   * Clave del espejo remoto por gateway+moneda (spec multipais-currency):
   * `remoteRefs` guarda "<GATEWAY>:<CURRENCY>" → planId remoto para los
   * proveedores no-Flow; el espejo Flow/CLP sigue en `flowPlanId`.
   */
  private remoteRefKey(gateway: string, currency: string): string {
    return `${gateway.toUpperCase()}:${currency.toUpperCase()}`;
  }

  private remotePlanId(
    plan: { flowPlanId: string | null; remoteRefs?: unknown },
    gateway: string,
    currency: string,
  ): string | null {
    if (currency.toUpperCase() === "CLP") return plan.flowPlanId;
    const refs = (plan.remoteRefs ?? null) as Record<string, unknown> | null;
    const id = refs?.[this.remoteRefKey(gateway, currency)];
    return typeof id === "string" && id ? id : null;
  }

  /**
   * Persiste el id del espejo base materializado: CLP → flowPlanId
   * (compat); otra moneda → remoteRefs["<GW>:<CUR>"] (merge del mapa).
   */
  private async markBaseMirror(
    planId: string,
    gateway: string,
    currency: string,
    remotePlanId: string,
  ): Promise<void> {
    if (currency.toUpperCase() === "CLP") {
      await this.prisma.membershipPlan
        .update({ where: { id: planId }, data: { flowPlanId: remotePlanId } })
        .catch(() => {});
      return;
    }
    const cur = await this.prisma.membershipPlan.findUnique({
      where: { id: planId },
      select: { remoteRefs: true },
    });
    const refs = { ...((cur?.remoteRefs as Record<string, string>) ?? {}) };
    refs[this.remoteRefKey(gateway, currency)] = remotePlanId;
    await this.prisma.membershipPlan
      .update({ where: { id: planId }, data: { remoteRefs: refs } })
      .catch(() => {});
  }

  /**
   * plans/edit - empuja nombre/precio al plan espejo de Flow cuando
   * staff edita el plan local (PATCH /academies/:id/plans/:planId).
   * No-op si el plan aún no tiene espejo (el primer subscribe lo crea
   * con los valores vigentes) o el gateway no implementa
   * SubscriptionProvider - en ambos casos no hay nada que sincronizar.
   *
   * El caller lo ejecuta ANTES del update local: si Flow rechaza, la
   * fila local queda intacta y ambos lados siguen consistentes (la
   * llamada queda auditada en GatewayTransaction igual).
   */
  async syncMirrorPlan(
    plan: { id?: string; flowPlanId: string | null; academy: { name: string } },
    next: { name: string; price: number },
  ): Promise<void> {
    const gw = await this.subscriptionGateway();
    if (!plan.flowPlanId || !gw) return;
    // Sin cargo de servicio en el monto espejo (modelo SaaS - spec
    // academy-saas-billing): Flow cobra al alumno solo plan.price; el
    // costo de pasarela se liquida en el payout de la academia.
    await (gw as unknown as SubscriptionProvider).syncPlan(
      {
        planId: plan.flowPlanId,
        name: `${plan.academy.name} - ${next.name}`,
        amount: next.price,
      },
      { correlationId: randomUUID() },
    );
    // El precio del espejo base ya cambió in-place (spec member-promos):
    // se actualiza planChargeClp en las subs que cobran por ese espejo
    // para que el drift-check no agenda un reprice redundante. Las subs
    // bajo espejo de promo quedan intactas - su reprice aplica al nuevo
    // precio resuelto (promo sobre el plan editado).
    if (plan.id) {
      await this.prisma.membershipSubscription
        .updateMany({
          where: {
            planId: plan.id,
            academyPromoId: null,
            pendingReprice: false,
            status: { in: ["ACTIVE", "CANCEL_PENDING"] },
          },
          data: { planChargeClp: next.price },
        })
        .catch(() => {});
    }
  }

  /**
   * Cargo de la sub recurrente de un plan para un alumno (spec
   * member-promos): precio del plan resuelto contra las AcademyPromo
   * vigentes (enabled + ventana + plan scope + whitelist + maxCycles).
   * El espejo remoto es el propio de la promo
   * (`omni_<planId>_prm_<promoId>_<amount>`) cuando aplica - nunca se
   * muta el plan espejo base ni MembershipPlan.price. Es la única
   * resolución que comparten subscribe, customerReturn, el drift-check
   * y el reprice.
   */
  private async memberChargeSpec(
    plan: {
      id: string;
      name: string;
      price: number;
      type: string;
      flowPlanId: string | null;
      currency?: string;
      remoteRefs?: unknown;
      academy: { name: string };
    },
    academyId: string,
    personId: string,
    /** Provider+moneda del cobro (spec multipais-currency). */
    providerName = "FLOW",
    currency = "CLP",
  ): Promise<{
    planId: string;
    name: string;
    amount: number;
    currency: string;
    intervalCount: number;
    promoId: string | null;
  }> {
    const intervalCount = INTERVAL_COUNT[plan.type] ?? 1;
    const label = `${plan.academy.name} - ${plan.name}`;
    const promo = await this.academyPromos.resolveApplicable(
      academyId,
      personId,
      plan.id,
      plan.price,
      currency,
    );
    if (!promo) {
      return {
        planId:
          this.remotePlanId(plan, providerName, currency) ??
          membershipBasePlanId(plan.id),
        name: label,
        amount: plan.price,
        currency,
        intervalCount,
        promoId: null,
      };
    }
    const amount = promoChargeClp(plan.price, promo);
    return {
      planId: academyPromoPlanId(plan.id, promo.id, amount),
      name: `${label} · ${promo.name}`,
      amount,
      currency,
      intervalCount,
      promoId: promo.id,
    };
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
   *
   * Concurrencia (I1): el re-check de sub viva + la elección/creación de
   * la fila PENDING_CARD van dentro de una tx corta con advisory lock
   * `pg_advisory_xact_lock(hashtext(personId))` - por PERSON, no por
   * plan: el sweep M7 cancela pendientes de cualquier plan, así que dos
   * subscribe() de planes distintos del mismo person también deben
   * serializarse (si no, una PENDING_CARD creada por el otro entre el
   * findMany y el commit escaparía al cancel dirigido). Las llamadas
   * HTTP a Flow quedan FUERA de la tx (el lock solo serializa quién crea
   * la fila, no se sostiene durante la red). Antes del createSubscription
   * hay un claim atómico PENDING_CARD→ACTIVATING que cubre la carrera
   * contra customerReturn (que toma la misma sub por su lado).
   * Regla de la sección crítica: TODO update de status es condicional
   * por el status esperado (updateMany id+status) - nunca update
   * incondicional sobre una fila cuyo estado pudo moverse fuera de la tx.
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
    // Academia bloqueada por mora (spec academy-saas-billing, S3): no
    // hay suscripciones nuevas - mismo código/copy que el checkout.
    if (plan.academy.billingBlockedAt != null) {
      throw new BadRequestException({
        error: "academy.unavailable",
        message: "la academia no está disponible por el momento",
      });
    }
    const intervalCount = INTERVAL_COUNT[plan.type];
    if (!intervalCount) {
      throw new BadRequestException("este plan no admite cobro recurrente");
    }
    // Moneda del plan (spec multipais-currency): fija el provider del
    // cobro y el snapshot de la sub. Capability check ANTES de la tx:
    // sin motor para la moneda no se crea una PENDING_CARD muerta.
    const planCurrency = plan.currency ?? "CLP";
    const { provider, name: providerName } = await this.provider(planCurrency);

    // Sección crítica (serializada por advisory lock): re-check de sub
    // viva + elección de la PENDING_CARD. Una PENDING_CARD FRESCA del
    // mismo plan se reutiliza - idempotencia del retry del cliente: el
    // segundo request devuelve needs_card con el mismo subscriptionId y
    // un registerUrl nuevo (customer/register es re-llamable sobre el
    // mismo customerId). Una PENDING_CARD/ACTIVATING expirada (>TTL,
    // crash del intento anterior) se reemplaza por un intento nuevo.
    const sub = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sub:${personId}`}))`;
      // TODAS las subs vivas del person (cualquier plan): el sweep M7
      // decide por fila sobre este snapshot - con el lock por person,
      // ningún subscribe concurrente puede crear una PENDING_CARD que
      // escape a la lista.
      const live = await tx.membershipSubscription.findMany({
        where: {
          personId,
          status: {
            in: ["ACTIVE", "CANCEL_PENDING", "PENDING_CARD", "ACTIVATING"],
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const existing = live.find((s) => s.planId === plan.id) ?? null;
      const fresh =
        existing != null &&
        Date.now() - existing.createdAt.getTime() < PENDING_CARD_TTL_MS;
      const reuse =
        existing?.status === "PENDING_CARD" && fresh ? existing : null;
      if (existing && !reuse) {
        const replaceable =
          existing.status === "PENDING_CARD" ||
          existing.status === "ACTIVATING";
        if (!replaceable || fresh) {
          throw new ConflictException(
            "ya tienes una suscripción a este plan",
          );
        }
      }
      const now = new Date();
      // Se cancelan las PENDING_CARD del person (cualquier plan): el
      // token de customer-return ata a customer→person, no a una sub
      // concreta - con dos pendientes vivas no habría forma de saber
      // cuál activar al volver del disclaimer (M7). Cancel dirigido por
      // fila y condicional por status esperado: si count===0 la fila se
      // movió entremedio (un customer-return la claimeó a ACTIVATING) →
      // se aborta la tx en vez de crear una segunda fila activable.
      for (const s of live) {
        if (s.status !== "PENDING_CARD" || s.id === reuse?.id) continue;
        const canceled = await tx.membershipSubscription.updateMany({
          where: { id: s.id, status: "PENDING_CARD" },
          data: { status: "CANCELED", canceledAt: now },
        });
        if (canceled.count === 0) {
          throw new ConflictException(
            "la suscripción está siendo procesada - reintenta en unos segundos",
          );
        }
      }
      // ACTIVATING expirada de este plan (crash entre claim y update):
      // la reemplaza el intento nuevo - cancel condicional por status.
      // Si el request colgado commiteó ACTIVATING→ACTIVE entremedio,
      // count===0 y NO se pisa: un update incondicional dejaría una sub
      // Flow viva cobrando con fila CANCELED (huérfana permanente -
      // reconcileAll solo escanea ACTIVE/CANCEL_PENDING).
      if (existing?.status === "ACTIVATING") {
        const canceled = await tx.membershipSubscription.updateMany({
          where: { id: existing.id, status: "ACTIVATING" },
          data: { status: "CANCELED", canceledAt: now },
        });
        if (canceled.count === 0) {
          throw new ConflictException(
            "la suscripción está siendo procesada - reintenta en unos segundos",
          );
        }
      }
      if (reuse) return reuse;
      return tx.membershipSubscription.create({
        data: {
          personId,
          planId: plan.id,
          academyId: plan.academyId,
          currency: planCurrency,
        },
      });
    });

    const correlationId = randomUUID();

    // Plan espejo en Flow - lazy create en el primer subscribe. Con
    // promo vigente (spec member-promos) el espejo es el propio de la
    // promo (omni_<plan>_prm_<promo>_<amount>): nunca se muta el espejo
    // base ni MembershipPlan.price.
    const charge = await this.memberChargeSpec(
      plan,
      plan.academyId,
      personId,
      providerName,
      planCurrency,
    );
    const flowPlanId = charge.planId;
    const baseMirrorId = this.remotePlanId(plan, providerName, planCurrency);
    if (flowPlanId !== baseMirrorId) {
      // Sin cargo de servicio en el monto espejo (modelo SaaS - spec
      // academy-saas-billing): el proveedor cobra al alumno solo el
      // monto del cargo (precio del plan, ya descontado si hay promo).
      await provider.ensurePlan(
        {
          planId: flowPlanId,
          name: charge.name,
          amount: charge.amount,
          intervalCount: charge.intervalCount,
          currency: planCurrency,
        },
        { correlationId },
      );
      // Solo se marca el espejo base cuando quedó materializado - con
      // promo el asegurado es el de la promo y el base sigue lazy.
      if (charge.promoId === null) {
        await this.markBaseMirror(
          plan.id,
          providerName,
          planCurrency,
          flowPlanId,
        );
      }
    }

    // Customer en Flow - lazy create (helper compartido con las subs de
    // plataforma); sin email no se puede registrar.
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      providerName,
      personId,
      { correlationId },
    );

    const customer = await provider.getCustomer(customerId, { correlationId });
    if (!customer.hasCard) {
      const { registerUrl } = await provider.registerCustomerCard(
        {
          customerId,
          returnUrl: `${this.apiUrl}/api/payments/flow/customer-return`,
          // Stripe Checkout mode=subscription resuelve el Price por
          // (planId, currency) - Flow/Stub ignoran los campos extra.
          planId: flowPlanId,
          currency: planCurrency,
          metadata: { personId },
        },
        { correlationId },
      );
      return { kind: "needs_card", registerUrl, subscriptionId: sub.id };
    }

    // Claim atómico de la PENDING_CARD: el lock de la tx ya se liberó y
    // un customer-return concurrente pudo activar la sub entremedio -
    // sin el claim ambos harían subscription/create → doble cobro.
    const claimed = await this.prisma.membershipSubscription.updateMany({
      where: { id: sub.id, status: "PENDING_CARD" },
      data: { status: "ACTIVATING" },
    });
    if (claimed.count === 0) {
      const cur = await this.prisma.membershipSubscription.findUnique({
        where: { id: sub.id },
        select: { status: true },
      });
      // El customer-return ganó la carrera y ya la dejó ACTIVE → el
      // subscribe responde éxito sin duplicar el cobro.
      if (cur?.status === "ACTIVE") {
        return { kind: "subscribed", subscriptionId: sub.id };
      }
      // Mensaje acorde al estado real: una CANCELED (cancel del usuario
      // o sweep de otro subscribe) no está "siendo procesada" - el
      // retry inmediato crea un intento nuevo.
      throw new ConflictException(
        cur?.status === "CANCELED"
          ? "la suscripción fue cancelada - vuelve a intentarlo"
          : "la suscripción está siendo procesada - reintenta en unos segundos",
      );
    }

    const { active, fs } = await this.createRemoteSubscription(sub.id, {
      flowPlanId,
      academyPromoId: charge.promoId,
      planChargeClp: charge.amount,
      currency: planCurrency,
      customerId,
      correlationId,
    });

    // El primer invoice puede venir ya pagado en la respuesta - el settle
    // materializa el Enrollment sin esperar al polling/webhook.
    try {
      await this.reconcileSubscription(active, fs, "system");
    } catch (e) {
      this.logger.error(
        `reconcile post-subscribe sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }

    if (active.status === "ACTIVE") {
      await this.notifications.notifySafe(personId, {
        category: "TRANSACTIONAL",
        type: "membership.subscription_started",
        title: "Suscripción activa",
        body: `${plan.name} · ${plan.academy.name}`,
        data: {
          subscriptionId: sub.id,
          planId: plan.id,
          academyId: plan.academyId,
        },
      });
    }
    return { kind: "subscribed", subscriptionId: sub.id };
  }

  /**
   * subscription/create de Flow sobre una sub ya claimeada (ACTIVATING)
   * + persistencia del resultado. Compartido por subscribe (con tarjeta)
   * y customerReturn.
   *
   * - Si la llamada a Flow falla, el claim se revierte a PENDING_CARD:
   *   la tarjeta ya está registrada y el próximo intento la retoma (si
   *   quedara ACTIVATING para siempre, el guard de subscribe daría 409
   *   eterno).
   * - Guard de status remoto (M4): no se asume ACTIVE a ciegas -
   *   el adaptador ya normalizó el código del proveedor; CANCELED →
   *   CANCELED; otro estado → ACTIVE; UNKNOWN → warn + ACTIVE (la sub
   *   existe en el proveedor; bloquear dejaría un cobro real sin
   *   reflejo local y el próximo reconcile corrige el estado).
   * - Si el update local falla, la sub remota quedaría huérfana
   *   (cobrando sin reflejo local) → compensación best-effort: cancel
   *   inmediata (M6) y rethrow.
   * - La transición ACTIVATING→final es condicional (updateMany): si la
   *   sub cambió de estado entremedio (p.ej. cancel del usuario), la sub
   *   remota recién creada se compensa igual y se lanza Conflict.
   */
  private async createRemoteSubscription(
    subId: string,
    p: {
      flowPlanId: string;
      /** Promo materializada en el plan remoto (spec member-promos). */
      academyPromoId: string | null;
      /** Monto horneado en el plan remoto - la verdad del próximo cobro. */
      planChargeClp: number;
      /** Moneda del cobro - resuelve el provider (multipais-currency). */
      currency: string;
      customerId: string;
      correlationId: string;
    },
  ): Promise<{ active: MembershipSubscription; fs: RemoteSubscription }> {
    const { provider } = await this.provider(p.currency);
    let fs: RemoteSubscription;
    try {
      fs = await provider.createSubscription(
        {
          planId: p.flowPlanId,
          customerId: p.customerId,
          subscriptionStart: new Date().toISOString().slice(0, 10),
          currency: p.currency,
        },
        { correlationId: p.correlationId },
      );
    } catch (e) {
      await this.prisma.membershipSubscription
        .updateMany({
          where: { id: subId, status: "ACTIVATING" },
          data: { status: "PENDING_CARD" },
        })
        .catch(() => {});
      throw e;
    }

    // Persistencia temprana del id remoto, INCONDICIONAL sobre la fila:
    // si el proceso muere o la fila se movió antes de la transición de
    // estado, el flowSubscriptionId ya quedó para que el sweep de
    // huérfanas (reconcileAll) la rastree. Si esta escritura falla, la
    // transición condicional de abajo también fallará (count===0) y la
    // compensación cancela la remota - el sweep la rescatará igual vía
    // la auditoría del create.
    await this.prisma.membershipSubscription
      .update({
        where: { id: subId },
        data: { flowSubscriptionId: fs.subscriptionId },
      })
      .catch(() => {});

    // UNKNOWN con rawStatus = código no mapeado por el adaptador (spec
    // subscription-port-generic): warn y se trata como ACTIVE (la sub
    // existe en el proveedor; el reconcile corrige). rawStatus ausente
    // (status null) no advierte - igual que el guard previo.
    if (fs.status === "UNKNOWN" && fs.rawStatus != null) {
      this.logger.warn(
        `subscription/create sub ${subId}: status remoto inesperado ${String(fs.rawStatus)} - queda ACTIVE y el reconcile lo corrige`,
      );
    }
    const nextStatus = fs.status === "CANCELED" ? "CANCELED" : "ACTIVE";
    const transition = await this.prisma.membershipSubscription
      .updateMany({
        where: { id: subId, status: "ACTIVATING" },
        data: {
          flowSubscriptionId: fs.subscriptionId,
          status: nextStatus,
          nextInvoiceAt: fs.nextInvoiceDate
            ? new Date(fs.nextInvoiceDate)
            : null,
          academyPromoId: p.academyPromoId,
          planChargeClp: p.planChargeClp,
          ...(nextStatus === "CANCELED" ? { canceledAt: new Date() } : {}),
        },
      })
      .catch(() => ({ count: 0 }));
    if (transition.count === 0) {
      // La sub ya no estaba ACTIVATING (cancel concurrente, crash+retry)
      // o el update falló: la sub Flow quedó huérfana → cancel inmediata
      // best-effort para no dejar un cobro sin reflejo local.
      await provider
        .cancelSubscription(fs.subscriptionId, {
          correlationId: p.correlationId,
          immediate: true,
        })
        .catch((ce) =>
          this.logger.error(
            `compensación cancel sub remota ${fs.subscriptionId} (local ${subId}): ${ce instanceof Error ? ce.message : ce}`,
          ),
        );
      throw new ConflictException(
        "la suscripción cambió de estado durante la activación",
      );
    }
    const active = await this.prisma.membershipSubscription.findUniqueOrThrow({
      where: { id: subId },
    });
    return { active, fs };
  }

  /**
   * Adopción de una sub remota ya creada por el registro de tarjeta
   * (Stripe Checkout mode=subscription - spec multipais-currency): la
   * fila ACTIVATING pasa a ACTIVE con el id remoto devuelto por
   * getRegisterStatus; el estado real lo confirma el getSubscription
   * inmediato (si falla queda ACTIVE y el reconcile corrige).
   */
  private async adoptRemoteSubscription(
    subId: string,
    p: {
      remoteId: string;
      academyPromoId: string | null;
      planChargeClp: number;
      currency: string;
      correlationId: string;
    },
  ): Promise<{ active: MembershipSubscription; fs: RemoteSubscription }> {
    const { provider } = await this.provider(p.currency);
    const fs = await provider
      .getSubscription(p.remoteId, { correlationId: p.correlationId })
      .catch(() => null);
    const transition = await this.prisma.membershipSubscription.updateMany({
      where: { id: subId, status: "ACTIVATING" },
      data: {
        flowSubscriptionId: p.remoteId,
        status: fs?.status === "CANCELED" ? "CANCELED" : "ACTIVE",
        nextInvoiceAt: fs?.nextInvoiceDate
          ? new Date(fs.nextInvoiceDate)
          : null,
        academyPromoId: p.academyPromoId,
        planChargeClp: p.planChargeClp,
        ...(fs?.status === "CANCELED" ? { canceledAt: new Date() } : {}),
      },
    });
    if (transition.count === 0) {
      throw new ConflictException(
        "la suscripción cambió de estado durante la activación",
      );
    }
    const active = await this.prisma.membershipSubscription.findUniqueOrThrow({
      where: { id: subId },
    });
    return {
      active,
      fs: fs ?? {
        subscriptionId: p.remoteId,
        planId: "",
        status: "ACTIVE",
        morose: false,
        cancelAtPeriodEnd: false,
      },
    };
  }

  /**
   * Retorno del disclaimer de registro de tarjeta (Flow hace POST del
   * browser a url_return con {token}). Público: registra el inbound en
   * GatewayTransaction y, si el registro quedó OK, reanuda la
   * suscripción PENDING_CARD más reciente del customer → ACTIVE.
   * Nunca lanza por estados esperados - el controller traduce a redirect.
   */
  async customerReturn(token: string): Promise<CustomerReturnResult> {
    const correlationId = randomUUID();
    await this.gatewayTx.record({
      provider:
        (await this.subscriptionGateway())?.name ?? "UNCONFIGURED",
      direction: "INBOUND_WEBHOOK",
      endpoint: "customer/register-return",
      correlationId,
      requestBody: { token },
      ok: true,
    });
    // El token del retorno no trae moneda ni provider: se prueba el
    // provider del param (CLP) primero y luego el resto de los
    // adaptadores con motor de suscripciones (spec multipais-currency,
    // mismo patrón que PlatformSubscriptionsService.customerReturn) -
    // el que reconozca el registro gana. Un token cs_… de Stripe
    // Checkout mode=subscription nunca lo entiende Flow.
    const primary = await this.subscriptionGateway();
    const candidates: PaymentGateway[] = [];
    if (primary) candidates.push(primary);
    for (const name of this.gateways.names()) {
      const gw = this.gateways.get(name);
      if (
        gw &&
        gw !== primary &&
        typeof (gw as Partial<SubscriptionProvider>).createSubscription ===
          "function"
      ) {
        candidates.push(gw);
      }
    }
    if (candidates.length === 0) {
      throw new BadRequestException(
        "el proveedor de suscripciones configurado no tiene motor de suscripciones",
      );
    }
    let provider = candidates[0] as unknown as SubscriptionProvider;
    let providerName = candidates[0].name;
    let reg: {
      registered: boolean;
      customerId?: string;
      subscriptionId?: string;
    } = { registered: false };
    for (const gw of candidates) {
      try {
        const r = await (
          gw as unknown as SubscriptionProvider
        ).getRegisterStatus(token, { correlationId });
        if (r.registered && r.customerId) {
          provider = gw as unknown as SubscriptionProvider;
          providerName = gw.name;
          reg = r;
          break;
        }
      } catch {
        // El token no pertenece a este proveedor - probar el siguiente.
      }
    }
    if (!reg.registered || !reg.customerId) {
      return { ok: false, academyId: null };
    }
    // Customer → person: mapa por proveedor (gatewayCustomerIds) con
    // fallback a la columna legacy flowCustomerId para FLOW.
    const person = await this.prisma.person.findFirst({
      where: {
        OR: [
          {
            gatewayCustomerIds: {
              path: [providerName.toUpperCase()],
              equals: reg.customerId,
            },
          },
          ...(providerName.toUpperCase() === "FLOW"
            ? [{ flowCustomerId: reg.customerId }]
            : []),
        ],
      },
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
            remoteRefs: true,
            currency: true,
            name: true,
            type: true,
            price: true,
            academy: { select: { name: true } },
          },
        },
      },
    });
    if (!sub) return { ok: false, academyId: null };

    // Claim atómico PENDING_CARD → ACTIVATING (I1): un segundo return
    // del browser o un subscribe concurrente con tarjeta no puede
    // duplicar el subscription/create. count===0 → otro la tomó; si ya
    // quedó ACTIVE el redirect es de éxito igual (retry del browser).
    const claimed = await this.prisma.membershipSubscription.updateMany({
      where: { id: sub.id, status: "PENDING_CARD" },
      data: { status: "ACTIVATING" },
    });
    if (claimed.count === 0) {
      const cur = await this.prisma.membershipSubscription.findUnique({
        where: { id: sub.id },
        select: { status: true, academyId: true },
      });
      return cur?.status === "ACTIVE"
        ? { ok: true, academyId: cur.academyId }
        : { ok: false, academyId: sub.academyId };
    }

    // El cargo se re-resuelve al volver del disclaimer (spec
    // member-promos): la promo pudo aparecer, editarse o expirar entre
    // el intento y el retorno. El espejo se asegura acá (idempotente);
    // si el resuelto es el base y aún no estaba materializado, se marca.
    // El provider ya quedó resuelto por el token (multi-provider): no
    // se re-deriva por moneda - un mismatch moneda↔provider fallaría
    // en ensurePlan/createSubscription, no en una resolución silenciosa.
    const subCurrency = sub.plan.currency ?? "CLP";
    const charge = await this.memberChargeSpec(
      { ...sub.plan, id: sub.planId },
      sub.academyId,
      person.id,
      providerName,
      subCurrency,
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
        currency: subCurrency,
      },
      { correlationId },
    );
    if (
      charge.promoId === null &&
      !this.remotePlanId(sub.plan, providerName, subCurrency)
    ) {
      await this.markBaseMirror(
        sub.planId,
        providerName,
        subCurrency,
        charge.planId,
      );
    }
    // La sesión de Stripe (Checkout mode=subscription) ya creó la sub
    // remota - su id viene en getRegisterStatus; Flow no lo emite.
    const { active, fs } = reg.subscriptionId
      ? await this.adoptRemoteSubscription(sub.id, {
          remoteId: reg.subscriptionId,
          academyPromoId: charge.promoId,
          planChargeClp: charge.amount,
          currency: subCurrency,
          correlationId,
        })
      : await this.createRemoteSubscription(sub.id, {
          flowPlanId: charge.planId,
          academyPromoId: charge.promoId,
          planChargeClp: charge.amount,
          currency: subCurrency,
          customerId: reg.customerId,
          correlationId,
        });
    try {
      await this.reconcileSubscription(active, fs, "system");
    } catch (e) {
      this.logger.error(
        `reconcile post-customer-return sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (active.status === "ACTIVE") {
      await this.notifications.notifySafe(person.id, {
        category: "TRANSACTIONAL",
        type: "membership.subscription_started",
        title: "Suscripción activa",
        body: `${sub.plan.name} · ${sub.plan.academy.name}`,
        data: { subscriptionId: sub.id, academyId: sub.academyId },
      });
    }
    return { ok: true, academyId: sub.academyId };
  }

  /**
   * urlCallback de los Flow-plans (plans/create lo registró): Flow avisa
   * eventos de suscripción (cobro, mora, cancelación). Registramos el
   * inbound y disparamos reconcileAll fire-and-forget - el endpoint
   * responde 200 siempre (si no, Flow reintenta y repetiría el barrido);
   * el cron diario (T7) es la red de seguridad real.
   *
   * I3: sin `token` (string no vacía) NO se dispara el sweep - el
   * endpoint es público y cada reconcileAll ejecuta N llamadas firmadas
   * a Flow; exigir el token evita amplificación por POST arbitrarios.
   * El registro INBOUND se mantiene igual (evidencia del intento).
   */
  async subscriptionWebhook(token: string | null): Promise<void> {
    await this.gatewayTx.record({
      provider:
        (await this.subscriptionGateway())?.name ?? "UNCONFIGURED",
      direction: "INBOUND_WEBHOOK",
      endpoint: "subscription/callback",
      correlationId: randomUUID(),
      requestBody: { token },
      ok: true,
    });
    if (typeof token !== "string" || token.trim() === "") return;
    void this.reconcileAll().catch((e) =>
      this.logger.error(
        `reconcileAll post-webhook falló: ${e instanceof Error ? e.message : e}`,
      ),
    );
  }

  /**
   * Evento de billing del webhook firmado del proveedor (spec
   * stripe-subs-webhook): si `ev.subscriptionId` es el remoteId
   * persistido de una MembershipSubscription (`flowSubscriptionId` -
   * Stripe lo guarda ahí igual que Flow), lo traduce a un
   * RemoteSubscription sintético y corre el MISMO reconcile puntual:
   * `invoice.paid` → settle de renovación (extiende vigencia, emite
   * Payment), `invoice.payment_failed` → mora (renewal_failed +
   * RENEWAL_FAILED), `customer.subscription.deleted|.updated` → sync
   * de estado (CANCELED / CANCEL_PENDING). Dedup por
   * `lastInvoiceId`/refId `mem_<planId>_<invoiceId>` - la misma invoice
   * por webhook y por polling liquida una sola vez.
   *
   * `true` = el evento pertenece a este dominio (target resuelto -
   * también cuando el tipo no tiene efecto local); `false` = ninguna
   * sub usa ese remoteId y el dispatcher prueba el siguiente
   * consumidor.
   */
  async handleBillingEvent(ev: BillingWebhookEvent): Promise<boolean> {
    if (!ev.subscriptionId) return false;
    const sub = await this.prisma.membershipSubscription.findUnique({
      where: { flowSubscriptionId: ev.subscriptionId },
    });
    if (!sub) return false;
    const fs = remoteFromBillingEvent(ev, {
      subscriptionId: sub.flowSubscriptionId!,
      planId: sub.planId,
      nextInvoiceAt: sub.nextInvoiceAt,
    });
    if (fs) await this.reconcileSubscription(sub, fs, "webhook");
    return true;
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
   * local - el cron sigue reconciliando.
   */
  async getForOwner(personId: string, id: string) {
    const sub = await this.prisma.membershipSubscription.findUnique({
      where: { id },
    });
    if (!sub || sub.personId !== personId) {
      throw new NotFoundException("suscripción no encontrada");
    }
    if (
      sub.flowSubscriptionId &&
      (await this.subscriptionGateway(sub.currency))
    ) {
      try {
        const { provider } = await this.provider(sub.currency);
        const fs = await provider.getSubscription(sub.flowSubscriptionId, {
          correlationId: randomUUID(),
        });
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

    const { provider } = await this.provider(sub.currency);
    await provider.cancelSubscription(sub.flowSubscriptionId, {
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
      await this.prisma.$transaction((tx) =>
        emitPaymentEvent(
          tx,
          lastPayment.id,
          "SUBSCRIPTION_CANCELED",
          "person",
          {
            subscriptionId: sub.id,
            flowSubscriptionId: sub.flowSubscriptionId,
            planId: sub.planId,
          },
        ),
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
        ? `${plan.name} · ${plan.academy.name} - acceso hasta fin del período pagado`
        : "Acceso hasta fin del período pagado",
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
   * falle no aborta el resto - queda loggeada y la reintenta el próximo
   * barrido.
   */
  async reconcileAll(
    actor = "reconcile",
  ): Promise<{ checked: number; settled: number }> {
    const subs = await this.prisma.membershipSubscription.findMany({
      where: {
        flowSubscriptionId: { not: null },
        status: { in: ["ACTIVE", "CANCEL_PENDING"] },
      },
    });
    // Provider por moneda de cada sub (spec multipais-currency) - lazy
    // por currency; una moneda sin proveedor solo salta sus subs.
    const providers = new Map<string, SubscriptionProvider | null>();
    const providerFor = async (currency: string) => {
      const cur = currency.toUpperCase();
      if (!providers.has(cur)) {
        providers.set(
          cur,
          (await this.provider(cur).catch(() => null))?.provider ?? null,
        );
      }
      return providers.get(cur) ?? null;
    };
    let settled = 0;
    const orphanProviders = new Map<
      string,
      { provider: SubscriptionProvider; name: string }
    >();
    // El barrido de huérfanas corre siempre sobre el provider del param
    // (CLP) además de los providers de otras monedas con subs vivas.
    const primary = await this.provider("CLP").catch(() => null);
    if (primary) {
      orphanProviders.set(primary.name, {
        provider: primary.provider,
        name: primary.name,
      });
    }
    for (const sub of subs) {
      const provider = await providerFor(sub.currency ?? "CLP");
      if (!provider) {
        this.logger.warn(
          `reconcile sub ${sub.id}: moneda ${sub.currency} sin proveedor de suscripciones`,
        );
        continue;
      }
      const resolved = await this.provider(sub.currency ?? "CLP").catch(
        () => null,
      );
      if (resolved && !orphanProviders.has(resolved.name)) {
        orphanProviders.set(resolved.name, {
          provider: resolved.provider,
          name: resolved.name,
        });
      }
      try {
        const fs = await provider.getSubscription(sub.flowSubscriptionId!, {
          correlationId: randomUUID(),
        });
        settled += await this.reconcileSubscription(sub, fs, actor);
      } catch (e) {
        this.logger.error(
          `reconcile sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    for (const p of orphanProviders.values()) {
      await this.sweepOrphanSubscriptions(p.provider, p.name);
    }
    return { checked: subs.length, settled };
  }

  /**
   * Sweep de suscripciones huérfanas: contrasta los `subscription/create`
   * exitosos auditados en GatewayTransaction contra las filas locales.
   * Un id remoto sin cobertura local viva significa que el proceso murió
   * entre el create y la persistencia (o la fila se canceló en la
   * ventana) → la remota sigue cobrando sin reflejo: se cancela de forma
   * inmediata.
   *
   * Cobertura viva = fila local con ese flowSubscriptionId en
   * ACTIVE/CANCEL_PENDING (las reconcilia reconcileSubscription) o
   * ACTIVATING fresca (request en vuelo - además el grace por createdAt
   * de la auditoría ya la excluye). Un crash en el round-trip del create
   * deja el id solo en la auditoría: este sweep es la última red.
   *
   * El barrido cubre AMBAS tablas: `subscription/create` es el mismo
   * endpoint auditado para membresías y para PlatformSubscription
   * (academy-saas-billing) - sin la cobertura de la segunda tabla, el
   * sweep cancelaría las subs de plataforma vivas por "huérfanas".
   */
  private async sweepOrphanSubscriptions(
    provider: SubscriptionProvider,
    providerName: string,
  ): Promise<void> {
    const txs = await this.prisma.gatewayTransaction.findMany({
      where: {
        // Se filtra por el provider BARRIDO (spec multipais-currency):
        // el create auditado de otra pasarela no se cancela con este
        // adaptador - los ids remotos no son intercambiables.
        provider: providerName,
        direction: "OUTBOUND",
        endpoint: "subscription/create",
        ok: true,
        createdAt: { lte: new Date(Date.now() - ORPHAN_SWEEP_GRACE_MS) },
      },
      select: { responseBody: true },
    });
    const remoteIds = new Set<string>();
    for (const t of txs) {
      const id = (
        t.responseBody as { subscriptionId?: unknown } | null
      )?.subscriptionId;
      if (typeof id === "string" && id) remoteIds.add(id);
    }
    if (!remoteIds.size) return;
    const [linked, linkedPlatform] = await Promise.all([
      this.prisma.membershipSubscription.findMany({
        where: { flowSubscriptionId: { in: [...remoteIds] } },
      }),
      this.prisma.platformSubscription.findMany({
        where: { flowSubscriptionId: { in: [...remoteIds] } },
      }),
    ]);
    const byRemote = new Map(
      linked.map((s) => [s.flowSubscriptionId!, s] as const),
    );
    const platformByRemote = new Map(
      linkedPlatform.map((s) => [s.flowSubscriptionId!, s] as const),
    );
    for (const remoteId of remoteIds) {
      const local = byRemote.get(remoteId);
      const platformLocal = platformByRemote.get(remoteId);
      if (
        platformLocal &&
        (platformLocal.status === "ACTIVE" ||
          platformLocal.status === "CANCEL_PENDING")
      ) {
        continue; // cobertura viva en la tabla de plataforma
      }
      if (
        platformLocal?.status === "ACTIVATING" &&
        Date.now() - platformLocal.createdAt.getTime() < PENDING_CARD_TTL_MS
      ) {
        continue; // request en vuelo
      }
      if (
        local &&
        (local.status === "ACTIVE" || local.status === "CANCEL_PENDING")
      ) {
        continue; // cobertura viva - reconcileSubscription la cubre
      }
      if (
        local?.status === "ACTIVATING" &&
        Date.now() - local.createdAt.getTime() < PENDING_CARD_TTL_MS
      ) {
        continue; // request en vuelo
      }
      try {
        const fs = await provider.getSubscription(remoteId, {
          correlationId: randomUUID(),
        });
        if (fs.status === "CANCELED") continue; // remota ya cancelada
        await provider.cancelSubscription(remoteId, {
          correlationId: randomUUID(),
          immediate: true,
        });
        this.logger.warn(
          `sub remota huérfana ${remoteId} cancelada (local: ${local?.id ?? platformLocal?.id ?? "sin fila"})`,
        );
        if (local?.status === "ACTIVATING") {
          await this.prisma.membershipSubscription.updateMany({
            where: { id: local.id, status: "ACTIVATING" },
            data: { status: "CANCELED", canceledAt: new Date() },
          });
        }
        if (platformLocal?.status === "ACTIVATING") {
          await this.prisma.platformSubscription.updateMany({
            where: { id: platformLocal.id, status: "ACTIVATING" },
            data: { status: "CANCELED", canceledAt: new Date() },
          });
        }
      } catch (e) {
        this.logger.error(
          `orphan sweep ${remoteId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /**
   * Reconcile de una suscripción contra su estado remoto en Flow -
   * compartido por el polling de GET /subscriptions/:id, el webhook y el
   * cron (T7 le agrega reminder/morose encima).
   *
   * Invoices pagados (`inv.paid` normalizado por el adaptador): dedup
   * por lastInvoiceId y por Payment.refId `mem_<planId>_<invoiceId>`
   * (único - retry seguro); cada uno nuevo crea el Payment PENDING +
   * ORDER_CREATED en el ledger y pasa por settleMembership
   * (kind "renewal" → RENEWAL_SETTLED).
   *
   * Sync de estado: nextInvoiceAt desde `fs.nextInvoiceDate`;
   * `cancelAtPeriodEnd` → CANCEL_PENDING; `status CANCELED` → CANCELED.
   * Devuelve cuántos invoices se liquidaron en esta pasada.
   *
   * Encima del sync corren los avisos del cron (T7): el reminder del
   * cobro del día siguiente (dedup por reminderSentFor === nextInvoiceAt)
   * y la mora - `morose=1` con invoice impaga → membership.renewal_failed
   * (dedup por invoiceId en la notificación ya enviada). Política SIN
   * grace period: el enrollment expira solo en endsAt, acá no se toca
   * nada más que notificar; la sub tampoco se marca CANCELED por mora
   * (Flow reintenta el cobro - sigue viva).
   */
  async reconcileSubscription(
    sub: MembershipSubscription,
    fs: RemoteSubscription,
    actor = "reconcile",
  ): Promise<number> {
    let settled = 0;
    const paidInvoices = (fs.invoices ?? []).filter((inv) => inv.paid);
    if (paidInvoices.length) {
      // Fallback de monto si la invoice no trae amount (raro - Flow lo
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
        });
        if (exists) {
          // Si el settle de una pasada anterior falló post-create, el
          // Payment quedó PENDING y la invoice cobrada sin enrollment
          // (I2). Se reintenta acá - settleMembership re-chequea status
          // dentro de su tx → idempotente. Si lanza, la invoice NO se
          // marca y el próximo barrido lo reintenta de nuevo.
          if (exists.status === "PENDING") {
            await this.settlement.settleMembership(exists, {
              actor,
              kind: "renewal",
              gatewayData: inv.payment?.data,
            });
            settled++;
          }
          await this.markInvoice(sub.id, invId);
          sub.lastInvoiceId = invId;
          continue;
        }
        // Fallback sin cargo de servicio (modelo SaaS - spec
        // academy-saas-billing): si Flow no reporta monto, el Payment
        // local registra solo el precio del plan.
        const amount = inv.amount > 0 ? inv.amount : (plan?.price ?? 0);
        // Desglose congelado igual que el checkout (spec
        // producer-fee-model): feeMode ACADEMY - sin comisión, la
        // pasarela esperada por card_pct queda para reconciliar.
        const cardPct = await this.params.getNumber(
          "gateway_fee.card_pct",
          3.19,
        );
        const payment = await this.prisma.payment.create({
          data: {
            orderType: "MEMBERSHIP",
            refId,
            personId: sub.personId,
            amount,
            fee: 0, // costo pasarela: lo persiste el settle (paymentData.fee)
            net: amount,
            // Auditoría del cobro descontado (spec member-promos) - base
            // del conteo de maxCycles por alumno.
            academyPromoId: sub.academyPromoId ?? null,
            currency: sub.currency ?? "CLP",
            gateway:
              (await this.subscriptionGateway(sub.currency))?.name ??
              "UNCONFIGURED",
            gatewayRef: inv.payment?.orderRef ?? null,
            ...academyFeeBreakdown(amount, cardPct),
          },
        });
        await this.prisma.$transaction((tx) =>
          emitPaymentEvent(tx, payment.id, "ORDER_CREATED", actor, {
            refId,
            invoiceId: invId,
            subscriptionId: sub.id,
          }),
        );
        await this.settlement.settleMembership(payment, {
          actor,
          kind: "renewal",
          gatewayData: inv.payment?.data,
        });
        settled++;
        await this.markInvoice(sub.id, invId);
        sub.lastInvoiceId = invId;
      }
    }

    const nextInvoiceAt = fs.nextInvoiceDate
      ? new Date(fs.nextInvoiceDate)
      : null;
    let status = sub.status;
    let canceledAt = sub.canceledAt;
    // Estado ya normalizado por el adaptador (spec
    // subscription-port-generic): CANCELED es terminal; UNKNOWN se
    // trata como vigente (igual que antes un código ≠4).
    if (fs.status === "CANCELED") {
      if (sub.pendingReprice) {
        // Reprice agendado por drift de precio (spec member-promos):
        // recrea la remota con el cargo vigente al fin del período - la
        // resolución vuelve a correr (promo expirada/agotada → plan base
        // a precio lleno). Si falla, CANCEL_PENDING + pendingReprice →
        // el próximo barrido reintenta.
        try {
          const repriced = await this.applyPendingReprice(sub, actor);
          if (repriced) return settled;
        } catch (e) {
          this.logger.error(
            `reprice sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
          );
          await this.prisma.membershipSubscription
            .update({
              where: { id: sub.id },
              data: {
                status: "CANCEL_PENDING",
                canceledAt: sub.canceledAt ?? new Date(),
              },
            })
            .catch(() => {});
          return settled;
        }
      }
      status = "CANCELED";
      canceledAt ??= new Date();
    } else if (
      fs.cancelAtPeriodEnd &&
      status === "ACTIVE" &&
      !sub.pendingReprice
    ) {
      // Con reprice agendado el status se mantiene ACTIVE: la cancel de
      // la remota la pidió el sistema para el swap, no el alumno.
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

    const now = Date.now();
    // Reminder del cobro del día siguiente: una vez por nextInvoiceAt
    // (reminderSentFor lo dedup - si Flow mueve la fecha, se puede
    // volver a avisar). Solo en ACTIVE: una CANCEL_PENDING no tiene
    // próximo cobro real aunque Flow siga reportando la fecha.
    if (
      status === "ACTIVE" &&
      nextInvoiceAt != null &&
      nextInvoiceAt.getTime() > now &&
      nextInvoiceAt.getTime() <= now + REMINDER_WINDOW_MS &&
      sub.reminderSentFor?.getTime() !== nextInvoiceAt.getTime()
    ) {
      const plan = await this.prisma.membershipPlan.findUnique({
        where: { id: sub.planId },
        select: { name: true, academy: { select: { name: true } } },
      });
      await this.notifications.notifySafe(sub.personId, {
        category: "TRANSACTIONAL",
        type: "membership.renewal_reminder",
        title: "Renovación mañana",
        body: plan
          ? `${plan.name} · ${plan.academy.name}`
          : "Se cobrará el próximo período de tu plan",
        data: {
          subscriptionId: sub.id,
          planId: sub.planId,
          planName: plan?.name ?? null,
          nextInvoiceAt: nextInvoiceAt.toISOString(),
        },
      });
      await this.prisma.membershipSubscription.update({
        where: { id: sub.id },
        data: { reminderSentFor: nextInvoiceAt },
      });
      sub.reminderSentFor = nextInvoiceAt;
    }

    // Mora: el proveedor reporta mora (Flow morose=1 → `morose`) con
    // la invoice impaga en invoices[]. Sin grace period - solo se
    // notifica una vez por invoice impaga (dedup por invoiceId en la
    // notificación enviada; la más antigua es el inicio del episodio -
    // clave estable mientras dure la mora).
    if (fs.morose) {
      const unpaid = (fs.invoices ?? [])
        .filter((inv) => !inv.paid)
        .sort((a, b) => Number(a.id) - Number(b.id))[0];
      const invoiceId = unpaid != null ? String(unpaid.id) : null;
      const already = await this.prisma.notification.findFirst({
        where: {
          personId: sub.personId,
          type: "membership.renewal_failed",
          AND: [
            { data: { path: ["subscriptionId"], equals: sub.id } },
            ...(invoiceId
              ? [{ data: { path: ["invoiceId"], equals: invoiceId } }]
              : []),
          ],
        },
        select: { id: true },
      });
      if (!already) {
        // Evidencia en el ledger del último pago de la suscripción
        // (mismo anchor que SUBSCRIPTION_CANCELED en cancel()).
        const lastPayment = await this.prisma.payment.findFirst({
          where: {
            personId: sub.personId,
            orderType: "MEMBERSHIP",
            refId: { startsWith: `mem_${sub.planId}_` },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (lastPayment) {
          await this.prisma.$transaction((tx) =>
            emitPaymentEvent(tx, lastPayment.id, "RENEWAL_FAILED", actor, {
              subscriptionId: sub.id,
              invoiceId,
              morose: true,
            }),
          );
        }
        const plan = await this.prisma.membershipPlan.findUnique({
          where: { id: sub.planId },
          select: { name: true, academy: { select: { name: true } } },
        });
        await this.notifications.notifySafe(sub.personId, {
          category: "TRANSACTIONAL",
          type: "membership.renewal_failed",
          title: "Cobro fallido",
          body: plan
            ? `${plan.name} · ${plan.academy.name} - reintentaremos; revisa tu tarjeta`
            : "Reintentaremos el cobro - revisa tu tarjeta",
          data: {
            subscriptionId: sub.id,
            planId: sub.planId,
            planName: plan?.name ?? null,
            invoiceId,
          },
        });
      }
    }

    // Drift de precio (spec member-promos): la remota debe cobrar lo que
    // la resolución de promos da HOY (promo vigente o precio lleno). Si
    // difiere; promo nueva aplicable, agotada, expirada, deshabilitada,
    // editada, o precio del plan cambiado; se agenda el reprice: cancel
    // de la remota a fin de período + recreación con el cargo vigente.
    // Con mora no se agenda nada (el cobro está fallando; la
    // regularización resuelve el precio después).
    if (
      status === "ACTIVE" &&
      !fs.morose &&
      sub.flowSubscriptionId &&
      !fs.cancelAtPeriodEnd &&
      !sub.pendingReprice
    ) {
      try {
        await this.ensureRemotePrice(sub, actor);
      } catch (e) {
        this.logger.error(
          `drift-check sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return settled;
  }

  /**
   * Agenda el reprice de una sub cuyo plan remoto ya no calza con lo que
   * memberChargeSpec resuelve hoy: cancel de la remota a fin de período
   * + `pendingReprice`. Cuando Flow la reporta CANCELED el reconcile la
   * recrea con el cargo vigente (`applyPendingReprice`).
   */
  private async ensureRemotePrice(
    sub: MembershipSubscription,
    actor: string,
  ): Promise<void> {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: sub.planId },
      include: { academy: { select: { name: true } } },
    });
    if (!plan) return;
    const cur = sub.currency ?? plan.currency ?? "CLP";
    const { name: gwName } = await this.provider(cur);
    const expected = await this.memberChargeSpec(
      plan,
      sub.academyId,
      sub.personId,
      gwName,
      cur,
    );
    const drift =
      (sub.academyPromoId ?? null) !== (expected.promoId ?? null) ||
      (sub.planChargeClp != null && sub.planChargeClp !== expected.amount);
    if (!drift) return;
    const { provider } = await this.provider(cur);
    await provider.cancelSubscription(sub.flowSubscriptionId!, {
      correlationId: randomUUID(),
    });
    await this.prisma.membershipSubscription.update({
      where: { id: sub.id },
      data: { pendingReprice: true },
    });
    sub.pendingReprice = true;
    this.logger.log(
      `reprice agendado sub ${sub.id} (${actor}): promo ${sub.academyPromoId ?? "-"}→${expected.promoId ?? "-"}, cargo ${sub.planChargeClp ?? "?"}→${expected.amount}`,
    );
  }

  /**
   * Materializa el reprice cuando la remota vieja quedó CANCELED (fin de
   * período): recrea la sub remota sobre el plan que memberChargeSpec
   * resuelve HOY - espejo base o promo según aplique. El primer cobro de
   * la remota nueva es el del ciclo que empieza (la invoice pagada la
   * liquida el reconcile recursivo).
   */
  private async applyPendingReprice(
    sub: MembershipSubscription,
    actor: string,
  ): Promise<boolean> {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: sub.planId },
      include: { academy: { select: { name: true } } },
    });
    if (!plan) return false;
    const cur = sub.currency ?? plan.currency ?? "CLP";
    const { provider, name: providerName } = await this.provider(cur);
    const correlationId = randomUUID();
    const charge = await this.memberChargeSpec(
      plan,
      sub.academyId,
      sub.personId,
      providerName,
      cur,
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
        currency: cur,
      },
      { correlationId },
    );
    if (
      charge.promoId === null &&
      !this.remotePlanId(plan, providerName, cur)
    ) {
      await this.markBaseMirror(plan.id, providerName, cur, charge.planId);
    }
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      providerName,
      sub.personId,
      { correlationId },
    );
    const fs = await provider.createSubscription(
      {
        planId: charge.planId,
        customerId,
        subscriptionStart: new Date().toISOString().slice(0, 10),
        currency: cur,
      },
      { correlationId },
    );
    // Persistencia temprana del id remoto - el sweep de huérfanas la
    // rastrea aunque muera el proceso antes del updateMany.
    await this.prisma.membershipSubscription
      .update({
        where: { id: sub.id },
        data: { flowSubscriptionId: fs.subscriptionId },
      })
      .catch(() => {});
    const transition = await this.prisma.membershipSubscription
      .updateMany({
        where: { id: sub.id, status: sub.status },
        data: {
          flowSubscriptionId: fs.subscriptionId,
          status: fs.status === "CANCELED" ? "CANCELED" : "ACTIVE",
          nextInvoiceAt: fs.nextInvoiceDate
            ? new Date(fs.nextInvoiceDate)
            : null,
          lastInvoiceId: null,
          reminderSentFor: null,
          pendingReprice: false,
          academyPromoId: charge.promoId,
          planChargeClp: charge.amount,
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
        "la suscripción cambió de estado durante el reprice",
      );
    }
    const updated = await this.prisma.membershipSubscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    try {
      await this.reconcileSubscription(updated, fs, actor);
    } catch (e) {
      this.logger.error(
        `reconcile post-reprice sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    return true;
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
