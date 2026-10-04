import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../domain/ports";
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
import {
  classStart,
  effectiveCapacity,
} from "../../academies/domain/academy.service";
import { SERVICE_FEE } from "@omnidance/shared";

// Una orden PENDING solo reserva cupo mientras el pago puede completarse;
// pasado el TTL se considera abandonada y deja de contar contra el cap.
const PENDING_ORDER_TTL_MS = 30 * 60 * 1000;

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
    super("La preventa cerró a las 19:00 — el resto se paga en puerta");
    this.name = "PresaleClosedError";
  }
}

export class InvalidDiscountError extends Error {
  constructor(reason: "EXPIRED" | "EXHAUSTED" | "SCOPE_MISMATCH" | "UNKNOWN") {
    super(
      reason === "EXPIRED"
        ? "código expirado"
        : reason === "EXHAUSTED"
          ? "código agotado"
          : reason === "SCOPE_MISMATCH"
            ? "código no aplica a este evento"
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
 * academy-saas-billing, S3): ningún pago nuevo hacia ella — membresía,
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
export class TableSoldOutError extends Error {
  constructor() {
    super("sin cupo en mesas para esa cantidad de personas");
    this.name = "TableSoldOutError";
  }
}

export interface PurchaseTicketInput {
  eventId: string;
  discountCode?: string;
  songSuggestion?: string;
  /** personIds de amigos a quienes se les regala entrada (máx. 9). */
  recipientIds?: string[];
  /** Entradas de la orden (1–10; default 1). Sobrantes = reclamables. */
  quantity?: number;
  /** Personas para reserva de mesa (solo si el evento tiene tablesTotal). */
  tablePartySize?: number;
}

export interface PurchaseSeriesPassInput {
  seriesId: string;
  /** Mes de vigencia "YYYY-MM" — validado por el DTO del controller. */
  month: string;
}

export interface PurchaseMembershipInput {
  planId: string;
}

export interface PurchaseClassInput {
  classId: string;
}

export interface PurchasePrivateClassInput {
  academyId: string;
}

export interface PurchaseTicketResult {
  paymentUrl: string;
  paymentId: string;
  quote: Quote;
  /** Tickets de la orden (1 comprador + N regalos); 1 en series pass. */
  quantity: number;
}

/**
 * Preview de código de descuento (GET /checkout/discount-quote): valida
 * existencia/vigencia/cupo/scope y estima el descuento de la ORDEN sobre
 * el precio del canal vigente — sin side-effects (no crea Payment ni
 * consume uso del código). `reason` replica el vocabulario de
 * InvalidDiscountError para logging/telemetría del cliente.
 */
export interface DiscountQuoteResult {
  valid: boolean;
  discountClp: number;
  reason?: "EXPIRED" | "EXHAUSTED" | "SCOPE_MISMATCH" | "UNKNOWN";
}

/**
 * Caso de uso del checkout de preventa: valida evento/cap/descuento, crea
 * la orden PENDING (con contexto desnormalizado en Payment), registra la
 * sugerencia de canción y delega el cobro a la pasarela configurada.
 * Lanza errores de dominio — el controller los mapea a HTTP.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly pricing: PricingService,
    private readonly params: ParamsService,
  ) {}

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
        doorAppFeeClp: true,
        seriesId: true,
        serviceFeeClp: true,
        producerId: true,
        tablesTotal: true,
        tableSeatMax: true,
        tableSeatsTotal: true,
      },
    });
    if (!event) throw new EventNotFoundError();

    // Reserva de mesa: solo si el evento ofrece, no supera el tope por
    // mesa (default 12 sin configuración) y queda cupo sentable — el
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

    // Canal de venta (spec: cargos diferenciados por canal — preventa
    // +$500 / puerta app +$700). La preventa cierra a las 19:00 del día
    // del evento (parametrizable: presale.cutoff_hour); desde ahí y
    // durante el evento LIVE la app vende a precio de puerta.
    const now = new Date();
    // Un evento que ya terminó no vende por ningún canal — un evento que
    // quedó LIVE pasado su endsAt tampoco (el staff pudo no cerrarlo).
    if (now >= event.endsAt) throw new EventEndedError();
    const cutoffHour = await this.params.getNumber("presale.cutoff_hour", 19);
    const cutoff = new Date(event.startsAt);
    cutoff.setHours(cutoffHour, 0, 0, 0);
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
            `${name} no es tu amigo en Omnidance — agrégalo primero`,
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
        "Elegiste más amigos que entradas disponibles — sube la cantidad o desmarca a alguien",
      );
    }

    if (channel === "PRESALE" && event.presaleCap != null) {
      // tickets emitidos + órdenes PENDING recientes cuentan contra el cap
      // (quantity, no la orden — una orden multi-entrada reserva N cupos)
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
      eventId: string | null;
      seriesId: string | null;
      percentOff: number | null;
      amountOff: number | null;
      maxUses: number | null;
      usedCount: number;
      expiresAt: Date | null;
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
    }

    // fee parametrizable por canal: override del evento → default del
    // productor → PlatformParam → env → default del shared.
    const producerParams = await this.params.getProducerParams(
      event.producerId,
    );
    const serviceFeeClp =
      channel === "PRESALE"
        ? (event.serviceFeeClp ??
          producerParams?.serviceFeeClp ??
          (await this.params.getNumber(
            "service_fee.presale_clp",
            Number(process.env.SERVICE_FEE_CLP ?? SERVICE_FEE.PRESALE_CLP),
          )))
        : (event.doorAppFeeClp ??
          producerParams?.doorAppFeeClp ??
          (await this.params.getNumber(
            "service_fee.door_app_clp",
            SERVICE_FEE.DOOR_APP_CLP,
          )));
    // quote por entrada; el descuento se aplica una vez por orden (no por
    // ticket) para no multiplicar el beneficio del código.
    const unit = this.pricing.quote({
      listPrice:
        channel === "PRESALE" ? event.presalePrice! : event.doorPrice!,
      serviceFeeClp,
      discount: code,
    });
    const orderTotal =
      (unit.listPrice + unit.serviceFee) * quantity - unit.discount;
    const quote: Quote = { ...unit, total: orderTotal };

    // refId correlaciona con la pasarela y el webhook; eventId/discountCodeId
    // también quedan desnormalizados en Payment para reporting. quantity +
    // recipients le dicen al webhook cuántos tickets emitir y a quién.
    const refId = encodeTicketOrderRef(event.id, code?.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderType: "TICKET",
        refId,
        personId,
        eventId: event.id,
        discountCodeId: code?.id ?? null,
        amount: orderTotal,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: orderTotal,
        quantity,
        recipients: recipientIds.length ? recipientIds : undefined,
        // Intención de mesa: solo si el evento ofrece mesas — el webhook
        // la materializa al PAID (pago fallido/abandonado no reserva).
        tablePartySize:
          event.tablesTotal != null && input.tablePartySize
            ? input.tablePartySize
            : null,
        channel,
        unitListPrice: unit.listPrice,
        unitServiceFee: unit.serviceFee,
        gateway: this.gateway.name,
      },
    });

    // SongSuggestion: se crea ya (ligada a personId+eventId) porque el
    // webhook no recibe el texto — el top-N filtra por ticket pagado, así
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
    const order = await this.gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
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
    };
  }

  /**
   * Cotización de un código de descuento para el checkout de tickets:
   * responde si el código es redimible en este evento y el descuento
   * estimado de la orden sobre el precio del canal vigente (misma
   * resolución preventa/puerta que purchaseTicket). Sin side-effects —
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
      },
    });
    if (!event) throw new EventNotFoundError();

    const code = await this.prisma.discountCode.findUnique({
      where: { code: input.code.trim() },
      select: {
        percentOff: true,
        amountOff: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        eventId: true,
        seriesId: true,
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

    // Misma regla de canal que purchaseTicket: preventa hasta el corte
    // (presale.cutoff_hour del día del evento), puerta app en LIVE o
    // post-corte; evento terminado no cotiza.
    const now = new Date();
    let listPrice: number | null = null;
    if (now < event.endsAt) {
      const cutoffHour = await this.params.getNumber("presale.cutoff_hour", 19);
      const cutoff = new Date(event.startsAt);
      cutoff.setHours(cutoffHour, 0, 0, 0);
      if (
        event.status === "PUBLISHED" &&
        event.presalePrice != null &&
        now < cutoff
      ) {
        listPrice = event.presalePrice;
      } else if (
        event.doorPrice != null &&
        (event.status === "LIVE" ||
          (event.status === "PUBLISHED" && now >= cutoff))
      ) {
        listPrice = event.doorPrice;
      }
    }
    if (listPrice == null) return { valid: true, discountClp: 0 };

    // El descuento se aplica una vez por orden (= unit.discount del
    // pricing, no por ticket) — igual que el total de purchaseTicket.
    const unit = this.pricing.quote({
      listPrice,
      serviceFeeClp: 0,
      discount: code,
    });
    return { valid: true, discountClp: unit.discount };
  }

  /**
   * Checkout del pase mensual de serie (spec series-pass): valida la serie,
   * rechaza si ya tiene el pase del mes, crea la orden PENDING
   * (orderType SERIES_PASS, sin evento ni descuento en v1) y delega el cobro
   * a la pasarela. El SeriesPass efectivo lo emite el webhook al PAID.
   * Lanza errores de dominio — el controller los mapea a HTTP.
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
    const serviceFeeClp =
      producerParams?.serviceFeeClp ??
      (await this.params.getNumber("service_fee.series_pass_clp", 500));
    const quote = this.pricing.quote({
      listPrice,
      serviceFeeClp,
      discount: null,
    });

    // refId = sp_<seriesId>_<month>_<uuid>: como no hay columna para la serie
    // en Payment (eventId queda null), el refId lleva todo el contexto — el
    // webhook lo decodifica como fuente primaria para emitir el SeriesPass.
    const refId = encodeSeriesPassRef(series.id, input.month);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderType: "SERIES_PASS",
        refId,
        personId,
        eventId: null,
        discountCodeId: null,
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
        gateway: this.gateway.name,
      },
    });

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await this.gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
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
   * vende online solo con price > 0 — la prueba gratis sigue siendo
   * asignación staff (la pasarela no cobra CLP 0). El Enrollment lo
   * emite el webhook al PAID — renovación incluida (extiende la
   * vigencia vigente); en TRIAL crea una fila nueva sin tocar la vigente.
   * Lanza errores de dominio — el controller los mapea a HTTP.
   */
  async purchaseMembership(
    personId: string,
    input: PurchaseMembershipInput,
  ): Promise<PurchaseTicketResult> {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: input.planId },
      select: {
        id: true,
        active: true,
        type: true,
        price: true,
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

    // Precio del plan desde DB (nunca del cliente). SIN cargo de servicio:
    // modelo SaaS (spec academy-saas-billing) — la academia paga su
    // suscripción y vende sin comisión al alumno; el costo Flow se liquida
    // en su payout (línea GATEWAY_FEE_PASSTHROUGH). Defensivo en código:
    // no depende del param service_fee.membership_clp (deprecated para
    // órdenes de academia), el fee es 0 para MEMBERSHIP siempre.
    const quote = this.pricing.quote({
      listPrice: plan.price,
      serviceFeeClp: 0,
      discount: null,
    });

    // refId = mem_<planId>_<uuid>: Payment no tiene columna para el plan,
    // así que el contexto viaja aquí — el webhook lo decodifica al PAID.
    const refId = encodeMembershipRef(plan.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderType: "MEMBERSHIP",
        refId,
        personId,
        eventId: null,
        discountCodeId: null,
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
        gateway: this.gateway.name,
      },
    });

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await this.gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
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
   * Revisión de orden del checkout de membresía — todo lo que la página
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

