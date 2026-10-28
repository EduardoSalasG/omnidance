import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
  type SubscriptionProvider,
} from "../domain/ports";
import {
  GatewayRegistry,
  PAYMENT_GATEWAYS,
  supportsCurrency,
} from "../domain/gateway-registry";
import { PricingService, type Quote } from "../domain/pricing.service";
import {
  encodeClassRef,
  encodeMembershipRef,
  encodePrivateRef,
  encodeSeriesPassRef,
  encodeTicketOrderRef,
} from "../domain/order-ref";
import {
  membershipBase,
  membershipEndsAt,
  RECURRING_PLAN_TYPES,
} from "../domain/membership-vigency";
import { isRedeemable } from "../../discounts/domain/discounts.service";
import { ParamsService } from "../../params/params.service";
import { PaymentSettlementService } from "./payment-settlement.service";
import {
  presaleCutoffDate,
  resolvePresaleCutoffMinutes,
} from "../../common/presale-cutoff";
import {
  classStart,
  effectiveCapacity,
} from "../../academies/domain/academy.service";
import {
  managedFeeBreakdown,
  ownMethodBreakdown,
  resolvePlatformFeeRate,
  academyFeeBreakdown,
  type FeeBreakdown,
} from "../../common/fee-breakdown";
import { GatewayAccountsService } from "./gateway-accounts.service";
import { AcademySalesService } from "./academy-sales.service";
import { AcademyPromosService } from "./academy-promos.service";
import { emitPaymentEvent } from "../domain/payment-ledger";
import { FeatureFlagsService } from "../../features/feature-flags.service";
import {
  isPassActive,
  redeemPassCredits,
  SocialPassConflictError,
} from "./social-pass.service";
import type { Prisma } from "@prisma/client";

// Una orden PENDING solo reserva cupo mientras el pago puede completarse;
// pasado el TTL se considera abandonada y deja de contar contra el cap.
const PENDING_ORDER_TTL_MS = 30 * 60 * 1000;

// Órdenes de academia (MEMBERSHIP/WORKSHOP/PRIVATE): modelo SaaS - sin
// comisión de plataforma; el costo de pasarela se liquida al actor como
// passthrough en el payout ACADEMY (spec producer-fee-model).

export class EventNotFoundError extends Error {
  constructor() {
    super("evento no encontrado");
    this.name = "EventNotFoundError";
  }
}

export class PresaleUnavailableError extends Error {
  constructor() {
    super("evento sin preventa disponible");
    this.name = "PresaleUnavailableError";
  }
}

export class PresaleSoldOutError extends Error {
  constructor() {
    super("preventa agotada");
    this.name = "PresaleSoldOutError";
  }
}

export class DoorSoldOutError extends Error {
  constructor() {
    super("entradas de puerta agotadas");
    this.name = "DoorSoldOutError";
  }
}

export class EventEndedError extends Error {
  constructor() {
    super("El evento ya terminó");
  }
}

export class PresaleClosedError extends Error {
  constructor() {
    super("La preventa cerró a las 19:00 - el resto se paga en puerta");
    this.name = "PresaleClosedError";
  }
}

type InvalidDiscountReason =
  | "EXPIRED"
  | "EXHAUSTED"
  | "SCOPE_MISMATCH"
  | "UNKNOWN"
  | "DISABLED"
  | "PRESALE_ONLY"
  | "SINGLE_TICKET";

export class InvalidDiscountError extends Error {
  constructor(reason: InvalidDiscountReason) {
    super(
      reason === "EXPIRED"
        ? "código expirado"
        : reason === "EXHAUSTED"
          ? "código agotado"
          : reason === "SCOPE_MISMATCH"
            ? "código no aplica a este evento"
            : reason === "DISABLED"
              ? "código desactivado"
              : reason === "PRESALE_ONLY"
                ? "este código solo es válido en preventa"
                : reason === "SINGLE_TICKET"
                  ? "este código cubre una sola entrada"
                  : "código inválido",
    );
    this.name = "InvalidDiscountError";
  }
}

export class SeriesNotFoundError extends Error {
  constructor() {
    super("serie no encontrada");
    this.name = "SeriesNotFoundError";
  }
}

export class SeriesInactiveError extends Error {
  constructor() {
    super("la serie no está activa");
    this.name = "SeriesInactiveError";
  }
}

export class SeriesPassAlreadyOwnedError extends Error {
  constructor() {
    super("ya tienes el pase de este mes");
    this.name = "SeriesPassAlreadyOwnedError";
  }
}

export class PlanNotFoundError extends Error {
  constructor() {
    super("plan no encontrado");
    this.name = "PlanNotFoundError";
  }
}

/**
 * La academia está bloqueada por suscripción impaga (spec
 * academy-saas-billing, S3): ningún pago nuevo hacia ella - membresía,
 * clase suelta, particular ni suscripción recurrente. El controller lo
 * traduce a 400 `{error:"academy.unavailable"}` con copy honesto (la
 * falta es del owner, no del alumno).
 */
export class AcademyUnavailableError extends Error {
  readonly code = "academy.unavailable";
  constructor() {
    super("la academia no está disponible por el momento");
    this.name = "AcademyUnavailableError";
  }
}

export class ClassNotFoundError extends Error {
  constructor() {
    super("clase no encontrada");
    this.name = "ClassNotFoundError";
  }
}

/** La clase no se vende suelta: cancelada, ya iniciada o sin dropInPrice. */
export class ClassNotPurchasableError extends Error {
  constructor() {
    super("clase no disponible para compra");
    this.name = "ClassNotPurchasableError";
  }
}

export class ClassSoldOutError extends Error {
  constructor() {
    super("cupo agotado para esta clase");
    this.name = "ClassSoldOutError";
  }
}

export class ClassAlreadyBookedError extends Error {
  constructor() {
    super("ya tienes una reserva en esta clase");
    this.name = "ClassAlreadyBookedError";
  }
}

export class AcademyNotFoundError extends Error {
  constructor() {
    super("academia no encontrada");
    this.name = "AcademyNotFoundError";
  }
}

/** La academia no vende particulares: inactiva o sin privateLessonPrice. */
export class PrivateClassNotPurchasableError extends Error {
  constructor() {
    super("la academia no vende clases particulares");
    this.name = "PrivateClassNotPurchasableError";
  }
}

export class PlanNotPurchasableError extends Error {
  constructor(message = "este plan no está disponible para compra online") {
    super(message);
    this.name = "PlanNotPurchasableError";
  }
}

/**
 * Un destinatario de regalo no pasó la validación: no está registrado, no
 * es amigo ACCEPTED del comprador, es el propio comprador, o ya tiene una
 * entrada ACTIVE para el evento. El mensaje nombra a la persona para que
 * el cliente lo muestre tal cual.
 */
export class RecipientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipientError";
  }
}

/** La reserva de mesa pedida supera el tope por mesa del evento. */
export class TablePartyTooLargeError extends Error {
  constructor(max: number) {
    super(`máximo ${max} personas por mesa`);
    this.name = "TablePartyTooLargeError";
  }
}

/** No queda cupo sentable en mesas para el grupo pedido. */
/** methodId no pertenece al productor de la venta o está inactivo. */
export class OwnMethodUnavailableError extends Error {
  constructor(message = "método propio no disponible") {
    super(message);
    this.name = "OwnMethodUnavailableError";
  }
}

export class TableSoldOutError extends Error {
  constructor() {
    super("sin cupo en mesas para esa cantidad de personas");
    this.name = "TableSoldOutError";
  }
}

