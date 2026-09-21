import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../domain/ports";
import { PricingService, type Quote } from "../domain/pricing.service";
import {
  encodeSeriesPassRef,
  encodeTicketOrderRef,
} from "../domain/order-ref";
import { isRedeemable } from "../../discounts/domain/discounts.service";
import { ParamsService } from "../../params/params.service";
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

export interface PurchaseTicketInput {
  eventId: string;
  discountCode?: string;
  songSuggestion?: string;
  /** personIds de amigos a quienes se les regala entrada (máx. 9). */
  recipientIds?: string[];
}

export interface PurchaseSeriesPassInput {
  seriesId: string;
  /** Mes de vigencia "YYYY-MM" — validado por el DTO del controller. */
  month: string;
}

export interface PurchaseTicketResult {
  paymentUrl: string;
  paymentId: string;
  quote: Quote;
  /** Tickets de la orden (1 comprador + N regalos); 1 en series pass. */
  quantity: number;
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
        presalePrice: true,
        presaleCap: true,
        seriesId: true,
        serviceFeeClp: true,
        producerId: true,
      },
    });
    if (!event) throw new EventNotFoundError();
    if (event.status !== "PUBLISHED" || event.presalePrice == null) {
      throw new PresaleUnavailableError();
    }

    // La preventa cierra a las 19:00 del día del evento (hora local del
    // server — los startsAt del seed también se generan en hora local).
    // Parametrizable: presale.cutoff_hour.
    const cutoffHour = await this.params.getNumber("presale.cutoff_hour", 19);
    const cutoff = new Date(event.startsAt);
    cutoff.setHours(cutoffHour, 0, 0, 0);
    if (new Date() >= cutoff) throw new PresaleClosedError();

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
    const quantity = 1 + recipientIds.length;

    if (event.presaleCap != null) {
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

    // fee parametrizable: override del evento → default del productor →
    // PlatformParam → env → default del shared
    const producerParams = await this.params.getProducerParams(
      event.producerId,
    );
    const serviceFeeClp =
      event.serviceFeeClp ??
      producerParams?.serviceFeeClp ??
      (await this.params.getNumber(
        "service_fee.presale_clp",
        Number(process.env.SERVICE_FEE_CLP ?? SERVICE_FEE.PRESALE_CLP),
      ));
    // quote por entrada; el descuento se aplica una vez por orden (no por
    // ticket) para no multiplicar el beneficio del código.
    const unit = this.pricing.quote({
      listPrice: event.presalePrice,
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
}