    // Sin cargo de servicio en productos de academia (modelo SaaS — spec
    // academy-saas-billing): el alumno paga solo lo que la academia fija;
    // el costo Flow se liquida en su payout. Defensivo: no lee el param
    // service_fee.membership_clp (deprecated para órdenes de academia).
    const serviceFeeClp = 0;

    // TRIAL nunca extiende la vigencia vigente — se materializa como
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
        serviceFeeClp,
        totalClp: plan.price + serviceFeeClp,
        recurring: false,
        vigenciaEndsAt:
          membershipEndsAt(plan, new Date())?.toISOString() ?? null,
        currentEndsAt: null,
        subscription: null,
        gateway: this.gateway.name,
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
      serviceFeeClp,
      totalClp: plan.price + serviceFeeClp,
      recurring: RECURRING_PLAN_TYPES.has(plan.type),
      vigenciaEndsAt: vigenciaEndsAt?.toISOString() ?? null,
      // Fin de la vigencia vigente — el checkout la muestra cuando la
      // compra extiende ("vence el X — la nueva vigencia parte después").
      currentEndsAt: enrollment?.endsAt?.toISOString() ?? null,
      subscription: subscription ?? null,
      gateway: this.gateway.name,
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
              select: { id: true, name: true, defaultQuorum: true, billingBlockedAt: true },
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
   * (solo el dropInPrice de la serie — sin cargo de servicio en el modelo
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
    // Sin cargo de servicio (modelo SaaS — spec academy-saas-billing):
    // la clase suelta cobra solo el dropInPrice de la serie.
    const serviceFeeClp = 0;
    const quote = this.pricing.quote({
      listPrice,
      serviceFeeClp,
      discount: null,
    });
    return {
      ...quote,
      serviceFee: quote.serviceFee,
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
      gateway: this.gateway.name,
    };
  }