interface PurchaseTicketInput {
  eventId: string;
  discountCode?: string;
  songSuggestion?: string;
  /** personIds de amigos a quienes se les regala entrada (máx. 9). */
  recipientIds?: string[];
  /** Entradas de la orden (1–10; default 1). Sobrantes = reclamables. */
  quantity?: number;
  /** Personas para reserva de mesa (solo si el evento tiene tablesTotal). */
  tablePartySize?: number;
  /**
   * Método propio del productor (spec producer-own-methods): si viene,
   * la orden queda MANUAL PENDING esperando el comprobante - no toca
   * la pasarela ni cuenta propia.
   */
  methodId?: string;
  /**
   * Atribución de preventa por academia (spec academy-presale-commission):
   * llega del link `?a=` persistido por el front. Solo aplica con acuerdo
   * ACTIVE y channel=PRESALE; sin acuerdo se ignora en silencio.
   */
  academyId?: string;
  /**
   * Pase Social (spec pase-social): true = pagar con créditos del pase
   * (1 crédito por entrada, orden $0). Solo válido sin regalos ni método
   * propio y con pass ACTIVE + saldo suficiente - si no, 409.
   */
  payWithCredit?: boolean;
}

interface PurchaseSeriesPassInput {
  seriesId: string;
  /** Mes de vigencia "YYYY-MM" - validado por el DTO del controller. */
  month: string;
  /** Método propio del productor (spec producer-own-methods). */
  methodId?: string;
}

interface PurchaseMembershipInput {
  planId: string;
}

interface PurchaseClassInput {
  classId: string;
}

interface PurchasePrivateClassInput {
  academyId: string;
}

export interface PurchaseTicketResult {
  /**
   * null cuando la orden no va a la pasarela: método propio (espera
   * comprobante) u orden $0 ya liquidada (paid=true).
   */
  paymentUrl: string | null;
  paymentId: string;
  quote: Quote;
  /**
   * true cuando la orden $0 ya quedó PAID en el server (preventa
   * liberada o descuento 100%) - el cliente cae directo a la
   * pantalla de éxito, sin redirect ni polling.
   */
  paid?: boolean;
  /** Tickets de la orden (1 comprador + N regalos); 1 en series pass. */
  quantity: number;
  /**
   * Pase Social aplicado (spec pase-social): `benefit` marca que el
   * comprador pagó preventa aunque la preventa ya cerró (línea visible
   * del desglose); `creditsUsed` = entradas pagadas con crédito.
   */
  socialPass?: {
    benefit?: { presalePriceApplied: boolean; doorFeeWaived: boolean };
    creditsUsed?: number;
  };
  /** Snapshot del método propio elegido - instrucciones al comprador. */
  method?: {
    type: string;
    label: string;
    details: unknown;
  };
}

/**
 * Preview de código de descuento (GET /checkout/discount-quote): valida
 * existencia/vigencia/cupo/scope y estima el descuento de la ORDEN sobre
 * el precio del canal vigente - sin side-effects (no crea Payment ni
 * consume uso del código). `reason` replica el vocabulario de
 * InvalidDiscountError para logging/telemetría del cliente.
 */
export interface DiscountQuoteResult {
  valid: boolean;
  discountClp: number;
  reason?: InvalidDiscountReason;
}

