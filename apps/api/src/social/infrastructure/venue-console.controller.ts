import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  roleKeysHavePermission,
  RolesGuard,
} from "../../common/rbac/roles.guard";
import { RequireRoles } from "../../common/rbac/roles.decorator";
import { PrismaService } from "../../prisma.service";

class SetRentalStatusDto {
  @IsIn(["CONFIRMED", "CANCELLED"])
  status!: "CONFIRMED" | "CANCELLED";
}

type SessionPerson = NonNullable<Request["person"]>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Consola del venue (venue_manager): sus locales, dashboard operativo
 * (eventos, check-ins, arriendos de academias, cartas) y gestión del
 * estado de los VenueRental. ADMIN entra con bypass de ownership —
 * un rol con permiso admin.access (o isSuperuser) ve todos los venues.
 */
@Controller("venues")
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles("VENUE_MANAGER", "ADMIN")
export class VenueConsoleController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/venues/mine — venues activos propios (admin: todos). */
  @Get("mine")
  async mine(@Req() req: Request) {
    const me = req.person!;
    const isAdmin = await this.isAdmin(me);
    const venues = await this.prisma.venue.findMany({
      where: { active: true, ...(isAdmin ? {} : { ownerId: me.id }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, capacity: true },
    });
    if (!venues.length) return [];

    // upcomingCount: eventos publicados/en vivo a futuro, por venue.
    const grouped = await this.prisma.event.groupBy({
      by: ["venueId"],
      where: {
        venueId: { in: venues.map((v) => v.id) },
        status: { in: ["PUBLISHED", "LIVE"] },
        startsAt: { gte: new Date() },
      },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [g.venueId, g._count._all]));
    return venues.map((v) => ({ ...v, upcomingCount: counts.get(v.id) ?? 0 }));
  }

  /** GET /api/venues/:id/dashboard — pulso operativo del local. */
  @Get(":id/dashboard")
  async dashboard(@Param("id") venueId: string, @Req() req: Request) {
    const venue = await this.assertVenueAccess(venueId, req.person!);
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY_MS);

    const [upcoming, pastCount, eventIds, rentals, menus] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          venueId,
          status: { in: ["PUBLISHED", "LIVE"] },
          startsAt: { gte: now },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
      }),
      // eventos que ya ocurrieron dentro de los últimos 30 días
      this.prisma.event.count({
        where: { venueId, startsAt: { gte: since, lt: now } },
      }),
      // Checkin.eventId es escalar (sin relación) — hay que resolver los
      // ids de los eventos del venue antes de contar.
      this.prisma.event.findMany({
        where: { venueId },
        select: { id: true },
      }),
      this.prisma.venueRental.findMany({
        where: { venueId },
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          price: true,
          status: true,
          academyId: true,
          eventId: true,
        },
      }),
      this.prisma.venueMenu.findMany({
        where: { venueId },
        orderBy: { version: "desc" },
        select: { id: true, pdfUrl: true, version: true },
      }),
    ]);

    const allEventIds = eventIds.map((e) => e.id);

    // Solo check-ins no anulados — un voidedAt no es asistencia real.
    // Se traen las filas (no solo count) para computar el flujo: hora
    // peak de llegada y permanencia media (outAt - inAt), spec §13 Local.
    const checkinRows = allEventIds.length
      ? await this.prisma.checkin.findMany({
          where: {
            eventId: { in: allEventIds },
            inAt: { gte: since },
            voidedAt: null,
          },
          select: { inAt: true, outAt: true },
        })
      : [];

    // Reservas de mesa de los eventos futuros del venue — el local
    // necesita saber qué mesas esperar cada noche (spec §13 Local).
    // TableReservation.eventId/personId son escalares → nombres por join
    // manual sobre los ids ya resueltos.
    const upcomingIds = upcoming.map((e) => e.id);
    const tableRows = upcomingIds.length
      ? await this.prisma.tableReservation.findMany({
          where: {
            eventId: { in: upcomingIds },
            status: { not: "CANCELLED" },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const tablePeople = tableRows.length
      ? await this.prisma.person.findMany({
          where: { id: { in: [...new Set(tableRows.map((r) => r.personId))] } },
          select: { id: true, name: true },
        })
      : [];
    const nameBy = new Map(tablePeople.map((p) => [p.id, p.name]));
    const eventBy = new Map(upcoming.map((e) => [e.id, e]));
    const tables = tableRows.map((r) => ({
      id: r.id,
      status: r.status,
      partySize: r.partySize,
      tableNo: r.tableNo,
      personName: nameBy.get(r.personId) ?? null,
      event: {
        id: r.eventId,
        name: eventBy.get(r.eventId)?.name ?? "",
        startsAt: eventBy.get(r.eventId)?.startsAt ?? null,
      },
    }));

    // Flujo del público (30d): check-ins por hora local + permanencia
    // media de quienes marcaron salida. peakHour = la hora con más
    // llegadas acumuladas.
    const byHour = new Array<number>(24).fill(0);
    let staySum = 0;
    let stayN = 0;
    for (const c of checkinRows) {
      byHour[c.inAt.getHours()] += 1;
      if (c.outAt && c.outAt > c.inAt) {
        staySum += c.outAt.getTime() - c.inAt.getTime();
        stayN += 1;
      }
    }
    const peakHour = checkinRows.length
      ? byHour.indexOf(Math.max(...byHour))
      : null;
    const flow = {
      byHour,
      peakHour,
      avgStayMinutes: stayN ? Math.round(staySum / stayN / 60_000) : null,
      checkins: checkinRows.length,
    };

    return {
      venue: {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        capacity: venue.capacity,
      },
      upcoming,
      past30d: { events: pastCount, checkins: checkinRows.length },
      rentals,
      menus,
      tables,
      flow,
    };
  }

  /**
   * PATCH /api/venues/:id/rentals/:rentalId — el venue confirma o cancela
   * el arriendo pedido por una academia (REQUESTED → CONFIRMED|CANCELLED).
   */
  @Patch(":id/rentals/:rentalId")
  async setRentalStatus(
    @Param("id") venueId: string,
    @Param("rentalId") rentalId: string,
    @Body() dto: SetRentalStatusDto,
    @Req() req: Request,
  ) {
    await this.assertVenueAccess(venueId, req.person!);
    // Doble filtro venueId+id: un rental de otro local responde 404,
    // no 403 — no se filtra su existencia.
    const rental = await this.prisma.venueRental.findFirst({
      where: { id: rentalId, venueId },
      select: { id: true },
    });
    if (!rental) {
      throw new NotFoundException("arriendo no encontrado en este venue");
    }
    return this.prisma.venueRental.update({
      where: { id: rental.id },
      data: { status: dto.status },
    });
  }

  /**
   * Ownership del venue: ownerId === me o rol con permiso admin.access
   * (ADMIN isSuperuser). 404 si no existe, 403 si existe pero no es tuyo.
   */
  private async assertVenueAccess(venueId: string, me: SessionPerson) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        address: true,
        capacity: true,
        ownerId: true,
      },
    });
    if (!venue) throw new NotFoundException("venue no encontrado");
    const isAdmin = await this.isAdmin(me);
    if (!isAdmin && venue.ownerId !== me.id) {
      throw new ForbiddenException("este venue no está asignado a tu cuenta");
    }
    return venue;
  }

  private isAdmin(me: SessionPerson) {
    return roleKeysHavePermission(this.prisma, me.roles, ["admin.access"]);
  }
}
