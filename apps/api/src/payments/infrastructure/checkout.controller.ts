import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../domain/ports";
import { PricingService } from "../domain/pricing.service";
import { encodeTicketOrderRef } from "../domain/order-ref";
import { isRedeemable } from "../../discounts/domain/discounts.service";
import { ParamsService } from "../../params/params.service";
import { SERVICE_FEE } from "@omnidance/shared";

// Una orden PENDING solo reserva cupo mientras el pago puede completarse;
// pasado el TTL se considera abandonada y deja de contar contra el cap.
const PENDING_ORDER_TTL_MS = 30 * 60 * 1000;

class CheckoutTicketDto {
  @IsString()
  eventId!: string;

  @IsOptional()
  @IsString()
  discountCode?: string;

  // Canción pedida para el DJ (spec song-suggestions): se guarda ligada al
  // comprador; el top-N del evento solo cuenta personas con ticket pagado.
  @IsOptional()
  @IsString()
  @MaxLength(140)
  songSuggestion?: string;
}

@Controller("checkout")
export class CheckoutController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly pricing: PricingService,
    private readonly params: ParamsService,
  ) {}

  @Post("ticket")
  @UseGuards(SessionGuard)
  async ticket(@Req() req: Request, @Body() dto: CheckoutTicketDto) {
    const personId = req.person!.id;

    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      select: {
        id: true,
        status: true,
        presalePrice: true,
        presaleCap: true,
        seriesId: true,
      },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    if (event.status !== "PUBLISHED" || event.presalePrice == null) {
      throw new BadRequestException("evento sin preventa disponible");
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
        throw new ConflictException("preventa agotada");
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
    if (dto.discountCode) {
      code = await this.prisma.discountCode.findUnique({
        where: { code: dto.discountCode },
      });
      if (!code) throw new BadRequestException("código inválido");
      // regla pura del dominio (misma semántica que discounts.service)
      const check = isRedeemable(code, {
        now: new Date(),
        eventId: event.id,
        seriesId: event.seriesId ?? undefined,
      });
      if (!check.ok) {
        const msg =
          check.reason === "EXPIRED"
            ? "código expirado"
            : check.reason === "EXHAUSTED"
              ? "código agotado"
              : "código no aplica a este evento";
        throw new BadRequestException(msg);
      }
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
    const suggestion = dto.songSuggestion?.trim().replace(/\s+/g, " ");
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
}

class TransferTicketDto {
  @IsEmail()
  toEmail!: string;
}

@Controller("tickets")
@UseGuards(SessionGuard)
export class TicketsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("mine")
  async mine(@Req() req: Request) {
    const me = req.person!.id;
    const tickets = await this.prisma.ticket.findMany({
      where: { ownerId: me },
      orderBy: { createdAt: "desc" },
    });
    // Ticket.eventId es bare string (sin relación) → fetch manual del evento
    const events = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(tickets.map((t) => t.eventId))] } },
      select: {
        id: true,
        name: true,
        startsAt: true,
        venue: { select: { name: true } },
      },
    });
    const byId = new Map(events.map((e) => [e.id, e]));
    return tickets.map((t) => ({
      id: t.id,
      status: t.status,
      listPrice: t.listPrice,
      serviceFee: t.serviceFee,
      event: byId.get(t.eventId) ?? null,
    }));
  }

  /**
   * Transferir un ticket propio a otra persona por email.
   * ownerId pasa al destinatario, giftedFromId registra al dueño anterior;
   * buyerId no cambia (trazabilidad del comprador original).
   */
  @Post(":id/transfer")
  @HttpCode(200)
  async transfer(
    @Param("id") id: string,
    @Body() dto: TransferTicketDto,
    @Req() req: Request,
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("ticket no encontrado");
    if (ticket.ownerId !== req.person!.id) {
      throw new ForbiddenException("solo el dueño puede transferir el ticket");
    }
    if (ticket.status !== "ACTIVE") {
      throw new ConflictException("el ticket no está activo");
    }

    const target = await this.prisma.person.findUnique({
      where: { email: dto.toEmail },
      select: { id: true },
    });
    if (!target) {
      throw new BadRequestException("no existe una persona con ese email");
    }
    if (target.id === ticket.ownerId) {
      throw new BadRequestException(
        "no puedes transferir el ticket a ti mismo",
      );
    }

    return this.prisma.ticket.update({
      where: { id },
      data: { ownerId: target.id, giftedFromId: ticket.ownerId },
    });
  }
}
