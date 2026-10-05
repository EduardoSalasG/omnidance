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
import { ensureFlowCustomer } from "./flow-customer";

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

export type SubscribeResult =
  | { kind: "needs_card"; registerUrl: string; subscriptionId: string }
  | { kind: "subscribed"; subscriptionId: string };

export type CustomerReturnResult =
  | { ok: true; academyId: string }
  | { ok: false; academyId: string | null };

// Shape público de una suscripción (lo que ve el dueño) - la academy viene
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
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly params: ParamsService,
    private readonly settlement: PaymentSettlementService,
    private readonly notifications: NotificationsService,
    private readonly gatewayTx: GatewayTransactionsService,
  ) {}

  /**
   * Port opcional: capability check por presencia de métodos, no por
   * name - cualquier adapter que implemente SubscriptionProvider vale
   * (Flow; StubGateway en dev), sin depender del concreto (hexagonal).
   */
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
    plan: { flowPlanId: string | null; academy: { name: string } },
    next: { name: string; price: number },
  ): Promise<void> {
    if (!plan.flowPlanId || !this.supportsSubscriptions()) return;
    // Sin cargo de servicio en el monto espejo (modelo SaaS - spec
    // academy-saas-billing): Flow cobra al alumno solo plan.price; el
    // costo de pasarela se liquida en el payout de la academia.
    await this.provider().syncPlan(
      {
        planId: plan.flowPlanId,
        name: `${plan.academy.name} - ${next.name}`,
        amount: next.price,
      },
      { correlationId: randomUUID() },
    );
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
    // Capability check ANTES de la tx: con un gateway sin motor de
    // suscripciones no se crea una fila PENDING_CARD muerta.
    const provider = this.provider();

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
        data: { personId, planId: plan.id, academyId: plan.academyId },
      });
    });

    const correlationId = randomUUID();

    // Plan espejo en Flow - lazy create en el primer subscribe.
    let flowPlanId = plan.flowPlanId;
    if (!flowPlanId) {
      flowPlanId = `omni_${plan.id}`;
      // Sin cargo de servicio en el monto espejo (modelo SaaS - spec
      // academy-saas-billing): Flow cobra al alumno solo plan.price.
      await provider.ensurePlan(
        {
          planId: flowPlanId,
          name: `${plan.academy.name} - ${plan.name}`,
          amount: plan.price,
          intervalCount,
        },
        { correlationId },
      );
      await this.prisma.membershipPlan.update({
        where: { id: plan.id },
        data: { flowPlanId },
      });
    }

    // Customer en Flow - lazy create (helper compartido con las subs de
    // plataforma); sin email no se puede registrar.
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      personId,
      { correlationId },
    );

    const customer = await provider.getCustomer(customerId, { correlationId });
    if (!customer.creditCardType) {
      const { registerUrl } = await provider.registerCustomerCard(
        {
          customerId,
          returnUrl: `${this.apiUrl}/api/payments/flow/customer-return`,
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

    const { active, fs } = await this.createFlowSubscription(sub.id, {
      flowPlanId,
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
   *   `fs.status` se coerciona a número (Flow puede devolverlo como
   *   STRING "4", igual que getRegisterStatus); 4 (cancelada) →
   *   CANCELED; ausente/1 → ACTIVE; otro valor o NaN → warn + ACTIVE
   *   (la sub existe en Flow; bloquear dejaría un cobro real sin
   *   reflejo local y el próximo reconcile corrige el estado).
   * - Si el update local falla, la sub Flow quedaría huérfana (cobrando
   *   sin reflejo local) → compensación best-effort: cancel inmediata
   *   (M6) y rethrow.
   * - La transición ACTIVATING→final es condicional (updateMany): si la
   *   sub cambió de estado entremedio (p.ej. cancel del usuario), la sub
   *   Flow recién creada se compensa igual y se lanza Conflict.
   */
  private async createFlowSubscription(
    subId: string,
    p: { flowPlanId: string; customerId: string; correlationId: string },
  ): Promise<{ active: MembershipSubscription; fs: FlowSubscription }> {
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

    // Coerción defensiva: Flow puede devolver status como string ("4")
    // igual que en getRegisterStatus. NaN cae en el warn y se trata como
    // ACTIVE (la sub existe en Flow; el reconcile corrige).
    const remoteStatus = fs.status == null ? null : Number(fs.status);
    if (remoteStatus != null && remoteStatus !== 1 && remoteStatus !== 4) {
      this.logger.warn(
        `subscription/create sub ${subId}: status remoto inesperado ${String(fs.status)} - queda ACTIVE y el reconcile lo corrige`,
      );
    }
    const nextStatus = remoteStatus === 4 ? "CANCELED" : "ACTIVE";
    const transition = await this.prisma.membershipSubscription
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
            `compensación cancel Flow sub ${fs.subscriptionId} (local ${subId}): ${ce instanceof Error ? ce.message : ce}`,
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
   * Retorno del disclaimer de registro de tarjeta (Flow hace POST del
   * browser a url_return con {token}). Público: registra el inbound en
   * GatewayTransaction y, si el registro quedó OK, reanuda la
   * suscripción PENDING_CARD más reciente del customer → ACTIVE.
   * Nunca lanza por estados esperados - el controller traduce a redirect.
   */
  async customerReturn(token: string): Promise<CustomerReturnResult> {
    const correlationId = randomUUID();
    await this.gatewayTx.record({
      provider: this.gateway.name,
      direction: "INBOUND_WEBHOOK",
      endpoint: "customer/register-return",
      correlationId,
      requestBody: { token },
      ok: true,
    });
    const provider = this.provider();
    const reg = await provider.getRegisterStatus(token, { correlationId });
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

    const { active, fs } = await this.createFlowSubscription(sub.id, {
      flowPlanId: sub.plan.flowPlanId,
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
      provider: this.gateway.name,
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
    if (sub.flowSubscriptionId && this.supportsSubscriptions()) {
      try {
        const fs = await this.provider().getSubscription(
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

    await this.provider().cancelSubscription(sub.flowSubscriptionId, {
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
    if (!this.supportsSubscriptions()) return { checked: 0, settled: 0 };
    const provider = this.provider();
    const subs = await this.prisma.membershipSubscription.findMany({
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
          `reconcile sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    await this.sweepOrphanSubscriptions(provider);
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
  ): Promise<void> {
    const txs = await this.prisma.gatewayTransaction.findMany({
      where: {
        provider: this.gateway.name,
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
        if (Number(fs.status) === 4) continue; // remota ya cancelada
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
   * Invoices pagados (isFlowInvoicePaid): dedup por lastInvoiceId y por
   * Payment.refId `mem_<planId>_<invoiceId>` (único - retry seguro);
   * cada uno nuevo crea el Payment PENDING + ORDER_CREATED en el ledger
   * y pasa por settleMembership (kind "renewal" → RENEWAL_SETTLED).
   *
   * Sync de estado: nextInvoiceAt desde next_invoice_date;
   * cancel_at_period_end → CANCEL_PENDING; status 4 → CANCELED.
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
    fs: FlowSubscription,
    actor = "reconcile",
  ): Promise<number> {
    let settled = 0;
    const paidInvoices = (fs.invoices ?? []).filter(isFlowInvoicePaid);
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
              gatewayData: inv.payment?.paymentData,
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
        const payment = await this.prisma.payment.create({
          data: {
            orderType: "MEMBERSHIP",
            refId,
            personId: sub.personId,
            amount,
            fee: 0, // costo pasarela: lo persiste el settle (paymentData.fee)
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
          }),
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
    // Flow puede devolver status y flags como strings ("4", "1") -
    // misma coerción defensiva que en createFlowSubscription.
    const remoteStatus = fs.status == null ? null : Number(fs.status);
    if (remoteStatus === 4) {
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

    // Mora: Flow reporta morose=1 con la invoice impaga en invoices[].
    // Sin grace period - solo se notifica una vez por invoice impaga
    // (dedup por invoiceId en la notificación enviada; Flow crea una
    // invoice por intento, la más antigua es el inicio del episodio -
    // clave estable mientras dure la mora).
    if (Number(fs.morose) === 1) {
      const unpaid = (fs.invoices ?? [])
        .filter((inv) => !isFlowInvoicePaid(inv))
        .sort((a, b) => a.id - b.id)[0];
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
