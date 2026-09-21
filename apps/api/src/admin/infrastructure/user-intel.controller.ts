import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsNotEmpty, IsString, Matches } from "class-validator";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { effectiveCapacity } from "../../academies/domain/academy.service";

const DAY_MS = 86_400_000;
const ROLE_KEY = /^[A-Z0-9_]+$/;

/** Primer día del mes calendario en curso (para métricas "del mes"). */
const monthStart = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1);

class AnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(ROLE_KEY, { message: "rol inválido" })
  role!: string;
}

type EventLite = { id: string; name: string; startsAt: Date };

/**
 * Intel de usuarios para la consola admin: ficha 360° por persona
 * (detail) y analítica por lente de rol (analytics). Read-only; la
 * gestión de roles sigue en AdminController.
 *
 * Notas de schema (Ticket/Checkin/StaffAssignment/Payment/VenueRental
 * no declaran relaciones Prisma — eventId/personId son FKs peladas):
 * los nombres de evento/persona se resuelven con lookups batch.
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class UserIntelController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Ficha 360° ──────────────────────────────────────────────────────

  /**
   * GET /api/admin/users/:personId/detail — datos personales (nunca
   * passwordHash/qrSecret), línea de tiempo de roles y un bloque de
   * roleData por cada rol con status ≠ REJECTED.
   */
  @Get("users/:personId/detail")
  async detail(@Param("personId") personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        photoUrl: true,
        isLightAccount: true,
        verifiedAt: true,
        createdAt: true,
        roles: {
          select: { id: true, role: true, status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!person) throw new NotFoundException("usuario no encontrado");

    const { roles, ...personData } = person;
    const held = new Set(
      roles.filter((r) => r.status !== "REJECTED").map((r) => r.role),
    );

    const roleData: Record<string, unknown> = {};
    if (held.has("DANCER")) roleData.DANCER = await this.dancerData(personId);
    if (held.has("PRODUCER"))
      roleData.PRODUCER = await this.producerData(personId);
    if (held.has("STAFF")) roleData.STAFF = await this.staffData(personId);
    if (held.has("INSTRUCTOR"))
      roleData.INSTRUCTOR = await this.instructorData(personId);
    if (held.has("ACADEMY_OWNER"))
      roleData.ACADEMY_OWNER = await this.academyOwnerData(personId);
    if (held.has("DJ")) roleData.DJ = await this.djData(personId);
    if (held.has("VENUE_MANAGER"))
      roleData.VENUE_MANAGER = await this.venueManagerData(personId);
    // Roles sin bloque propio (SUPPORT, ADMIN, customs) → objeto vacío.
    for (const role of held) {
      if (!(role in roleData)) roleData[role] = {};
    }

    return { person: personData, roles, roleData };
  }

  // ── Analítica por usuario ───────────────────────────────────────────

  /**
   * GET /api/admin/users/:personId/analytics?role=X — sections por lente.
   * Rol no poseído (sin PersonRole APPROVED/SANDBOX) → 400 ROLE_NOT_HELD.
   */
  @Get("users/:personId/analytics")
  async analytics(
    @Param("personId") personId: string,
    @Query() q: AnalyticsQueryDto,
  ) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, createdAt: true },
    });
    if (!person) throw new NotFoundException("usuario no encontrado");

    const held = await this.prisma.personRole.findFirst({
      where: {
        personId,
        role: q.role,
        status: { in: ["APPROVED", "SANDBOX"] },
      },
      select: { id: true },
    });
    if (!held) throw new BadRequestException({ error: "ROLE_NOT_HELD" });

    const sections = await this.sectionsFor(q.role, person);
    return { role: q.role, sections };
  }

  private sectionsFor(
    role: string,
    person: { id: string; createdAt: Date },
  ): Promise<Record<string, unknown>> {
    switch (role) {
      case "DANCER":
        return this.dancerSections(person.id);
      case "PRODUCER":
        return this.producerSections(person.id);
      case "STAFF":
        return this.staffSections(person.id);
      case "INSTRUCTOR":
        return this.instructorSections(person.id);
      case "DJ":
        return this.djSections(person.id);
      case "VENUE_MANAGER":
        return this.venueManagerSections(person.id);
      case "ACADEMY_OWNER":
        return this.academyOwnerSections(person.id);
      default:
        // SUPPORT/ADMIN (y roles custom poseídos) → meta de cuenta.
        return this.metaSections(person);
    }
  }

  // ── roleData (detail) ───────────────────────────────────────────────

  private async dancerData(personId: string) {
    const now = new Date();
    const [tickets, dancesCount, checkinsCount] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { ownerId: personId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, status: true, listPrice: true, eventId: true },
      }),
      // Misma definición que home: sesiones confirmadas en adelante.
      this.prisma.danceSession.count({
        where: {
          OR: [{ inviterId: personId }, { inviteeId: personId }],
          status: { in: ["CONFIRMED", "RATED", "CLOSED"] },
        },
      }),
      this.prisma.checkin.count({
        where: { personId, voidedAt: null },
      }),
    ]);
    const events = await this.eventsByIds(tickets.map((t) => t.eventId));
    const rows = tickets.map((t) => ({
      id: t.id,
      status: t.status,
      listPrice: t.listPrice,
      event: events.get(t.eventId) ?? null,
    }));
    const at = (r: { event: EventLite | null }) =>
      r.event?.startsAt.getTime() ?? 0;
    return {
      ticketsUpcoming: rows
        .filter((r) => r.event && r.event.startsAt >= now)
        .sort((a, b) => at(a) - at(b)),
      ticketsPast: rows
        .filter((r) => !r.event || r.event.startsAt < now)
        .sort((a, b) => at(b) - at(a)),
      dancesCount,
      checkinsCount,
    };
  }

  private async producerData(personId: string) {
    const now = new Date();
    const events = await this.prisma.event.findMany({
      where: { producerId: personId },
      orderBy: { startsAt: "desc" },
      take: 200,
      select: { id: true, name: true, startsAt: true, status: true },
    });
    return {
      eventsUpcoming: events
        .filter((e) => e.startsAt >= now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
      eventsPast: events.filter((e) => e.startsAt < now),
    };
  }

  private async staffData(personId: string) {
    const assignments = await this.prisma.staffAssignment.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, role: true, eventId: true },
    });
    const events = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(assignments.map((a) => a.eventId))] } },
      select: { id: true, name: true, startsAt: true, producerId: true },
    });
    const producerIds = [
      ...new Set(
        events.map((e) => e.producerId).filter((p): p is string => !!p),
      ),
    ];
    const producers = await this.peopleByIds(producerIds);
    const eventOf = new Map(events.map((e) => [e.id, e]));
    return {
      assignments: assignments.map((a) => {
        const e = eventOf.get(a.eventId);
        return {
          id: a.id,
          role: a.role,
          event: e
            ? {
                id: e.id,
                name: e.name,
                startsAt: e.startsAt,
                producer: e.producerId
                  ? (producers.get(e.producerId) ?? null)
                  : null,
              }
            : null,
        };
      }),
    };
  }

  private async instructorData(personId: string) {
    const now = new Date();
    const instructorWhere = {
      OR: [
        { instructorId: personId },
        { slot: { instructorId: personId } },
      ],
    };
    const [memberships, upcoming, classesPastCount] = await Promise.all([
      this.prisma.academyInstructor.findMany({
        where: { personId },
        select: { academy: { select: { id: true, name: true } } },
      }),
      this.prisma.class.findMany({
        where: { ...instructorWhere, date: { gte: now }, cancelled: false },
        orderBy: { date: "asc" },
        take: 50,
        select: {
          id: true,
          date: true,
          slot: {
            select: {
              styleId: true,
              academy: { select: { id: true, name: true } },
              series: { select: { style: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.class.count({
        where: { ...instructorWhere, date: { lt: now }, cancelled: false },
      }),
    ]);
    const styleNames = await this.styleNamesByIds(
      upcoming
        .map((c) => c.slot.styleId)
        .filter((s): s is string => !!s),
    );
    return {
      academies: memberships.map((m) => m.academy),
      // Class.date se expone como startsAt (instante de la clase).
      classesUpcoming: upcoming.map((c) => ({
        id: c.id,
        startsAt: c.date,
        style: c.slot.styleId
          ? (styleNames.get(c.slot.styleId) ?? null)
          : (c.slot.series?.style?.name ?? null),
        academy: c.slot.academy,
      })),
      classesPastCount,
    };
  }

  private async academyOwnerData(personId: string) {
    const academies = await this.prisma.academy.findMany({
      where: { ownerId: personId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return {
      academies: await Promise.all(
        academies.map(async (a) => ({
          id: a.id,
          name: a.name,
          studentsCount: await this.prisma.enrollment.count({
            where: { academyId: a.id, status: "ACTIVE" },
          }),
        })),
      ),
    };
  }

  private async djData(personId: string) {
    const now = new Date();
    const gigs = await this.prisma.eventDj.findMany({
      where: { personId },
      orderBy: { event: { startsAt: "desc" } },
      take: 200,
      select: {
        id: true,
        event: { select: { id: true, name: true, startsAt: true } },
      },
    });
    const rows = gigs.map((g) => ({ id: g.id, event: g.event }));
    return {
      gigsUpcoming: rows
        .filter((g) => g.event.startsAt >= now)
        .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime()),
      gigsPast: rows.filter((g) => g.event.startsAt < now),
    };
  }

  private async venueManagerData(personId: string) {
    const venues = await this.prisma.venue.findMany({
      where: { ownerId: personId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const rentals = venues.length
      ? await this.prisma.venueRental.findMany({
          where: { venueId: { in: venues.map((v) => v.id) } },
          orderBy: { date: "desc" },
          take: 50,
          select: {
            id: true,
            date: true,
            status: true,
            venue: { select: { id: true, name: true } },
          },
        })
      : [];
    return { venues, rentals };
  }

  // ── sections (analytics) ────────────────────────────────────────────

  private async dancerSections(personId: string) {
    const now = new Date();
    const mStart = monthStart(now);
    const [payments, checkins, dancesCount, personBadges, season] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: { personId, status: "PAID" },
          select: { amount: true, createdAt: true },
        }),
        this.prisma.checkin.findMany({
          where: { personId, voidedAt: null },
          orderBy: { inAt: "desc" },
          select: { eventId: true, inAt: true },
        }),
        this.prisma.danceSession.count({
          where: {
            OR: [{ inviterId: personId }, { inviteeId: personId }],
            status: { in: ["CONFIRMED", "RATED", "CLOSED"] },
          },
        }),
        this.prisma.personBadge.findMany({
          where: { personId },
          select: { badgeId: true },
        }),
        this.prisma.season.findFirst({
          where: { startsAt: { lte: now }, endsAt: { gte: now } },
          select: { id: true },
        }),
      ]);

    const totalSpentClp = payments.reduce((a, p) => a + p.amount, 0);
    const monthSpentClp = payments
      .filter((p) => p.createdAt >= mStart)
      .reduce((a, p) => a + p.amount, 0);
    // Promedio por mes calendario desde el primer pago PAID (0 sin pagos).
    const first = payments.reduce<Date | null>(
      (acc, p) => (acc && acc < p.createdAt ? acc : p.createdAt),
      null,
    );
    const months = first
      ? (now.getFullYear() - first.getFullYear()) * 12 +
        (now.getMonth() - first.getMonth()) +
        1
      : 0;
    const monthlyAvgClp = months > 0 ? Math.round(totalSpentClp / months) : 0;

    const events = await this.eventsByIds(checkins.map((c) => c.eventId));
    const lastCheckin = checkins[0];
    const attendances = new Map<string, number>();
    for (const c of checkins) {
      attendances.set(c.eventId, (attendances.get(c.eventId) ?? 0) + 1);
    }
    const favoriteEvents = [...attendances.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([eventId, count]) => ({
        eventId,
        name: events.get(eventId)?.name ?? "?",
        attendances: count,
      }));
    // Hora promedio de llegada (decimal, TZ del servidor), redondeada a 0.1.
    const avgCheckinHour = checkins.length
      ? Math.round(
          (checkins.reduce(
            (a, c) => a + c.inAt.getHours() + c.inAt.getMinutes() / 60,
            0,
          ) /
            checkins.length) *
            10,
        ) / 10
      : null;

    const pointsAgg = await this.prisma.pointLedger.aggregate({
      where: season ? { personId, seasonId: season.id } : { personId },
      _sum: { points: true },
    });
    const seasonPoints = pointsAgg._sum.points ?? 0;
    // Posición en la temporada activa: no hay leaderboard global
    // reutilizable (gamification solo expone leaderboard por evento),
    // así que se deriva del PointLedger. null sin temporada activa.
    let rank: number | null = null;
    if (season) {
      const above = await this.prisma.pointLedger.groupBy({
        by: ["personId"],
        where: { seasonId: season.id },
        _sum: { points: true },
        having: { points: { _sum: { gt: seasonPoints } } },
      });
      rank = above.length + 1;
    }

    const badgeRows = personBadges.length
      ? await this.prisma.badge.findMany({
          where: { id: { in: personBadges.map((b) => b.badgeId) } },
          select: { key: true, name: true },
        })
      : [];

    const social = {
      totalSpentClp,
      monthSpentClp,
      monthlyAvgClp,
      lastEvent: lastCheckin
        ? (events.get(lastCheckin.eventId) ?? null)
        : null,
      favoriteEvents,
      avgCheckinHour,
      dancesCount,
      seasonPoints,
      rank,
      badges: badgeRows,
    };

    return { social, academy: await this.dancerAcademySection(personId) };
  }

  private async dancerAcademySection(personId: string) {
    const now = new Date();
    const [enrollments, attendances, classesUpcoming, paidAgg] =
      await Promise.all([
        // "Activas" = membresías vigentes: ACTIVE + TRIAL + ONLINE.
        this.prisma.enrollment.findMany({
          where: {
            personId,
            status: { in: ["ACTIVE", "TRIAL", "ONLINE"] },
          },
          select: {
            status: true,
            academy: { select: { id: true, name: true } },
            plan: { select: { name: true, price: true, type: true } },
          },
        }),
        this.prisma.attendance.findMany({
          where: { personId },
          select: {
            class: {
              select: {
                slot: {
                  select: {
                    academyId: true,
                    styleId: true,
                    series: { select: { styleId: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.classBooking.count({
          where: {
            personId,
            status: "BOOKED",
            class: { date: { gte: now } },
          },
        }),
        // Gasto del lado academia (preventas nightlife van en social).
        this.prisma.payment.aggregate({
          where: {
            personId,
            status: "PAID",
            orderType: { in: ["MEMBERSHIP", "PRIVATE_LESSON", "WORKSHOP"] },
          },
          _sum: { amount: true },
        }),
      ]);

    const academyCounts = new Map<string, number>();
    const styleCounts = new Map<string, number>();
    for (const a of attendances) {
      const slot = a.class.slot;
      academyCounts.set(
        slot.academyId,
        (academyCounts.get(slot.academyId) ?? 0) + 1,
      );
      const styleId = slot.styleId ?? slot.series?.styleId;
      if (styleId) {
        styleCounts.set(styleId, (styleCounts.get(styleId) ?? 0) + 1);
      }
    }
    const [academyRows, styleRows] = await Promise.all([
      this.prisma.academy.findMany({
        where: { id: { in: [...academyCounts.keys()] } },
        select: { id: true, name: true },
      }),
      this.prisma.style.findMany({
        where: { id: { in: [...styleCounts.keys()] } },
        select: { id: true, name: true, genre: true },
      }),
    ]);
    const academyName = new Map(academyRows.map((a) => [a.id, a.name]));
    const styleOf = new Map(styleRows.map((s) => [s.id, s]));

    const genreCounts = new Map<string, number>();
    for (const [styleId, count] of styleCounts) {
      const genre = styleOf.get(styleId)?.genre;
      if (genre) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + count);
    }

    return {
      activeEnrollments: enrollments.map((e) => ({
        academy: e.academy,
        plan: e.plan,
        status: e.status,
      })),
      classesTaken: attendances.length,
      classesUpcoming,
      // Suma de precios de planes MONTHLY vigentes (proyección mensual).
      currentMonthlyClp: enrollments.reduce(
        (a, e) => a + (e.plan?.type === "MONTHLY" ? e.plan.price : 0),
        0,
      ),
      totalPaidClp: paidAgg._sum.amount ?? 0,
      byAcademy: [...academyCounts.entries()].map(([id, count]) => ({
        name: academyName.get(id) ?? "?",
        count,
      })),
      byStyle: [...styleCounts.entries()].map(([id, count]) => ({
        name: styleOf.get(id)?.name ?? "?",
        count,
      })),
      byGenre: [...genreCounts.entries()].map(([genre, count]) => ({
        genre,
        count,
      })),
    };
  }

  private async producerSections(personId: string) {
    const now = new Date();
    const mStart = monthStart(now);
    const events = await this.prisma.event.findMany({
      where: { producerId: personId },
      select: { id: true, name: true, startsAt: true, capacity: true },
    });
    const ids = events.map((e) => e.id);
    if (!ids.length) {
      return {
        eventsTotal: 0,
        eventsUpcoming: 0,
        grossAllClp: 0,
        grossMonthClp: 0,
        ticketsSold: 0,
        avgOccupancyPct: null,
        topEvents: [],
      };
    }
    const [grossAll, grossMonth, grossByEvent, soldByEvent] =
      await Promise.all([
        this.prisma.payment.aggregate({
          where: {
            status: "PAID",
            orderType: "TICKET",
            eventId: { in: ids },
          },
          _sum: { amount: true },
        }),
        this.prisma.payment.aggregate({
          where: {
            status: "PAID",
            orderType: "TICKET",
            eventId: { in: ids },
            createdAt: { gte: mStart },
          },
          _sum: { amount: true },
        }),
        this.prisma.payment.groupBy({
          by: ["eventId"],
          where: {
            status: "PAID",
            orderType: "TICKET",
            eventId: { in: ids },
          },
          _sum: { amount: true },
        }),
        this.prisma.ticket.groupBy({
          by: ["eventId"],
          where: { eventId: { in: ids }, status: { not: "CANCELLED" } },
          _count: true,
        }),
      ]);
    const grossOf = new Map(
      grossByEvent.map((g) => [g.eventId, g._sum.amount ?? 0]),
    );
    const soldOf = new Map(soldByEvent.map((t) => [t.eventId, t._count]));
    const ticketsSold = [...soldOf.values()].reduce((a, n) => a + n, 0);

    const withCapacity = events.filter((e) => e.capacity && e.capacity > 0);
    const avgOccupancyPct = withCapacity.length
      ? Math.round(
          (withCapacity.reduce(
            (a, e) => a + (soldOf.get(e.id) ?? 0) / e.capacity!,
            0,
          ) /
            withCapacity.length) *
            100,
        )
      : null;

    const topEvents = [...grossOf.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, grossClp]) => ({
        id,
        name: events.find((e) => e.id === id)?.name ?? "?",
        grossClp,
      }));

    return {
      eventsTotal: events.length,
      eventsUpcoming: events.filter((e) => e.startsAt >= now).length,
      grossAllClp: grossAll._sum.amount ?? 0,
      grossMonthClp: grossMonth._sum.amount ?? 0,
      ticketsSold,
      avgOccupancyPct,
      topEvents,
    };
  }

  private async staffSections(personId: string) {
    const now = new Date();
    const assignments = await this.prisma.staffAssignment.findMany({
      where: { personId },
      select: { eventId: true },
    });
    const events = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(assignments.map((a) => a.eventId))] } },
      select: { id: true, startsAt: true, producerId: true },
    });
    const shiftsByProducer = new Map<string, number>();
    let eventsWorked = 0;
    let upcomingShifts = 0;
    for (const e of events) {
      if (e.producerId) {
        shiftsByProducer.set(
          e.producerId,
          (shiftsByProducer.get(e.producerId) ?? 0) + 1,
        );
      }
      if (e.startsAt >= now) upcomingShifts += 1;
      else eventsWorked += 1;
    }
    const producers = await this.peopleByIds([...shiftsByProducer.keys()]);
    return {
      producers: [...shiftsByProducer.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, shifts]) => ({
          id,
          name: producers.get(id)?.name ?? "?",
          shifts,
        })),
      eventsWorked,
      upcomingShifts,
    };
  }

  private async instructorSections(personId: string) {
    const now = new Date();
    const [memberships, classes] = await Promise.all([
      this.prisma.academyInstructor.findMany({
        where: { personId },
        select: { academy: { select: { id: true, name: true } } },
      }),
      this.prisma.class.findMany({
        where: {
          OR: [
            { instructorId: personId },
            { slot: { instructorId: personId } },
          ],
          cancelled: false,
        },
        select: {
          id: true,
          date: true,
          capacity: true,
          slot: {
            select: {
              capacity: true,
              series: { select: { quorum: true } },
              academy: { select: { defaultQuorum: true } },
            },
          },
        },
        take: 500,
      }),
    ]);
    const bookedByClass = classes.length
      ? await this.prisma.classBooking.groupBy({
          by: ["classId"],
          where: {
            classId: { in: classes.map((c) => c.id) },
            status: "BOOKED",
          },
          _count: true,
        })
      : [];
    const bookedOf = new Map(bookedByClass.map((b) => [b.classId, b._count]));
    // Ocupación promedio con la cadena de herencia real de cupos
    // (class → slot → serie → academia → 20).
    const fillPcts = classes.map(
      (c) =>
        (bookedOf.get(c.id) ?? 0) /
        effectiveCapacity({
          classCapacity: c.capacity,
          slotCapacity: c.slot.capacity,
          seriesQuorum: c.slot.series?.quorum,
          academyDefaultQuorum: c.slot.academy.defaultQuorum,
        }),
    );
    const avgFillPct = fillPcts.length
      ? Math.round(
          (fillPcts.reduce((a, n) => a + n, 0) / fillPcts.length) * 100,
        )
      : null;
    return {
      academies: memberships.map((m) => m.academy),
      classesTaught: classes.filter((c) => c.date < now).length,
      classesUpcoming: classes.filter((c) => c.date >= now).length,
      avgFillPct,
    };
  }

  private async djSections(personId: string) {
    const now = new Date();
    const gigs = await this.prisma.eventDj.findMany({
      where: { personId },
      select: {
        event: { select: { id: true, name: true, startsAt: true } },
      },
    });
    const upcoming = gigs
      .map((g) => g.event)
      .filter((e) => e.startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return {
      gigsTotal: gigs.length,
      gigsUpcoming: upcoming.length,
      events: upcoming.slice(0, 20),
    };
  }

  private async venueManagerSections(personId: string) {
    const venues = await this.prisma.venue.findMany({
      where: { ownerId: personId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const grouped = venues.length
      ? await this.prisma.venueRental.groupBy({
          by: ["status"],
          where: { venueId: { in: venues.map((v) => v.id) } },
          _count: true,
        })
      : [];
    const rentalsByStatus: Record<string, number> = {
      REQUESTED: 0,
      CONFIRMED: 0,
      CANCELLED: 0,
    };
    for (const g of grouped) rentalsByStatus[g.status] = g._count;
    return { venues, rentalsByStatus };
  }

  private async academyOwnerSections(personId: string) {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const academies = await this.prisma.academy.findMany({
      where: { ownerId: personId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const perAcademy = await Promise.all(
      academies.map(async (a) => {
        const [students, attendance30d, classes30d] = await Promise.all([
          this.prisma.enrollment.count({
            where: { academyId: a.id, status: "ACTIVE" },
          }),
          this.prisma.attendance.count({
            where: {
              class: { slot: { academyId: a.id } },
              checkedAt: { gte: since },
            },
          }),
          this.prisma.class.count({
            where: { slot: { academyId: a.id }, date: { gte: since } },
          }),
        ]);
        return { id: a.id, name: a.name, students, attendance30d, classes30d };
      }),
    );
    return { academies: perAcademy };
  }

  private async metaSections(person: { id: string; createdAt: Date }) {
    const roleHistory = await this.prisma.personRole.findMany({
      where: { personId: person.id },
      orderBy: { createdAt: "asc" },
      select: { role: true, status: true, createdAt: true },
    });
    return {
      meta: {
        accountAgeDays: Math.floor(
          (Date.now() - person.createdAt.getTime()) / DAY_MS,
        ),
        roleHistory,
      },
    };
  }

  // ── helpers ─────────────────────────────────────────────────────────

  /** Batch de eventos por ids (Ticket/Checkin no declaran relación). */
  private async eventsByIds(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, EventLite>();
    const events = await this.prisma.event.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, startsAt: true },
    });
    return new Map(events.map((e) => [e.id, e]));
  }

  private async peopleByIds(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, { id: string; name: string }>();
    const people = await this.prisma.person.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(people.map((p) => [p.id, p]));
  }

  private async styleNamesByIds(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, string>();
    const styles = await this.prisma.style.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(styles.map((s) => [s.id, s.name]));
  }
}
