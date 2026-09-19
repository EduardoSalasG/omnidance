import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";

/**
 * Vista alumno: explorar clases próximas (por día/estilo/nivel/academia)
 * y reservar cupo. Booking con capacidad real — si el slot está lleno la
 * reserva entra como WAITLIST y se promueve en orden al liberarse un cupo.
 */
@Controller("classes")
@UseGuards(SessionGuard)
export class ClassesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Catálogos públicos para los filtros del explorador (lectura). */
  @Get("catalogs")
  catalogs() {
    return Promise.all([
      this.prisma.classLevel.findMany({ orderBy: { order: "asc" } }),
      this.prisma.classType.findMany({ orderBy: { name: "asc" } }),
    ]).then(([levels, types]) => ({ levels, types }));
  }

  /**
   * Clases futuras no canceladas con info de serie/academia/instructor.
   * Cada item incluye capacity, bookedCount, spotsLeft y myBooking
   * (status de mi reserva si existe).
   */
  @Get("browse")
  async browse(
    @Req() req: Request,
    @Query("weekday") weekday?: string,
    @Query("styleId") styleId?: string,
    @Query("levelId") levelId?: string,
    @Query("academyId") academyId?: string,
    @Query("days") days?: string,
  ) {
    const me = req.person!.id;
    const horizon = Math.min(Math.max(Number(days) || 14, 1), 60);
    const until = new Date(Date.now() + horizon * 86_400_000);

    const classes = await this.prisma.class.findMany({
      where: {
        cancelled: false,
        date: { gte: new Date(), lte: until },
        slot: {
          ...(academyId ? { academyId } : {}),
          ...(styleId ? { OR: [{ styleId }, { series: { styleId } }] } : {}),
          series: {
            active: true,
            ...(levelId ? { levelId } : {}),
          },
        },
      },
      orderBy: { date: "asc" },
      take: 200,
      select: {
        id: true,
        date: true,
        instructorId: true,
        slot: {
          select: {
            weekday: true,
            startTime: true,
            endTime: true,
            capacity: true,
            academy: { select: { id: true, name: true } },
            series: {
              select: {
                id: true,
                name: true,
                level: { select: { id: true, name: true } },
                style: { select: { id: true, name: true } },
                types: {
                  include: { type: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
        bookings: {
          where: { status: { in: ["BOOKED", "WAITLIST"] } },
          select: { personId: true, status: true },
        },
      },
    });

    const weekdayFilter =
      weekday !== undefined && weekday !== "" ? Number(weekday) : null;
    const instructorIds = [
      ...new Set(classes.map((c) => c.instructorId).filter(Boolean)),
    ] as string[];
    const instructors = instructorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true },
        })
      : [];
    const instructorName = new Map(instructors.map((i) => [i.id, i.name]));

    return classes
      .filter((c) => weekdayFilter === null || c.slot.weekday === weekdayFilter)
      .map((c) => {
        const booked = c.bookings.filter((b) => b.status === "BOOKED").length;
        const mine = c.bookings.find((b) => b.personId === me);
        return {
          id: c.id,
          date: c.date,
          startTime: c.slot.startTime,
          endTime: c.slot.endTime,
          weekday: c.slot.weekday,
          capacity: c.slot.capacity,
          bookedCount: booked,
          spotsLeft: Math.max(c.slot.capacity - booked, 0),
          waitlistCount: c.bookings.filter((b) => b.status === "WAITLIST")
            .length,
          myBooking: mine?.status ?? null,
          academy: c.slot.academy,
          instructor: c.instructorId
            ? { id: c.instructorId, name: instructorName.get(c.instructorId) ?? null }
            : null,
          series: c.slot.series
            ? {
                id: c.slot.series.id,
                name: c.slot.series.name,
                level: c.slot.series.level,
                style: c.slot.series.style,
                types: c.slot.series.types.map((t) => t.type),
              }
            : null,
        };
      });
  }

  /** Mis reservas activas (BOOKED/WAITLIST) en clases futuras. */
  @Get("mine")
  async mine(@Req() req: Request) {
    const rows = await this.prisma.classBooking.findMany({
      where: {
        personId: req.person!.id,
        status: { in: ["BOOKED", "WAITLIST"] },
        class: { date: { gte: new Date() }, cancelled: false },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        class: {
          select: {
            id: true,
            date: true,
            slot: {
              select: {
                startTime: true,
                endTime: true,
                academy: { select: { id: true, name: true } },
                series: {
                  select: {
                    name: true,
                    level: { select: { name: true } },
                    style: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return rows.map((r) => ({
      bookingId: r.id,
      status: r.status,
      classId: r.class.id,
      date: r.class.date,
      startTime: r.class.slot.startTime,
      endTime: r.class.slot.endTime,
      academy: r.class.slot.academy,
      series: r.class.slot.series,
    }));
  }

  /**
   * Reservar: cupo libre → BOOKED; lleno → WAITLIST (orden de llegada).
   * Re-reservar una reserva cancelada reactiva la misma fila.
   */
  @Post(":id/book")
  async book(@Param("id") classId: string, @Req() req: Request) {
    const me = req.person!.id;
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        cancelled: true,
        slot: { select: { capacity: true } },
      },
    });
    if (!cls) throw new NotFoundException("clase no encontrada");
    if (cls.cancelled) throw new BadRequestException("la clase fue cancelada");
    if (cls.date < new Date()) {
      throw new BadRequestException("la clase ya pasó");
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.classBooking.findUnique({
        where: { classId_personId: { classId, personId: me } },
      });
      if (existing && existing.status !== "CANCELLED") {
        throw new ConflictException("ya tienes una reserva en esta clase");
      }

      const booked = await tx.classBooking.count({
        where: { classId, status: "BOOKED" },
      });
      const status = booked < cls.slot.capacity ? "BOOKED" : "WAITLIST";

      if (existing) {
        return tx.classBooking.update({
          where: { id: existing.id },
          data: { status, createdAt: new Date() },
        });
      }
      return tx.classBooking.create({
        data: { classId, personId: me, status },
      });
    });
  }

  /**
   * Cancelar mi reserva. Si era BOOKED, el primer WAITLIST se promueve
   * a BOOKED y se le notifica.
   */
  @Delete(":id/book")
  @HttpCode(200)
  async cancel(@Param("id") classId: string, @Req() req: Request) {
    const me = req.person!.id;
    const booking = await this.prisma.classBooking.findUnique({
      where: { classId_personId: { classId, personId: me } },
    });
    if (!booking || booking.status === "CANCELLED") {
      throw new NotFoundException("no tienes reserva activa en esta clase");
    }

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.classBooking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED" },
      });

      if (booking.status === "BOOKED") {
        const next = await tx.classBooking.findFirst({
          where: { classId, status: "WAITLIST" },
          orderBy: { createdAt: "asc" },
        });
        if (next) {
          await tx.classBooking.update({
            where: { id: next.id },
            data: { status: "BOOKED" },
          });
          const cls = await tx.class.findUnique({
            where: { id: classId },
            select: {
              date: true,
              slot: {
                select: {
                  series: { select: { name: true } },
                  academy: { select: { name: true } },
                },
              },
            },
          });
          await this.notifications.notifySafe(next.personId, {
            category: "SOCIAL",
            type: "class.waitlist.promoted",
            title: `Se liberó un cupo en ${cls?.slot.series?.name ?? cls?.slot.academy.name ?? "tu clase"}`,
            data: { classId, bookingId: next.id },
          });
        }
      }
      return cancelled;
    });
  }
}
