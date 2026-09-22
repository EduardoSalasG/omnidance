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
import { NotificationsService } from "../../notifications/domain/notifications.service";

class TransferTicketDto {
  @IsEmail()
  toEmail!: string;
}

@Controller("tickets")
export class TicketsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Info pública de una invitación de entrada (claim link). Solo expone
   * lo necesario para la landing: quién regala + qué evento. 404 para
   * tokens inexistentes o ya reclamados (sin distinguir — no filtramos
   * qué tokens existen).
   */
  @Get("claim/:token")
  async claimInfo(@Param("token") token: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { claimToken: token },
      select: {
        status: true,
        eventId: true,
        buyerId: true,
      },
    });
    if (!ticket || ticket.status !== "ACTIVE") {
      throw new NotFoundException("este link ya no es válido");
    }
    const [buyer, event] = await Promise.all([
      this.prisma.person.findUnique({
        where: { id: ticket.buyerId },
        select: { name: true },
      }),
      this.prisma.event.findUnique({
        where: { id: ticket.eventId },
        select: {
          name: true,
          startsAt: true,
          venue: { select: { name: true } },
        },
      }),
    ]);
    return {
      buyerName: buyer?.name ?? "Un amigo",
      event: event ?? null,
    };
  }

  /**
   * Reclamar la entrada (sesión requerida): ownerId pasa al reclamante,
   * giftedFromId=comprador, claimedAt marca el momento y el token se
   * quema. Atómico vía updateMany — un doble reclamo concurrente gana el
   * primero; el segundo recibe 404.
   */
  @Post("claim/:token")
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async claim(@Param("token") token: string, @Req() req: Request) {
    const me = req.person!;
    const ticket = await this.prisma.ticket.findUnique({
      where: { claimToken: token },
      select: { id: true, ownerId: true, status: true, eventId: true },
    });
    if (!ticket) throw new NotFoundException("este link ya no es válido");
    if (ticket.ownerId === me.id) {
      throw new ConflictException("esta entrada ya es tuya");
    }
    if (ticket.status !== "ACTIVE") {
      throw new ConflictException("esta entrada ya no está disponible");
    }

    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticket.id, claimToken: token },
      data: {
        ownerId: me.id,
        giftedFromId: ticket.ownerId,
        claimedAt: new Date(),
        claimToken: null,
      },
    });
    if (count === 0) {
      throw new NotFoundException("este link ya no es válido");
    }

    // Aviso al comprador de que su regalo fue reclamado (best-effort).
    const [claimant, event] = await Promise.all([
      this.prisma.person.findUnique({
        where: { id: me.id },
        select: { name: true },
      }),
      this.prisma.event.findUnique({
        where: { id: ticket.eventId },
        select: { name: true, startsAt: true },
      }),
    ]);
    const claimantName = claimant?.name ?? "Alguien";
    await this.notifications.notifySafe(ticket.ownerId, {
      category: "TRANSACTIONAL",
      type: "ticket.claimed",
      title: `${claimantName} reclamó la entrada que le regalaste`,
      body: event?.name ? `Para ${event.name}` : undefined,
      data: {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        eventName: event?.name ?? null,
        eventStartsAt: event?.startsAt?.toISOString() ?? null,
        claimedById: me.id,
        claimedByName: claimantName,
      },
    });

    return { ok: true, ticketId: ticket.id };
  }

  @Get("mine")
  @UseGuards(SessionGuard)
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
      // reclamable: token para compartir por WhatsApp (null tras reclamo)
      claimToken: t.claimToken,
      event: byId.get(t.eventId) ?? null,
    }));
  }

  /**
   * Transferir un ticket propio a otra persona por email.
   * ownerId pasa al destinatario, giftedFromId registra al dueño anterior;
   * buyerId no cambia (trazabilidad del comprador original).
   */
  @Post(":id/transfer")
  @UseGuards(SessionGuard)
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

    // Transfer manual quema el claim link (si el ticket era reclamable)
    // — el nuevo dueño no hereda un token que el anterior siga teniendo.
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        ownerId: target.id,
        giftedFromId: ticket.ownerId,
        claimToken: null,
        claimedAt: new Date(),
      },
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
