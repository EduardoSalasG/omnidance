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
  MembershipSubscription,
  Payment,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { academyFeeBreakdown } from "../../common/fee-breakdown";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { emitPaymentEvent } from "../domain/payment-ledger";
import {
  type BillingWebhookEvent,
  type CollectResult,
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
import { GatewayAccountsService } from "./gateway-accounts.service";
import {
  AcademyCollectionsBlockedError,
  AcademyGatewayUnavailableError,
} from "./checkout.service";
import {
  academyPromoPlanId,
  membershipBasePlanId,
  promoChargeClp,
} from "../domain/academy-promos";

// PlanType recurrente → interval_count de Flow (interval=3 mensual fijo):
// MONTHLY cobra cada mes, QUARTERLY cada 3, SEMIANNUAL cada 6.
// SINGLE/CLASS_PACK/PERIOD no son suscribibles (pago único / staff).
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
  | { kind: "subscribed"; subscriptionId: string }
  | {
      /** Alta manual por transferencia (spec subscription-manual-transfer). */
      kind: "pending_payment";
      subscriptionId: string;
      paymentId: string;
      amount: number;
      currency: string;
      /** Endpoint multipart para subir el comprobante (OwnMethodClaim). */
      claimUrl: string;
      /** Métodos TRANSFER activos de la academia (datos bancarios). */
      transfer: {
        methods: { id: string; label: string; details: unknown }[];
      };
    };

type PlanWithAcademy = Prisma.MembershipPlanGetPayload<{
  include: { academy: true };
}>;

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
 * de la pasarela (SubscriptionProvider). El primer cobro lo ejecuta el
 * proveedor al `subscription/create` (subscription_start = hoy); las
 * renovaciones se liquidan acá vía `reconcileSubscription` - cada
 * invoice pagado genera un Payment `mem_<planId>_<invoiceId>` que pasa
 * por `PaymentSettlementService.settleMembership` (misma fuente de
 * verdad que el checkout manual: extiende endsAt, emite eventos,
 * notifica).
 *
 * Scope del proveedor (spec academy-card-subs-byo): una sub con
 * `gatewayAccountId` non-null opera SIEMPRE sobre el adaptador de esa
 * cuenta BYO de la academia (customer/plan espejo/remoto en SU
 * proveedor, take `academy_fee.net_pct` congelado por Payment); null =
 * provider de plataforma por moneda (subs legacy pre-BYO). Nuevas subs
 * CARD solo nacen con cuenta propia - sin ella queda el alta TRANSFER.
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
    private readonly accounts: GatewayAccountsService,
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
   * Provider de la SUB (spec academy-card-subs-byo, D1): única fuente
   * de resolución de TODA llamada remota. `gatewayAccountId` non-null →
   * adaptador de esa `ActorGatewayAccount` con capability
   * SubscriptionProvider; null → provider de plataforma por moneda.
   * Fail-closed: cuenta inexistente/DISABLED o sin motor produce error
   * explícito, jamás cae en silencio a credenciales de plataforma.
   */
  private async providerFor(sub: {
    gatewayAccountId: string | null;
    currency?: string | null;
  }): Promise<{
    provider: SubscriptionProvider;
    name: string;
    accountId: string | null;
  }> {
    if (sub.gatewayAccountId) {
      const { gateway } = await this.accounts.adapterFor(
        sub.gatewayAccountId,
      );
      if (
        typeof (gateway as Partial<SubscriptionProvider>)
          .createSubscription !== "function"
      ) {
        throw new BadRequestException(
          "la cuenta de la academia no tiene motor de suscripciones",
        );
      }
      return {
        provider: gateway as unknown as SubscriptionProvider,
        name: gateway.name,
        accountId: sub.gatewayAccountId,
      };
    }
    const { provider, name } = await this.provider(sub.currency ?? "CLP");
    return { provider, name, accountId: null };
  }

  /**
   * Take de cobranza BYO congelado por Payment (spec
   * academy-card-subs-byo, D6): `amount × academy_fee.net_pct` (default
   * 1,0 = 1%) - misma regla que el checkout one-off. Solo payments de
   * subs con cuenta propia; viaja en el statement del mes.
   */
  private async academyTake(
    amount: number,
  ): Promise<{ academyTakeRate: number; academyTakeClp: number }> {
    const rate = await this.params.getNumber("academy_fee.net_pct", 1.0);
    return {
      academyTakeRate: rate,
      academyTakeClp: Math.round((amount * rate) / 100),
    };
  }

  /**
   * Clave del espejo remoto por gateway+moneda (spec multipais-currency):
   * `remoteRefs` guarda "<GATEWAY>:<CURRENCY>" → planId remoto para los
   * proveedores no-Flow; el espejo Flow/CLP sigue en `flowPlanId`.
   * Con cuenta BYO la clave se namespacetea
   * "<GATEWAY>:<accountId>:<CURRENCY>" - el espejo vive en el proveedor
   * DE LA ACADEMIA y el mismo plan puede tener espejos en N cuentas.
   */
  private remoteRefKey(
    gateway: string,
    currency: string,
    accountId?: string | null,
  ): string {
    const base = `${gateway.toUpperCase()}:${currency.toUpperCase()}`;
    return accountId
      ? `${gateway.toUpperCase()}:${accountId}:${currency.toUpperCase()}`
      : base;
  }

  private remotePlanId(
    plan: { flowPlanId: string | null; remoteRefs?: unknown },
    gateway: string,
    currency: string,
    accountId?: string | null,
  ): string | null {
    if (accountId) {
      const refs = (plan.remoteRefs ?? null) as Record<
        string,
        unknown
      > | null;
      const id = refs?.[this.remoteRefKey(gateway, currency, accountId)];
      return typeof id === "string" && id ? id : null;
    }
    if (currency.toUpperCase() === "CLP") return plan.flowPlanId;
    const refs = (plan.remoteRefs ?? null) as Record<string, unknown> | null;
    const id = refs?.[this.remoteRefKey(gateway, currency)];
    return typeof id === "string" && id ? id : null;
  }

  /**
   * Persiste el id del espejo base materializado: CLP sin cuenta →
   * flowPlanId (compat); cualquier otro scope → remoteRefs con la clave
   * namespacetea que corresponda (merge del mapa).
   */
  private async markBaseMirror(
    planId: string,
    gateway: string,
    currency: string,
    remotePlanId: string,
    accountId?: string | null,
  ): Promise<void> {
    if (!accountId && currency.toUpperCase() === "CLP") {
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
    refs[this.remoteRefKey(gateway, currency, accountId)] = remotePlanId;
    await this.prisma.membershipPlan
      .update({ where: { id: planId }, data: { remoteRefs: refs } })
      .catch(() => {});
  }

  /**
   * plans/edit - empuja nombre/precio al plan espejo remoto cuando
   * staff edita el plan local (PATCH /academies/:id/plans/:planId).
   * No-op si el plan aún no tiene espejo (el primer subscribe lo crea
   * con los valores vigentes) o el gateway no implementa
   * SubscriptionProvider - en ambos casos no hay nada que sincronizar.
   *
   * Alcance (spec academy-card-subs-byo): el espejo de plataforma
   * (`flowPlanId`, provider por param) y cada espejo por cuenta
   * (`remoteRefs["<GW>:<accountId>:<CUR>"]`, adaptador por
   * `adapterFor`). Una cuenta apagada o sin motor se salta - su espejo
   * queda inerte con la cuenta y no bloquea la edición local.
   *
   * El caller lo ejecuta ANTES del update local: si Flow rechaza, la
   * fila local queda intacta y ambos lados siguen consistentes (la
   * llamada queda auditada en GatewayTransaction igual).
   */
  async syncMirrorPlan(
    plan: {
      id?: string;
      flowPlanId: string | null;
      remoteRefs?: unknown;
      academy: { name: string };
    },
    next: { name: string; price: number },
  ): Promise<void> {
    const remoteName = `${plan.academy.name} - ${next.name}`;
    let platformSynced = false;
    const syncedAccounts: string[] = [];
    const gw = await this.subscriptionGateway();
    if (plan.flowPlanId && gw) {
      // Sin cargo de servicio en el monto espejo (modelo SaaS - spec
      // academy-saas-billing): Flow cobra al alumno solo plan.price; el
      // costo de pasarela se liquida en el payout de la academia.
      await (gw as unknown as SubscriptionProvider).syncPlan(
        { planId: plan.flowPlanId, name: remoteName, amount: next.price },
        { correlationId: randomUUID() },
      );
      platformSynced = true;
    }
    // Espejos por cuenta (spec academy-card-subs-byo): clave de 3
    // segmentos "<GW>:<accountId>:<CUR>" - las planas "<GW>:<CUR>" son
    // de plataforma y no se sincronizan acá (mismo alcance previo).
    const refs = (plan.remoteRefs ?? null) as Record<string, unknown> | null;
    for (const [key, remoteId] of Object.entries(refs ?? {})) {
      const parts = key.split(":");
      if (
        parts.length !== 3 ||
        typeof remoteId !== "string" ||
        remoteId === ""
      ) {
        continue;
      }
      const resolved = await this.accounts
        .adapterFor(parts[1])
        .catch(() => null);
      const accountGw = resolved?.gateway;
      if (
        !accountGw ||
        typeof (accountGw as Partial<SubscriptionProvider>).syncPlan !==
          "function"
      ) {
        continue;
      }
      await (accountGw as unknown as SubscriptionProvider).syncPlan(
        { planId: remoteId, name: remoteName, amount: next.price },
        { correlationId: randomUUID() },
      );
      syncedAccounts.push(parts[1]);
    }
    // El precio del espejo base ya cambió in-place (spec member-promos):
    // se actualiza planChargeClp en las subs que cobran por ese espejo
    // para que el drift-check no agenda un reprice redundante. Las subs
    // bajo espejo de promo quedan intactas - su reprice aplica al nuevo
    // precio resuelto (promo sobre el plan editado). Scope por cuenta:
    // solo las subs cuyo espejo se sincronizó de verdad.
    if (plan.id && (platformSynced || syncedAccounts.length)) {
      await this.prisma.membershipSubscription
        .updateMany({
          where: {
            planId: plan.id,
            academyPromoId: null,
            pendingReprice: false,
            status: { in: ["ACTIVE", "CANCEL_PENDING"] },
            OR: [
              ...(platformSynced ? [{ gatewayAccountId: null }] : []),
              ...(syncedAccounts.length
                ? [{ gatewayAccountId: { in: syncedAccounts } }]
                : []),
            ],
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
    /** Cuenta BYO del cobro - namespacetea el espejo base (spec
     *  academy-card-subs-byo). */
    accountId: string | null = null,
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
          this.remotePlanId(plan, providerName, currency, accountId) ??
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
    opts?: { paymentMethod?: "CARD" | "TRANSFER"; methodId?: string },
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
    // Alta manual por transferencia (spec subscription-manual-transfer):
    // nunca toca el motor de la pasarela - la sub nace PENDING_PAYMENT
    // con su Payment MANUAL PENDING claim-elegible y se activa al
    // aprobar el comprobante (settleMembership).
    if (opts?.paymentMethod === "TRANSFER") {
      return this.subscribeTransfer(personId, plan, opts.methodId);
    }
    // Motor per-account (spec academy-card-subs-byo): la sub CARD cobra
    // por la pasarela propia de la academia - sin cuenta BYO o sin
    // motor de suscripciones solo queda el alta TRANSFER. El bloqueo de
    // cobranza rechaza igual que el checkout one-off; el claim manual
    // sigue disponible (vuelve al cliente a elegir TRANSFER).
    const planCurrency = plan.currency ?? "CLP";
    if (plan.academy.collectionsBlockedAt != null) {
      throw new AcademyCollectionsBlockedError();
    }
    const own = await this.accounts.activeForAcademy(plan.academyId);
    if (!own) throw new AcademyGatewayUnavailableError();
    if (
      typeof (own.gateway as Partial<SubscriptionProvider>)
        .createSubscription !== "function"
    ) {
      throw new AcademyGatewayUnavailableError(
        "esta academia no puede cobrar suscripciones con tarjeta",
      );
    }
    const provider = own.gateway as unknown as SubscriptionProvider;
    const providerName = own.gateway.name;
    const gatewayAccountId = own.account.id;

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
            in: [
              "ACTIVE",
              "CANCEL_PENDING",
              "PENDING_CARD",
              "ACTIVATING",
              "PENDING_PAYMENT",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const existing = live.find((s) => s.planId === plan.id) ?? null;
      const fresh =
        existing != null &&
        Date.now() - existing.createdAt.getTime() < PENDING_CARD_TTL_MS;
      // La PENDING_CARD reutilizable es la de ESTA cuenta (spec
      // academy-card-subs-byo): una fresca de otra cuenta (la academia
      // ganó/rotó su BYO dentro del TTL) no puede reutilizarse - su
      // registerUrl apunta al disclaimer de la cuenta vieja.
      const accountMismatch =
        existing != null &&
        (existing.gatewayAccountId ?? null) !== gatewayAccountId;
      const reuse =
        existing?.status === "PENDING_CARD" && fresh && !accountMismatch
          ? existing
          : null;
      if (existing && !reuse) {
        const replaceable =
          existing.status === "PENDING_CARD" ||
          existing.status === "ACTIVATING" ||
          // El intento manual se reemplaza siempre por el de tarjeta (el
          // usuario cambió de método) - no tiene carrera con un cobro
          // remoto porque nunca toca Flow.
          existing.status === "PENDING_PAYMENT";
        if (
          !replaceable ||
          (fresh &&
            existing.status !== "PENDING_PAYMENT" &&
            !(existing.status === "PENDING_CARD" && accountMismatch))
        ) {
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
      // Intento manual del mismo plan reemplazado por el de tarjeta: la
      // fila queda CANCELED y su orden PENDING se anula - un comprobante
      // tardío ya no puede aprobarse ni reactivar la sub (spec
      // subscription-manual-transfer).
      if (existing?.status === "PENDING_PAYMENT") {
        const canceled = await tx.membershipSubscription.updateMany({
          where: { id: existing.id, status: "PENDING_PAYMENT" },
          data: { status: "CANCELED", canceledAt: now },
        });
        if (canceled.count === 0) {
          throw new ConflictException(
            "la suscripción está siendo procesada - reintenta en unos segundos",
          );
        }
        await tx.payment.updateMany({
          where: {
            personId,
            orderType: "MEMBERSHIP",
            refId: { startsWith: `mem_${plan.id}_${personId}_manual_` },
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });
      }
      if (reuse) return reuse;
      return tx.membershipSubscription.create({
        data: {
          personId,
          planId: plan.id,
          academyId: plan.academyId,
          currency: planCurrency,
          // Scope del cobro sellado al nacer (spec academy-card-subs-byo):
          // customer/espejo/sub remota y reconcile viven en ESTA cuenta.
          gatewayAccountId,
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
      gatewayAccountId,
    );
    const flowPlanId = charge.planId;
    const baseMirrorId = this.remotePlanId(
      plan,
      providerName,
      planCurrency,
      gatewayAccountId,
    );
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
          gatewayAccountId,
        );
      }
    }

    // Customer en la cuenta del cobro - lazy create (helper compartido
    // con las subs de plataforma, clave namespacetea por cuenta); sin
    // email no se puede registrar.
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      providerName,
      personId,
      { correlationId },
      gatewayAccountId,
    );

    const customer = await provider.getCustomer(customerId, { correlationId });
    if (!customer.hasCard) {
      const { registerUrl } = await provider.registerCustomerCard(
        {
          customerId,
          // El retorno de la tarjeta vuelve scoped a la cuenta (spec
          // academy-card-subs-byo, D3): customer-return resuelve el
          // adaptador por `?account=` y activa la sub de ESA cuenta.
          returnUrl: `${this.apiUrl}/api/payments/flow/customer-return?account=${gatewayAccountId}`,
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
      accountId: gatewayAccountId,
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
   * Alta manual por transferencia (spec subscription-manual-transfer):
   * la sub nace PENDING_PAYMENT con paymentMethod TRANSFER + un Payment
   * MANUAL PENDING claim-elegible (`mem_<planId>_manual_<cycle>`), sin
   * tocar Flow. El bailarín sube el comprobante por
   * `POST /payments/:id/claims` (TicketClaim dominio ACADEMY) y el
   * settle al aprobar la deja ACTIVE con su primer período.
   *
   * Misma sección crítica por advisory lock `sub:<personId>` que el
   * alta de tarjeta: una PENDING_PAYMENT viva del mismo plan se
   * reutiliza (idempotencia del retry - devuelve su misma orden);
   * PENDING_CARD y ACTIVATING expirada del mismo plan se reemplazan;
   * ACTIVE/CANCEL_PENDING del mismo plan y ACTIVATING fresca dan 409.
   * Las pendientes de OTROS planes no se barren: a diferencia de
   * tarjeta, el claim se ata a su Payment por id - no hay token
   * ambiguo que resolver (M7 no aplica a la vía manual).
   */
  private async subscribeTransfer(
    personId: string,
    plan: PlanWithAcademy,
    methodId?: string,
  ): Promise<SubscribeResult> {
    const planCurrency = plan.currency ?? "CLP";
    // Método de transferencia elegido (opcional): solo valida que sea un
    // TRANSFER activo de la academia - su label queda snapshot en la orden.
    let methodLabel = "Transferencia";
    if (methodId) {
      const method = await this.prisma.academyPaymentMethod.findFirst({
        where: {
          id: methodId,
          academyId: plan.academyId,
          type: "TRANSFER",
          active: true,
        },
      });
      if (!method) throw new NotFoundException("método no encontrado");
      methodLabel = method.label;
    }
    // Cargo con la misma resolución de promos que el alta con tarjeta
    // (spec member-promos): el descuento se marca en la sub y en el
    // Payment (academyPromoId) para auditoría y conteo de maxCycles.
    const charge = await this.memberChargeSpec(
      plan,
      plan.academyId,
      personId,
      "MANUAL",
      planCurrency,
    );

    const { sub, payment } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sub:${personId}`}))`;
      const live = await tx.membershipSubscription.findMany({
        where: {
          personId,
          status: {
            in: [
              "ACTIVE",
              "CANCEL_PENDING",
              "PENDING_CARD",
              "ACTIVATING",
              "PENDING_PAYMENT",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const existing = live.find((s) => s.planId === plan.id) ?? null;
      const now = new Date();
      if (existing) {
        // Intento manual vivo del mismo plan → reutiliza su orden
        // pendiente (idempotente como la PENDING_CARD fresca de tarjeta).
        if (existing.status === "PENDING_PAYMENT") {
          const pending = await tx.payment.findFirst({
            where: {
              personId,
              orderType: "MEMBERSHIP",
              refId: { startsWith: `mem_${plan.id}_${personId}_manual_` },
              status: "PENDING",
            },
            orderBy: { createdAt: "desc" },
          });
          if (pending) return { sub: existing, payment: pending };
        }
        const replaceable =
          existing.status === "PENDING_CARD" ||
          existing.status === "PENDING_PAYMENT" ||
          (existing.status === "ACTIVATING" &&
            now.getTime() - existing.createdAt.getTime() >=
              PENDING_CARD_TTL_MS);
        if (!replaceable) {
          throw new ConflictException(
            "ya tienes una suscripción a este plan",
          );
        }
        // Cancel condicional por el status leído - si la fila se movió
        // entremedio se aborta en vez de pisar una sub activa.
        const canceled = await tx.membershipSubscription.updateMany({
          where: { id: existing.id, status: existing.status },
          data: { status: "CANCELED", canceledAt: now },
        });
        if (canceled.count === 0) {
          throw new ConflictException(
            "la suscripción está siendo procesada - reintenta en unos segundos",
          );
        }
        // Un intento manual reemplazado arrastra su orden pendiente:
        // sin el void un comprobante tardío podría aprobarse y liquidar
        // una sub ya cancelada.
        await tx.payment.updateMany({
          where: {
            personId,
            orderType: "MEMBERSHIP",
            refId: { startsWith: `mem_${plan.id}_${personId}_manual_` },
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });
      }
      // Ciclo correlativo del refId (spec subscription-manual-transfer):
      // la renovación manual del slice 2 seguirá el mismo contador.
      const cycle =
        (await tx.payment.count({
          where: {
            personId,
            orderType: "MEMBERSHIP",
            refId: { startsWith: `mem_${plan.id}_${personId}_manual_` },
          },
        })) + 1;
      const created = await tx.membershipSubscription.create({
        data: {
          personId,
          planId: plan.id,
          academyId: plan.academyId,
          currency: planCurrency,
          status: "PENDING_PAYMENT",
          paymentMethod: "TRANSFER",
          academyPromoId: charge.promoId,
          planChargeClp: charge.amount,
        },
      });
      const order = await tx.payment.create({
        data: {
          orderType: "MEMBERSHIP",
          refId: `mem_${plan.id}_${personId}_manual_${cycle}`,
          personId,
          amount: charge.amount,
          fee: 0,
          net: charge.amount,
          currency: planCurrency,
          gateway: "MANUAL",
          methodLabel,
          // Modelo SaaS (mismo que el claim manual aprobado): la plata
          // la cobra la academia por su cuenta - queda en el libro sin
          // comisión de plataforma y nunca entra a Payout.
          feeMode: "ACADEMY",
          platformFeeNetClp: 0,
          platformFeeVatClp: 0,
          gatewayFeeExpected: 0,
          producerNetClp: charge.amount,
          academyPromoId: charge.promoId,
        },
      });
      return { sub: created, payment: order };
    });

    // Datos de transferencia de la academia (sus métodos propios
    // TRANSFER activos - el mismo shape que lista el checkout manual).
    const methods = await this.prisma.academyPaymentMethod.findMany({
      where: { academyId: plan.academyId, type: "TRANSFER", active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, label: true, details: true },
    });

    return {
      kind: "pending_payment",
      subscriptionId: sub.id,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      claimUrl: `/payments/${payment.id}/claims`,
      transfer: { methods },
    };
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
      /** Cuenta BYO dueña de la sub (spec academy-card-subs-byo) - null
       *  = provider de plataforma. */
      accountId: string | null;
      correlationId: string;
    },
  ): Promise<{ active: MembershipSubscription; fs: RemoteSubscription }> {
    const { provider } = await this.providerFor({
      gatewayAccountId: p.accountId,
      currency: p.currency,
    });
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
      /** Cuenta BYO dueña de la sub (spec academy-card-subs-byo). */
      accountId: string | null;
      correlationId: string;
    },
  ): Promise<{ active: MembershipSubscription; fs: RemoteSubscription }> {
    const { provider } = await this.providerFor({
      gatewayAccountId: p.accountId,
      currency: p.currency,
    });
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
  async customerReturn(
    token: string,
    accountId?: string,
  ): Promise<CustomerReturnResult> {
    const correlationId = randomUUID();
    // Con ?account= (spec academy-card-subs-byo, D3) el retorno
    // pertenece a la cuenta BYO de una academia: el adaptador DE ESA
    // cuenta verifica el token y la PENDING_CARD a activar es la del
    // person en esa misma cuenta. Sin cuenta → comportamiento de
    // plataforma (subs legacy y previas al change).
    const scopedGateway = accountId
      ? (await this.accounts.adapterFor(accountId)).gateway
      : null;
    await this.gatewayTx.record({
      provider:
        scopedGateway?.name ??
        (await this.subscriptionGateway())?.name ??
        "UNCONFIGURED",
      direction: "INBOUND_WEBHOOK",
      endpoint: "customer/register-return",
      correlationId,
      requestBody: { token },
      ok: true,
      ...(accountId ? { gatewayAccountId: accountId } : {}),
    });
    let provider: SubscriptionProvider;
    let providerName: string;
    let reg: {
      registered: boolean;
      customerId?: string;
      subscriptionId?: string;
    } = { registered: false };
    if (scopedGateway) {
      provider = scopedGateway as unknown as SubscriptionProvider;
      providerName = scopedGateway.name;
      if (typeof provider.getRegisterStatus === "function") {
        try {
          reg = await provider.getRegisterStatus(token, { correlationId });
        } catch {
          // Token que la cuenta no reconoce - cae al ok:false de abajo.
        }
      }
    } else {
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
          typeof (gw as Partial<SubscriptionProvider>)
            .createSubscription === "function"
        ) {
          candidates.push(gw);
        }
      }
      if (candidates.length === 0) {
        throw new BadRequestException(
          "el proveedor de suscripciones configurado no tiene motor de suscripciones",
        );
      }
      provider = candidates[0] as unknown as SubscriptionProvider;
      providerName = candidates[0].name;
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
    }
    if (!reg.registered || !reg.customerId) {
      return { ok: false, academyId: null };
    }
    // Customer → person: con cuenta la clave es namespacetea
    // "<GW>:<accountId>"; sin cuenta el mapa por proveedor
    // (gatewayCustomerIds) + fallback a la columna legacy
    // flowCustomerId para FLOW.
    const person = await this.prisma.person.findFirst({
      where: accountId
        ? {
            gatewayCustomerIds: {
              path: [`${providerName.toUpperCase()}:${accountId}`],
              equals: reg.customerId,
            },
          }
        : {
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
      where: {
        personId: person.id,
        status: "PENDING_CARD",
        // La sub activable vive en el mismo scope del retorno (spec
        // academy-card-subs-byo): una PENDING_CARD de otra cuenta jamás
        // se activa con el disclaimer de esta - customer/token no son
        // intercambiables entre cuentas.
        gatewayAccountId: accountId ?? null,
      },
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
      sub.gatewayAccountId,
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
      !this.remotePlanId(
        sub.plan,
        providerName,
        subCurrency,
        sub.gatewayAccountId,
      )
    ) {
      await this.markBaseMirror(
        sub.planId,
        providerName,
        subCurrency,
        charge.planId,
        sub.gatewayAccountId,
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
          accountId: sub.gatewayAccountId,
          correlationId,
        })
      : await this.createRemoteSubscription(sub.id, {
          flowPlanId: charge.planId,
          academyPromoId: charge.promoId,
          planChargeClp: charge.amount,
          currency: subCurrency,
          customerId: reg.customerId,
          accountId: sub.gatewayAccountId,
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
  async subscriptionWebhook(
    token: string | null,
    accountId?: string,
  ): Promise<void> {
    // Con ?account= (spec academy-card-subs-byo, D4) el callback es el
    // urlCallback horneado en el plan espejo de ESA cuenta BYO: el
    // barrido queda limitado a sus subs y la auditoría se estampa con
    // la cuenta. Sin cuenta → barrido de plataforma (comportamiento
    // previo).
    const providerName = accountId
      ? await this.accounts
          .adapterFor(accountId)
          .then((r) => r.gateway.name)
          .catch(() => "UNCONFIGURED")
      : ((await this.subscriptionGateway())?.name ?? "UNCONFIGURED");
    await this.gatewayTx.record({
      provider: providerName,
      direction: "INBOUND_WEBHOOK",
      endpoint: "subscription/callback",
      correlationId: randomUUID(),
      requestBody: { token },
      ok: true,
      ...(accountId ? { gatewayAccountId: accountId } : {}),
    });
    if (typeof token !== "string" || token.trim() === "") return;
    void this.reconcileAll("reconcile", accountId).catch((e) =>
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
  async handleBillingEvent(
    ev: BillingWebhookEvent,
    accountId?: string,
  ): Promise<boolean> {
    if (!ev.subscriptionId) return false;
    const sub = await this.prisma.membershipSubscription.findUnique({
      where: { flowSubscriptionId: ev.subscriptionId },
    });
    if (!sub) return false;
    // Consistencia cuenta↔sub (spec academy-card-subs-byo, D4 - misma
    // regla cross-account del confirm de órdenes): la cuenta que
    // notifica tiene que ser la dueña de la suscripción. Un evento de
    // otra cuenta o de plataforma para esta sub se rechaza.
    if ((sub.gatewayAccountId ?? null) !== (accountId ?? null)) {
      throw new BadRequestException(
        "la notificación no corresponde a la cuenta de la suscripción",
      );
    }
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
    if (sub.flowSubscriptionId) {
      // providerFor = adaptador de la cuenta de la sub (spec
      // academy-card-subs-byo) o plataforma para legacy. Cuenta apagada
      // o sin motor → estado local, sin refresh (fail-closed).
      const resolved = await this.providerFor(sub).catch(() => null);
      if (resolved) {
        try {
          const fs = await resolved.provider.getSubscription(
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
      // Alta manual cancelada (spec subscription-manual-transfer): su
      // orden PENDING se anula - un comprobante tardío ya no puede
      // aprobarla ni reactivar la sub.
      if (sub.paymentMethod === "TRANSFER") {
        await this.prisma.payment.updateMany({
          where: {
            personId,
            orderType: "MEMBERSHIP",
            refId: { startsWith: `mem_${sub.planId}_${sub.personId}_manual_` },
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });
      }
      return { ok: true, status: "CANCELED", subscriptionId: sub.id };
    }

    // Cancel remota por el adaptador de la cuenta de la sub (spec
    // academy-card-subs-byo, D5): una cuenta apagada/borrada no bloquea
    // al usuario - la cancelación local procede y la remota la barre el
    // reconcile cuando la cuenta vuelva (o muere en su Flow).
    let provider: SubscriptionProvider | null = null;
    try {
      provider = (await this.providerFor(sub)).provider;
    } catch (e) {
      if (!sub.gatewayAccountId) throw e;
      this.logger.warn(
        `cancel remoto sub ${sub.id}: cuenta ${sub.gatewayAccountId} no disponible - solo cancel local`,
      );
    }
    if (provider) {
      await provider.cancelSubscription(sub.flowSubscriptionId, {
        correlationId: randomUUID(),
      });
    }
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
    scopeAccountId?: string,
  ): Promise<{ checked: number; settled: number }> {
    const subs = await this.prisma.membershipSubscription.findMany({
      where: {
        flowSubscriptionId: { not: null },
        status: { in: ["ACTIVE", "CANCEL_PENDING"] },
        // Barrido scoped por cuenta (spec academy-card-subs-byo, D4):
        // el webhook con ?account= solo reconcilia subs de esa cuenta.
        ...(scopeAccountId
          ? { gatewayAccountId: scopeAccountId }
          : {}),
      },
    });
    // Provider por scope de la sub (spec academy-card-subs-byo): cada
    // cuenta BYO resuelve su adaptador vía providerFor (cache por
    // cuenta - adapterFor ya cachea por updatedAt); null = plataforma
    // por moneda. Una cuenta apagada o moneda sin motor solo salta sus
    // subs, nunca cae a otro scope.
    const providers = new Map<
      string,
      {
        provider: SubscriptionProvider;
        name: string;
        accountId: string | null;
      } | null
    >();
    const providerForSub = async (sub: {
      gatewayAccountId: string | null;
      currency: string | null;
    }) => {
      const key = sub.gatewayAccountId
        ? `acct:${sub.gatewayAccountId}`
        : `plat:${(sub.currency ?? "CLP").toUpperCase()}`;
      if (!providers.has(key)) {
        providers.set(key, await this.providerFor(sub).catch(() => null));
      }
      return providers.get(key) ?? null;
    };
    let settled = 0;
    const orphanProviders = new Map<
      string,
      {
        provider: SubscriptionProvider;
        name: string;
        accountId: string | null;
      }
    >();
    const addOrphanScope = (
      r: {
        provider: SubscriptionProvider;
        name: string;
        accountId: string | null;
      } | null,
    ) => {
      if (!r) return;
      const key = r.accountId ?? `plat:${r.name}`;
      if (!orphanProviders.has(key)) orphanProviders.set(key, r);
    };
    if (!scopeAccountId) {
      // El barrido de huérfanas corre siempre sobre el provider del
      // param (CLP) además de los scopes de las subs vivas.
      const primary = await this.provider("CLP").catch(() => null);
      addOrphanScope(primary ? { ...primary, accountId: null } : null);
    }
    for (const sub of subs) {
      const resolved = await providerForSub(sub);
      if (!resolved) {
        this.logger.warn(
          `reconcile sub ${sub.id}: ${
            sub.gatewayAccountId
              ? `cuenta ${sub.gatewayAccountId}`
              : `moneda ${sub.currency}`
          } sin proveedor de suscripciones`,
        );
        continue;
      }
      if (!scopeAccountId) addOrphanScope(resolved);
      try {
        const fs = await resolved.provider.getSubscription(
          sub.flowSubscriptionId!,
          { correlationId: randomUUID() },
        );
        settled += await this.reconcileSubscription(sub, fs, actor);
      } catch (e) {
        this.logger.error(
          `reconcile sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    if (scopeAccountId) {
      // El barrido scoped barre huérfanas solo de esa cuenta.
      const scoped = await this.providerFor({
        gatewayAccountId: scopeAccountId,
        currency: null,
      }).catch(() => null);
      addOrphanScope(scoped);
    } else {
      // Cuentas BYO con creates auditados aunque no tengan subs vivas
      // (spec academy-card-subs-byo, D5): la huérfana es un
      // subscription/create remoto sin fila local - su auditoría lleva
      // gatewayAccountId y define qué adaptador la barre.
      const creates = await this.prisma.gatewayTransaction.findMany({
        where: {
          direction: "OUTBOUND",
          endpoint: "subscription/create",
          ok: true,
          gatewayAccountId: { not: null },
        },
        select: { gatewayAccountId: true },
      });
      for (const accountId of new Set(
        creates
          .map((c) => c.gatewayAccountId)
          .filter((id): id is string => typeof id === "string"),
      )) {
        if (providers.has(`acct:${accountId}`)) continue;
        addOrphanScope(
          await this.providerFor({
            gatewayAccountId: accountId,
            currency: null,
          }).catch(() => null),
        );
      }
    }
    for (const p of orphanProviders.values()) {
      await this.sweepOrphanSubscriptions(p.provider, p.name, p.accountId);
    }
    return { checked: subs.length, settled };
  }

  /**
   * Barrido de renovaciones manuales por transferencia (spec
   * subscription-manual-transfer) - corre dentro del mismo job diario
   * `subscriptions.reconcile` que el reconcile de tarjeta.
   *
   * Una sub TRANSFER ACTIVE cuyo `currentPeriodEnd` entra en la ventana
   * de anticipación (`billing.manual_renewal.lead_days`, default 5 -
   * transferir + revisar el comprobante necesita días reales, no las
   * 24h del reminder de tarjeta) recibe el Payment PENDING del ciclo
   * siguiente (`mem_<planId>_manual_<n+1>`, mismo correlativo del alta)
   * + aviso al alumno con la URL del claim.
   *
   * Idempotente por orden: una PENDING viva del par (person, plan)
   * cubre el ciclo en curso - el barrido no duplica ni re-avisa. El
   * cargo se re-resuelve en cada ciclo con la misma regla de promos del
   * alta (member-promos): una promo expirada/agotada cae a precio lleno
   * sin reprice remoto (la sub manual no tiene espejo en Flow).
   *
   * Vencida sin claim aprobado (currentPeriodEnd < now): la suspensión
   * del acceso la hace la gracia del Enrollment - resolveQuota habilita
   * reservas solo hasta endsAt + academy.renewal.grace_days y
   * AcademyRemindersService ya manda el aviso de regularización. La sub
   * queda ACTIVE con su orden PENDING: un comprobante tardío la
   * reactiva (misma política que la mora de tarjeta, que tampoco
   * cancela automáticamente).
   */
  async reconcileManualRenewals(
    actor = "reconcile",
  ): Promise<{ checked: number; issued: number }> {
    const leadDays = await this.params.getNumber(
      "billing.manual_renewal.lead_days",
      5,
    );
    const horizon = new Date(Date.now() + leadDays * 24 * 60 * 60_000);
    const subs = await this.prisma.membershipSubscription.findMany({
      where: {
        paymentMethod: "TRANSFER",
        status: "ACTIVE",
        currentPeriodEnd: { lte: horizon },
      },
    });
    let issued = 0;
    for (const sub of subs) {
      try {
        if (await this.issueManualMembershipCycle(sub, actor)) issued++;
      } catch (e) {
        this.logger.error(
          `renovación manual sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return { checked: subs.length, issued };
  }

  /**
   * Emite la orden del ciclo siguiente de una sub manual (sección
   * crítica con advisory lock `sub:<personId>` - el mismo del alta:
   * serializa contra un subscribe concurrente que cancelaría la sub y
   * anularía sus pendientes). Devuelve true si se creó la orden (el
   * aviso va fuera de la tx). El cargo emitido queda en la fila como
   * la verdad del ciclo (academyPromoId/planChargeClp - no hay espejo
   * remoto que sincronizar).
   */
  private async issueManualMembershipCycle(
    sub: MembershipSubscription,
    actor: string,
  ): Promise<boolean> {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: sub.planId },
      include: { academy: true },
    });
    if (!plan) return false;
    const cur = sub.currency ?? plan.currency ?? "CLP";
    const charge = await this.memberChargeSpec(
      plan,
      sub.academyId,
      sub.personId,
      "MANUAL",
      cur,
    );
    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sub:${sub.personId}`}))`;
      // Re-check dentro del lock: una sub que se canceló (o mutó a
      // tarjeta) en la ventana no recibe orden nueva.
      const fresh = await tx.membershipSubscription.findUnique({
        where: { id: sub.id },
      });
      if (
        !fresh ||
        fresh.status !== "ACTIVE" ||
        fresh.paymentMethod !== "TRANSFER"
      ) {
        return null;
      }
      const pending = await tx.payment.findFirst({
        where: {
          personId: sub.personId,
          orderType: "MEMBERSHIP",
          refId: { startsWith: `mem_${sub.planId}_${sub.personId}_manual_` },
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      });
      if (pending) return null;
      const cycle =
        (await tx.payment.count({
          where: {
            personId: sub.personId,
            orderType: "MEMBERSHIP",
            refId: { startsWith: `mem_${sub.planId}_${sub.personId}_manual_` },
          },
        })) + 1;
      const refId = `mem_${sub.planId}_${sub.personId}_manual_${cycle}`;
      const order = await tx.payment.create({
        data: {
          orderType: "MEMBERSHIP",
          refId,
          personId: sub.personId,
          amount: charge.amount,
          fee: 0,
          net: charge.amount,
          currency: cur,
          gateway: "MANUAL",
          methodLabel: "Transferencia",
          // Modelo SaaS igual que el alta manual: la plata la cobra la
          // academia fuera de la plataforma - sin comisión ni Payout.
          feeMode: "ACADEMY",
          platformFeeNetClp: 0,
          platformFeeVatClp: 0,
          gatewayFeeExpected: 0,
          producerNetClp: charge.amount,
          academyPromoId: charge.promoId,
        },
      });
      await emitPaymentEvent(tx, order.id, "ORDER_CREATED", actor, {
        refId,
        subscriptionId: sub.id,
        cycle,
      });
      await tx.membershipSubscription.update({
        where: { id: sub.id },
        data: {
          academyPromoId: charge.promoId,
          planChargeClp: charge.amount,
        },
      });
      return order;
    });
    if (!payment) return false;
    await this.notifications.notifySafe(sub.personId, {
      category: "TRANSACTIONAL",
      type: "membership.transfer_renewal",
      title: "Renueva tu plan",
      body: `${plan.name} · ${plan.academy.name} - sube el comprobante del próximo período`,
      data: {
        subscriptionId: sub.id,
        paymentId: payment.id,
        planId: plan.id,
        academyId: sub.academyId,
        amount: payment.amount,
        currency: payment.currency,
        claimUrl: `/payments/${payment.id}/claims`,
        currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      },
    });
    return true;
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
    accountId: string | null = null,
  ): Promise<void> {
    const txs = await this.prisma.gatewayTransaction.findMany({
      where: {
        // Se filtra por el provider BARRIDO (spec multipais-currency):
        // el create auditado de otra pasarela no se cancela con este
        // adaptador - los ids remotos no son intercambiables. Scope por
        // cuenta (spec academy-card-subs-byo): una cuenta BYO solo barre
        // sus creates auditados (gatewayAccountId), plataforma los
        // suyos (null).
        provider: providerName,
        gatewayAccountId: accountId,
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
              (await this.providerFor(sub).catch(() => null))?.name ??
              "UNCONFIGURED",
            // Cobro BYO (spec academy-card-subs-byo, D6): el Payment
            // congela la cuenta + el take academy_fee.net_pct y entra
            // al statement del período por el filtro gatewayAccountId.
            gatewayAccountId: sub.gatewayAccountId ?? null,
            ...(sub.gatewayAccountId
              ? await this.academyTake(amount)
              : {}),
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

    // Recuperación de mora por collect (spec overdue-invoice-collect):
    // invoices impagas que el proveedor ya no reintentará → cargo
    // on-demand a la tarjeta del subscriber, antes de notificar.
    let collectUrl: string | null = null;
    let covered: Set<string> = new Set();
    if (sub.flowSubscriptionId) {
      try {
        const r = await this.collectOverdueInvoices(sub, fs, actor);
        settled += r.settled;
        collectUrl = r.paymentUrl;
        covered = r.coveredIds;
      } catch (e) {
        this.logger.error(
          `collect-overdue sub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    // Mora: el proveedor reporta mora (Flow morose=1 → `morose`) con
    // la invoice impaga en invoices[]. Sin grace period - solo se
    // notifica una vez por invoice impaga (dedup por invoiceId en la
    // notificación enviada; la más antigua es el inicio del episodio -
    // clave estable mientras dure la mora). Una invoice recuperada por
    // collect (Payment PAID con su refId) ya no es deuda.
    if (
      fs.morose &&
      (fs.invoices ?? []).some(
        (i) => !i.paid && !covered.has(String(i.id)),
      )
    ) {
      const unpaid = (fs.invoices ?? [])
        .filter((inv) => !inv.paid && !covered.has(String(inv.id)))
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
            // Link de pago del collect degradado (sin tarjeta) para
            // regularizar la deuda (spec overdue-invoice-collect).
            ...(collectUrl ? { collectUrl } : {}),
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
    const { name: gwName } = await this.providerFor(sub);
    const expected = await this.memberChargeSpec(
      plan,
      sub.academyId,
      sub.personId,
      gwName,
      cur,
      sub.gatewayAccountId,
    );
    const drift =
      (sub.academyPromoId ?? null) !== (expected.promoId ?? null) ||
      (sub.planChargeClp != null && sub.planChargeClp !== expected.amount);
    if (!drift) return;
    const { provider } = await this.providerFor(sub);
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
    const { provider, name: providerName } = await this.providerFor(sub);
    const correlationId = randomUUID();
    const charge = await this.memberChargeSpec(
      plan,
      sub.academyId,
      sub.personId,
      providerName,
      cur,
      sub.gatewayAccountId,
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
      !this.remotePlanId(plan, providerName, cur, sub.gatewayAccountId)
    ) {
      await this.markBaseMirror(
        plan.id,
        providerName,
        cur,
        charge.planId,
        sub.gatewayAccountId,
      );
    }
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      providerName,
      sub.personId,
      { correlationId },
      sub.gatewayAccountId,
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

  /**
   * Cobro on-demand de invoices impagas que el proveedor ya no
   * reintentará (spec overdue-invoice-collect): `customer/collect`
   * sobre la tarjeta del subscriber. Mismas reglas que plataforma:
   * elegible = impaga con `nextAttemptDate === null` o `undefined`
   * bajo morose; dedup por refId `mem_<planId>_<invoiceId>` @unique
   * (un intento automático por invoice); COLLECTED liquida por el
   * camino de renovación, FAILED marca y corta, PENDING deja el link
   * en la notificación de mora; error de API libera el claim.
   */
  private async collectOverdueInvoices(
    sub: MembershipSubscription,
    fs: RemoteSubscription,
    actor: string,
  ): Promise<{
    settled: number;
    paymentUrl: string | null;
    coveredIds: Set<string>;
  }> {
    const coveredIds = new Set<string>();
    const eligible = (fs.invoices ?? []).filter(
      (inv) =>
        !inv.paid &&
        (inv.nextAttemptDate === null ||
          (fs.morose && inv.nextAttemptDate == null)),
    );
    if (!eligible.length) return { settled: 0, paymentUrl: null, coveredIds };
    const { provider, name: providerName } = await this.providerFor(sub);
    if (typeof provider.collect !== "function") {
      return { settled: 0, paymentUrl: null, coveredIds };
    }
    let settled = 0;
    let paymentUrl: string | null = null;
    for (const inv of eligible) {
      const invId = String(inv.id);
      const refId = `mem_${sub.planId}_${invId}`;
      const exists = await this.prisma.payment.findFirst({
        where: { refId },
        select: { id: true, status: true },
      });
      if (exists) {
        if (exists.status === "PAID") coveredIds.add(invId);
        continue;
      }
      const { customerId } = await ensureFlowCustomer(
        this.prisma,
        provider,
        providerName,
        sub.personId,
        { correlationId: randomUUID() },
        sub.gatewayAccountId,
      );
      const plan = await this.prisma.membershipPlan.findUnique({
        where: { id: sub.planId },
        select: { price: true, name: true },
      });
      const amount = inv.amount > 0 ? inv.amount : (plan?.price ?? 0);
      const cardPct = await this.params.getNumber(
        "gateway_fee.card_pct",
        3.19,
      );
      let payment: Payment;
      try {
        payment = await this.prisma.payment.create({
          data: {
            orderType: "MEMBERSHIP",
            refId,
            personId: sub.personId,
            amount,
            fee: 0,
            net: amount,
            academyPromoId: sub.academyPromoId ?? null,
            currency: sub.currency ?? "CLP",
            gateway: providerName,
            // Cobro BYO (spec academy-card-subs-byo, D6): congela la
            // cuenta + el take como el Payment de renovación directa.
            gatewayAccountId: sub.gatewayAccountId ?? null,
            ...(sub.gatewayAccountId
              ? await this.academyTake(amount)
              : {}),
            ...academyFeeBreakdown(amount, cardPct),
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") continue;
        throw e;
      }
      await this.prisma.$transaction((tx) =>
        emitPaymentEvent(tx, payment.id, "ORDER_CREATED", actor, {
          refId,
          invoiceId: invId,
          subscriptionId: sub.id,
          via: "collect",
        }),
      );
      let res: CollectResult;
      try {
        res = await provider.collect(
          {
            customerId,
            amount,
            subject: `Renovación ${plan?.name ?? "membresía"}`,
            commerceOrder: refId,
            returnUrl: `${this.apiUrl}/api/payments/order-return`,
            currency: sub.currency ?? "CLP",
          },
          { correlationId: randomUUID() },
        );
      } catch (e) {
        this.logger.warn(
          `collect sub ${sub.id} inv ${invId}: ${e instanceof Error ? e.message : e}`,
        );
        await this.prisma
          .$transaction(async (tx) => {
            await tx.paymentEvent.deleteMany({
              where: { paymentId: payment.id },
            });
            await tx.payment.delete({ where: { id: payment.id } });
          })
          .catch(() => undefined);
        break;
      }
      if (res.flowOrder) {
        await this.prisma.payment.updateMany({
          where: { id: payment.id },
          data: { gatewayRef: res.flowOrder },
        });
      }
      const current = {
        ...payment,
        gatewayRef: res.flowOrder ?? payment.gatewayRef,
      };
      if (res.outcome === "COLLECTED") {
        await this.settlement.settleMembership(current, {
          actor,
          kind: "renewal",
          gatewayData: res.gatewayData,
        });
        await this.markInvoice(sub.id, invId);
        sub.lastInvoiceId = invId;
        coveredIds.add(invId);
        settled++;
      } else if (res.outcome === "FAILED") {
        await this.settlement.settle(current, "FAILED", { actor });
        break;
      } else {
        paymentUrl = res.paymentUrl ?? paymentUrl;
      }
    }
    return { settled, paymentUrl, coveredIds };
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