  /**
   * Checkout de clase suelta / taller pago (spec academy-workshops):
   * valida vendibilidad, cupo y duplicidad, crea la orden PENDING
   * (orderType WORKSHOP, refId wks_<classId>_<uuid>) y delega el cobro.
   * El ClassBooking pagado lo emite el settle al PAID — ocupa cupo físico
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
    // entre el click y el pago, el settle deja la reserva en WAITLIST —
    // pagó, queda en cola, y la academia gestiona el aforo.
    if (booked >= capacity) throw new ClassSoldOutError();

    // Sin cargo de servicio (modelo SaaS — spec academy-saas-billing):
    // la orden WORKSHOP cobra solo el dropInPrice.
    const serviceFeeClp = 0;
    const quote = this.pricing.quote({
      listPrice,
      serviceFeeClp,
      discount: null,
    });

    const refId = encodeClassRef(cls.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderType: "WORKSHOP",
        refId,
        personId,
        eventId: null,
        discountCodeId: null,
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
        quantity: 1,
        unitListPrice: quote.listPrice,
        unitServiceFee: quote.serviceFee,
        gateway: this.gateway.name,
      },
    });

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await this.gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
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
   * privateLessonPrice único de la academia — sin cargo de servicio en
   * el modelo SaaS de academia). No crea orden ni toca la pasarela.
   */
  async privateClassQuote(personId: string, academyId: string) {
    void personId;
    const { academy, listPrice } = await this.purchasableAcademy(academyId);
    // Sin cargo de servicio (modelo SaaS — spec academy-saas-billing):
    // la particular cobra solo el privateLessonPrice de la academia.
    const serviceFeeClp = 0;
    const quote = this.pricing.quote({
      listPrice,
      serviceFeeClp,
      discount: null,
    });
    return {
      ...quote,
      academy: { id: academy.id, name: academy.name },
      gateway: this.gateway.name,
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
    // Sin cargo de servicio (modelo SaaS — spec academy-saas-billing):
    // la orden PRIVATE cobra solo el privateLessonPrice.
    const serviceFeeClp = 0;
    const quote = this.pricing.quote({
      listPrice,
      serviceFeeClp,
      discount: null,
    });

    const refId = encodePrivateRef(academy.id);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { email: true },
    });

    const payment = await this.prisma.payment.create({
      data: {
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
        unitServiceFee: quote.serviceFee,
        gateway: this.gateway.name,
      },
    });

    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const order = await this.gateway.createOrder({
      refId,
      amount: quote.total,
      email: person?.email ?? "",
      returnUrl: `${webUrl}/checkout/return?paymentId=${payment.id}`,
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
