import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsEmail } from "class-validator";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";

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

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: { ownerId: target.id, giftedFromId: ticket.ownerId },
    });

    // Referral GIFT_TICKET (CRM) — best-effort, nunca bloquea el transfer.
    // Sin @@unique en schema: guard findFirst para no duplicar
    // referrerId+referredId+source si se repite el transfer al mismo target.
    try {
      const existing = await this.prisma.referral.findFirst({
        where: {
          referrerId: ticket.ownerId,
          referredId: target.id,
          source: "GIFT_TICKET",
        },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.referral.create({
          data: {
            referrerId: ticket.ownerId,
            referredId: target.id,
            source: "GIFT_TICKET",
          },
        });
      }
    } catch {
      /* referral no crítico */
    }

    return updated;
  }
}
