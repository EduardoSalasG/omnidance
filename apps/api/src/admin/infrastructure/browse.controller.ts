import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";
import type {
  EventStatus,
  PaymentStatus,
  Prisma,
  TicketStatus,
} from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { effectiveCapacity } from "../../academies/domain/academy.service";

const TAKE = 100;
const ROLE_KEY = /^[A-Z0-9_]+$/;

const EVENT_STATUSES: readonly EventStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "LIVE",
  "CLOSED",
  "CANCELLED",
];
const TICKET_STATUSES: readonly TicketStatus[] = [
  "ACTIVE",
  "USED",
  "TRANSFERRED",
  "CANCELLED",
];
const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
];
// Payment.orderType es String libre en schema — whitelist de negocio.
const ORDER_TYPES = [
  "TICKET",
  "SERIES_PASS",
  "MEMBERSHIP",
  "PRIVATE_LESSON",
  "WORKSHOP",
] as const;
const RENTAL_STATUSES = ["REQUESTED", "CONFIRMED", "CANCELLED"] as const;
const LEAD_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "DISCARDED"] as const;
const LEAD_INTENTS = ["CONTACT", "DEMO"] as const;

class BrowseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  orderType?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  producerId?: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsString()
  academyId?: string;

  @IsOptional()
  @IsString()
  styleId?: string;

  @IsOptional()
  @IsString()
  eventId?: string;
}

/** Valida un filtro enum por whitelist — inválido → 400 (no se ignora). */
function whitelist<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined || value === "") return undefined;
  if (!allowed.includes(value as T)) {
    throw new BadRequestException(
      `${field} inválido: "${value}" (válidos: ${allowed.join(", ")})`,
    );
  }
  return value as T;
}

