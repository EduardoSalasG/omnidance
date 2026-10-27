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
  PlatformPromo,
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
  cycleChargeClp,
  isProActive,
  platformPlanId,
  PRODUCER_PRO_TIERS,
  PRODUCER_TIER_RANK,
  producerTierParamKey,
  SELF_SERVE_ACADEMY_TIERS,
  SELF_SERVE_PRODUCER_TIERS,
} from "../domain/platform-tiers";
import {
  platformPromoPlanId,
  promoChargeClp,
} from "../domain/platform-promos";
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
import {
  PENDING_CARD_TTL_MS,
  REMINDER_WINDOW_MS,
} from "./subscriptions.service";

// Estados "vivos" de una PlatformSubscription - mismo ciclo de vida que
// MembershipSubscription (PENDING_CARD → ACTIVATING → ACTIVE →
// CANCEL_PENDING → CANCELED).
const LIVE_STATUSES = [
  "ACTIVE",
  "CANCEL_PENDING",
  "PENDING_CARD",
  "ACTIVATING",
] as const;

// Precio mensual-equivalente por defecto si el param no existe (mismos
// valores que el seed - getNumber recibe fallback, nunca hardcode en la
// respuesta).
const ACADEMY_MAX_FALLBACK = Number.MAX_SAFE_INTEGER;

/** Plan Flow + cargo por ciclo resueltos desde PlatformParam. */
interface ChargeSpec {
  planId: string;
  name: string;
  /** Monto del cargo por ciclo = mensual-equivalente × meses del ciclo. */
  amount: number;
  /** ISO-4217 del cargo (spec multipais-currency) - del price book o CLP. */
  currency: string;
  intervalCount: number;
  /** Promo aplicada al monto (spec platform-promos); null = plan base. */
  promoId: string | null;
}

/**
 * Actor contra el que se evalúa una promo: la entidad que suscribe
 * (academia o productor). maxCycles cuenta por actor sobre TODAS sus
 * subs - cancelar y resuscribirse no resetea el beneficio.
 */
interface PromoActor {
  kind: PlatformSubKind;
  academyId?: string | null;
  producerId?: string | null;
}

type PromoWithWhitelist = PlatformPromo & {
  academies: { id: string }[];
  producers: { id: string }[];
};

export type PlatformSubscribeResult =
  | { kind: "needs_card"; paymentUrl: string; subscriptionId: string }
  | { kind: "subscribed"; subscriptionId: string };

