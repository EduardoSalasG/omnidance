import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

/**
 * KPIs del home por rol activo. Ventanas "rolling" (últimos 7/30 días,
 * próximas 36h) en vez de calendario — evita edge cases de zona horaria
 * y para eventos sociales nocturnos describe mejor la actividad.
 */

type Kpi = { key: string; value: number; format?: "clp" };
type Tonight = {
  id: string;
  name: string;
  startsAt: Date;
  venueName: string | null;
  presalePrice: number | null;
  hasTicket: boolean;
};
type NextItem = {
  id: string;
  name: string;
  when: Date | string;
  place: string | null;
};

export type HomeStats = {
  kpis: Kpi[];
  tonight?: Tonight | null;
  nextClass?: NextItem | null;
  nextGig?: NextItem | null;
  nextShift?: NextItem | null;
  needsAcademy?: boolean;
};

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async statsFor(
    personId: string,
    role: string,
    mode: string,
  ): Promise<HomeStats> {
    // DANCER es lente universal; el resto solo si el rol está aprobado.
    const approved = await this.prisma.personRole.findMany({
      where: { personId, status: "APPROVED" },
      select: { role: true },
    });
    const held = new Set(approved.map((r) => r.role));
    const effective = role !== "DANCER" && held.has(role) ? role : "DANCER";

    switch (effective) {
      case "ADMIN":
        return this.adminStats();
      case "PRODUCER":
        return this.producerStats(personId);
      case "ACADEMY_OWNER":
        return this.academyOwnerStats(personId);
      case "INSTRUCTOR":
        return this.instructorStats(personId);
      case "VENUE_MANAGER":
        return this.venueStats(personId);
      case "DJ":
        return this.djStats(personId);
      case "STAFF":
        return this.staffStats(personId);
      default:
        return mode === "academy"
          ? this.dancerAcademyStats(personId)
          : this.dancerSocialStats(personId);
    }
  }

  /** Próximo evento publicado/live en las próximas ~36h + si ya tiene ticket. */
  private async tonightFor(personId: string): Promise<Tonight | null> {
    const soon = await this.prisma.event.findMany({
      where: {
        status: { in: ["PUBLISHED", "LIVE"] },
        startsAt: { gte: new Date(), lte: inDays(1.5) },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        startsAt: true,
        presalePrice: true,
        venue: { select: { name: true } },
      },
    });
    if (soon.length === 0) return null;
    const mine = await this.prisma.ticket.findMany({
      where: {
        ownerId: personId,
        status: "ACTIVE",
        eventId: { in: soon.map((e) => e.id) },
      },
      select: { eventId: true },
    });
    const withTicket = new Set(mine.map((t) => t.eventId));
    const pick = soon.find((e) => withTicket.has(e.id)) ?? soon[0];
    return {
      id: pick.id,
      name: pick.name,
      startsAt: pick.startsAt,
      venueName: pick.venue?.name ?? null,
      presalePrice: pick.presalePrice,
      hasTicket: withTicket.has(pick.id),
    };
  }

  private async dancerSocialStats(personId: string): Promise<HomeStats> {
    const [streak, points, badges, dances7d, tonight] = await Promise.all([
      this.prisma.streak.findFirst({
        where: { personId, type: "WEEKLY_OUT" },
        select: { count: true },
      }),
      this.prisma.pointLedger.aggregate({
        where: { personId },
        _sum: { points: true },
      }),
      this.prisma.personBadge.count({ where: { personId } }),
      this.prisma.danceSession.count({
        where: {
          OR: [{ inviterId: personId }, { inviteeId: personId }],
          status: { in: ["CONFIRMED", "RATED", "CLOSED"] },
          scannedAt: { gte: daysAgo(7) },
        },
      }),
      this.tonightFor(personId),
    ]);
    return {
      kpis: [
        { key: "streak", value: streak?.count ?? 0 },
        { key: "points", value: points._sum.points ?? 0 },
        { key: "badges", value: badges },
        { key: "dances7d", value: dances7d },
      ],
      tonight,
    };
  }

  private async dancerAcademyStats(personId: string): Promise<HomeStats> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { personId, status: { in: ["ACTIVE", "TRIAL", "ONLINE"] } },
      select: { academyId: true, academy: { select: { name: true } } },
    });
    if (enrollments.length === 0) {
      return { kpis: [], needsAcademy: true };
    }
    const academyIds = enrollments.map((e) => e.academyId);
    const [attendance30d, classesNext7d, nextClassRow] = await Promise.all([
      this.prisma.attendance.count({
        where: { personId, checkedAt: { gte: daysAgo(30) } },
      }),
      this.prisma.class.count({
        where: {
          cancelled: false,
          date: { gte: new Date(), lte: inDays(7) },
          slot: { academyId: { in: academyIds } },
        },
      }),
      this.prisma.class.findFirst({
        where: {
          cancelled: false,
          date: { gte: new Date() },
          slot: { academyId: { in: academyIds } },
        },
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          slot: {
            select: {
              startTime: true,
              academy: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    return {
      kpis: [
        { key: "enrollments", value: enrollments.length },
        { key: "attendance30d", value: attendance30d },
        { key: "classes7d", value: classesNext7d },
      ],
      nextClass: nextClassRow
        ? {
            id: nextClassRow.id,
            name: nextClassRow.slot.academy.name,
            when: nextClassRow.date,
            place: nextClassRow.slot.startTime,
          }
        : null,
    };
  }

  private async producerStats(personId: string): Promise<HomeStats> {
    const events = await this.prisma.event.findMany({
      where: {
        producerId: personId,
        status: { in: ["PUBLISHED", "LIVE"] },
        endsAt: { gte: new Date() },
      },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    const [ticketsSold, pendingPayouts] = await Promise.all([
      eventIds.length
        ? this.prisma.ticket.count({
            where: {
              eventId: { in: eventIds },
              status: { in: ["ACTIVE", "USED"] },
            },
          })
        : 0,
      this.prisma.payout.aggregate({
        where: { actorType: "PRODUCER", actorId: personId, status: "PENDING" },
        _count: true,
        _sum: { net: true },
      }),
    ]);
    return {
      kpis: [
        { key: "activeEvents", value: events.length },
        { key: "ticketsSold", value: ticketsSold },
        { key: "pendingPayouts", value: pendingPayouts._count },
        {
          key: "pendingPayoutNet",
          value: pendingPayouts._sum.net ?? 0,
          format: "clp",
        },
      ],
      tonight: await this.tonightFor(personId),
    };
  }

  private async adminStats(): Promise<HomeStats> {
    const [pendingRoles, users, activeEvents, pendingPayouts] =
      await Promise.all([
        this.prisma.personRole.count({ where: { status: "PENDING" } }),
        this.prisma.person.count(),
        this.prisma.event.count({
          where: {
            status: { in: ["PUBLISHED", "LIVE"] },
            endsAt: { gte: new Date() },
          },
        }),
        this.prisma.payout.count({ where: { status: "PENDING" } }),
      ]);
    return {
      kpis: [
        { key: "pendingRoles", value: pendingRoles },
        { key: "users", value: users },
        { key: "activeEvents", value: activeEvents },
        { key: "pendingPayouts", value: pendingPayouts },
      ],
    };
  }

  private async academyOwnerStats(personId: string): Promise<HomeStats> {
    const academies = await this.prisma.academy.findMany({
      where: { ownerId: personId, active: true },
      select: { id: true },
    });
    const ids = academies.map((a) => a.id);
    if (ids.length === 0) return { kpis: [] };
    const [students, classesNext7d, attendance7d] = await Promise.all([
      this.prisma.enrollment.count({
        where: { academyId: { in: ids }, status: "ACTIVE" },
      }),
      this.prisma.class.count({
        where: {
          cancelled: false,
          date: { gte: new Date(), lte: inDays(7) },
          slot: { academyId: { in: ids } },
        },
      }),
      this.prisma.attendance.count({
        where: {
          checkedAt: { gte: daysAgo(7) },
          class: { slot: { academyId: { in: ids } } },
        },
      }),
    ]);
    return {
      kpis: [
        { key: "academies", value: ids.length },
        { key: "students", value: students },
        { key: "classes7d", value: classesNext7d },
        { key: "attendance7d", value: attendance7d },
      ],
    };
  }

  private async instructorStats(personId: string): Promise<HomeStats> {
    const slots = await this.prisma.classSlot.findMany({
      where: { instructorId: personId },
      select: { id: true, academyId: true },
    });
    const slotIds = slots.map((s) => s.id);
    const [classesNext7d, attendance7d] = await Promise.all([
      slotIds.length
        ? this.prisma.class.count({
            where: {
              cancelled: false,
              classSlotId: { in: slotIds },
              date: { gte: new Date(), lte: inDays(7) },
            },
          })
        : 0,
      slotIds.length
        ? this.prisma.attendance.count({
            where: {
              checkedAt: { gte: daysAgo(7) },
              class: { slot: { id: { in: slotIds } } },
            },
          })
        : 0,
    ]);
    return {
      kpis: [
        { key: "mySlots", value: slots.length },
        { key: "classes7d", value: classesNext7d },
        { key: "attendance7d", value: attendance7d },
      ],
    };
  }

  private async venueStats(personId: string): Promise<HomeStats> {
    const venue = await this.prisma.venue.findFirst({
      where: { ownerId: personId, active: true },
      select: { id: true },
    });
    if (!venue) return { kpis: [] };
    const [upcoming, next] = await Promise.all([
      this.prisma.event.count({
        where: {
          venueId: venue.id,
          status: { in: ["PUBLISHED", "LIVE"] },
          endsAt: { gte: new Date() },
        },
      }),
      this.prisma.event.findFirst({
        where: {
          venueId: venue.id,
          status: { in: ["PUBLISHED", "LIVE"] },
          startsAt: { gte: new Date() },
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, name: true, startsAt: true },
      }),
    ]);
    return {
      kpis: [{ key: "upcomingAtVenue", value: upcoming }],
      nextGig: next
        ? { id: next.id, name: next.name, when: next.startsAt, place: null }
        : null,
    };
  }

  private async djStats(personId: string): Promise<HomeStats> {
    const gigs = await this.prisma.eventDj.findMany({
      where: {
        personId,
        event: {
          status: { in: ["PUBLISHED", "LIVE"] },
          startsAt: { gte: new Date() },
        },
      },
      orderBy: { event: { startsAt: "asc" } },
      take: 1,
      select: {
        eventId: true,
        event: {
          select: {
            name: true,
            startsAt: true,
            venue: { select: { name: true } },
          },
        },
      },
    });
    const total = await this.prisma.eventDj.count({
      where: {
        personId,
        event: {
          status: { in: ["PUBLISHED", "LIVE"] },
          startsAt: { gte: new Date() },
        },
      },
    });
    const next = gigs[0]?.event;
    return {
      kpis: [{ key: "upcomingGigs", value: total }],
      nextGig: next
        ? {
            id: gigs[0].eventId,
            name: next.name,
            when: next.startsAt,
            place: next.venue?.name ?? null,
          }
        : null,
    };
  }

  private async staffStats(personId: string): Promise<HomeStats> {
    // StaffAssignment solo tiene eventId escalar — dos pasos.
    const assignments = await this.prisma.staffAssignment.findMany({
      where: { personId },
      select: { eventId: true },
    });
    const eventIds = assignments.map((a) => a.eventId);
    if (eventIds.length === 0) {
      return { kpis: [{ key: "upcomingShifts", value: 0 }], nextShift: null };
    }
    const where = {
      id: { in: eventIds },
      startsAt: { gte: new Date() },
    };
    const [total, next] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findFirst({
        where,
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          name: true,
          startsAt: true,
          venue: { select: { name: true } },
        },
      }),
    ]);
    return {
      kpis: [{ key: "upcomingShifts", value: total }],
      nextShift: next
        ? {
            id: next.id,
            name: next.name,
            when: next.startsAt,
            place: next.venue?.name ?? null,
          }
        : null,
    };
  }
}
