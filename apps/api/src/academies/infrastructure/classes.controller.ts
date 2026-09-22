import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
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
import type { Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import { effectiveCapacity } from "../domain/academy.service";
import { AcademyAccess } from "./academy-access.service";

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
    private readonly access: AcademyAccess,
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
   *
   * Incluye dos orígenes: (a) clases de series activas y (b) clases de
   * slots "legacy" sin serie (ClassSlot.seriesId null, materializadas al
   * registrar asistencia) de academias activas — estas responden con
   * `series: null`. Los slots legacy no tienen levelId ni serie, así que
   * con filtro levelId quedan excluidos; con styleId filtran por su
   * propio slot.styleId.
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

    const slotBranches: Prisma.ClassSlotWhereInput[] = [
      {
        ...(styleId
          ? { OR: [{ styleId }, { series: { styleId } }] }
          : {}),
        series: {
          active: true,
          ...(levelId ? { levelId } : {}),
        },
      },
    ];
    // Legacy: slots sueltos sin serie. Sin nivel propio → no aplican
    // cuando el usuario filtra por levelId.
    if (!levelId) {
      slotBranches.push({
        seriesId: null,
        academy: { active: true },
        ...(styleId ? { styleId } : {}),
      });
    }

    const classes = await this.prisma.class.findMany({
      where: {
        cancelled: false,
        date: { gte: new Date(), lte: until },
        slot: {
          ...(academyId ? { academyId } : {}),
          OR: slotBranches,
        },
      },
      orderBy: { date: "asc" },
      take: 200,
      select: {
        id: true,
        date: true,
        instructorId: true,
        capacity: true,
        slot: {
          select: {
            weekday: true,
            startTime: true,
            endTime: true,
            capacity: true,
            types: {
              include: { type: { select: { id: true, name: true } } },
            },
            academy: {
              select: { id: true, name: true, defaultQuorum: true },
            },
            series: {
              select: {
                id: true,
                name: true,
                quorum: true,
                dropInPrice: true,
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
        // Quórum efectivo ya resuelto: class → slot → serie → academia → 20.
        const capacity = effectiveCapacity({
          classCapacity: c.capacity,
          slotCapacity: c.slot.capacity,
          seriesQuorum: c.slot.series?.quorum,
          academyDefaultQuorum: c.slot.academy.defaultQuorum,
        });
        return {
          id: c.id,
          date: c.date,
          startTime: c.slot.startTime,
          endTime: c.slot.endTime,
          weekday: c.slot.weekday,
          capacity,
          bookedCount: booked,
          spotsLeft: Math.max(capacity - booked, 0),
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
                dropInPrice: c.slot.series.dropInPrice,
                // Modalidad efectiva: el horario propio gana sobre la serie
                // (slot.types vacío = hereda series.types).
                types: (c.slot.types.length
                  ? c.slot.types
                  : c.slot.series.types
                ).map((t) => t.type),
              }
            : null,
        };
      });
  }

  /** Mis reservas activas (BOOKED/WAITLIST) en clases futuras. */
  @Get("mine")
  async mine(@Req() req: Request, @Query("scope") scope?: string) {
    if (scope === "past") return this.history(req.person!.id);
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
   * Historial del alumno (spec §9): clases pasadas con reserva o
   * asistencia. Dedup por classId — la asistencia prevalece sobre la
   * reserva (misma regla que la ficha del alumno del owner). Últimas 50.
   */
  private async history(personId: string) {
    const classSelect = {
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
    } as const;
    const now = new Date();
    const [attendances, bookings] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { personId, class: { date: { lt: now } } },
        select: { class: { select: classSelect } },
      }),
      this.prisma.classBooking.findMany({
        where: { personId, class: { date: { lt: now } } },
        select: {
          status: true,
          class: { select: classSelect },
        },
      }),
    ]);

    const past = new Map<
      string,
      {
        classId: string;
        date: Date;
        startTime: string;
        endTime: string;
        academy: { id: string; name: string };
        series: {
          name: string;
          level: { name: string } | null;
          style: { name: string } | null;
        } | null;
        status: "attended" | "booked" | "cancelled";
      }
    >();
    const put = (
      c: (typeof bookings)[number]["class"],
      status: "attended" | "booked" | "cancelled",
    ) =>
      past.set(c.id, {
        classId: c.id,
        date: c.date,
        startTime: c.slot.startTime,
        endTime: c.slot.endTime,
        academy: c.slot.academy,
        series: c.slot.series,
        status,
      });
    for (const b of bookings) {
      put(b.class, b.status === "BOOKED" ? "booked" : "cancelled");
    }
    for (const a of attendances) {
      put(a.class, "attended"); // la asistencia gana el dedup
    }
    return [...past.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 50);
  }

  /**
   * Consola del instructor: clases futuras (~30 días) donde es profesor —
   * por override de la instancia (class.instructorId), del slot o de la
   * serie. Requiere rol INSTRUCTOR aprobado, membresía AcademyInstructor
   * o admin.access.
   */
  @Get("teaching")
  async teaching(@Req() req: Request) {
    const me = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
      "admin.access",
    ]);
    const membership = me.roles.includes("INSTRUCTOR")
      ? true
      : !!(await this.prisma.academyInstructor.findFirst({
          where: { personId: me.id },
          select: { id: true },
        }));
    if (!isAdmin && !membership) {
      throw new ForbiddenException(
        "requiere rol INSTRUCTOR o ser instructor de una academia",
      );
    }

    const until = new Date(Date.now() + 30 * 86_400_000);
    const classes = await this.prisma.class.findMany({
      where: {
        cancelled: false,
        date: { gte: new Date(), lte: until },
        OR: [
          { instructorId: me.id },
          { slot: { instructorId: me.id } },
          { slot: { series: { instructorId: me.id } } },
        ],
      },
      orderBy: { date: "asc" },
      take: 200,
      select: {
        id: true,
        date: true,
        instructorId: true,
        capacity: true,
        slot: {
          select: {
            startTime: true,
            endTime: true,
            capacity: true,
            instructorId: true,
            styleId: true,
            academy: {
              select: { name: true, defaultQuorum: true },
            },
            series: {
              select: {
                name: true,
                quorum: true,
                instructorId: true,
                styleId: true,
                style: { select: { name: true } },
                level: { select: { name: true } },
              },
            },
          },
        },
        bookings: {
          where: { status: { in: ["BOOKED", "WAITLIST"] } },
          select: { status: true },
        },
      },
    });

    // instructorId/styleId son FKs planas en slot/series — join manual.
    const instructorIds = [
      ...new Set(
        classes
          .map(
            (c) =>
              c.instructorId ??
              c.slot.instructorId ??
              c.slot.series?.instructorId,
          )
          .filter((x): x is string => !!x),
      ),
    ];
    const styleIds = [
      ...new Set(
        classes
          .map((c) => c.slot.series?.styleId ?? c.slot.styleId)
          .filter((x): x is string => !!x),
      ),
    ];
    const [people, styles] = await Promise.all([
      instructorIds.length
        ? this.prisma.person.findMany({
            where: { id: { in: instructorIds } },
            select: { id: true, name: true },
          })
        : [],
      styleIds.length
        ? this.prisma.style.findMany({
            where: { id: { in: styleIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const personName = new Map(people.map((p) => [p.id, p.name]));
    const styleName = new Map(styles.map((s) => [s.id, s.name]));

    return classes.map((c) => {
      const instructorId =
        c.instructorId ?? c.slot.instructorId ?? c.slot.series?.instructorId;
      const styleId = c.slot.series?.styleId ?? c.slot.styleId;
      return {
        id: c.id,
        date: c.date,
        startTime: c.slot.startTime,
        endTime: c.slot.endTime,
        academyName: c.slot.academy.name,
        seriesName: c.slot.series?.name ?? null,
        styleName:
          c.slot.series?.style?.name ??
          (styleId ? (styleName.get(styleId) ?? null) : null),
        levelName: c.slot.series?.level?.name ?? null,
        instructorName: instructorId
          ? (personName.get(instructorId) ?? null)
          : null,
        quorum: effectiveCapacity({
          classCapacity: c.capacity,
          slotCapacity: c.slot.capacity,
          seriesQuorum: c.slot.series?.quorum,
          academyDefaultQuorum: c.slot.academy.defaultQuorum,
        }),
        bookedCount: c.bookings.filter((b) => b.status === "BOOKED").length,
        waitlistCount: c.bookings.filter((b) => b.status === "WAITLIST")
          .length,
      };
    });
  }

  /**
   * Roster de una clase: detalle + reservas BOOKED/WAITLIST con el nombre
   * del alumno. Gestión de la academia dueña del slot (requireManage:
   * owner / instructor / ADMIN).
   */
  @Get(":id/roster")
  async roster(@Param("id") classId: string, @Req() req: Request) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        instructorId: true,
        capacity: true,
        slot: {
          select: {
            academyId: true,
            startTime: true,
            endTime: true,
            capacity: true,
            instructorId: true,
            academy: { select: { defaultQuorum: true } },
            series: {
              select: {
                name: true,
                quorum: true,
                instructorId: true,
                style: { select: { name: true } },
                level: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!cls) throw new NotFoundException("clase no encontrada");
    await this.access.requireManage(cls.slot.academyId, req.person!);

    const bookings = await this.prisma.classBooking.findMany({
      where: { classId, status: { in: ["BOOKED", "WAITLIST"] } },
      orderBy: { createdAt: "asc" },
      select: { personId: true, status: true, createdAt: true },
    });
    // ClassBooking.personId es FK plana — join manual (mismo patrón que
    // GET /academies/:id/students).
    const instructorId =
      cls.instructorId ?? cls.slot.instructorId ?? cls.slot.series?.instructorId;
    const personIds = [
      ...new Set([
        ...bookings.map((b) => b.personId),
        ...(instructorId ? [instructorId] : []),
      ]),
    ];
    const people = personIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, name: true },
        })
      : [];
    const personName = new Map(people.map((p) => [p.id, p.name]));

    const toRow = (b: (typeof bookings)[number]) => ({
      personId: b.personId,
      name: personName.get(b.personId) ?? null,
      createdAt: b.createdAt,
    });
    return {
      class: {
        id: cls.id,
        date: cls.date,
        startTime: cls.slot.startTime,
        endTime: cls.slot.endTime,
        seriesName: cls.slot.series?.name ?? null,
        styleName: cls.slot.series?.style?.name ?? null,
        levelName: cls.slot.series?.level?.name ?? null,
        instructor: instructorId
          ? { id: instructorId, name: personName.get(instructorId) ?? null }
          : null,
      },
      quorum: effectiveCapacity({
        classCapacity: cls.capacity,
        slotCapacity: cls.slot.capacity,
        seriesQuorum: cls.slot.series?.quorum,
        academyDefaultQuorum: cls.slot.academy.defaultQuorum,
      }),
      booked: bookings.filter((b) => b.status === "BOOKED").map(toRow),
      waitlist: bookings.filter((b) => b.status === "WAITLIST").map(toRow),
    };
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
        capacity: true,
        slot: {
          select: {
            capacity: true,
            series: { select: { quorum: true } },
            academy: { select: { defaultQuorum: true } },
          },
        },
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
      const quorum = effectiveCapacity({
        classCapacity: cls.capacity,
        slotCapacity: cls.slot.capacity,
        seriesQuorum: cls.slot.series?.quorum,
        academyDefaultQuorum: cls.slot.academy.defaultQuorum,
      });
      const status = booked < quorum ? "BOOKED" : "WAITLIST";

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