type PlatformCustomerReturn =
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
 * `PlatformSubscription` - mismo motor Flow (customer + plan espejo +
 * subscription/create), mismo claim anti-doble-cobro, mismo reconcile de
 * invoices y misma dedup de mora/reminder.
 *
 * Diferencias deliberadas respecto a membresías:
 * - El plan espejo es compartido por (kind, tier, ciclo):
 *   `plat_academy_<tier>_<cycle>` / `plat_producer_<tier>_<cycle>` -
 *   los tiers son catálogo de plataforma (params), no planes por academia.
 * - El monto del cargo = precio mensual base del param `*_monthly_clp`
 *   × meses facturados del ciclo (semestral ×5.75 / anual ×11 - medio
 *   mes y un mes gratis por año respectivamente).
 * - El Payment de cada invoice usa `orderType PLATFORM_SUB` y refId
 *   `platsub_<subId>_<invoiceId>`; el settle vive en
 *   `PaymentSettlementService.settlePlatformSub` (desbloquea la academia
 *   / restaura proTier - los pagos son INGRESO de la plataforma, no
 *   devengo del actor, por eso no entran a payouts).
 * - El retorno del disclaimer de tarjeta usa un endpoint propio
 *   (`/api/payments/flow/platform-customer-return`): el token de Flow se
 *   consume una sola vez, así que cada dominio resuelve sus pendientes en
 *   su propio callback sin ambigüedad.
 * - Upgrade de tier = swap inmediato (cancel remota inmediata + create en
 *   el plan nuevo - cobra el ciclo completo nuevo; prorateo manual v1).
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
    private readonly params: ParamsService,
    private readonly settlement: PaymentSettlementService,
    private readonly notifications: NotificationsService,
    private readonly gatewayTx: GatewayTransactionsService,
    @Inject(PAYMENT_GATEWAYS)
    private readonly gateways: GatewayRegistry,
  ) {}

  /**
   * Provider de suscripciones (spec subscription-port-generic): param
   * `payments.subscription_gateway` resuelto contra el
   * GatewayRegistry + capability por presencia de métodos, nunca por
   * name. null = el provider resuelto no tiene motor de suscripciones
   * - los flujos fallan explícito, jamás caen en silencio a otro
   * provider.
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
    // primer adaptador registrado con motor de suscripciones que declare
    // la moneda en `currencies` (sin declaración = sin restricción)
    // gana. Ninguno → null → error explícito, jamás caer en silencio a
    // un provider de CLP.
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

  /** País de cobro de la academia (spec multipais-currency): null → CL. */
  private async countryOfAcademy(academyId: string): Promise<string> {
    const a = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { city: { select: { country: { select: { code: true } } } } },
    });
    return a?.city?.country?.code?.toUpperCase() ?? "CL";
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
   * (TICKET con eventId propio + SERIES_PASS de sus series - la misma
   * definición de devengo que usan los payouts) ÷ 3 = mensual, agrupada
   * por moneda (spec platform-multicountry): nunca suma monedas
   * distintas - el caller elige el monto en la moneda relevante.
   */
  async producerMonthlyGross(
    producerId: string,
  ): Promise<Record<string, number>> {
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
      select: {
        orderType: true,
        eventId: true,
        refId: true,
        amount: true,
        currency: true,
      },
    });
    const byCurrency = new Map<string, number>();
    for (const p of payments) {
      const belongs =
        p.orderType === "TICKET"
          ? p.eventId != null && eventIds.has(p.eventId)
          : seriesIds.has(decodeSeriesPassRef(p.refId)?.seriesId ?? "");
      if (belongs) {
        const cur = (p.currency ?? "CLP").toUpperCase();
        byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + p.amount);
      }
    }
    const gross: Record<string, number> = {};
    for (const [cur, sum] of byCurrency) {
      gross[cur] = Math.round(sum / 3);
    }
    return gross;
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
   * Con `actor` resuelve además la promo vigente aplicable (spec
   * platform-promos): el descuento se materializa como plan espejo
   * propio por (promo, monto) - nunca muta el plan compartido del tier.
   */
  private async chargeSpec(
    kind: PlatformSubKind,
    tierCode: string,
    cycle: BillingCycle,
    countryCode: string | null | undefined,
    actor?: PromoActor,
  ): Promise<ChargeSpec> {
    const months = CYCLE_MONTHS[cycle];
    const label =
      kind === "ACADEMY"
        ? `OmniDance Academia ${tierCode} (${CYCLE_LABEL[cycle]})`
        : `OmniDance Producer Pro ${tierCode} (${CYCLE_LABEL[cycle]})`;
    // Price book por país (spec multipais-currency): la fila TierPrice
    // del país del actor es la fuente; sin ella cae a la fila CL y
    // luego al param legacy *_monthly_clp (con el factor del ciclo).
    const { amount: baseAmount, currency } = await this.priceBook(
      kind,
      tierCode,
      cycle,
      countryCode,
    );
    if (baseAmount <= 0) {
      throw new BadRequestException(
        `el tier ${tierCode} no tiene precio autogestionado - contratación manual`,
      );
    }
    const promo = actor
      ? await this.resolveApplicablePromo(actor, baseAmount, currency)
      : null;
    if (!promo) {
      return {
        planId: platformPlanId(kind, tierCode, cycle),
        name: label,
        amount: baseAmount,
        currency,
        intervalCount: months,
        promoId: null,
      };
    }
    const amount = promoChargeClp(baseAmount, promo);
    return {
      planId: platformPromoPlanId(
        kind,
        tierCode,
        cycle,
        promo.id,
        amount,
      ),
      name: `${label} · ${promo.name}`,
      amount,
      currency,
      intervalCount: months,
      promoId: promo.id,
    };
  }

  /**
   * Cargo del ciclo por país (spec multipais-currency):
   * TierPrice(tierCode, kind, cycle, countryCode) → fila CL → param
   * legacy `*_monthly_clp` × factor del ciclo. La fila del price book
   * ya trae el cargo del ciclo y su moneda; el fallback param es CLP.
   */
  private async priceBook(
    kind: PlatformSubKind,
    tierCode: string,
    cycle: BillingCycle,
    countryCode: string | null | undefined,
  ): Promise<{ amount: number; currency: string }> {
    const cc = (countryCode ?? "CL").toUpperCase();
    const where = { tierCode, kind, billingCycle: cycle };
    const row =
      (await this.prisma.tierPrice.findFirst({
        where: { ...where, countryCode: cc },
      })) ??
      (cc !== "CL"
        ? await this.prisma.tierPrice.findFirst({
            where: { ...where, countryCode: "CL" },
          })
        : null);
    if (row) return { amount: row.price, currency: row.currency };
    const monthly = await this.baseMonthlyClp(kind, tierCode);
    return { amount: cycleChargeClp(monthly, cycle), currency: "CLP" };
  }

  /**
   * Mapa tier×ciclo → cargo del price book del país (spec
   * multipais-currency): lo consumen los selectores de billing/pro del
   * front en vez de derivar del param `*_monthly_clp` CLP. `price` es
   * el cargo TOTAL del ciclo en unidad menor (la fila TierPrice ya
   * trae el factor del ciclo); `currency` es la de la fila. null =
   * tier sin precio autogestionado para ese ciclo.
   */
  private async priceBookMap(
    kind: PlatformSubKind,
    tierCodes: string[],
    countryCode: string,
  ): Promise<
    Record<string, Record<string, { price: number; currency: string } | null>>
  > {
    const out: Record<
      string,
      Record<string, { price: number; currency: string } | null>
    > = {};
    for (const tier of tierCodes) {
      out[tier] = {};
      for (const cycle of Object.keys(CYCLE_MONTHS) as BillingCycle[]) {
        try {
          const { amount, currency } = await this.priceBook(
            kind,
            tier,
            cycle,
            countryCode,
          );
          out[tier][cycle] =
            amount > 0 ? { price: amount, currency } : null;
        } catch {
          out[tier][cycle] = null;
        }
      }
    }
    return out;
  }

  /** Precio mensual base del tier desde PlatformParam (0 = manual). */
  private async baseMonthlyClp(
    kind: PlatformSubKind,
    tierCode: string,
  ): Promise<number> {
    if (kind === "ACADEMY") {
      return this.params.getNumber(
        `academy_tier.${tierCode.toLowerCase()}_monthly_clp`,
        0,
      );
    }
    const key = producerTierParamKey(tierCode);
    return key
      ? await this.params.getNumber(`producer_tier.${key}_monthly_clp`, 0)
      : 0;
  }

  // ─── Promos de suscripción (spec platform-promos) ─────────────────

  private promoActorOf(sub: PlatformSubscription): PromoActor {
    return {
      kind: sub.kind,
      academyId: sub.academyId,
      producerId: sub.producerId,
    };
  }

  /**
   * Cobros PAID marcados con la promo sobre TODAS las subs del actor -
   * el conteo que agota maxCycles (cancelar y resuscribirse no lo
   * resetea: las refId de todas sus subs cuentan).
   */
  private async promoUsedCycles(
    actor: PromoActor,
    promoId: string,
  ): Promise<number> {
    const actorId =
      actor.kind === "ACADEMY" ? actor.academyId : actor.producerId;
    if (!actorId) return 0;
    const subIds = (
      await this.prisma.platformSubscription.findMany({
        where:
          actor.kind === "ACADEMY"
            ? { academyId: actorId }
            : { producerId: actorId },
        select: { id: true },
      })
    ).map((s) => s.id);
    if (subIds.length === 0) return 0;
    return this.prisma.payment.count({
      where: {
        platformPromoId: promoId,
        status: "PAID",
        OR: subIds.map((id) => ({ refId: { startsWith: `platsub_${id}_` } })),
      },
    });
  }

  /**
   * Promo vigente aplicable al actor para un cargo base dado:
   * - enabled, dentro de [validFrom, validUntil] y scope de línea
   *   (kind exacto o null = ambas);
   * - whitelist: ambas listas vacías = global; si no, el actor debe
   *   estar en la lista de su línea;
   * - maxCycles no agotado (conteo de cobros PAID marcados).
   * Si varias califican gana la de mayor ahorro sobre el cargo;
   * empate → la que vence antes (determinista).
   */
  private async resolveApplicablePromo(
    actor: PromoActor,
    chargeClp: number | null,
    currency = "CLP",
  ): Promise<PromoWithWhitelist | null> {
    const actorId =
      actor.kind === "ACADEMY" ? actor.academyId : actor.producerId;
    if (!actorId) return null;
    const now = new Date();
    const promos = await this.prisma.platformPromo.findMany({
      where: {
        enabled: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
        OR: [{ kind: actor.kind }, { kind: null }],
      },
      include: {
        academies: { select: { id: true } },
        producers: { select: { id: true } },
      },
    });
    let best: { promo: PromoWithWhitelist; saved: number } | null = null;
    for (const promo of promos) {
      // Alcance por moneda (spec multipais-currency): una promo de monto
      // fijo en CLP nunca descuenta un cargo en otra moneda; PERCENT
      // aplica a cualquier moneda.
      if (
        promo.discountType === "FIXED_CLP" &&
        currency.toUpperCase() !== "CLP"
      ) {
        continue;
      }
      const globalList =
        promo.academies.length === 0 && promo.producers.length === 0;
      const whitelisted = globalList
        ? true
        : actor.kind === "ACADEMY"
          ? promo.academies.some((a) => a.id === actorId)
          : promo.producers.some((p) => p.id === actorId);
      if (!whitelisted) continue;
      if (promo.maxCycles != null) {
        const used = await this.promoUsedCycles(actor, promo.id);
        if (used >= promo.maxCycles) continue;
      }
      // Ahorro sobre el cargo dado; sin cargo (vista sin tier) se
      // compara el descriptor nominal del descuento.
      const saved =
        chargeClp != null
          ? chargeClp - promoChargeClp(chargeClp, promo)
          : promo.discountType === "PERCENT"
            ? (promo.percentOff ?? 0)
            : (promo.amountOffClp ?? 0);
      if (
        !best ||
        saved > best.saved ||
        (saved === best.saved && promo.validUntil < best.promo.validUntil)
      ) {
        best = { promo, saved };
      }
    }
    return best?.promo ?? null;
  }

  /**
   * `activePromo` de las vistas del actor: la promo que chargeSpec
   * aplicaría hoy + ciclos restantes. `finalMonthlyClp` es el
   * mensual-equivalente del plan vigente ya descontado (null si no hay
   * tier/ciclo resolvible - el front aplica el descriptor a sus
   * precios del selector).
   */
  private async activePromoView(
    actor: PromoActor,
    tierCode: string | null,
    cycle: BillingCycle | null,
    countryCode: string | null = null,
  ) {
    const { amount: baseAmount, currency } =
      tierCode && cycle
        ? await this.priceBook(actor.kind, tierCode, cycle, countryCode)
        : { amount: null, currency: "CLP" };
    const promo = await this.resolveApplicablePromo(actor, baseAmount, currency);
    if (!promo) return null;
    const usedCycles =
      promo.maxCycles != null
        ? await this.promoUsedCycles(actor, promo.id)
        : null;
    return {
      id: promo.id,
      name: promo.name,
      discountType: promo.discountType,
      percentOff: promo.percentOff,
      amountOffClp: promo.amountOffClp,
      validUntil: promo.validUntil,
      cyclesLeft:
        promo.maxCycles != null && usedCycles != null
          ? Math.max(0, promo.maxCycles - usedCycles)
          : null,
      finalMonthlyClp:
        baseAmount != null && cycle
          ? Math.round(promoChargeClp(baseAmount, promo) / CYCLE_MONTHS[cycle])
          : null,
    };
  }

  // ─── Contratación ─────────────────────────────────────────────────

  /**
   * `POST /academies/:id/subscribe` - el owner contrata tier + ciclo.
   * Verifica el límite de alumnos activos ANTES de crear nada (400
   * `tier_limit` con copy honesto), serializa la elección de la fila
   * PENDING_CARD con advisory lock por persona (mismo invariante que
   * membresías: el retorno del disclaimer resuelve la pendiente más
   * reciente del pagador - no puede haber dos vivas) y deriva al flujo de
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
        "ese tier es de contratación manual o ya no se vende - contacta a ventas",
      );
    }
    const [activeStudents, max] = await Promise.all([
      this.countActiveStudents(academy.id),
      this.academyMaxStudents(input.tier),
    ]);
    if (activeStudents > max) {
      throw new BadRequestException({
        error: "tier_limit",
        message: `Tu academia tiene ${activeStudents} alumnos activos y el plan ${input.tier} permite hasta ${max} - depura alumnos o elige un tier mayor`,
        active: activeStudents,
        max,
        tier: input.tier,
      });
    }
    // País de cobro de la academia (spec multipais-currency): deriva de
    // su ciudad → país (null → CL); fija la moneda del cargo.
    const countryCode = await this.countryOfAcademy(academy.id);
    const charge = await this.chargeSpec(
      "ACADEMY",
      input.tier,
      input.cycle,
      countryCode,
      {
        kind: "ACADEMY",
        academyId: academy.id,
      },
    );
    await this.provider(charge.currency); // fail-fast si no hay motor de subs
    const sub = await this.prisma.$transaction((tx) =>
      this.pickOrCreatePendingSub(tx, personId, {
        kind: "ACADEMY",
        academyId: academy.id,
        tierCode: input.tier,
        billingCycle: input.cycle,
        countryCode,
        currency: charge.currency,
      }),
    );
    return this.runSubscribeFlow(sub, charge, randomUUID(), academy.name);
  }

  /**
   * `POST /producers/:id/pro/subscribe` - el productor contrata Pro; el
   * tier se calcula por su facturación (media bruta de 90d ÷ 3) contra
   * `producer_tier.*_max_monthly_clp`. Sobre el tope GROWTH → 400
   * `tier_limit` (PRO_BIG es "a convenir").
   */
  async subscribeProducer(
    personId: string,
    input: {
      cycle: BillingCycle;
      acceptRecurring?: boolean;
      billingCountry?: string;
    },
  ): Promise<PlatformSubscribeResult> {
    if (input.acceptRecurring !== true) {
      throw new BadRequestException("debes aceptar el cobro recurrente");
    }
    // País de cobro declarado por el productor (spec multipais-currency,
    // ISO-2, default CL - no tiene venue del que derivarlo); se valida
    // contra el catálogo Country.
    const countryCode = (input.billingCountry ?? "CL").toUpperCase();
    const country = await this.prisma.country.findUnique({
      where: { code: countryCode },
      select: { code: true, currency: true },
    });
    if (!country) {
      throw new BadRequestException("billingCountry no es un país válido");
    }
    const grossByCurrency = await this.producerMonthlyGross(personId);
    // El tope de tier se evalúa en la moneda del país de cobro declarado
    // (es la moneda del price book que cobrará la suscripción) - nunca
    // una suma cruzada de monedas (spec platform-multicountry).
    const monthlyGross =
      grossByCurrency[(country.currency ?? "CLP").toUpperCase()] ?? 0;
    const tier = await this.producerTierForGross(monthlyGross);
    if (!tier || !SELF_SERVE_PRODUCER_TIERS.has(tier)) {
      const max = await this.params.getNumber(
        "producer_tier.growth_max_monthly_clp",
        8000000,
      );
      throw new BadRequestException({
        error: "tier_limit",
        message:
          "tu facturación supera el máximo autogestionado - contacta a ventas (PRO_BIG)",
        monthlyGross,
        max,
      });
    }
    const charge = await this.chargeSpec(
      "PRODUCER",
      tier,
      input.cycle,
      countryCode,
      {
        kind: "PRODUCER",
        producerId: personId,
      },
    );
    await this.provider(charge.currency);
    const sub = await this.prisma.$transaction((tx) =>
      this.pickOrCreatePendingSub(tx, personId, {
        kind: "PRODUCER",
        producerId: personId,
        tierCode: tier,
        billingCycle: input.cycle,
        countryCode,
        currency: charge.currency,
      }),
    );
    return this.runSubscribeFlow(sub, charge, randomUUID(), "Producer Pro");
  }

  /**
   * Elección/creación de la fila PENDING_CARD bajo advisory lock
   * `platsub:<personId>` (espejo de `sub:<personId>` de membresías):
   * - reutiliza la PENDING_CARD fresca del MISMO scope (academia o
   *   productor) - actualiza tier/ciclo si el retry pidió otro plan;
   * - 409 si ya hay una sub ACTIVE/CANCEL_PENDING de ese scope (el cambio
   *   va por PATCH);
   * - cancela las PENDING_CARD vencidas y las de otros scopes del mismo
   *   pagador, y la ACTIVATING expirada del scope (crash del intento).
   * Todo cancel es condicional por status esperado - si la fila se movió
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
      countryCode: string;
      currency: string;
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
          "ya existe una suscripción activa - gestiona el cambio con PATCH /subscription",
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
          "la suscripción está siendo procesada - reintenta en unos segundos",
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
          "la suscripción está siendo procesada - reintenta en unos segundos",
        );
      }
    }
    if (reuse) {
      if (
        reuse.tierCode !== create.tierCode ||
        reuse.billingCycle !== create.billingCycle ||
        reuse.countryCode !== create.countryCode ||
        reuse.currency !== create.currency
      ) {
        return tx.platformSubscription.update({
          where: { id: reuse.id },
          data: {
            tierCode: create.tierCode,
            billingCycle: create.billingCycle,
            countryCode: create.countryCode,
            currency: create.currency,
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
        countryCode: create.countryCode,
        currency: create.currency,
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
    const { provider, name: providerName } = await this.provider(
      charge.currency,
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
        currency: charge.currency,
      },
      { correlationId },
    );
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      providerName,
      sub.personId,
      { correlationId },
    );
    const customer = await provider.getCustomer(customerId, { correlationId });
    if (!customer.hasCard) {
      const { registerUrl } = await provider.registerCustomerCard(
        {
          customerId,
          returnUrl: `${this.apiUrl}/api/payments/flow/platform-customer-return`,
          // El registro de Stripe ES el Checkout mode=subscription - el
          // Price espejo se resuelve por (planId, currency) allá.
          planId: charge.planId,
          currency: charge.currency,
          metadata: { personId: sub.personId },
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
          ? "la suscripción fue cancelada - vuelve a intentarlo"
          : "la suscripción está siendo procesada - reintenta en unos segundos",
      );
    }

    const { active, fs } = await this.createRemoteSubscription(sub.id, {
      flowPlanId: charge.planId,
      promoId: charge.promoId,
      planChargeClp: charge.amount,
      currency: charge.currency,
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
   * subscription/create del proveedor sobre una platsub claimeada
   * (ACTIVATING) + persistencia del resultado - mismo contrato que el
   * de membresías: reversa del claim si el proveedor falla,
   * persistencia temprana del id remoto, guard de status ya
   * normalizado, compensación de la remota huérfana (cancel
   * inmediato) si la transición local no aplica.
   */
  private async createRemoteSubscription(
    subId: string,
    p: {
      flowPlanId: string;
      promoId: string | null;
      planChargeClp: number;
      /** Moneda del cargo - resuelve el provider (spec multipais-currency). */
      currency: string;
      customerId: string;
      correlationId: string;
    },
  ): Promise<{ active: PlatformSubscription; fs: RemoteSubscription }> {
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

    if (fs.status === "UNKNOWN" && fs.rawStatus != null) {
      this.logger.warn(
        `subscription/create platsub ${subId}: status remoto inesperado ${String(fs.rawStatus)} - queda ACTIVE y el reconcile corrige`,
      );
    }
    const nextStatus = fs.status === "CANCELED" ? "CANCELED" : "ACTIVE";
    const transition = await this.prisma.platformSubscription
      .updateMany({
        where: { id: subId, status: "ACTIVATING" },
        data: {
          flowSubscriptionId: fs.subscriptionId,
          status: nextStatus,
          nextInvoiceAt: fs.nextInvoiceDate
            ? new Date(fs.nextInvoiceDate)
            : null,
          promoId: p.promoId,
          planChargeClp: p.planChargeClp,
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
            `compensación cancel sub remota ${fs.subscriptionId} (platsub ${subId}): ${ce instanceof Error ? ce.message : ce}`,
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
   * Adopción de una sub remota ya creada por el registro de tarjeta
   * (Stripe Checkout mode=subscription - spec multipais-currency): la
   * fila ACTIVATING pasa a ACTIVE con el id remoto; el estado real lo
   * confirma el getSubscription inmediato (si falla, queda ACTIVE y el
   * reconcile corrige - la sub existe, cobrará).
   */
  private async adoptRemoteSubscription(
    subId: string,
    p: {
      remoteId: string;
      promoId: string | null;
      planChargeClp: number;
      correlationId: string;
    },
  ): Promise<{ active: PlatformSubscription; fs: RemoteSubscription }> {
    const sub = await this.prisma.platformSubscription.findUniqueOrThrow({
      where: { id: subId },
    });
    const { provider } = await this.provider(sub.currency);
    const fs = await provider
      .getSubscription(p.remoteId, { correlationId: p.correlationId })
      .catch(() => null);
    const transition = await this.prisma.platformSubscription.updateMany({
      where: { id: subId, status: "ACTIVATING" },
      data: {
        flowSubscriptionId: p.remoteId,
        status: fs?.status === "CANCELED" ? "CANCELED" : "ACTIVE",
        nextInvoiceAt: fs?.nextInvoiceDate
          ? new Date(fs.nextInvoiceDate)
          : null,
        promoId: p.promoId,
        planChargeClp: p.planChargeClp,
        ...(fs?.status === "CANCELED" ? { canceledAt: new Date() } : {}),
      },
    });
    if (transition.count === 0) {
      throw new ConflictException(
        "la suscripción cambió de estado durante la activación",
      );
    }
    const active =
      await this.prisma.platformSubscription.findUniqueOrThrow({
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
   * Retorno del disclaimer de tarjeta para subs de plataforma -
   * `POST /api/payments/flow/platform-customer-return` (Flow POSTea el
   * browser con {token}). Endpoint propio porque el token de
   * getRegisterStatus se consume una vez: cada dominio resuelve sus
   * pendientes en su callback. Reanuda la PENDING_CARD más reciente del
   * pagador → ACTIVATING → subscription/create → ACTIVE.
   */
  async customerReturn(token: string): Promise<PlatformCustomerReturn> {
    const correlationId = randomUUID();
    await this.gatewayTx.record({
      provider:
        (await this.subscriptionGateway())?.name ?? "UNCONFIGURED",
      direction: "INBOUND_WEBHOOK",
      endpoint: "platform-customer/register-return",
      correlationId,
      requestBody: { token },
      ok: true,
    });
    // El token del retorno no trae moneda: se prueba el provider del
    // param (CLP) primero y luego el resto de los adaptadores con motor
    // de suscripciones (spec multipais-currency) - el que reconozca el
    // registro gana. Así una sub no-CLP (Stripe Checkout) también
    // resuelve su provider correcto.
    let provider: SubscriptionProvider;
    let reg: {
      registered: boolean;
      customerId?: string;
      subscriptionId?: string;
    };
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
    provider = candidates[0] as unknown as SubscriptionProvider;
    let providerName = candidates[0].name;
    reg = { registered: false };
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
      return { ok: false };
    }
    // Customer → person por el mapa multi-provider
    // (gatewayCustomerIds["<GW>"]) con fallback a la columna legacy
    // para FLOW - el customerId devuelto pertenece al provider que
    // reconoció el token.
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

    // El plan espejo se deriva de tier/ciclo (compartido por el tier) -
    // ensurePlan es idempotente por si aún no existe.
    const charge = await this.chargeSpec(
      sub.kind,
      sub.tierCode,
      sub.billingCycle,
      sub.countryCode,
      this.promoActorOf(sub),
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
        currency: charge.currency,
      },
      { correlationId },
    );
    // La sesión de Stripe (Checkout mode=subscription) ya creó la sub
    // remota - su id viene en getRegisterStatus; Flow no lo emite y sigue
    // por subscription/create.
    const { active, fs } = reg.subscriptionId
      ? await this.adoptRemoteSubscription(sub.id, {
          remoteId: reg.subscriptionId,
          promoId: charge.promoId,
          planChargeClp: charge.amount,
          correlationId,
        })
      : await this.createRemoteSubscription(sub.id, {
          flowPlanId: charge.planId,
          promoId: charge.promoId,
          planChargeClp: charge.amount,
          currency: charge.currency,
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
   * `PATCH /academies/:id/subscription` - cambio de tier y/o ciclo.
   * - PENDING_CARD: edita la fila directo (aún no hay cargo).
   * - Upgrade de tier (rank mayor): inmediato - cancel remota inmediata +
   *   subscription/create en el plan nuevo (cobra el ciclo completo;
   *   prorateo manual v1 según design).
   * - Downgrade o cambio de ciclo: persiste `pendingTierCode`/
   *   `pendingBillingCycle` y cancela la remota a fin de período - el
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
        "la academia no tiene suscripción - usa POST /subscribe",
      );
    }
    if (input.tier === undefined && input.cycle === undefined) {
      throw new BadRequestException("envía tier y/o cycle");
    }
    const targetTier = input.tier ?? sub.tierCode;
    const targetCycle = input.cycle ?? sub.billingCycle;
    if (!SELF_SERVE_ACADEMY_TIERS.has(targetTier)) {
      throw new BadRequestException(
        "ese tier es de contratación manual o ya no se vende - contacta a ventas",
      );
    }
    // Spec: la verificación del límite aplica al suscribir y al bajar de
    // tier - se valida SIEMPRE el tier destino (en un upgrade nunca
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
        "la suscripción está siendo procesada - reintenta en unos segundos",
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
    // Downgrade / cambio de ciclo - o PATCH de vuelta al plan vigente
    // con un cambio pendiente: el pending queda = actual (la cancel
    // remota a fin de período ya no se puede deshacer; el swap recrea
    // el mismo plan al fin del ciclo → continuidad del cobro).
    return this.schedulePlanChange(sub, targetTier, targetCycle);
  }

  /**
   * Upgrade inmediato: crea la sub Flow nueva (cobra ya), cancela la
   * remota anterior de inmediato y conmuta la fila local. La transición
   * es condicional por el status leído al entrar - si la fila se movió
   * entremedio, la remota nueva se compensa con cancel inmediata.
   */
  private async swapPlanNow(
    sub: PlatformSubscription,
    targetTier: string,
    targetCycle: BillingCycle,
    scopeName: string,
  ): Promise<PlatformSubscription> {
    const correlationId = randomUUID();
    const charge = await this.chargeSpec(
      sub.kind,
      targetTier,
      targetCycle,
      sub.countryCode,
      this.promoActorOf(sub),
    );
    const { provider, name: providerName } = await this.provider(
      charge.currency,
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
        currency: charge.currency,
      },
      { correlationId },
    );
    const { customerId } = await ensureFlowCustomer(
      this.prisma,
      provider,
      providerName,
      sub.personId,
      { correlationId },
    );
    // Crear ANTES de cancelar la vieja: si el create falla la sub actual
    // sigue intacta y cobrando (nada cambió). El remote viejo se captura
    // antes del persist temprano - escribir la fila no debe pisar el id
    // que aún hay que cancelar.
    const oldRemoteId = sub.flowSubscriptionId;
    const fs = await provider.createSubscription(
      {
        planId: charge.planId,
        customerId,
        subscriptionStart: new Date().toISOString().slice(0, 10),
        currency: charge.currency,
      },
      { correlationId },
    );
    // Persistencia temprana del id remoto - si muere el proceso, el sweep
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
        // La nueva ya cobró - no puede quedar huérfana cobrando en
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
    const nextStatus = fs.status === "CANCELED" ? "CANCELED" : "ACTIVE";
    const transition = await this.prisma.platformSubscription
      .updateMany({
        where: { id: sub.id, status: sub.status },
        data: {
          tierCode: targetTier,
          billingCycle: targetCycle,
          flowSubscriptionId: fs.subscriptionId,
          status: nextStatus,
          nextInvoiceAt: fs.nextInvoiceDate
            ? new Date(fs.nextInvoiceDate)
            : null,
          lastInvoiceId: null,
          reminderSentFor: null,
          pendingTierCode: null,
          pendingBillingCycle: null,
          pendingReprice: false,
          promoId: charge.promoId,
          // planChargeClp guarda el cargo EN LA MONEDA de la sub (el
          // nombre quedó legacy CLP - renombrar la columna es invasivo).
          planChargeClp: charge.amount,
          currency: charge.currency,
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
   * remota sigue activa) la cancela a fin de período - el reconcile la
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
      const { provider } = await this.provider(sub.currency);
      await provider.cancelSubscription(sub.flowSubscriptionId, {
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
   * Cancelación owner - efecto al fin del período ya pagado (Flow
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
      pendingReprice: false,
    } as const;
    if (!sub.flowSubscriptionId) {
      await this.prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { status: "CANCELED", canceledAt: new Date(), ...clearPending },
      });
      return { ok: true, status: "CANCELED", subscriptionId: sub.id };
    }
    const { provider } = await this.provider(sub.currency);
    await provider.cancelSubscription(sub.flowSubscriptionId, {
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
   * `GET /academies/:id/billing` - estado de la suscripción de la
   * academia para el owner: tier/ciclo vigentes, alumnos activos vs
   * límite del tier, próxima facturación, trial, gracia restante,
   * bloqueo e invoices (los Payment PLATFORM_SUB de sus suscripciones).
   * Hace refresh activo contra Flow como `getForOwner` de membresías -
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
      (await this.subscriptionGateway(current.currency))
    ) {
      try {
        const { provider } = await this.provider(current.currency);
        const fs = await provider.getSubscription(current.flowSubscriptionId, {
          correlationId: randomUUID(),
        });
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
              currency: true,
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
    const academyCountry = await this.countryOfAcademy(academy.id);
    // Promo vigente aplicable a la academia (spec platform-promos): la
    // vista la expone para mostrar precio tachado + oferta + vencimiento.
    const activePromo = await this.activePromoView(
      { kind: "ACADEMY", academyId: academy.id },
      effectiveTier,
      current?.billingCycle ?? academy.billingCycle ?? null,
      academyCountry,
    );
    // Selector de tier/ciclo con los precios del price book del país
    // de la academia (spec multipais-currency) - el front NO deriva de
    // los params CLP: cada celda trae el cargo del ciclo + su moneda.
    const prices = await this.priceBookMap(
      "ACADEMY",
      [...SELF_SERVE_ACADEMY_TIERS],
      academyCountry,
    );
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
      currency: current?.currency ?? "CLP",
      countryCode: current?.countryCode ?? "CL",
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
      activePromo,
      prices,
    };
  }

  /**
   * `GET /producers/:id/pro` - estado Producer Pro: tier vigente
   * (`Person.proTier`), suscripción, facturación media 90d vs límite del
   * tier y próxima facturación. Refresh activo igual que billing.
   * `effectivePro`/`proTrialEndsAt` le dicen al front si las features Pro
   * están habilitadas (tier pago o trial de lanzamiento, S5).
   */
  async producerProView(personId: string) {
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { proTier: true, proTrialEndsAt: true },
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
      (await this.subscriptionGateway(current.currency))
    ) {
      try {
        const { provider } = await this.provider(current.currency);
        const fs = await provider.getSubscription(current.flowSubscriptionId, {
          correlationId: randomUUID(),
        });
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
    const grossByCurrency = await this.producerMonthlyGross(personId);
    // Facturación para el tope del tier: en la moneda de la suscripción
    // (spec platform-multicountry; sin suscripción → CLP). El front
    // muestra el desglose completo, nunca una suma cruzada.
    const viewCurrency = (current?.currency ?? "CLP").toUpperCase();
    const monthlyGross = grossByCurrency[viewCurrency] ?? 0;
    const tierKey = producerTierParamKey(
      current?.tierCode ?? person.proTier,
    );
    const maxGross = tierKey
      ? await this.params.getNumber(
          `producer_tier.${tierKey}_max_monthly_clp`,
          0,
        )
      : null;
    // Promo vigente aplicable al productor (spec platform-promos).
    const producerCountry = current?.countryCode ?? "CL";
    const activePromo = await this.activePromoView(
      { kind: "PRODUCER", producerId: personId },
      current?.tierCode ?? person.proTier ?? null,
      current?.billingCycle ?? null,
      producerCountry,
    );
    // Precios del price book del país de cobro (spec
    // multipais-currency) para el selector de ciclo del front.
    const prices = await this.priceBookMap(
      "PRODUCER",
      [...SELF_SERVE_PRODUCER_TIERS],
      producerCountry,
    );
    return {
      proTier: person.proTier,
      proTrialEndsAt: person.proTrialEndsAt,
      effectivePro: isProActive(person),
      currency: current?.currency ?? "CLP",
      countryCode: current?.countryCode ?? "CL",
      status: current?.status ?? null,
      subscriptionId: current?.id ?? null,
      tier: current?.tierCode ?? null,
      cycle: current?.billingCycle ?? null,
      pendingTier: current?.pendingTierCode ?? null,
      pendingCycle: current?.pendingBillingCycle ?? null,
      monthlyGross,
      monthlyGrossByCurrency: grossByCurrency,
      maxGross,
      nextInvoiceAt: current?.nextInvoiceAt ?? null,
      canceledAt: current?.canceledAt ?? null,
      activePromo,
      prices,
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
   * Evento de billing del webhook firmado (spec stripe-subs-webhook) -
   * espejo de `SubscriptionsService.handleBillingEvent` sobre
   * PlatformSubscription: si `ev.subscriptionId` matchea el
   * `flowSubscriptionId` persistido (remoteId - Stripe lo guarda ahí
   * igual que Flow), traduce el evento y corre el MISMO reconcile
   * puntual: `invoice.paid` → `settlePlatformSub` (RENEWAL_SETTLED -
   * restaura tier, limpia `billingGraceUntil`/`billingBlockedAt`),
   * `invoice.payment_failed` → gracia/aviso de mora (handleMorose),
   * `customer.subscription.deleted` → CANCELED. Dedup por
   * `lastInvoiceId`/refId `platsub_<subId>_<invoiceId>` - webhook y
   * polling no duplican la liquidación.
   *
   * `true` = target resuelto (también cuando el tipo no tiene efecto
   * local); `false` = sin match - el dispatcher sigue con el próximo
   * consumidor.
   */
  async handleBillingEvent(ev: BillingWebhookEvent): Promise<boolean> {
    if (!ev.subscriptionId) return false;
    const sub = await this.prisma.platformSubscription.findUnique({
      where: { flowSubscriptionId: ev.subscriptionId },
    });
    if (!sub) return false;
    const fs = remoteFromBillingEvent(ev, {
      subscriptionId: sub.flowSubscriptionId!,
      planId: sub.tierCode,
      nextInvoiceAt: sub.nextInvoiceAt,
    });
    if (fs) await this.reconcileSubscription(sub, fs, "webhook");
    return true;
  }

  /**
   * Barrido de las PlatformSubscription vivas - mismo gatillado que
   * membresías (webhook fast-path + cron T7 + refresh de las vistas).
   * El sweep de huérfanas NO se duplica acá: corre en
   * `SubscriptionsService.reconcileAll` sobre la auditoría compartida de
   * `subscription/create` y ya cubre ambas tablas.
   */
  async reconcileAll(
    actor = "reconcile",
  ): Promise<{ checked: number; settled: number }> {
    const subs = await this.prisma.platformSubscription.findMany({
      where: {
        flowSubscriptionId: { not: null },
        status: { in: ["ACTIVE", "CANCEL_PENDING"] },
      },
    });
    // Provider por moneda de cada sub (spec multipais-currency) -
    // resuelto lazy por currency para no fallar el barrido completo si
    // una moneda no tiene proveedor (esa sub se salta con log).
    const providers = new Map<string, SubscriptionProvider | null>();
    let settled = 0;
    for (const sub of subs) {
      const cur = sub.currency ?? "CLP";
      if (!providers.has(cur)) {
        providers.set(
          cur,
          (await this.provider(cur).catch(() => null))?.provider ?? null,
        );
      }
      const provider = providers.get(cur);
      if (!provider) {
        this.logger.warn(
          `reconcile platsub ${sub.id}: moneda ${cur} sin proveedor de suscripciones`,
        );
        continue;
      }
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
   * Reconcile de una PlatformSubscription contra Flow - espejo de
   * `SubscriptionsService.reconcileSubscription`:
   * - invoices pagadas → Payment `platsub_<subId>_<invoiceId>` +
   *   `settlePlatformSub` (RENEWAL_SETTLED - desbloquea academia /
   *   restaura proTier). Dedup por lastInvoiceId + refId único; Payment
   *   PENDING huérfano reintenta el settle.
   * - sync de estado: `nextInvoiceDate` → nextInvoiceAt;
   *   `cancelAtPeriodEnd` → CANCEL_PENDING; `status CANCELED` →
   *   CANCELED - o, si hay cambio de plan pendiente, swap a la nueva
   *   sub remota.
   * - reminder del cobro del día siguiente (misma ventana 24h y dedup
   *   reminderSentFor).
   * - mora (`fs.morose` - Flow morose=1 normalizado): ACADEMY →
   *   `billingGraceUntil` = now + `academy_billing.grace_days` (el
   *   BLOQUEO efectivo lo hace el job de S3) + notify
   *   `academy.billing_grace`; PRODUCER → notify
   *   `producer.pro_renewal_failed` (S5 decide la degradación de
   *   features). Ambos emiten RENEWAL_FAILED en el último Payment de la
   *   sub, una vez por episodio (dedup por invoiceId impaga más antigua).
   */
  async reconcileSubscription(
    sub: PlatformSubscription,
    fs: RemoteSubscription,
    actor = "reconcile",
  ): Promise<number> {
    let settled = 0;
    const paidInvoices = (fs.invoices ?? []).filter((inv) => inv.paid);
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
            gatewayData: inv.payment?.data,
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
          // Auditoría del cobro descontado (spec platform-promos) -
          // base del conteo de maxCycles por actor.
          platformPromoId: sub.promoId ?? null,
          currency: sub.currency ?? "CLP",
          gateway:
            (await this.subscriptionGateway(sub.currency))?.name ??
            "UNCONFIGURED",
          gatewayRef: inv.payment?.orderRef ?? null,
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
        gatewayData: inv.payment?.data,
      });
      settled++;
      await this.markInvoice(sub.id, invId);
      sub.lastInvoiceId = invId;
    }

    const nextInvoiceAt = fs.nextInvoiceDate
      ? new Date(fs.nextInvoiceDate)
      : null;
    let status = sub.status;
    let canceledAt = sub.canceledAt;
    // Estado ya normalizado por el adaptador (spec
    // subscription-port-generic): CANCELED gatilla el swap pendiente o
    // la cancelación local; UNKNOWN se trata como vigente.
    if (fs.status === "CANCELED") {
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
      } else if (sub.pendingReprice) {
        // Reprice agendado por drift de precio (spec platform-promos):
        // recrea la remota con el cargo vigente al fin del período -
        // chargeSpec resuelve la promo de nuevo (expirada/agotada →
        // plan base a precio lleno). Si falla, CANCEL_PENDING +
        // pendingReprice → el próximo barrido reintenta.
        try {
          const repriced = await this.applyPendingReprice(sub, actor);
          if (repriced) return settled;
        } catch (e) {
          this.logger.error(
            `reprice platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
          );
          await this.prisma.platformSubscription
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
      // la remota la pidió el sistema para el swap, no el actor.
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
    // membresías) - solo en ACTIVE: una CANCEL_PENDING no tiene próximo
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
    // re-evalúa la facturación - si supera el tope del tier vigente se
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

    // Mora: el proveedor reporta mora con la invoice impaga en
    // invoices[] (Flow morose=1 → `fs.morose` ya normalizado).
    if (fs.morose) {
      await this.handleMorose(sub, fs, actor);
    }

    // Drift de precio (spec platform-promos): la remota debe cobrar lo
    // que chargeSpec resuelve HOY (promo vigente o precio lleno). Si
    // difiere — promo nueva aplicable, agotada, expirada, deshabilitada,
    // editada, o param de precio cambiado — se agenda el reprice: cancel
    // de la remota a fin de período + recreación con el plan vigente.
    // Con cambio de plan pendiente o cancel ya agendada no hace falta:
    // ese swap ya reprecia. Con mora no se agenda nada (el cobro está
    // fallando; la regularización resuelve el precio después).
    if (
      status === "ACTIVE" &&
      !fs.morose &&
      sub.flowSubscriptionId &&
      !fs.cancelAtPeriodEnd &&
      !sub.pendingTierCode &&
      !sub.pendingReprice
    ) {
      try {
        await this.ensureRemotePrice(sub, actor);
      } catch (e) {
        this.logger.error(
          `drift-check platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    return settled;
  }

  /**
   * Agenda el reprice de una sub cuyo plan remoto ya no calza con lo que
   * chargeSpec resuelve hoy: cancel de la remota a fin de período +
   * `pendingReprice`. Cuando Flow la reporta CANCELED el reconcile la
   * recrea con el cargo vigente (`applyPendingReprice`).
   */
  private async ensureRemotePrice(
    sub: PlatformSubscription,
    actor: string,
  ): Promise<void> {
    let expected: ChargeSpec;
    try {
      expected = await this.chargeSpec(
        sub.kind,
        sub.tierCode,
        sub.billingCycle,
        sub.countryCode,
        this.promoActorOf(sub),
      );
    } catch {
      return; // tier "a convenir" sin param: contrato manual, nunca reprice
    }
    const drift =
      (sub.promoId ?? null) !== (expected.promoId ?? null) ||
      (sub.currency ?? "CLP") !== expected.currency ||
      (sub.planChargeClp != null && sub.planChargeClp !== expected.amount);
    if (!drift) return;
    const { provider } = await this.provider(sub.currency);
    await provider.cancelSubscription(sub.flowSubscriptionId!, {
      correlationId: randomUUID(),
    });
    await this.prisma.platformSubscription.update({
      where: { id: sub.id },
      data: { pendingReprice: true },
    });
    sub.pendingReprice = true;
    this.logger.log(
      `reprice agendado platsub ${sub.id} (${actor}): promo ${sub.promoId ?? "-"}→${expected.promoId ?? "-"}, cargo ${sub.planChargeClp ?? "?"}→${expected.amount}`,
    );
  }

  /**
   * Materializa el reprice cuando la remota vieja quedó CANCELED (fin de
   * período): recrea la sub remota sobre el plan que chargeSpec resuelve
   * HOY - mismo tier/ciclo, plan base o promo según aplique. Espejo de
   * `applyPendingPlanChange` sin cambio de tier ni aviso al actor (la
   * vista de billing ya muestra el precio efectivo y la promo activa).
   */
  private async applyPendingReprice(
    sub: PlatformSubscription,
    actor: string,
  ): Promise<boolean> {
    const correlationId = randomUUID();
    const charge = await this.chargeSpec(
      sub.kind,
      sub.tierCode,
      sub.billingCycle,
      sub.countryCode,
      this.promoActorOf(sub),
    );
    const { provider, name: providerName } = await this.provider(
      charge.currency,
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
        currency: charge.currency,
      },
      { correlationId },
    );
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
        currency: charge.currency,
      },
      { correlationId },
    );
    // Persistencia temprana del id remoto - el sweep de huérfanas la
    // rastrea aunque muera el proceso antes del updateMany.
    await this.prisma.platformSubscription
      .update({
        where: { id: sub.id },
        data: { flowSubscriptionId: fs.subscriptionId },
      })
      .catch(() => {});
    const transition = await this.prisma.platformSubscription
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
          promoId: charge.promoId,
          // Cargo en la moneda de la sub (nombre legacy CLP).
          planChargeClp: charge.amount,
          currency: charge.currency,
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
    const updated =
      await this.prisma.platformSubscription.findUniqueOrThrow({
        where: { id: sub.id },
      });
    try {
      await this.reconcileSubscription(updated, fs, actor);
    } catch (e) {
      this.logger.error(
        `reconcile post-reprice platsub ${sub.id}: ${e instanceof Error ? e.message : e}`,
      );
    }
    return true;
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
    const correlationId = randomUUID();
    const charge = await this.chargeSpec(
      sub.kind,
      tier,
      cycle,
      sub.countryCode,
      this.promoActorOf(sub),
    );
    const { provider, name: providerName } = await this.provider(
      charge.currency,
    );
    await provider.ensurePlan(
      {
        planId: charge.planId,
        name: charge.name,
        amount: charge.amount,
        intervalCount: charge.intervalCount,
        currency: charge.currency,
      },
      { correlationId },
    );
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
        currency: charge.currency,
      },
      { correlationId },
    );
    // Persistencia temprana del id remoto - el sweep de huérfanas la
    // rastrea aunque muera el proceso antes del updateMany.
    await this.prisma.platformSubscription
      .update({
        where: { id: sub.id },
        data: { flowSubscriptionId: fs.subscriptionId },
      })
      .catch(() => {});
    const transition = await this.prisma.platformSubscription
      .updateMany({
        where: { id: sub.id, status: sub.status },
        data: {
          tierCode: tier,
          billingCycle: cycle,
          flowSubscriptionId: fs.subscriptionId,
          status: fs.status === "CANCELED" ? "CANCELED" : "ACTIVE",
          nextInvoiceAt: fs.nextInvoiceDate
            ? new Date(fs.nextInvoiceDate)
            : null,
          lastInvoiceId: null,
          reminderSentFor: null,
          pendingTierCode: null,
          pendingBillingCycle: null,
          pendingReprice: false,
          promoId: charge.promoId,
          // Cargo en la moneda de la sub (nombre legacy CLP).
          planChargeClp: charge.amount,
          currency: charge.currency,
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
   * por encima del máximo autogestionado (PRO_BIG) solo avisa - la
   * contratación es manual. Nunca corta la venta ni las features en curso.
   */
  private async enforceProducerTier(
    sub: PlatformSubscription,
  ): Promise<void> {
    if (!sub.producerId) return;
    const grossByCurrency = await this.producerMonthlyGross(sub.producerId);
    // Tope del tier en la moneda de la suscripción (spec
    // platform-multicountry) - fallback CLP para filas legacy.
    const monthlyGross =
      grossByCurrency[(sub.currency ?? "CLP").toUpperCase()] ?? 0;
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
        const { provider } = await this.provider(sub.currency);
        await provider
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
        ? `Tu facturación supera el tope de ${sub.tierCode} - al próximo ciclo pasas a ${required}`
        : "Tu facturación supera el máximo autogestionado - contacta a ventas (PRO_BIG)",
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
   * no hay una gracia vigente - la primera detección gana; el bloqueo del
   * día siguiente al vencimiento lo ejecuta el job de S3) + aviso al
   * owner. PRODUCER: solo aviso (la degradación de features Pro es de
   * S5). Ambos emiten RENEWAL_FAILED sobre el último Payment de la sub -
   * una vez por episodio (dedup por la invoice impaga más antigua).
   */
  private async handleMorose(
    sub: PlatformSubscription,
    fs: RemoteSubscription,
    actor: string,
  ): Promise<void> {
    const unpaid = (fs.invoices ?? [])
      .filter((inv) => !inv.paid)
      .sort((a, b) => Number(a.id) - Number(b.id))[0];
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
      // Solo fija la gracia si no hay una vigente - extenderla en cada
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
          ? `Tienes ${graceDays ?? 5} días para regularizar antes del bloqueo - revisa tu tarjeta`
          : "Reintentaremos el cobro de Producer Pro - revisa tu tarjeta",
      data: {
        subscriptionId: sub.id,
        academyId: sub.academyId,
        producerId: sub.producerId,
        invoiceId,
        graceDays,
      },
    });
  }

  // ─── Enforcement S3 - bloqueo por gracia vencida ──────────────────

  /**
   * Job diario (cron 09:00, `SubscriptionsScheduler`): academias con
   * `billingGraceUntil` vencido y aún sin bloqueo pasan a
   * `billingBlockedAt = now`. El filtro del updateMany repite la
   * condición - si un RENEWAL_SETTLED limpió los campos entre el
   * findMany y el update, count=0 y no se notifica un bloqueo falso.
   * El owner recibe `academy.billing_blocked` una sola vez por episodio
   * (la condición excluye las ya bloqueadas → el barrido es idempotente).
   * El desbloqueo NO espera al job: `settlePlatformSub` limpia ambos
   * campos al liquidar la renovación.
   */
  async enforceAcademyBlocks(): Promise<{ blocked: number }> {
    const now = new Date();
    const expired = await this.prisma.academy.findMany({
      where: {
        billingGraceUntil: { lt: now },
        billingBlockedAt: null,
      },
      select: { id: true, name: true, ownerId: true },
    });
    let blocked = 0;
    for (const academy of expired) {
      const marked = await this.prisma.academy.updateMany({
        where: {
          id: academy.id,
          billingGraceUntil: { lt: now },
          billingBlockedAt: null,
        },
        data: { billingBlockedAt: now },
      });
      if (marked.count === 0) continue; // regularizó entre el read y el write
      blocked += marked.count;
      await this.notifications.notifySafe(academy.ownerId, {
        category: "TRANSACTIONAL",
        type: "academy.billing_blocked",
        title: "Academia bloqueada por suscripción impaga",
        body: `${academy.name} quedó en solo lectura - regulariza el pago para volver a operar`,
        data: {
          academyId: academy.id,
          blockedAt: now.toISOString(),
        },
      });
    }
    if (blocked > 0) {
      this.logger.log(`enforcement mora: ${blocked} academia(s) bloqueadas`);
    }
    return { blocked };
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
        sub.countryCode,
        this.promoActorOf(sub),
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
