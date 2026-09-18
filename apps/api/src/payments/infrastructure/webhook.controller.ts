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
import type { Request } from "express";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../domain/ports";
import { PricingService } from "../domain/pricing.service";
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
    private readonly pricing: PricingService,
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
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.failed",
        title: "Tu pago no pudo procesarse",
        data: { paymentId: payment.id, refId: payment.refId },
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
      select: { presalePrice: true, serviceFeeClp: true },
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

      // el ticket SOLO se emite cuando el pago queda PAID
      // (event ya cargado antes de la tx: presalePrice + serviceFeeClp)
      const code = order.codeId
        ? await tx.discountCode.findUnique({ where: { id: order.codeId } })
        : null;
      const quote = this.pricing.quote({
        listPrice: event?.presalePrice ?? payment.amount,
        serviceFeeClp,
        discount: code,
      });

      await tx.ticket.create({
        data: {
          eventId: order.eventId,
          ownerId: payment.personId,
          buyerId: payment.personId,
          listPrice: event?.presalePrice ?? 0,
          serviceFee: quote.serviceFee,
          discountCodeId: code?.id ?? null,
        },
      });

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
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.paid",
        title: "Pago confirmado — tu ticket está listo",
        data: { paymentId: payment.id, refId: payment.refId },
      });
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
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.series_pass",
        title: "Pago confirmado — tu pase de serie está activo",
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          seriesId: order.seriesId,
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
}
