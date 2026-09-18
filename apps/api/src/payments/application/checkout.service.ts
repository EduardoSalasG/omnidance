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

export interface PurchaseTicketInput {
  eventId: string;
  discountCode?: string;
  songSuggestion?: string;
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
        presalePrice: true,
        presaleCap: true,
        seriesId: true,
      },
    });
    if (!event) throw new EventNotFoundError();
    if (event.status !== "PUBLISHED" || event.presalePrice == null) {
      throw new PresaleUnavailableError();
    }

    if (event.presaleCap != null) {
      // tickets emitidos + órdenes PENDING recientes cuentan contra el cap
      const [sold, inFlight] = await Promise.all([
        this.prisma.ticket.count({
          where: { eventId: event.id, status: { not: "CANCELLED" } },
        }),
        this.prisma.payment.count({
          where: {
            orderType: "TICKET",
            status: "PENDING",
            eventId: event.id,
            createdAt: { gt: new Date(Date.now() - PENDING_ORDER_TTL_MS) },
          },
        }),
      ]);
      if (sold + inFlight >= event.presaleCap) {
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

    // fee parametrizable: PlatformParam → env → default del shared
    const serviceFeeClp = await this.params.getNumber(
      "service_fee.presale_clp",
      Number(process.env.SERVICE_FEE_CLP ?? SERVICE_FEE.PRESALE_CLP),
    );
    const quote = this.pricing.quote({
      listPrice: event.presalePrice,
      serviceFeeClp,
      discount: code,
    });

    // refId correlaciona con la pasarela y el webhook; eventId/discountCodeId
    // también quedan desnormalizados en Payment para reporting.
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
        amount: quote.total,
        fee: 0, // costo pasarela: desconocido hasta la liquidación
        net: quote.total,
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

    return { paymentUrl: order.paymentUrl, paymentId: payment.id, quote };
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
      select: { id: true, active: true },
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

    // Precio/cargo parametrizables (PlatformParam); sin descuentos en v1.
    const listPrice = await this.params.getNumber(
      "series_pass.price_clp",
      25000,
    );
    const serviceFeeClp = await this.params.getNumber(
      "service_fee.series_pass_clp",
      500,
    );
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

    return { paymentUrl: order.paymentUrl, paymentId: payment.id, quote };
  }
}
