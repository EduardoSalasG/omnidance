import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

export type AnalyticsRole =
  | "ADMIN"
  | "PRODUCER"
  | "ACADEMY_OWNER"
  | "VENUE_MANAGER";

const ANALYTICS_ROLES: readonly string[] = [
  "ADMIN",
  "PRODUCER",
  "ACADEMY_OWNER",
  "VENUE_MANAGER",
];

export interface AnalyticsResult {
  role: string;
  periodDays: number;
  kpis: Array<{ key: string; value: number; format?: "clp" | "pct" }>;
  /** Bloques extra por rol (listas, top-N, por-entidad). */
  sections: Record<string, unknown>;
}

/**
 * Métricas por lente de gestión (spec analytics): un solo request que
 * devuelve KPIs + desgloses según el rol aprobado del usuario.
 * ADMIN ve la plataforma; PRODUCER/ACADEMY_OWNER/VENUE_MANAGER ven lo suyo.
 * Roles sin analítica (DANCER/DJ/STAFF/INSTRUCTOR) → sections vacío.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summaryFor(
    personId: string,
    role: string,
  ): Promise<AnalyticsResult | null> {
    const approved = await this.prisma.personRole.findMany({
      where: { personId, status: "APPROVED" },
      select: { role: true },
    });
    const held = new Set(approved.map((r) => r.role));
    if (!ANALYTICS_ROLES.includes(role) || !held.has(role)) return null;

    switch (role as AnalyticsRole) {
      case "ADMIN":
        return this.admin();
      case "PRODUCER":
        return this.producer(personId);
      case "ACADEMY_OWNER":
        return this.academyOwner(personId);
      case "VENUE_MANAGER":
        return this.venueManager(personId);
    }
  }

  /** Roles con analítica aprobados para el usuario — para el selector. */
  async availableRoles(personId: string): Promise<string[]> {
    const approved = await this.prisma.personRole.findMany({
      where: { personId, status: "APPROVED" },
      select: { role: true },
    });
    return approved.map((r) => r.role).filter((r) =>
      ANALYTICS_ROLES.includes(r),
    );
  }

  private async admin(): Promise<AnalyticsResult> {
    const since = daysAgo(30);
    const [pay, tickets, checkins, newPeople, byStatus, payoutAgg] =
      await Promise.all([
        this.prisma.payment.aggregate({
          where: { status: "PAID", createdAt: { gte: since } },
          _sum: { amount: true, fee: true, net: true },
          _count: true,
        }),
        this.prisma.ticket.count({ where: { createdAt: { gte: since } } }),
        this.prisma.checkin.count({ where: { inAt: { gte: since } } }),
        this.prisma.person.count({ where: { createdAt: { gte: since } } }),
        this.prisma.event.groupBy({
          by: ["status"],
          _count: true,
        }),
        this.prisma.payout.aggregate({
          _sum: { gross: true, platformFee: true, net: true },
        }),
      ]);

    // Top productores por gross 30d — payments → event → producerId.
    const top = await this.topProducers(since);

    return {
      role: "ADMIN",
      periodDays: 30,
      kpis: [
        { key: "gmv", value: pay._sum.amount ?? 0, format: "clp" },
        { key: "payments", value: pay._count },
        { key: "tickets", value: tickets },
        { key: "checkins", value: checkins },
        { key: "newPeople", value: newPeople },
        {
          key: "platformFeeAccrued",
          value: payoutAgg._sum.platformFee ?? 0,
          format: "clp",
        },
      ],
      sections: {
        eventsByStatus: Object.fromEntries(
          byStatus.map((s) => [s.status, s._count]),
        ),
        payouts: {
          gross: payoutAgg._sum.gross ?? 0,
          platformFee: payoutAgg._sum.platformFee ?? 0,
          net: payoutAgg._sum.net ?? 0,
        },
        topProducers: top,
      },
    };
  }

  private async topProducers(since: Date) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: "PAID",
        orderType: "TICKET",
        eventId: { not: null },
        createdAt: { gte: since },
      },
      select: { eventId: true, amount: true },
    });
    if (!payments.length) return [];
    const events = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(payments.map((p) => p.eventId!))] } },
      select: { id: true, producerId: true },
    });
    const producerOf = new Map(events.map((e) => [e.id, e.producerId]));
    const gross = new Map<string, number>();
    for (const p of payments) {
      const pid = producerOf.get(p.eventId!);
      if (!pid) continue;
      gross.set(pid, (gross.get(pid) ?? 0) + p.amount);
    }
    const top = [...gross.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const people = await this.prisma.person.findMany({
      where: { id: { in: top.map(([id]) => id) } },
      select: { id: true, name: true },
    });
    const name = new Map(people.map((p) => [p.id, p.name]));
    return top.map(([id, g]) => ({ id, name: name.get(id) ?? id, gross: g }));
  }

  private async producer(personId: string): Promise<AnalyticsResult> {
    const since = daysAgo(30);
    const events = await this.prisma.event.findMany({
      where: { producerId: personId },
      orderBy: { startsAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        startsAt: true,
        status: true,
        capacity: true,
        presaleCap: true,
      },
    });
    if (!events.length) {
      return {
        role: "PRODUCER",
        periodDays: 30,
        kpis: [],
        sections: { events: [] },
      };
    }
    const ids = events.map((e) => e.id);
    const [payByEvent, ticketByEvent, checkinByEvent] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ["eventId"],
        where: {
          status: "PAID",
          orderType: "TICKET",
          eventId: { in: ids },
          createdAt: { gte: since },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.ticket.groupBy({
        by: ["eventId"],
        where: { eventId: { in: ids }, status: { not: "CANCELLED" } },
        _count: true,
      }),
      this.prisma.checkin.groupBy({
        by: ["eventId"],
        where: { eventId: { in: ids }, inAt: { gte: since } },
        _count: true,
      }),
    ]);
    const grossOf = new Map(payByEvent.map((p) => [p.eventId, p._sum.amount ?? 0]));
    const soldOf = new Map(ticketByEvent.map((t) => [t.eventId, t._count]));
    const checkinOf = new Map(checkinByEvent.map((c) => [c.eventId, c._count]));

    const perEvent = events.map((e) => {
      const sold = soldOf.get(e.id) ?? 0;
      return {
        id: e.id,
        name: e.name,
        startsAt: e.startsAt,
        status: e.status,
        sold,
        gross30d: grossOf.get(e.id) ?? 0,
        checkins30d: checkinOf.get(e.id) ?? 0,
        capacity: e.capacity,
        occupancyPct:
          e.capacity && e.capacity > 0
            ? Math.round((sold / e.capacity) * 100)
            : null,
      };
    });
    const gross30d = perEvent.reduce((a, e) => a + e.gross30d, 0);
    const soldTotal = perEvent.reduce((a, e) => a + e.sold, 0);
    const checkins30d = perEvent.reduce((a, e) => a + e.checkins30d, 0);

    return {
      role: "PRODUCER",
      periodDays: 30,
      kpis: [
        { key: "gross", value: gross30d, format: "clp" },
        { key: "sold", value: soldTotal },
        { key: "checkins", value: checkins30d },
        { key: "events", value: events.length },
      ],
      sections: { events: perEvent },
    };
  }

  private async academyOwner(personId: string): Promise<AnalyticsResult> {
    const since = daysAgo(30);
    const academies = await this.prisma.academy.findMany({
      where: { ownerId: personId, active: true },
      select: { id: true, name: true },
    });
    if (!academies.length) {
      return {
        role: "ACADEMY_OWNER",
        periodDays: 30,
        kpis: [],
        sections: { academies: [] },
      };
    }
    const ids = academies.map((a) => a.id);

    const perAcademy = await Promise.all(
      academies.map(async (a) => {
        const [students, attendance30d, classes30d, seriesActive, occupancy] =
          await Promise.all([
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
              where: {
                slot: { academyId: a.id },
                date: { gte: since },
              },
            }),
            this.prisma.classSeries.count({
              where: { academyId: a.id, active: true },
            }),
            this.occupancyFor(a.id, since),
          ]);
        return {
          id: a.id,
          name: a.name,
          students,
          attendance30d,
          classes30d,
          seriesActive,
          occupancyPct: occupancy,
        };
      }),
    );

    return {
      role: "ACADEMY_OWNER",
      periodDays: 30,
      kpis: [
        {
          key: "students",
          value: perAcademy.reduce((a, x) => a + x.students, 0),
        },
        {
          key: "attendance",
          value: perAcademy.reduce((a, x) => a + x.attendance30d, 0),
        },
        {
          key: "classes",
          value: perAcademy.reduce((a, x) => a + x.classes30d, 0),
        },
        { key: "academies", value: ids.length },
      ],
      sections: { academies: perAcademy },
    };
  }

  /** Ocupación promedio: reservas BOOKED / capacidad de clases recientes. */
  private async occupancyFor(
    academyId: string,
    since: Date,
  ): Promise<number | null> {
    const classes = await this.prisma.class.findMany({
      where: { slot: { academyId }, date: { gte: since } },
      select: { id: true, slot: { select: { capacity: true } } },
      take: 200,
    });
    const cap = classes.reduce((a, c) => a + c.slot.capacity, 0);
    if (!cap) return null;
    const booked = await this.prisma.classBooking.count({
      where: { classId: { in: classes.map((c) => c.id) }, status: "BOOKED" },
    });
    return Math.round((booked / cap) * 100);
  }

  private async venueManager(personId: string): Promise<AnalyticsResult> {
    const since = daysAgo(30);
    const venues = await this.prisma.venue.findMany({
      where: { ownerId: personId },
      select: { id: true, name: true },
    });
    if (!venues.length) {
      return {
        role: "VENUE_MANAGER",
        periodDays: 30,
        kpis: [],
        sections: { venues: [] },
      };
    }

    const perVenue = await Promise.all(
      venues.map(async (v) => {
        // Checkin no tiene relación a Event — se resuelven los eventIds
        // del venue y se cuenta por eventId.
        const [upcoming, events30d, venueEventIds] = await Promise.all([
          this.prisma.event.count({
            where: {
              venueId: v.id,
              status: { in: ["PUBLISHED", "LIVE"] },
              startsAt: { gte: new Date() },
            },
          }),
          this.prisma.event.count({
            where: { venueId: v.id, startsAt: { gte: since } },
          }),
          this.prisma.event.findMany({
            where: { venueId: v.id },
            select: { id: true },
          }),
        ]);
        const checkins30d = venueEventIds.length
          ? await this.prisma.checkin.count({
              where: {
                eventId: { in: venueEventIds.map((e) => e.id) },
                inAt: { gte: since },
              },
            })
          : 0;
        return { id: v.id, name: v.name, upcoming, events30d, checkins30d };
      }),
    );

    return {
      role: "VENUE_MANAGER",
      periodDays: 30,
      kpis: [
        {
          key: "upcoming",
          value: perVenue.reduce((a, x) => a + x.upcoming, 0),
        },
        {
          key: "events",
          value: perVenue.reduce((a, x) => a + x.events30d, 0),
        },
        {
          key: "checkins",
          value: perVenue.reduce((a, x) => a + x.checkins30d, 0),
        },
        { key: "venues", value: venues.length },
      ],
      sections: { venues: perVenue },
    };
  }
}
