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
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../domain/ports";
import { PaymentSettlementService } from "../application/payment-settlement.service";

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
    private readonly settlement: PaymentSettlementService,
  ) {}

  // Público: lo llama la pasarela (o el stub en dev).
  // Idempotente: re-notificación PAID no duplica ticket ni usedCount —
  // la transición real vive en PaymentSettlementService.settle; aquí solo
  // queda verificación + lookup + evidencia WEBHOOK_RECEIVED.
  @Post("webhook")
  @HttpCode(200)
  async webhook(@Body() body: WebhookDto) {
    let result: {
      refId: string;
      status: "PAID" | "FAILED";
      gatewayData?: unknown;
    };
    try {
      result = await this.gateway.verifyWebhook(body);
    } catch {
      throw new BadRequestException("webhook inválido");
    }

    const payment = await this.prisma.payment.findFirst({
      where: { refId: result.refId },
    });
    if (!payment) throw new NotFoundException("pago no encontrado");

    // WEBHOOK_RECEIVED se emite SIEMPRE — un webhook duplicado también es
    // evidencia. Los eventos de transición (STATUS_CONFIRMED, SETTLED,
    // FAILED…) solo se emiten dentro del settle cuando hay cambio real.
    await this.settlement.recordWebhookReceived(payment, {
      remoteStatus: result.status,
      body,
    });

    return this.settlement.settle(payment, result.status, {
      actor: "webhook",
      gatewayData: result.gatewayData,
    });
  }

  // Polling desde el checkout (solo el dueño del pago). Si la pasarela
  // soporta consulta activa (Flow.refreshStatus por commerceOrder) y la
  // orden sigue PENDING, se le pregunta directamente — cubre sandbox/dev
  // donde el webhook no puede alcanzar localhost; un estado terminal
  // pasa por el mismo settle del webhook (idempotente).
  @Get(":id")
  @UseGuards(SessionGuard)
  async getPayment(@Req() req: Request, @Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.personId !== req.person!.id) {
      throw new NotFoundException("pago no encontrado");
    }

    if (payment.status === "PENDING" && this.gateway.refreshStatus) {
      try {
        const remote = await this.gateway.refreshStatus(payment.refId);
        if (remote !== "PENDING") {
          await this.settlement.settle(payment, remote, { actor: "polling" });
          const fresh = await this.prisma.payment.findUnique({
            where: { id: payment.id },
            select: { status: true },
          });
          if (fresh) payment.status = fresh.status;
        }
      } catch {
        // best-effort: si la pasarela no responde se devuelve el estado
        // local (PENDING) y el próximo poll reintenta.
      }
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
