import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import type { Request } from "express";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";

class RequestReservationDto {
  @IsInt()
  @Min(1)
  partySize!: number;
}

class ManageReservationDto {
  @IsIn(["CONFIRMED", "CANCELLED"])
  status!: "CONFIRMED" | "CANCELLED";

  @IsOptional()
  @IsString()
  tableNo?: string;

  /** Ajuste del tamaño al confirmar — la disponibilidad es referencial. */
  @IsOptional()
  @IsInt()
  @Min(1)
  partySize?: number;
}

type PersonCtx = { id: string; roles: string[] };

/**
 * Reservas de mesa por evento: la mesa es solo registro/proxy de consumo,
 * no compite con el POS del local (spec §8, §13).
 */
@Controller()
export class TableReservationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Solicitar reserva — una activa (REQUESTED|CONFIRMED) por persona/evento. */
  @Post("events/:id/table-reservations")
  @UseGuards(SessionGuard)
  async request(
    @Param("id") eventId: string,
    @Body() dto: RequestReservationDto,
    @Req() req: Request,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    if (event.status === "DRAFT" || event.status === "CANCELLED") {
      throw new ConflictException("el evento no admite reservas");
    }

    const existing = await this.prisma.tableReservation.findFirst({
      where: {
        eventId,
        personId: req.person!.id,
        status: { in: ["REQUESTED", "CONFIRMED"] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "ya tienes una reserva activa en este evento",
      );
    }

    return this.prisma.tableReservation.create({
      data: {
        eventId,
        personId: req.person!.id,
        partySize: dto.partySize,
        status: "REQUESTED",
      },
    });
  }

  /**
   * Visibilidad para asistentes: solo CONFIRMED, con nombre del solicitante
   * y cantidad — sin exponer datos sensibles (spec: "amigos que van").
   */
  @Get("events/:id/table-reservations")
  @UseGuards(SessionGuard)
  async listForEvent(@Param("id") eventId: string) {
    const reservations = await this.prisma.tableReservation.findMany({
      where: { eventId, status: "CONFIRMED" },
      orderBy: { createdAt: "asc" },
      select: { personId: true, partySize: true, tableNo: true },
    });
    // TableReservation.personId es escalar (sin relación) → join manual
    const people = await this.prisma.person.findMany({
      where: { id: { in: reservations.map((r) => r.personId) } },
      select: { id: true, name: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return reservations.map((r) => ({
      person: { name: byId.get(r.personId)?.name ?? "?" },
      partySize: r.partySize,
      tableNo: r.tableNo,
    }));
  }

  /**
   * Vista de gestión para el productor: TODAS las reservas con id/status
   * (el listado público solo expone CONFIRMED, sin ids — privacidad).
   */
  @Get("events/:id/table-reservations/manage")
  @UseGuards(SessionGuard)
  async listForManage(@Param("id") eventId: string, @Req() req: Request) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { producerId: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    await this.assertProducerOrAdmin(event, req.person!);

    const reservations = await this.prisma.tableReservation.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });
    const people = await this.prisma.person.findMany({
      where: { id: { in: reservations.map((r) => r.personId) } },
      select: { id: true, name: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return reservations.map((r) => ({
      id: r.id,
      status: r.status,
      partySize: r.partySize,
      tableNo: r.tableNo,
      createdAt: r.createdAt,
      person: { name: byId.get(r.personId)?.name ?? "?" },
    }));
  }

  /** Confirmar/cancelar (y asignar mesa) — productor del evento o admin. */
  @Patch("table-reservations/:id")
  @UseGuards(SessionGuard)
  async manage(
    @Param("id") id: string,
    @Body() dto: ManageReservationDto,
    @Req() req: Request,
  ) {
    const reservation = await this.prisma.tableReservation.findUnique({
      where: { id },
    });
    if (!reservation) throw new NotFoundException("reserva no encontrada");

    const event = await this.prisma.event.findUnique({
      where: { id: reservation.eventId },
      select: { producerId: true },
    });
    await this.assertProducerOrAdmin(
      event ?? { producerId: null },
      req.person!,
    );

    return this.prisma.tableReservation.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.tableNo !== undefined ? { tableNo: dto.tableNo } : {}),
        ...(dto.partySize !== undefined ? { partySize: dto.partySize } : {}),
      },
    });
  }

  /** Cancelación por el solicitante — libera el cupo (soft-cancel). */
  @Delete("table-reservations/:id")
  @UseGuards(SessionGuard)
  async cancel(@Param("id") id: string, @Req() req: Request) {
    const reservation = await this.prisma.tableReservation.findUnique({
      where: { id },
    });
    if (!reservation) throw new NotFoundException("reserva no encontrada");
    if (reservation.personId !== req.person!.id) {
      throw new ForbiddenException(
        "solo el solicitante puede cancelar la reserva",
      );
    }
    return this.prisma.tableReservation.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  /** Mis reservas (todas, cualquier estado) con el evento asociado. */
  @Get("table-reservations/mine")
  @UseGuards(SessionGuard)
  async mine(@Req() req: Request) {
    const reservations = await this.prisma.tableReservation.findMany({
      where: { personId: req.person!.id },
      orderBy: { createdAt: "desc" },
    });
    // eventId es escalar → join manual del evento
    const events = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(reservations.map((r) => r.eventId))] } },
      select: { id: true, name: true, startsAt: true },
    });
    const byId = new Map(events.map((e) => [e.id, e]));
    return reservations.map((r) => ({
      id: r.id,
      status: r.status,
      partySize: r.partySize,
      tableNo: r.tableNo,
      createdAt: r.createdAt,
      event: byId.get(r.eventId) ?? null,
    }));
  }

  /** productor del evento o admin.access — permiso desde DB, nunca rol literal. */
  private async assertProducerOrAdmin(
    event: { producerId: string | null },
    person: PersonCtx,
  ): Promise<void> {
    if (event.producerId === person.id) return;
    if (
      await roleKeysHavePermission(this.prisma, person.roles, ["admin.access"])
    ) {
      return;
    }
    throw new ForbiddenException(
      "solo el productor del evento o un admin puede gestionar reservas",
    );
  }
}
