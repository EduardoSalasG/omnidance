import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../domain/ports";
import {
  decodeSeriesPassRef,
  decodeTicketOrderRef,
} from "../domain/order-ref";
import { ParamsService } from "../../params/params.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { SERVICE_FEE } from "@omnidance/shared";

class WebhookDto {
  @IsOptional()
  @IsString()
  refId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  // Flow notifica solo { token }
  @IsOptional()
  @IsString()
  token?: string;
}

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly params: ParamsService,
    private readonly notifications: NotificationsService,
  ) {}

  // Público: lo llama la pasarela (o el stub en dev).
  // Idempotente: re-notificación PAID no duplica ticket ni usedCount.
  @Post("webhook")
  @HttpCode(200)
  async webhook(@Body() body: WebhookDto) {
    let result: { refId: string; status: "PAID" | "FAILED" };
    try {
      result = await this.gateway.verifyWebhook(body);
    } catch {
      throw new BadRequestException("webhook inválido");
    }

    const payment = await this.prisma.payment.findFirst({
      where: { refId: result.refId },
    });
    if (!payment) throw new NotFoundException("pago no encontrado");

    // ya PAID → idempotente (re-notificación de la pasarela)
    if (payment.status === "PAID") {
      return { ok: true, status: "PAID", duplicated: true };
    }

    if (result.status === "FAILED") {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      const failedEvent = payment.eventId
        ? await this.prisma.event.findUnique({
            where: { id: payment.eventId },
            select: { name: true, startsAt: true },
          })
        : null;
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.failed",
        title: "Tu pago no pudo procesarse",
        body: failedEvent ? `Para ${failedEvent.name}` : undefined,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          eventId: payment.eventId,
          eventName: failedEvent?.name ?? null,
          eventStartsAt: failedEvent?.startsAt?.toISOString() ?? null,
        },
      });
      return { ok: true, status: "FAILED" };
    }

    // SERIES_PASS: rama separada del flujo ticket. A diferencia del ticket,
    // la orden no tiene contexto en columnas (Payment.eventId es null por
    // diseño — el pase es de la serie, no de un evento): el (seriesId, month)
    // viaja codificado en el refId y se decodifica como fuente primaria.
    if (payment.orderType === "SERIES_PASS") {
      return this.settleSeriesPass(payment);
    }

    // El contexto de la compra vive en columnas (Payment.eventId/
    // discountCodeId); refId queda solo como correlación con la pasarela.
    // Fallback al decode para pagos legacy sin las columnas.
    const order = payment.eventId
      ? { eventId: payment.eventId, codeId: payment.discountCodeId }
      : decodeTicketOrderRef(payment.refId);
    if (!order) {
      throw new BadRequestException("pago sin contexto de orden ticket");
    }

    // fee parametrizable: se lee ANTES de abrir la tx (usa this.prisma, no
    // tx). Override admin del evento → PlatformParam → env → default shared.
    // El evento también se reutiliza dentro de la tx para el quote/ticket.
    const event = await this.prisma.event.findUnique({
      where: { id: order.eventId },
      select: {
        presalePrice: true,
        serviceFeeClp: true,
        name: true,
        startsAt: true,
      },
    });
    const serviceFeeClp =
      event?.serviceFeeClp ??
      (await this.params.getNumber(
        "service_fee.presale_clp",
        Number(process.env.SERVICE_FEE_CLP ?? SERVICE_FEE.PRESALE_CLP),
      ));

    // la notificación solo sale si esta llamada fue la que marcó PAID
    // (no en re-notificaciones ni carreras perdidas dentro de la tx)
    let paidNow = false;
    await this.prisma.$transaction(async (tx) => {
      // re-check dentro de la tx: doble webhook concurrente no duplica
      const fresh = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      if (!fresh || fresh.status === "PAID") return;

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "PAID" },
      });
      paidNow = true;

      // el ticket SOLO se emite cuando el pago queda PAID.
      // Economía unitaria: la orden la desnormalizó al checkout
      // (unitListPrice/unitServiceFee cubren preventa y puerta app);
      // pagos legacy sin columnas caen al re-derive por presalePrice.
      const code = order.codeId
        ? await tx.discountCode.findUnique({ where: { id: order.codeId } })
        : null;
      const unitListPrice =
        payment.unitListPrice ?? event?.presalePrice ?? 0;
      const unitServiceFee = payment.unitServiceFee ?? serviceFeeClp;

      // Multi-entrada: un ticket para el comprador + uno por destinatario
      // de regalo (ownerId=amigo, giftedFromId=comprador). El descuento se
      // audita una sola vez — solo el ticket del comprador lo referencia.
      const recipientIds = Array.isArray(payment.recipients)
        ? (payment.recipients as string[]).filter(
            (id): id is string => typeof id === "string",
          )
        : [];
      await tx.ticket.create({
        data: {
          eventId: order.eventId,
          ownerId: payment.personId,
          buyerId: payment.personId,
          paymentId: payment.id,
          listPrice: unitListPrice,
          serviceFee: unitServiceFee,
          discountCodeId: code?.id ?? null,
        },
      });
      for (const ownerId of recipientIds) {
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ownerId,
            buyerId: payment.personId,
            giftedFromId: payment.personId,
            paymentId: payment.id,
            listPrice: unitListPrice,
            serviceFee: unitServiceFee,
          },
        });
      }

      // Reclamables: entradas sobrantes de la orden quedan del comprador
      // con claimToken — el destinatario las reclama en /reclamar/:token
      // aunque no esté registrado ni sea amigo.
      const unassigned = Math.max(
        0,
        payment.quantity - 1 - recipientIds.length,
      );
      for (let i = 0; i < unassigned; i++) {
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ownerId: payment.personId,
            buyerId: payment.personId,
            paymentId: payment.id,
            claimToken: randomBytes(16).toString("hex"),
            listPrice: unitListPrice,
            serviceFee: unitServiceFee,
          },
        });
      }

      if (code) {
        // auditoría de la redemption + consumo del uso
        await tx.discountRedemption.create({
          data: {
            codeId: code.id,
            personId: payment.personId,
            paymentId: payment.id,
          },
        });
        await tx.discountCode.update({
          where: { id: code.id },
          data: { usedCount: { increment: 1 } },
        });
      }
    });

    if (paidNow) {
      const clp = new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(payment.amount);
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.paid",
        title: "Pago confirmado — tu ticket está listo",
        body: event
          ? `${event.name} · ${payment.quantity} entrada${payment.quantity > 1 ? "s" : ""} · ${clp}`
          : `${payment.quantity} entrada${payment.quantity > 1 ? "s" : ""} · ${clp}`,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          eventId: order.eventId,
          eventName: event?.name ?? null,
          eventStartsAt: event?.startsAt?.toISOString() ?? null,
          quantity: payment.quantity,
          amount: payment.amount,
        },
      });

      // Aviso a cada destinatario de regalo: quién la compró + qué evento.
      const recipientIds = Array.isArray(payment.recipients)
        ? (payment.recipients as string[]).filter(
            (id): id is string => typeof id === "string",
          )
        : [];
      if (recipientIds.length) {
        const buyer = await this.prisma.person.findUnique({
          where: { id: payment.personId },
          select: { name: true },
        });
        const buyerName = buyer?.name ?? "Un amigo";
        for (const ownerId of recipientIds) {
          await this.notifications.notifySafe(ownerId, {
            category: "TRANSACTIONAL",
            type: "ticket.gifted",
            title: `${buyerName} te regaló una entrada`,
            body: event?.name
              ? `Para ${event.name} — ya está en Mis entradas`
              : "Ya está en Mis entradas",
            data: {
              paymentId: payment.id,
              refId: payment.refId,
              eventId: order.eventId,
              eventName: event?.name ?? null,
              eventStartsAt: event?.startsAt?.toISOString() ?? null,
              buyerId: payment.personId,
              buyerName,
            },
          });
        }
      }
    }

    return { ok: true, status: "PAID" };
  }

  /**
   * Liquidación del pase de serie al PAID: marca el Payment y hace upsert del
   * SeriesPass por @@unique([seriesId,personId,month]) — re-pago del mismo mes
   * solo refresca el precio, nunca duplica. Idempotente: re-notificación PAID
   * sale antes (ramal "duplicated") y el re-check dentro de la tx cubre
   * carreras; la notificación solo sale cuando esta llamada marcó PAID.
   */
  private async settleSeriesPass(payment: Payment) {
    const order = decodeSeriesPassRef(payment.refId);
    if (!order) {
      throw new BadRequestException("pago sin contexto de orden series pass");
    }

    let paidNow = false;
    await this.prisma.$transaction(async (tx) => {
      // re-check dentro de la tx: doble webhook concurrente no duplica
      const fresh = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      if (!fresh || fresh.status === "PAID") return;

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "PAID" },
      });
      paidNow = true;

      // el SeriesPass SOLO se emite cuando el pago queda PAID
      await tx.seriesPass.upsert({
        where: {
          seriesId_personId_month: {
            seriesId: order.seriesId,
            personId: payment.personId,
            month: order.month,
          },
        },
        update: { price: payment.amount },
        create: {
          seriesId: order.seriesId,
          personId: payment.personId,
          month: order.month,
          price: payment.amount,
        },
      });
    });

    if (paidNow) {
      const series = await this.prisma.classSeries.findUnique({
        where: { id: order.seriesId },
        select: { name: true },
      });
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.series_pass",
        title: "Pago confirmado — tu pase de serie está activo",
        body: series ? `Para ${series.name} · ${order.month}` : undefined,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          seriesId: order.seriesId,
          seriesName: series?.name ?? null,
          month: order.month,
        },
      });
    }

    return { ok: true, status: "PAID" };
  }

  // Polling desde el checkout (solo el dueño del pago).
  @Get(":id")
  @UseGuards(SessionGuard)
  async getPayment(@Req() req: Request, @Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.personId !== req.person!.id) {
      throw new NotFoundException("pago no encontrado");
    }
    return {
      id: payment.id,
      orderType: payment.orderType,
      status: payment.status,
      amount: payment.amount,
      createdAt: payment.createdAt,
    };
  }

  /**
   * Tickets emitidos por esta orden (solo el dueño del pago) — el éxito
   * del checkout los necesita para pintar los links de reclamo. Devuelve
   * id + claimToken; nada más del ticket es necesario ahí.
   */
  @Get(":id/tickets")
  @UseGuards(SessionGuard)
  async paymentTickets(@Req() req: Request, @Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.personId !== req.person!.id) {
      throw new NotFoundException("pago no encontrado");
    }
    if (payment.orderType !== "TICKET" || payment.status !== "PAID") {
      return [];
    }
    // Ticket.paymentId vincula exacto con la orden que los emitió.
    const tickets = await this.prisma.ticket.findMany({
      where: { paymentId: payment.id },
      select: { id: true, claimToken: true, ownerId: true },
      orderBy: { createdAt: "asc" },
    });
    return tickets;
  }
}