/**
 * Caso de uso del checkout de preventa: valida evento/cap/descuento, crea
 * la orden PENDING (con contexto desnormalizado en Payment), registra la
 * sugerencia de canción y delega el cobro a la pasarela configurada.
 * Lanza errores de dominio - el controller los mapea a HTTP.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly pricing: PricingService,
    private readonly params: ParamsService,
    private readonly settlement: PaymentSettlementService,
    @Inject(PAYMENT_GATEWAYS)
    private readonly gateways: GatewayRegistry,
    private readonly accounts: GatewayAccountsService,
    private readonly academySales: AcademySalesService,
    private readonly features: FeatureFlagsService,
    private readonly academyPromos: AcademyPromosService,
  ) {}

  /**
   * Provider que procesa la orden (spec gateway-port-normalization):
   * param `payments.default_gateway` resuelto contra el registry; si el
   * provider pedido no está registrado (sin credenciales) cae al
   * default del env - `this.gateway` es ese mismo default.
   * `currency` = moneda de la orden (Payment.currency): habilita el
   * routing por moneda del registry (spec stripe-gateway-payout-rail).
   */
  private async resolveGateway(currency?: string): Promise<PaymentGateway> {
    const name = await this.params.get("payments.default_gateway");
    return this.gateways.resolve(
      typeof name === "string" ? name : null,
      currency,
    );
  }

  /**
   * ¿Hay motor de suscripciones para la moneda del plan? (spec
   * multipais-currency) - misma regla que
   * `SubscriptionsService.subscriptionGateway`: CLP por el param
   * `payments.subscription_gateway`, otra moneda por el primer
   * adaptador con `createSubscription` que la soporte. La quote de
   * membresía la expone para que el checkout solo ofrezca el modo
   * suscripción cuando el cobro real puede darse.
   */
  private async subscriptionCapable(currency: string): Promise<boolean> {
    const cur = currency.toUpperCase();
    if (cur === "CLP") {
      const name = await this.params.get("payments.subscription_gateway");
      const gw = this.gateways.resolve(
        typeof name === "string" ? name : null,
      );
      return (
        typeof (gw as Partial<SubscriptionProvider>).createSubscription ===
        "function"
      );
    }
    for (const name of this.gateways.names()) {
      const gw = this.gateways.get(name);
      if (
        gw &&
        typeof (gw as Partial<SubscriptionProvider>).createSubscription ===
          "function" &&
        supportsCurrency(gw, cur)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Pasarela propia del productor (spec producer-gateway-accounts): si
   * tiene cuenta ACTIVE la orden se cobra en SU Flow/MP →
   * `gatewayAccountId` + feeMode OWN_GATEWAY (comisión devengada,
   * neteada en su payout). Sin cuenta → default de la plataforma.
   * La cuenta propia gana siempre primero - el routing por moneda solo
   * aplica al camino MANAGED.
   */
  private async orderGateway(
    producerId: string | null | undefined,
    currency?: string,
  ): Promise<{ gateway: PaymentGateway; gatewayAccountId: string | null }> {
    if (producerId) {
      const own = await this.accounts.activeForProducer(producerId);
      if (own) return { gateway: own.gateway, gatewayAccountId: own.account.id };
    }
    return { gateway: await this.resolveGateway(currency), gatewayAccountId: null };
  }

  /**
   * Método propio del productor (spec producer-own-methods): el
   * comprador elige pagar por transferencia/link/efectivo del
   * productor → la orden queda MANUAL PENDING esperando comprobante.
   * Solo métodos `active` del dueño del evento/serie; eventos sin
   * productor no admiten el modo.
   */
  private async ownMethodFor(
    producerId: string | null | undefined,
    methodId: string,
  ) {
    if (!producerId) {
      throw new OwnMethodUnavailableError(
        "esta venta no admite pago por métodos propios",
      );
    }
    const method = await this.prisma.producerPaymentMethod.findFirst({
      where: { id: methodId, producerId, active: true },
    });
    if (!method) {
      throw new OwnMethodUnavailableError();
    }
    return method;
  }

  /**
   * Crea la orden y congela la descomposición del fee en la misma tx +
   * emite FEE_ASSESSED al ledger hash-chain (spec producer-fee-model):
   * la tasa aplicada queda evidenciada y nunca se recalcula después.
   */
  private async createAssessedPayment(
    data: Prisma.PaymentUncheckedCreateInput,
    breakdown: FeeBreakdown,
    extraMeta?: Record<string, unknown>,
    /**
     * Hook transaccional post-create (spec pase-social): el REDEEM de
     * créditos corre acá para que orden + ledger + decremento sean un
     * solo commit - si lanza, la tx revierte y el pago no existe.
     */
    onCreated?: (
      tx: Prisma.TransactionClient,
      payment: { id: string },
    ) => Promise<void>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          ...data,
          feeMode: breakdown.feeMode,
          platformFeeRate: breakdown.platformFeeRate,
          platformFeeNetClp: breakdown.platformFeeNetClp,
          platformFeeVatClp: breakdown.platformFeeVatClp,
          gatewayFeeExpected: breakdown.gatewayFeeExpected,
          producerNetClp: breakdown.producerNetClp,
        },
      });
      if (onCreated) await onCreated(tx, payment);
      await emitPaymentEvent(tx, payment.id, "FEE_ASSESSED", "checkout", {
        feeMode: breakdown.feeMode,
        platformFeeRate: breakdown.platformFeeRate,
        platformFeeNetClp: breakdown.platformFeeNetClp,
        platformFeeVatClp: breakdown.platformFeeVatClp,
        gatewayFeeExpected: breakdown.gatewayFeeExpected,
        producerNetClp: breakdown.producerNetClp,
        ...extraMeta,
      });
      return payment;
    });
  }

  /** Desglose ACADEMY con la pasarela esperada por gateway_fee.card_pct. */
  private async academyBreakdown(amount: number): Promise<FeeBreakdown> {
    const cardPct = await this.params.getNumber("gateway_fee.card_pct", 3.19);
    return academyFeeBreakdown(amount, cardPct);
  }

  /** Tasa todo incluido + costos esperados para órdenes del productor. */
  private async producerFeeContext(
    eventOrNull: { platformFeePct?: number | null } | null,
    producerParams: {
      platformFeePct?: number | null;
      proTier?: string | null;
    } | null,
  ) {
    const [globalPct, cardPct, ivaPct, stdFee, proFee] = await Promise.all([
      this.params.getNumber("fees.managed_allin_pct", 9.14),
      this.params.getNumber("gateway_fee.card_pct", 3.19),
      this.params.getNumber("tax.iva_pct", 19),
      this.params.getNumber("fees.standard_fee_pct", 3.5),
      this.params.getNumber("fees.pro_fee_pct", 2.5),
    ]);
    // Fee por plan (comisión-bundled): el tier Pro vigente baja el fee
    // base; la cadena sigue evento → override manual → tier → global.
    const allin = (fee: number) => fee * (1 + ivaPct / 100) + cardPct;
    const tierPct =
      producerParams?.proTier === "PRO_GROWTH"
        ? allin(stdFee)
        : producerParams?.proTier === "PRO_BIG"
          ? allin(proFee)
          : null;
    const allInPct = resolvePlatformFeeRate(
      eventOrNull ?? {},
      producerParams,
      tierPct ?? globalPct,
    );
    return { allInPct, cardPct, ivaPct };
  }

  async purchaseTicket(
    personId: string,
    input: PurchaseTicketInput,
  ): Promise<PurchaseTicketResult> {
    const event = await this.prisma.event.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        presaleCap: true,
        doorPrice: true,
        doorCap: true,
        seriesId: true,
        platformFeePct: true,
        producerId: true,
        presaleCutoffMinutes: true,
        tablesTotal: true,
        tableSeatMax: true,
        tableSeatsTotal: true,
        currency: true,
      },
    });
    if (!event) throw new EventNotFoundError();

    // Reserva de mesa: solo si el evento ofrece, no supera el tope por
    // mesa (default 12 sin configuración) y queda cupo sentable - el
    // inventario real es en personas (tableSeatsTotal), no en mesas.
    if (input.tablePartySize != null && event.tablesTotal != null) {
      const seatMax = event.tableSeatMax ?? 12;
      if (input.tablePartySize > seatMax) {
        throw new TablePartyTooLargeError(seatMax);
      }
      if (event.tableSeatsTotal != null) {
        const agg = await this.prisma.tableReservation.aggregate({
          where: {
            eventId: event.id,
            status: { in: ["REQUESTED", "CONFIRMED"] },
          },
          _sum: { partySize: true },
        });
        const seatsLeft =
          event.tableSeatsTotal - (agg._sum.partySize ?? 0);
        if (input.tablePartySize > seatsLeft) {
          throw new TableSoldOutError();
        }
      }
    }

    // Canal de venta: preventa hasta el corte resuelto en cadena
    // (event-presale-cutoff: evento → productor → presale.cutoff_hour),
    // después y durante LIVE la app vende a precio de puerta. Ambos
    // canales cobran al comprador solo la lista - la comisión "todo
    // incluido" la paga el productor (producer-fee-model).
    const now = new Date();
    // Un evento que ya terminó no vende por ningún canal - un evento que
    // quedó LIVE pasado su endsAt tampoco (el staff pudo no cerrarlo).
    if (now >= event.endsAt) throw new EventEndedError();
    // producerParams se lee una vez: gobierna el corte y los fees (cache
    // 30s en ParamsService - el segundo uso no pega a la DB).
    const producerParams = await this.params.getProducerParams(
      event.producerId,
    );
    const cutoffHour = await this.params.getNumber("presale.cutoff_hour", 19);
    const cutoff = presaleCutoffDate(
      event.startsAt,
      resolvePresaleCutoffMinutes(event, producerParams, cutoffHour),
    );
    const presaleOpen =
      event.status === "PUBLISHED" &&
      event.presalePrice != null &&
      now < cutoff;
    const doorOpen =
      event.doorPrice != null &&
      (event.status === "LIVE" ||
        (event.status === "PUBLISHED" && now >= cutoff));
    if (!presaleOpen && !doorOpen) {
      // Preventa que existió y cerró sin puerta app → mensaje específico.
      if (
        event.status === "PUBLISHED" &&
        event.presalePrice != null &&
        now >= cutoff
      ) {
        throw new PresaleClosedError();
      }
      throw new PresaleUnavailableError();
    }
    const channel = presaleOpen ? "PRESALE" : "DOOR";

    // Pase Social (spec pase-social): flag ON + pass del comprador
    // ACTIVE/CANCEL_PENDING (cancel_at_period_end conserva el acceso).
    // Una sola lectura por compra; con el flag OFF ni la query corre.
    const socialPass = (await this.features.isEnabled("social_pass"))
      ? await this.prisma.socialPass.findUnique({ where: { personId } })
      : null;
    const passActive = isPassActive(socialPass);
    // Beneficio de precio: el suscriptor paga preventa aunque la
    // preventa haya cerrado (canal DOOR). La exención del cargo de
    // puerta app es vacuosa hoy - el modelo todo incluido ya no cobra
    // fee al comprador (unitServiceFee=0); se marca igual para el
    // desglose/auditoría según la spec.
    // Beneficio solo para la entrada del comprador (spec pase-social):
    // con quantity>1 las sobrantes quedan claimables (transferibles)
    // y con recipientIds son regalo a terceros - en ambos casos el
    // precio beneficio no aplica a nada de la orden (el pricing es por
    // unidad, mezclar por unidad queda para iteración).
    const soloBuyer =
      (input.quantity ?? 1) === 1 && !(input.recipientIds?.length);
    const socialPassBenefit =
      passActive && soloBuyer && channel === "DOOR" && event.presalePrice != null
        ? {
            presalePriceApplied: true,
            doorFeeWaived: true,
          }
        : undefined;
    const payWithCredit = input.payWithCredit === true;
    // v1: el crédito cubre TODAS las entradas de la orden o ninguna y
    // es solo del comprador - se rechaza ANTES de validar la amistad
    // de cada regalo para que el error diga el motivo real.
    if (payWithCredit && !soloBuyer) {
      throw new SocialPassConflictError(
        "el crédito del Pase Social solo cubre tu propia entrada - compra de a una y sin regalos",
      );
    }
    if (payWithCredit && input.methodId) {
      throw new SocialPassConflictError(
        "el crédito del Pase Social no se combina con métodos propios",
      );
    }

    // Destinatarios de regalo: deben existir, ser amigos ACCEPTED del
    // comprador y no tener ya una entrada ACTIVE para el evento.
    const recipientIds = [
      ...new Set(input.recipientIds ?? []).values(),
    ].filter((id) => id !== personId);
    const recipients = recipientIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: recipientIds } },
          select: { id: true, name: true },
        })
      : [];
    if (recipientIds.length) {
      const byId = new Map(recipients.map((r) => [r.id, r]));
      const missing = recipientIds.find((id) => !byId.has(id));
      if (missing) {
        throw new RecipientError(
          "Una de las personas no está registrada en Omnidance",
        );
      }
      const [friendships, taken] = await Promise.all([
        this.prisma.friendship.findMany({
          where: {
            status: "ACCEPTED",
            OR: [
              { aId: personId, bId: { in: recipientIds } },
              { bId: personId, aId: { in: recipientIds } },
            ],
          },
          select: { aId: true, bId: true },
        }),
        this.prisma.ticket.findMany({
          where: {
            eventId: event.id,
            ownerId: { in: recipientIds },
            status: "ACTIVE",
          },
          select: { ownerId: true },
        }),
      ]);
      const friendIds = new Set(
        friendships.map((f) => (f.aId === personId ? f.bId : f.aId)),
      );
      const takenIds = new Set(taken.map((t) => t.ownerId));
      for (const id of recipientIds) {
        const name = byId.get(id)?.name ?? "Esa persona";
        if (!friendIds.has(id)) {
          throw new RecipientError(
            `${name} no es tu amigo en Omnidance - agrégalo primero`,
          );
        }
        if (takenIds.has(id)) {
          throw new RecipientError(
            `${name} ya tiene una entrada para este evento`,
          );
        }
      }
    }
    // Sin quantity explícita el default es 1 + asignados (compat: un
    // cliente que solo manda recipientIds pide exactamente esas). Con
    // quantity, los amigos no pueden superar los cupos disponibles.
    // El DTO valida 1–10; el clamp defensivo cubre llamadas directas.
    const quantity =
      input.quantity == null
        ? 1 + recipientIds.length
        : Math.min(10, Math.max(1, Math.floor(input.quantity)));
    if (recipientIds.length > quantity - 1) {
      throw new RecipientError(
        "Elegiste más amigos que entradas disponibles - sube la cantidad o desmarca a alguien",
      );
    }

    // Redención de créditos del pase (spec pase-social): sin pass
    // activo o sin saldo para TODAS las entradas → 409 sin mutar nada
    // (el decremento condicional en la tx re-verifica contra carreras).
    if (payWithCredit) {
      if (!passActive || !socialPass) {
        throw new SocialPassConflictError(
          "no tienes un Pase Social activo",
        );
      }
      if (socialPass.creditsBalance < quantity) {
        throw new SocialPassConflictError(
          "no te quedan suficientes créditos del Pase Social",
        );
      }
    }

    if (channel === "PRESALE" && event.presaleCap != null) {
      // tickets emitidos + órdenes PENDING recientes cuentan contra el cap
      // (quantity, no la orden - una orden multi-entrada reserva N cupos)
      const [sold, inFlightAgg] = await Promise.all([
        this.prisma.ticket.count({
          where: { eventId: event.id, status: { not: "CANCELLED" } },
        }),
        this.prisma.payment.aggregate({
          _sum: { quantity: true },
          where: {
            orderType: "TICKET",
            status: "PENDING",
            eventId: event.id,
            createdAt: { gt: new Date(Date.now() - PENDING_ORDER_TTL_MS) },
          },
        }),
      ]);
      const inFlight = inFlightAgg._sum.quantity ?? 0;
      if (sold + inFlight + quantity > event.presaleCap) {
        throw new PresaleSoldOutError();
      }
    }
    if (channel === "DOOR" && event.doorCap != null) {
      // Ventas de puerta = registros staff (checkins MANUAL, spec
      // countDoorSales) + órdenes DOOR ya pagadas + PENDING recientes.
      const [manualSold, doorPaidAgg, inFlightAgg] = await Promise.all([
        this.prisma.checkin.count({
          where: { eventId: event.id, method: "MANUAL", voidedAt: null },
        }),
        this.prisma.payment.aggregate({
          _sum: { quantity: true },
          where: {
            orderType: "TICKET",
            status: "PAID",
            eventId: event.id,
            channel: "DOOR",
          },
        }),
        this.prisma.payment.aggregate({
          _sum: { quantity: true },
          where: {
            orderType: "TICKET",
            status: "PENDING",
            eventId: event.id,
            channel: "DOOR",
            createdAt: { gt: new Date(Date.now() - PENDING_ORDER_TTL_MS) },
          },
        }),
      ]);
      const doorSold =
        manualSold +
        (doorPaidAgg._sum.quantity ?? 0) +
        (inFlightAgg._sum.quantity ?? 0);
      if (doorSold + quantity > event.doorCap) {
        throw new DoorSoldOutError();
      }
    }

    let code: {
      id: string;
      type: string;
      eventId: string | null;
      seriesId: string | null;
      percentOff: number | null;
      amountOff: number | null;
      maxUses: number | null;
      usedCount: number;
      expiresAt: Date | null;
      academySaleAgreementId: string | null;
    } | null = null;
    let academyCodeAgreement: {
      academyId: string;
      commissionPct: number;
    } | null = null;
    if (input.discountCode) {
      code = await this.prisma.discountCode.findUnique({
        where: { code: input.discountCode },
      });
      if (!code) throw new InvalidDiscountError("UNKNOWN");
      // regla pura del dominio (misma semántica que discounts.service)
      const check = isRedeemable(code, {
        now: new Date(),
        eventId: event.id,
        seriesId: event.seriesId ?? undefined,
      });
      if (!check.ok) throw new InvalidDiscountError(check.reason);
      // Canal código de academia (spec academy-presale-codes): la
      // academia cobró la entrada en efectivo y el código la deja en
      // $0 - solo en preventa, una entrada por código, y solo mientras
      // el acuerdo siga ACTIVE.
      if (code.type === "ACADEMY_PRESALE") {
        if (channel !== "PRESALE") {
          throw new InvalidDiscountError("PRESALE_ONLY");
        }
        if (quantity !== 1) {
          throw new InvalidDiscountError("SINGLE_TICKET");
        }
        const agreement = await this.academySales.codeAgreement(code);
        if (!agreement || agreement.status !== "ACTIVE") {
          throw new InvalidDiscountError("DISABLED");
        }
        academyCodeAgreement = agreement;
      }
    }

    // Comisión "todo incluido" al productor (producer-fee-model): tasa en
    // cadena evento → productor → fees.managed_allin_pct, congelada en el
    // Payment junto con el desglose (pasarela al costo + neto + IVA). El
    // comprador paga solo lista × cantidad − descuento de la orden.
    const { allInPct, cardPct, ivaPct } = await this.producerFeeContext(
      event,
      producerParams,
    );
    // quote por entrada; el descuento se aplica una vez por orden (no por
    // ticket) para no multiplicar el beneficio del código.
    const unit = this.pricing.quote({
      listPrice:
        channel === "PRESALE"
          ? event.presalePrice!
          : passActive && soloBuyer && event.presalePrice != null
            ? event.presalePrice!
            : event.doorPrice!,
      discount: code,
    });
    const orderTotal = unit.listPrice * quantity - unit.discount;
    // Con crédito del pase la orden queda en $0 (gateway FREE) pero el
    // quote conserva la lista para el desglose; `charged` es lo que se
    // persiste como amount/net del Payment.
    const charged = payWithCredit ? 0 : orderTotal;
    const quote: Quote = { ...unit, total: orderTotal };
    // Modo de cobro de la orden (specs producer-gateway-accounts /
    // producer-own-methods): método propio → MANUAL PENDING esperando
    // comprobante (OWN_METHOD); cuenta propia → su adaptador
    // (OWN_GATEWAY); resto → plataforma (MANAGED). Orden $0 → FREE.
    const ownMethod = input.methodId
      ? await this.ownMethodFor(event.producerId, input.methodId)
      : null;
    // Moneda de la orden: la declarada por el evento (multipaís) - es la
    // que queda en Payment.currency y la que rutea el gateway (CLP si el
    // evento no la trae, p.ej. selects legacy).
    const orderCurrency = event.currency ?? "CLP";
    const { gateway, gatewayAccountId } = ownMethod
      ? { gateway: null, gatewayAccountId: null }
      : await this.orderGateway(event.producerId, orderCurrency);
    const breakdown =
      charged > 0 && (gatewayAccountId || ownMethod)
        ? ownMethodBreakdown(
            charged,
            allInPct,
            cardPct,
            ivaPct,
            gatewayAccountId ? "OWN_GATEWAY" : "OWN_METHOD",
          )
        : managedFeeBreakdown(charged, allInPct, cardPct, ivaPct);

    // Atribución de preventa por academia: canal código (el vínculo
    // DiscountCode→acuerdo manda y ya viene validado) o canal link
    // (?a= + acuerdo ACTIVE - spec academy-presale-commission). Sin
    // acuerdo o cupo agotado → null: la compra procede idéntica.
    const attribution = academyCodeAgreement
      ? {
          soldByAcademyId: academyCodeAgreement.academyId,
          academyCommissionClp: Math.round(
            (unit.listPrice * academyCodeAgreement.commissionPct) / 100,
          ),
        }
      : await this.academySales.resolveAttribution({
          eventId: event.id,
          seriesId: event.seriesId,
          academyId: input.academyId,
          unitListPrice: unit.listPrice,
          quantity,
          channel,
        });

    // refId correlaciona con la pasarela y el webhook; eventId/discountCodeId
    // también quedan desnormalizados en Payment para reporting. quantity +
    // recipients le dicen al webhook cuántos tickets emitir y a quién.
    const refId = encodeTicketOrderRef(event.id, code?.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    const payment = await this.createAssessedPayment(
      {
        orderType: "TICKET",
        refId,
        personId,
        eventId: event.id,
        discountCodeId: code?.id ?? null,
        amount: charged,
        currency: orderCurrency,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: charged,
        quantity,
        recipients: recipientIds.length ? recipientIds : undefined,
        // Intención de mesa: solo si el evento ofrece mesas - el webhook
        // la materializa al PAID (pago fallido/abandonado no reserva).
        tablePartySize:
          event.tablesTotal != null && input.tablePartySize
            ? input.tablePartySize
            : null,
        channel,
        unitListPrice: unit.listPrice,
        unitServiceFee: 0, // ya no existe fee al comprador
        // La orden $0 nunca toca la pasarela: "FREE" la distingue en el
        // libro; "MANUAL" = método propio esperando comprobante - su
        // label queda congelado como medio declarado (methodLabel).
        gateway:
          charged === 0 ? "FREE" : ownMethod ? "MANUAL" : gateway!.name,
        gatewayAccountId:
          charged === 0 || ownMethod ? null : gatewayAccountId,
        methodLabel: ownMethod?.label ?? null,
        soldByAcademyId: attribution?.soldByAcademyId ?? null,
        academyCommissionClp: attribution?.academyCommissionClp ?? null,
      },
      breakdown,
      // La comisión atribuida queda evidenciada en el ledger cuando existe;
      // el beneficio del pase también (spec pase-social: línea auditable).
      {
        ...(attribution
          ? {
              soldByAcademyId: attribution.soldByAcademyId,
              academyCommissionClp: attribution.academyCommissionClp,
            }
          : {}),
        ...(socialPassBenefit ? { socialPassBenefit } : {}),
        ...(payWithCredit ? { socialPassCreditsUsed: quantity } : {}),
      },
      // REDEEM de créditos en la MISMA tx que crea la orden (spec
      // pase-social: redención atómica - si el saldo se agotó entremedio
      // la tx revierte y no existe ni la orden ni el débito).
      payWithCredit && socialPass
        ? (tx, payment) =>
            redeemPassCredits(tx, socialPass, quantity, payment.id)
        : undefined,
    );

    // SongSuggestion: se crea ya (ligada a personId+eventId) porque el
    // webhook no recibe el texto - el top-N filtra por ticket pagado, así
    // una sugerencia de pago FAILED/abandonado nunca se expone. Una activa
    // por persona/evento: la última checkout reemplaza la anterior.
    const suggestion = input.songSuggestion?.trim().replace(/\s+/g, " ");
    if (suggestion) {
      await this.prisma.songSuggestion.deleteMany({
        where: { eventId: event.id, personId },
      });
      await this.prisma.songSuggestion.create({
        data: { eventId: event.id, personId, title: suggestion },
      });
    }

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const returnUrl = `${webUrl}/checkout/return?paymentId=${payment.id}`;

    // Orden con total $0 (preventa liberada, descuento que la dejó en
    // cero o crédito del Pase Social): no hay cobro que derivar a la
    // pasarela - se liquida al instante por el mismo settle del webhook
    // (tickets, mesa, redención del código, ledger, notificación) y el
    // cliente cae directo en la pantalla de éxito (paid=true).
    if (charged === 0) {
      await this.settlement.settle(payment, "PAID", { actor: "checkout" });
      return {
        paymentUrl: null,
        paymentId: payment.id,
        quote,
        quantity,
        paid: true,
        socialPass: socialPassBenefit || payWithCredit
          ? {
              benefit: socialPassBenefit,
              creditsUsed: payWithCredit ? quantity : undefined,
            }
          : undefined,
      };
    }

    // Método propio: sin cobro en pasarela - la orden espera el
    // comprobante del comprador y el productor la valida.
    if (ownMethod) {
      return {
        paymentUrl: null,
        paymentId: payment.id,
        quote,
        quantity,
        method: {
          type: ownMethod.type,
          label: ownMethod.label,
          details: ownMethod.details,
        },
      };
    }

    const order = await gateway!.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl,
      currency: payment.currency,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayRef: order.gatewayRef },
    });

    return {
      paymentUrl: order.paymentUrl,
      paymentId: payment.id,
      quote,
      quantity,
      socialPass: socialPassBenefit
        ? { benefit: socialPassBenefit }
        : undefined,
    };
  }

  /**
   * Cotización de un código de descuento para el checkout de tickets:
   * responde si el código es redimible en este evento y el descuento
   * estimado de la orden sobre el precio del canal vigente (misma
   * resolución preventa/puerta que purchaseTicket). Sin side-effects -
   * el cliente lo usa para mostrar el total con descuento ANTES de
   * generar la orden. Un evento que ya no vende (terminado o sin canal
   * abierto) devuelve discountClp 0: el POST manda su propio error.
   */
  async discountQuote(input: {
    eventId: string;
    code: string;
  }): Promise<DiscountQuoteResult> {
    const event = await this.prisma.event.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        doorPrice: true,
        seriesId: true,
        producerId: true,
        presaleCutoffMinutes: true,
      },
    });
    if (!event) throw new EventNotFoundError();

    const code = await this.prisma.discountCode.findUnique({
      where: { code: input.code.trim() },
      select: {
        type: true,
        percentOff: true,
        amountOff: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        eventId: true,
        seriesId: true,
        academySaleAgreementId: true,
      },
    });
    if (!code) return { valid: false, discountClp: 0, reason: "UNKNOWN" };
    const check = isRedeemable(code, {
      now: new Date(),
      eventId: event.id,
      seriesId: event.seriesId ?? undefined,
    });
    if (!check.ok) {
      return { valid: false, discountClp: 0, reason: check.reason };
    }
    // Código de academia: el acuerdo debe seguir ACTIVE (misma regla
    // que el POST - el preview no promete un código muerto).
    if (code.type === "ACADEMY_PRESALE") {
      const agreement = await this.academySales.codeAgreement(code);
      if (!agreement || agreement.status !== "ACTIVE") {
        return { valid: false, discountClp: 0, reason: "DISABLED" };
      }
    }

    // Misma regla de canal que purchaseTicket: preventa hasta el corte
    // resuelto en cadena (evento → productor → global), puerta app en
    // LIVE o post-corte; evento terminado no cotiza.
    const now = new Date();
    let listPrice: number | null = null;
    let channel: "PRESALE" | "DOOR" | null = null;
    if (now < event.endsAt) {
      const producerParams = await this.params.getProducerParams(
        event.producerId,
      );
      const cutoffHour = await this.params.getNumber("presale.cutoff_hour", 19);
      const cutoff = presaleCutoffDate(
        event.startsAt,
        resolvePresaleCutoffMinutes(event, producerParams, cutoffHour),
      );
      if (
        event.status === "PUBLISHED" &&
        event.presalePrice != null &&
        now < cutoff
      ) {
        listPrice = event.presalePrice;
        channel = "PRESALE";
      } else if (
        event.doorPrice != null &&
        (event.status === "LIVE" ||
          (event.status === "PUBLISHED" && now >= cutoff))
      ) {
        listPrice = event.doorPrice;
        channel = "DOOR";
      }
    }
    if (listPrice == null) return { valid: true, discountClp: 0 };
    if (code.type === "ACADEMY_PRESALE" && channel !== "PRESALE") {
      return { valid: false, discountClp: 0, reason: "PRESALE_ONLY" };
    }

    // El descuento se aplica una vez por orden (= unit.discount del
    // pricing, no por ticket) - igual que el total de purchaseTicket.
    const unit = this.pricing.quote({ listPrice, discount: code });
    return { valid: true, discountClp: unit.discount };
  }

  /**
   * Checkout del pase mensual de serie (spec series-pass): valida la serie,
   * rechaza si ya tiene el pase del mes, crea la orden PENDING
   * (orderType SERIES_PASS, sin evento ni descuento en v1) y delega el cobro
   * a la pasarela. El SeriesPass efectivo lo emite el webhook al PAID.
   * Lanza errores de dominio - el controller los mapea a HTTP.
   */
  async purchaseSeriesPass(
    personId: string,
    input: PurchaseSeriesPassInput,
  ): Promise<PurchaseTicketResult> {
    const series = await this.prisma.eventSeries.findUnique({
      where: { id: input.seriesId },
      select: { id: true, active: true, producerId: true },
    });
    if (!series) throw new SeriesNotFoundError();
    if (!series.active) throw new SeriesInactiveError();

    // Un pase por (serie, persona, mes): @@unique del schema; el check
    // anticipado da el 409 de dominio antes de cobrar de nuevo.
    const owned = await this.prisma.seriesPass.findUnique({
      where: {
        seriesId_personId_month: {
          seriesId: series.id,
          personId,
          month: input.month,
        },
      },
      select: { id: true },
    });
    if (owned) throw new SeriesPassAlreadyOwnedError();

    // Precio/cargo parametrizables: default del productor → PlatformParam;
    // sin descuentos ni override por serie en v1.
    const listPrice = await this.params.getNumber(
      "series_pass.price_clp",
      25000,
    );
    const producerParams = await this.params.getProducerParams(
      series.producerId,
    );
    const { allInPct, cardPct, ivaPct } = await this.producerFeeContext(
      null,
      producerParams,
    );
    const quote = this.pricing.quote({ listPrice, discount: null });
    // Misma selección de modo que el ticket: método propio → MANUAL
    // PENDING (OWN_METHOD); cuenta propia → su adaptador (OWN_GATEWAY).
    const ownMethod = input.methodId
      ? await this.ownMethodFor(series.producerId, input.methodId)
      : null;
    const { gateway, gatewayAccountId } = ownMethod
      ? { gateway: null, gatewayAccountId: null }
      // EventSeries no declara moneda propia - la orden queda en el
      // default CLP del schema (Payment.currency).
      : await this.orderGateway(series.producerId, "CLP");
    const breakdown =
      quote.total > 0 && (gatewayAccountId || ownMethod)
        ? ownMethodBreakdown(
            quote.total,
            allInPct,
            cardPct,
            ivaPct,
            gatewayAccountId ? "OWN_GATEWAY" : "OWN_METHOD",
          )
        : managedFeeBreakdown(
            quote.total,
            allInPct,
            cardPct,
            ivaPct,
          );

    // refId = sp_<seriesId>_<month>_<uuid>: como no hay columna para la serie
    // en Payment (eventId queda null), el refId lleva todo el contexto - el
    // webhook lo decodifica como fuente primaria para emitir el SeriesPass.
    const refId = encodeSeriesPassRef(series.id, input.month);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    const payment = await this.createAssessedPayment(
      {
        orderType: "SERIES_PASS",
        refId,
        personId,
        eventId: null,
        discountCodeId: null,
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
        gateway: ownMethod ? "MANUAL" : gateway!.name,
        gatewayAccountId: ownMethod ? null : gatewayAccountId,
        methodLabel: ownMethod?.label ?? null,
      },
      breakdown,
    );

    if (ownMethod) {
      return {
        paymentUrl: null,
        paymentId: payment.id,
        quote,
        quantity: 1,
        method: {
          type: ownMethod.type,
          label: ownMethod.label,
          details: ownMethod.details,
        },
      };
    }

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await gateway!.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
      currency: payment.currency,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayRef: order.gatewayRef },
    });

    return {
      paymentUrl: order.paymentUrl,
      paymentId: payment.id,
      quote,
      quantity: 1,
    };
  }

  /**
   * Checkout de plan de academia: valida plan+academia activos y crea la
   * orden PENDING (orderType MEMBERSHIP) delegando el cobro. TRIAL se
   * vende online solo con price > 0 - la prueba gratis sigue siendo
   * asignación staff (la pasarela no cobra CLP 0). El Enrollment lo
   * emite el webhook al PAID - renovación incluida (extiende la
   * vigencia vigente); en TRIAL crea una fila nueva sin tocar la vigente.
   * Lanza errores de dominio - el controller los mapea a HTTP.
   */
  async purchaseMembership(
    personId: string,
    input: PurchaseMembershipInput,
  ): Promise<PurchaseTicketResult> {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: input.planId },
      select: {
        id: true,
        academyId: true,
        active: true,
        type: true,
        price: true,
        currency: true,
        academy: { select: { active: true, billingBlockedAt: true } },
      },
    });
    if (!plan || !plan.academy.active) throw new PlanNotFoundError();
    if (plan.academy.billingBlockedAt != null) {
      throw new AcademyUnavailableError();
    }
    if (!plan.active) throw new PlanNotPurchasableError();
    // La prueba gratis no pasa por la pasarela (no cobra CLP 0):
    // sigue siendo asignación staff. Solo el TRIAL con precio se vende.
    if (plan.type === "TRIAL" && plan.price <= 0) {
      throw new PlanNotPurchasableError(
        "la clase de prueba gratis la asigna la academia, no se vende online",
      );
    }

    // Promo de la academia vigente para este alumno/plan (spec
    // member-promos): el descuento sale del precio de lista - la
    // pasarela cobra el total ya descontado y el Payment queda marcado
    // (auditoría + conteo de maxCycles).
    const planCurrency = plan.currency ?? "CLP";
    const promo = await this.academyPromos.resolveApplicable(
      plan.academyId,
      personId,
      plan.id,
      plan.price,
      planCurrency,
    );

    // Precio del plan desde DB (nunca del cliente) = total exacto: modelo
    // SaaS (spec academy-saas-billing) - la academia paga su suscripción y
    // vende sin comisión; el costo Flow se liquida en su payout (línea
    // GATEWAY_FEE_PASSTHROUGH). feeMode ACADEMY lo marca en el libro.
    const quote = this.pricing.quote({
      listPrice: plan.price,
      discount: promo
        ? promo.discountType === "PERCENT"
          ? { percentOff: promo.percentOff }
          : { amountOff: promo.amountOffClp }
        : null,
    });

    // refId = mem_<planId>_<uuid>: Payment no tiene columna para el plan,
    // así que el contexto viaja aquí - el webhook lo decodifica al PAID.
    const refId = encodeMembershipRef(plan.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    // Moneda de la orden = la del plan (spec multipais-currency).
    const gateway = await this.resolveGateway(planCurrency);
    const payment = await this.createAssessedPayment(
      {
        orderType: "MEMBERSHIP",
        refId,
        personId,
        eventId: null,
        discountCodeId: null,
        academyPromoId: promo?.id ?? null,
        currency: planCurrency,
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
        gateway: gateway.name,
      },
      await this.academyBreakdown(quote.total),
    );

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
      currency: payment.currency,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayRef: order.gatewayRef },
    });

    return {
      paymentUrl: order.paymentUrl,
      paymentId: payment.id,
      quote,
      quantity: 1,
    };
  }

  /**
   * Revisión de orden del checkout de membresía - todo lo que la página
   * muestra ANTES de cobrar: precio, cargo de servicio, total real que
   * la pasarela debita, vigencia resultante (misma derivación que el
   * settle: extiende desde endsAt+1d si hay vigencia futura) y la
   * suscripción viva del viewer a este plan (la UI no ofrece suscribirse
   * dos veces). Mismas reglas de dominio que purchaseMembership.
   */
  async membershipQuote(personId: string, planId: string) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        name: true,
        active: true,
        type: true,
        price: true,
        currency: true,
        classCount: true,
        periodDays: true,
        description: true,
        academy: {
          select: { id: true, name: true, active: true, billingBlockedAt: true },
        },
      },
    });
    if (!plan || !plan.academy.active) throw new PlanNotFoundError();
    if (plan.academy.billingBlockedAt != null) {
      throw new AcademyUnavailableError();
    }
    if (!plan.active) throw new PlanNotPurchasableError();
    // Misma regla que purchaseMembership: TRIAL solo se vende con
    // price > 0 (la gratis es asignación staff).
    if (plan.type === "TRIAL" && plan.price <= 0) {
      throw new PlanNotPurchasableError(
        "la clase de prueba gratis la asigna la academia, no se vende online",
      );
    }

    // Promo de la academia vigente para este alumno/plan (spec
    // member-promos): la quote expone descriptor + total ya descontado
    // para el precio tachado + oferta del checkout.
    const promo = await this.academyPromos.applicableView(
      plan.academy.id,
      personId,
      plan.id,
      plan.price,
      plan.currency ?? "CLP",
    );

    // TRIAL nunca extiende la vigencia vigente - se materializa como
    // enrollment independiente desde now; sin lookups de vigencia/suscripción.
    if (plan.type === "TRIAL") {
      return {
        plan: {
          id: plan.id,
          name: plan.name,
          type: plan.type,
          price: plan.price,
          classCount: plan.classCount,
          periodDays: plan.periodDays,
          description: plan.description,
        },
        academy: { id: plan.academy.id, name: plan.academy.name },
        totalClp: promo?.finalClp ?? plan.price,
        currency: plan.currency ?? "CLP",
        promo,
        recurring: false,
        vigenciaEndsAt:
          membershipEndsAt(plan, new Date())?.toISOString() ?? null,
        currentEndsAt: null,
        subscription: null,
        gateway: (await this.resolveGateway(plan.currency ?? "CLP")).name,
        supportsSubscription: false,
      };
    }

    const [enrollment, subscription] = await Promise.all([
      this.prisma.enrollment.findFirst({
        where: {
          personId,
          academyId: plan.academy.id,
          status: { in: ["ACTIVE", "ONLINE"] },
          endsAt: { gt: new Date() },
        },
        orderBy: { endsAt: "desc" },
        select: { endsAt: true },
      }),
      this.prisma.membershipSubscription.findFirst({
        where: {
          personId,
          planId: plan.id,
          status: {
            in: ["ACTIVE", "CANCEL_PENDING", "PENDING_CARD", "ACTIVATING"],
          },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, nextInvoiceAt: true },
      }),
    ]);

    const vigenciaEndsAt = membershipEndsAt(
      plan,
      membershipBase(new Date(), enrollment?.endsAt ?? null),
    );

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        type: plan.type,
        price: plan.price,
        classCount: plan.classCount,
        periodDays: plan.periodDays,
        description: plan.description,
      },
      academy: { id: plan.academy.id, name: plan.academy.name },
      totalClp: promo?.finalClp ?? plan.price,
      currency: plan.currency ?? "CLP",
      promo,
      recurring: RECURRING_PLAN_TYPES.has(plan.type),
      vigenciaEndsAt: vigenciaEndsAt?.toISOString() ?? null,
      // Fin de la vigencia vigente - el checkout la muestra cuando la
      // compra extiende ("vence el X - la nueva vigencia parte después").
      currentEndsAt: enrollment?.endsAt?.toISOString() ?? null,
      subscription: subscription ?? null,
      gateway: (await this.resolveGateway(plan.currency ?? "CLP")).name,
      supportsSubscription: await this.subscriptionCapable(
        plan.currency ?? "CLP",
      ),
    };
  }

  /**
   * Clase vendible suelta (spec academy-workshops): existe, no cancelada,
   * aún no inicia y su serie tiene dropInPrice. La capacidad efectiva usa
   * la misma cadena que el roster: class → slot → series → academy → 20.
   */
  private async purchasableClass(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        cancelled: true,
        capacity: true,
        slot: {
          select: {
            startTime: true,
            endTime: true,
            capacity: true,
            academyId: true,
            series: {
              select: {
                id: true,
                name: true,
                dropInPrice: true,
                quorum: true,
              },
            },
            academy: {
              select: {
                id: true,
                name: true,
                defaultQuorum: true,
                billingBlockedAt: true,
                city: {
                  select: { country: { select: { currency: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!cls) throw new ClassNotFoundError();
    // Academia bloqueada por mora (S3): la clase no se vende suelta.
    if (cls.slot.academy.billingBlockedAt != null) {
      throw new AcademyUnavailableError();
    }
    const listPrice = cls.slot.series.dropInPrice;
    if (
      cls.cancelled ||
      listPrice == null ||
      classStart(cls.date, cls.slot.startTime) <= new Date()
    ) {
      throw new ClassNotPurchasableError();
    }
    return { cls, listPrice };
  }

  /**
   * Revisión previa a comprar una clase suelta/taller: desglose de precio
   * (solo el dropInPrice de la serie - sin cargo de servicio en el modelo
   * SaaS de academia), cupo restante y si el viewer ya tiene reserva.
   * Mismas reglas de dominio que purchaseClass; no crea orden ni toca la
   * pasarela.
   */
  async classQuote(personId: string, classId: string) {
    const { cls, listPrice } = await this.purchasableClass(classId);
    const capacity = effectiveCapacity({
      classCapacity: cls.capacity,
      slotCapacity: cls.slot.capacity,
      seriesQuorum: cls.slot.series.quorum,
      academyDefaultQuorum: cls.slot.academy.defaultQuorum,
    });
    const [booked, mine] = await Promise.all([
      this.prisma.classBooking.count({
        where: { classId: cls.id, status: "BOOKED" },
      }),
      this.prisma.classBooking.findFirst({
        where: {
          classId: cls.id,
          personId,
          status: { in: ["BOOKED", "WAITLIST"] },
        },
        select: { status: true },
      }),
    ]);
    // Precio exacto (modelo SaaS): la clase suelta cobra solo el
    // dropInPrice de la serie.
    const quote = this.pricing.quote({ listPrice, discount: null });
    return {
      ...quote,
      spotsLeft: Math.max(capacity - booked, 0),
      alreadyBooked: !!mine,
      class: {
        id: cls.id,
        date: cls.date,
        startTime: cls.slot.startTime,
        endTime: cls.slot.endTime,
      },
      series: { id: cls.slot.series.id, name: cls.slot.series.name },
      academy: { id: cls.slot.academy.id, name: cls.slot.academy.name },
      currency: cls.slot.academy.city?.country?.currency ?? "CLP",
      gateway: (
        await this.resolveGateway(
          cls.slot.academy.city?.country?.currency ?? "CLP",
        )
      ).name,
    };
  }

  /**
   * Checkout de clase suelta / taller pago (spec academy-workshops):
   * valida vendibilidad, cupo y duplicidad, crea la orden PENDING
   * (orderType WORKSHOP, refId wks_<classId>_<uuid>) y delega el cobro.
   * El ClassBooking pagado lo emite el settle al PAID - ocupa cupo físico
   * pero nunca consume cuota del plan ni exige inscripción.
   */
  async purchaseClass(
    personId: string,
    input: PurchaseClassInput,
  ): Promise<PurchaseTicketResult> {
    const { cls, listPrice } = await this.purchasableClass(input.classId);
    const capacity = effectiveCapacity({
      classCapacity: cls.capacity,
      slotCapacity: cls.slot.capacity,
      seriesQuorum: cls.slot.series.quorum,
      academyDefaultQuorum: cls.slot.academy.defaultQuorum,
    });
    const [booked, mine] = await Promise.all([
      this.prisma.classBooking.count({
        where: { classId: cls.id, status: "BOOKED" },
      }),
      this.prisma.classBooking.findFirst({
        where: {
          classId: cls.id,
          personId,
          status: { in: ["BOOKED", "WAITLIST"] },
        },
        select: { id: true },
      }),
    ]);
    if (mine) throw new ClassAlreadyBookedError();
    // Las órdenes PENDING no reservan cupo físico (a diferencia de la
    // preventa): el asiento se materializa al PAID. Si el cupo se agotó
    // entre el click y el pago, el settle deja la reserva en WAITLIST -
    // pagó, queda en cola, y la academia gestiona el aforo.
    if (booked >= capacity) throw new ClassSoldOutError();

    // Precio exacto (modelo SaaS): la orden WORKSHOP cobra solo el
    // dropInPrice; feeMode ACADEMY en el libro.
    const quote = this.pricing.quote({ listPrice, discount: null });

    const refId = encodeClassRef(cls.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    // Moneda de la orden (spec multipais-currency): la del pais de la
    // academia duena de la clase (fallback CLP).
    const orderCurrency =
      cls.slot.academy.city?.country?.currency ?? "CLP";
    const gateway = await this.resolveGateway(orderCurrency);
    const payment = await this.createAssessedPayment(
      {
        orderType: "WORKSHOP",
        refId,
        personId,
        eventId: null,
        discountCodeId: null,
        currency: orderCurrency,
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
        quantity: 1,
        unitListPrice: quote.listPrice,
        unitServiceFee: 0,
        gateway: gateway.name,
      },
      await this.academyBreakdown(quote.total),
    );

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
      currency: payment.currency,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayRef: order.gatewayRef },
    });

    return {
      paymentUrl: order.paymentUrl,
      paymentId: payment.id,
      quote,
      quantity: 1,
    };
  }

  /** Academia vendible para particular: activa + privateLessonPrice > 0. */
  private async purchasableAcademy(academyId: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: {
        id: true,
        name: true,
        active: true,
        privateLessonPrice: true,
        billingBlockedAt: true,
      },
    });
    if (!academy) throw new AcademyNotFoundError();
    // Academia bloqueada por mora (S3): no vende particulares nuevos.
    if (academy.billingBlockedAt != null) {
      throw new AcademyUnavailableError();
    }
    if (!academy.active || !academy.privateLessonPrice) {
      throw new PrivateClassNotPurchasableError();
    }
    return { academy, listPrice: academy.privateLessonPrice };
  }

  /**
   * Revisión previa a comprar una clase particular (spec
   * private-lesson-product): desglose de precio (solo el
   * privateLessonPrice único de la academia - sin cargo de servicio en
   * el modelo SaaS de academia). No crea orden ni toca la pasarela.
   */
  async privateClassQuote(personId: string, academyId: string) {
    void personId;
    const { academy, listPrice } = await this.purchasableAcademy(academyId);
    // Precio exacto (modelo SaaS): la particular cobra solo el
    // privateLessonPrice de la academia.
    const quote = this.pricing.quote({ listPrice, discount: null });
    return {
      ...quote,
      academy: { id: academy.id, name: academy.name },
      gateway: (await this.resolveGateway("CLP")).name,
    };
  }

  /**
   * Checkout de clase particular (spec private-lesson-product): el alumno
   * paga por adelantado y el owner de la academia asigna fecha e
   * instructor post-compra. Crea la orden PENDING (orderType PRIVATE,
   * refId pvt_<academyId>_<uuid>) y delega el cobro; el settle
   * materializa la PrivateLesson "por asignar" al PAID.
   */
  async purchasePrivateClass(
    personId: string,
    input: PurchasePrivateClassInput,
  ): Promise<PurchaseTicketResult> {
    const { academy, listPrice } = await this.purchasableAcademy(
      input.academyId,
    );
    // Precio exacto (modelo SaaS): la orden PRIVATE cobra solo el
    // privateLessonPrice; feeMode ACADEMY en el libro.
    const quote = this.pricing.quote({ listPrice, discount: null });

    const refId = encodePrivateRef(academy.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    // Sin moneda declarada en la entidad - la orden es CLP (default).
    const gateway = await this.resolveGateway("CLP");
    const payment = await this.createAssessedPayment(
      {
        orderType: "PRIVATE",
        refId,
        personId,
        eventId: null,
        discountCodeId: null,
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
        quantity: 1,
        unitListPrice: quote.listPrice,
        unitServiceFee: 0,
        gateway: gateway.name,
      },
      await this.academyBreakdown(quote.total),
    );

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
      currency: payment.currency,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayRef: order.gatewayRef },
    });

    return {
      paymentUrl: order.paymentUrl,
      paymentId: payment.id,
      quote,
      quantity: 1,
    };
  }
}