/**
 * Explorador de datos operacional (/admin/datos): listados livianos
 * (≤100 filas) por entidad con filtros por query string. Read-only.
 * FKs peladas (eventId/personId/producerId/ownerId) se resuelven a
 * {id,name} con lookups batch — el schema no declara esas relaciones.
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class BrowseController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("browse/:entity")
  async browse(@Param("entity") entity: string, @Query() q: BrowseQueryDto) {
    switch (entity) {
      case "events":
        return this.events(q);
      case "classes":
        return this.classes(q);
      case "payments":
        return this.payments(q);
      case "tickets":
        return this.tickets(q);
      case "academies":
        return this.academies(q);
      case "venues":
        return this.venues(q);
      case "rentals":
        return this.rentals(q);
      case "people":
        return this.people(q);
      case "leads":
        return this.leads(q);
      default:
        throw new BadRequestException(
          `entidad inválida: "${entity}" (válidas: events, classes, payments, tickets, academies, venues, rentals, people, leads)`,
        );
    }
  }

  // ── events: q,status,from,to,producerId,venueId ─────────────────────

  private async events(q: BrowseQueryDto) {
    const status = whitelist(q.status, EVENT_STATUSES, "status");
    const where: Prisma.EventWhereInput = {
      ...(q.q?.trim()
        ? { name: { contains: q.q.trim(), mode: "insensitive" as const } }
        : {}),
      ...(status ? { status } : {}),
      ...(q.producerId ? { producerId: q.producerId } : {}),
      ...(q.venueId ? { venueId: q.venueId } : {}),
      ...(q.from || q.to
        ? {
            startsAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const events = await this.prisma.event.findMany({
      where,
      orderBy: { startsAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        name: true,
        startsAt: true,
        status: true,
        producerId: true,
        venue: { select: { id: true, name: true } },
      },
    });
    const ids = events.map((e) => e.id);
    const [soldByEvent, producers] = await Promise.all([
      ids.length
        ? this.prisma.ticket.groupBy({
            by: ["eventId"],
            where: { eventId: { in: ids }, status: { not: "CANCELLED" } },
            _count: true,
          })
        : Promise.resolve([]),
      this.peopleByIds(
        events.map((e) => e.producerId).filter((p): p is string => !!p),
      ),
    ]);
    const soldOf = new Map(soldByEvent.map((t) => [t.eventId, t._count]));
    return events.map((e) => ({
      id: e.id,
      name: e.name,
      startsAt: e.startsAt,
      status: e.status,
      producer: e.producerId ? (producers.get(e.producerId) ?? null) : null,
      venue: e.venue,
      sold: soldOf.get(e.id) ?? 0,
    }));
  }

  // ── classes: academyId,styleId,from,to ──────────────────────────────

  private async classes(q: BrowseQueryDto) {
    const where: Prisma.ClassWhereInput = {};
    if (q.academyId) where.slot = { academyId: q.academyId };
    if (q.from || q.to) {
      where.date = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    if (q.styleId) {
      // ClassSlot.styleId no declara relación; el fallback es la serie.
      where.OR = [
        { slot: { styleId: q.styleId } },
        { slot: { series: { styleId: q.styleId } } },
      ];
    }
    const classes = await this.prisma.class.findMany({
      where,
      orderBy: { date: "desc" },
      take: TAKE,
      select: {
        id: true,
        date: true,
        capacity: true,
        cancelled: true,
        instructorId: true,
        slot: {
          select: {
            instructorId: true,
            styleId: true,
            capacity: true,
            academy: {
              select: { id: true, name: true, defaultQuorum: true },
            },
            series: {
              select: {
                quorum: true,
                style: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    const ids = classes.map((c) => c.id);
    const instructorIds = classes
      .map((c) => c.instructorId ?? c.slot.instructorId)
      .filter((p): p is string => !!p);
    const slotStyleIds = classes
      .map((c) => c.slot.styleId)
      .filter((s): s is string => !!s);
    const [bookedByClass, instructors, slotStyles] = await Promise.all([
      ids.length
        ? this.prisma.classBooking.groupBy({
            by: ["classId"],
            where: { classId: { in: ids }, status: "BOOKED" },
            _count: true,
          })
        : Promise.resolve([]),
      this.peopleByIds(instructorIds),
      slotStyleIds.length
        ? this.prisma.style.findMany({
            where: { id: { in: [...new Set(slotStyleIds)] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const bookedOf = new Map(bookedByClass.map((b) => [b.classId, b._count]));
    const slotStyleOf = new Map(slotStyles.map((s) => [s.id, s]));

    return classes.map((c) => {
      const instructorId = c.instructorId ?? c.slot.instructorId;
      const style = c.slot.styleId
        ? (slotStyleOf.get(c.slot.styleId) ?? null)
        : (c.slot.series?.style ?? null);
      return {
        id: c.id,
        // Class.date es el instante de la clase → expuesto como startsAt.
        startsAt: c.date,
        cancelled: c.cancelled,
        style,
        academy: c.slot.academy,
        instructor: instructorId
          ? (instructors.get(instructorId) ?? null)
          : null,
        booked: bookedOf.get(c.id) ?? 0,
        capacity: effectiveCapacity({
          classCapacity: c.capacity,
          slotCapacity: c.slot.capacity,
          seriesQuorum: c.slot.series?.quorum,
          academyDefaultQuorum: c.slot.academy.defaultQuorum,
        }),
      };
    });
  }

  // ── payments: status,orderType,from,to ──────────────────────────────

  private async payments(q: BrowseQueryDto) {
    const status = whitelist(q.status, PAYMENT_STATUSES, "status");
    const orderType = whitelist(q.orderType, ORDER_TYPES, "orderType");
    const payments = await this.prisma.payment.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(orderType ? { orderType } : {}),
        ...(q.from || q.to
          ? {
              createdAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        amount: true,
        net: true,
        status: true,
        orderType: true,
        createdAt: true,
        personId: true,
        eventId: true,
      },
    });
    const [people, events] = await Promise.all([
      this.peopleByIds(payments.map((p) => p.personId)),
      this.eventsByIds(
        payments.map((p) => p.eventId).filter((e): e is string => !!e),
      ),
    ]);
    return payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      net: p.net,
      status: p.status,
      orderType: p.orderType,
      createdAt: p.createdAt,
      person: people.get(p.personId) ?? null,
      event: p.eventId ? (events.get(p.eventId) ?? null) : null,
    }));
  }

  // ── tickets: status,eventId ─────────────────────────────────────────

  private async tickets(q: BrowseQueryDto) {
    const status = whitelist(q.status, TICKET_STATUSES, "status");
    const tickets = await this.prisma.ticket.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q.eventId ? { eventId: q.eventId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        status: true,
        listPrice: true,
        eventId: true,
        ownerId: true,
      },
    });
    const [owners, events] = await Promise.all([
      this.peopleByIds(tickets.map((t) => t.ownerId)),
      this.eventsByIds(tickets.map((t) => t.eventId)),
    ]);
    return tickets.map((t) => ({
      id: t.id,
      status: t.status,
      listPrice: t.listPrice,
      event: events.get(t.eventId) ?? null,
      owner: owners.get(t.ownerId) ?? null,
    }));
  }

  // ── academies: q ────────────────────────────────────────────────────

  private async academies(q: BrowseQueryDto) {
    const academies = await this.prisma.academy.findMany({
      where: q.q?.trim()
        ? { name: { contains: q.q.trim(), mode: "insensitive" } }
        : {},
      orderBy: { name: "asc" },
      take: TAKE,
      select: { id: true, name: true },
    });
    const ids = academies.map((a) => a.id);
    const [students, seriesActive] = ids.length
      ? await Promise.all([
          this.prisma.enrollment.groupBy({
            by: ["academyId"],
            where: { academyId: { in: ids }, status: "ACTIVE" },
            _count: true,
          }),
          this.prisma.classSeries.groupBy({
            by: ["academyId"],
            where: { academyId: { in: ids }, active: true },
            _count: true,
          }),
        ])
      : [[], []];
    const studentsOf = new Map(students.map((s) => [s.academyId, s._count]));
    const seriesOf = new Map(seriesActive.map((s) => [s.academyId, s._count]));
    return academies.map((a) => ({
      id: a.id,
      name: a.name,
      students: studentsOf.get(a.id) ?? 0,
      seriesActive: seriesOf.get(a.id) ?? 0,
    }));
  }

  // ── venues: q ───────────────────────────────────────────────────────

  private async venues(q: BrowseQueryDto) {
    const venues = await this.prisma.venue.findMany({
      where: q.q?.trim()
        ? { name: { contains: q.q.trim(), mode: "insensitive" } }
        : {},
      orderBy: { name: "asc" },
      take: TAKE,
      select: {
        id: true,
        name: true,
        address: true,
        _count: { select: { rentals: true } },
      },
    });
    return venues.map((v) => ({
      id: v.id,
      name: v.name,
      address: v.address,
      rentalsCount: v._count.rentals,
    }));
  }

  // ── rentals: status,venueId ─────────────────────────────────────────

  private async rentals(q: BrowseQueryDto) {
    const status = whitelist(q.status, RENTAL_STATUSES, "status");
    const rentals = await this.prisma.venueRental.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q.venueId ? { venueId: q.venueId } : {}),
      },
      orderBy: { date: "desc" },
      take: TAKE,
      select: {
        id: true,
        date: true,
        status: true,
        eventId: true,
        venue: { select: { id: true, name: true } },
      },
    });
    const events = await this.eventsByIds(
      rentals.map((r) => r.eventId).filter((e): e is string => !!e),
    );
    return rentals.map((r) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      venue: r.venue,
      event: r.eventId ? (events.get(r.eventId) ?? null) : null,
    }));
  }

  // ── people: q,role — misma shape que /admin/users ───────────────────

  private async people(q: BrowseQueryDto) {
    const term = q.q?.trim() ?? "";
    let role: string | undefined;
    if (q.role) {
      if (!ROLE_KEY.test(q.role)) {
        throw new BadRequestException("rol inválido");
      }
      const exists = await this.prisma.role.findUnique({
        where: { key: q.role },
        select: { key: true },
      });
      if (!exists) {
        throw new BadRequestException(`rol ${q.role} no existe en el catálogo`);
      }
      role = q.role;
    }
    // Igual que /admin/users: sin término ni filtro de rol nunca se
    // devuelve un listado masivo de personas.
    if (!role && term.length < 2) return [];

    const where: Prisma.PersonWhereInput = {
      ...(term.length >= 2
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
              { phone: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(role ? { roles: { some: { role } } } : {}),
    };
    return this.prisma.person.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        name: true,
        email: true,
        isDemoAccount: true,
        createdAt: true,
        roles: {
          select: { id: true, role: true, status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  // ── leads: q,status,intent,from,to — captación del landing /pro ─────

  private async leads(q: BrowseQueryDto) {
    const status = whitelist(q.status, LEAD_STATUSES, "status");
    const intent = whitelist(q.intent, LEAD_INTENTS, "intent");
    const term = q.q?.trim() ?? "";
    const leads = await this.prisma.lead.findMany({
      where: {
        ...(term.length >= 2
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
                { phone: { contains: term, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(status ? { status } : {}),
        ...(intent ? { intent } : {}),
        ...(q.from || q.to
          ? {
              createdAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roles: true,
        intent: true,
        status: true,
        personId: true,
        createdAt: true,
      },
    });
    // demoPending = la persona ligada sigue en modo demo — habilita el
    // botón "Convertir a usuario real" en la UI admin.
    const personIds = leads.map((l) => l.personId).filter((x): x is string => !!x);
    const persons = personIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, isDemoAccount: true },
        })
      : [];
    const demoById = new Map(persons.map((p) => [p.id, p.isDemoAccount]));
    return leads.map((l) => ({
      ...l,
      demoPending: l.personId ? (demoById.get(l.personId) ?? false) : false,
    }));
  }

  // ── helpers ─────────────────────────────────────────────────────────

  private async peopleByIds(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map<string, { id: string; name: string }>();
    const people = await this.prisma.person.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(people.map((p) => [p.id, p]));
  }

  private async eventsByIds(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) {
      return new Map<string, { id: string; name: string; startsAt: Date }>();
    }
    const events = await this.prisma.event.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, startsAt: true },
    });
    return new Map(events.map((e) => [e.id, e]));
  }
}
