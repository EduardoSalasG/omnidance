import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { QueryFilters } from "@omnidance/shared";
import type { PrismaService } from "../../prisma.service";
import { effectiveCapacity } from "../../academies/domain/academy.service";
import {
  academiesByIds,
  clp,
  dateRange,
  eventsByIds,
  iso,
  peopleByIds,
  whitelist,
  type EntityHandler,
  type EntityResult,
} from "./helpers";

/**
 * Entidades del lente ADMIN (spec analytics/query-console): las 12
 * entidades del explorador /admin/browse extraídas a handlers reusables
 * + `payouts`. Cada handler produce las dos shapes desde la misma query:
 * `objects` (lo que /admin/browse sigue devolviendo, sin cambios) y
 * `rows` planas en el orden de columnas del catálogo (preview/export).
 * Scope admin = global - el parámetro `scope` se ignora.
 */

const ROLE_KEY = /^[A-Z0-9_]+$/;

const EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "LIVE",
  "CLOSED",
  "CANCELLED",
] as const;
const TICKET_STATUSES = [
  "ACTIVE",
  "USED",
  "TRANSFERRED",
  "CANCELLED",
] as const;
const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;
// Payment.orderType es String libre en schema - whitelist de negocio
// (la del catálogo suma PLATFORM_SUB - superset aditivo).
const ORDER_TYPES = [
  "TICKET",
  "SERIES_PASS",
  "MEMBERSHIP",
  "PRIVATE_LESSON",
  "WORKSHOP",
  "PLATFORM_SUB",
] as const;
const RENTAL_STATUSES = ["REQUESTED", "CONFIRMED", "CANCELLED"] as const;
const LEAD_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "DISCARDED"] as const;
const LEAD_INTENTS = ["CONTACT", "DEMO"] as const;
const GATEWAY_DIRECTIONS = ["OUTBOUND", "INBOUND_WEBHOOK"] as const;
const SUBSCRIPTION_STATUSES = [
  "PENDING_CARD",
  "ACTIVATING",
  "ACTIVE",
  "CANCEL_PENDING",
  "CANCELED",
  "FAILED_CARD",
] as const;
const PAYOUT_STATUSES = ["PENDING", "APPROVED", "PAID"] as const;
const ACTOR_TYPES = ["PRODUCER", "ACADEMY", "VENUE"] as const;

interface ExecOpts {
  take?: number;
  /** Offset de la página (paginación del preview); default 0. */
  skip?: number;
  /** false omite el count (browse back-compat); default true. */
  total?: boolean;
}

/** Arma el EntityResult dual (objects + rows + total + summary). */
function assemble<T>(
  objects: T[],
  total: number,
  toRow: (o: T) => unknown[],
  summarize?: (objects: T[], total: number) => string[],
): EntityResult {
  return {
    rows: objects.map(toRow),
    objects,
    total,
    summary: summarize?.(objects, total) ?? [`${total} registros`],
  };
}

// ─── events: q,status,from,to,producerId,venueId ──────────────────────

interface EventObject {
  id: string;
  name: string;
  startsAt: Date;
  status: string;
  producer: { id: string; name: string } | null;
  venue: { id: string; name: string } | null;
  sold: number;
}

function eventsWhere(f: QueryFilters): Prisma.EventWhereInput {
  const status = whitelist(f.status, EVENT_STATUSES, "status");
  const range = dateRange(f.from, f.to);
  return {
    ...(f.q?.trim()
      ? { name: { contains: f.q.trim(), mode: "insensitive" as const } }
      : {}),
    ...(status ? { status } : {}),
    ...(f.producerId ? { producerId: f.producerId } : {}),
    ...(f.venueId ? { venueId: f.venueId } : {}),
    ...(range ? { startsAt: range } : {}),
  };
}

const events: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const where = eventsWhere(f);
    const rows = await prisma.event.findMany({
      where,
      orderBy: { startsAt: "desc" },
      take: opts?.take,
      skip: opts?.skip,
      select: {
        id: true,
        name: true,
        startsAt: true,
        status: true,
        producerId: true,
        venue: { select: { id: true, name: true } },
      },
    });
    const ids = rows.map((e) => e.id);
    const [soldByEvent, producers] = await Promise.all([
      ids.length
        ? prisma.ticket.groupBy({
            by: ["eventId"],
            where: { eventId: { in: ids }, status: { not: "CANCELLED" } },
            _count: true,
          })
        : Promise.resolve([]),
      peopleByIds(
        prisma,
        rows.map((e) => e.producerId).filter((p): p is string => !!p),
      ),
    ]);
    const soldOf = new Map(soldByEvent.map((t) => [t.eventId, t._count]));
    const objects: EventObject[] = rows.map((e) => ({
      id: e.id,
      name: e.name,
      startsAt: e.startsAt,
      status: e.status,
      producer: e.producerId ? (producers.get(e.producerId) ?? null) : null,
      venue: e.venue,
      sold: soldOf.get(e.id) ?? 0,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.event.count({ where });
    return assemble(
      objects,
      total,
      (e) => [
        e.name,
        iso(e.startsAt),
        e.status,
        e.producer?.name ?? "",
        e.venue?.name ?? "",
        e.sold,
      ],
      (objs, t) => [
        `${t} eventos · ${objs.reduce((a, e) => a + e.sold, 0)} entradas en esta página`,
      ],
    );
  },
};

// ─── classes: academyId,styleId,from,to ───────────────────────────────

interface ClassObject {
  id: string;
  startsAt: Date;
  cancelled: boolean;
  style: { id: string; name: string } | null;
  academy: { id: string; name: string };
  instructor: { id: string; name: string } | null;
  booked: number;
  capacity: number;
}

function classesWhere(f: QueryFilters): Prisma.ClassWhereInput {
  const where: Prisma.ClassWhereInput = {};
  const slotWhere: Prisma.ClassSlotWhereInput = {};
  if (f.academyId) slotWhere.academyId = f.academyId;
  if (f.styleId) slotWhere.series = { styleId: f.styleId };
  if (f.academyId || f.styleId) where.slot = slotWhere;
  const range = dateRange(f.from, f.to);
  if (range) where.date = range;
  return where;
}

const classes: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const where = classesWhere(f);
    const rows = await prisma.class.findMany({
      where,
      orderBy: { date: "desc" },
      take: opts?.take,
      skip: opts?.skip,
      select: {
        id: true,
        date: true,
        capacity: true,
        cancelled: true,
        instructorId: true,
        slot: {
          select: {
            instructorId: true,
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
    const ids = rows.map((c) => c.id);
    const instructorIds = rows
      .map((c) => c.instructorId ?? c.slot.instructorId)
      .filter((p): p is string => !!p);
    const [bookedByClass, instructors] = await Promise.all([
      ids.length
        ? prisma.classBooking.groupBy({
            by: ["classId"],
            where: { classId: { in: ids }, status: "BOOKED" },
            _count: true,
          })
        : Promise.resolve([]),
      peopleByIds(prisma, instructorIds),
    ]);
    const bookedOf = new Map(bookedByClass.map((b) => [b.classId, b._count]));

    const objects: ClassObject[] = rows.map((c) => {
      const instructorId = c.instructorId ?? c.slot.instructorId;
      const style = c.slot.series.style ?? null;
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
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.class.count({ where });
    return assemble(objects, total, (c) => [
      iso(c.startsAt),
      c.style?.name ?? "",
      c.academy.name,
      c.instructor?.name ?? "",
      c.booked,
      c.capacity,
      c.cancelled ? "si" : "",
    ]);
  },
};

// ─── payments: status,orderType,from,to ───────────────────────────────

interface PaymentObject {
  id: string;
  amount: number;
  net: number;
  status: string;
  orderType: string;
  createdAt: Date;
  gateway: string;
  feeMode: string | null;
  platformFeeRate: number | null;
  platformFeeNetClp: number | null;
  platformFeeVatClp: number | null;
  gatewayFeeExpected: number | null;
  producerNetClp: number | null;
  currency: string;
  person: { id: string; name: string } | null;
  event: { id: string; name: string; startsAt: Date } | null;
}

function paymentsWhere(f: QueryFilters): Prisma.PaymentWhereInput {
  const status = whitelist(f.status, PAYMENT_STATUSES, "status");
  const orderType = whitelist(f.orderType, ORDER_TYPES, "orderType");
  const range = dateRange(f.from, f.to);
  return {
    ...(status ? { status } : {}),
    ...(orderType ? { orderType } : {}),
    ...(range ? { createdAt: range } : {}),
  };
}

const payments: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const where = paymentsWhere(f);
    const rows = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      skip: opts?.skip,
      select: {
        id: true,
        amount: true,
        net: true,
        status: true,
        orderType: true,
        createdAt: true,
        personId: true,
        eventId: true,
        // Desglose congelado (spec admin-finance-console): trazabilidad
        // del fee por orden en la consola de finanzas.
        gateway: true,
        feeMode: true,
        platformFeeRate: true,
        platformFeeNetClp: true,
        platformFeeVatClp: true,
        gatewayFeeExpected: true,
        gatewayFeeClp: true,
        producerNetClp: true,
        currency: true,
      },
    });
    const [people, events] = await Promise.all([
      peopleByIds(
        prisma,
        rows.map((p) => p.personId),
      ),
      eventsByIds(
        prisma,
        rows.map((p) => p.eventId).filter((e): e is string => !!e),
      ),
    ]);
    const objects: PaymentObject[] = rows.map((p) => ({
      id: p.id,
      amount: p.amount,
      net: p.net,
      status: p.status,
      orderType: p.orderType,
      createdAt: p.createdAt,
      gateway: p.gateway,
      feeMode: p.feeMode,
      platformFeeRate: p.platformFeeRate,
      platformFeeNetClp: p.platformFeeNetClp,
      platformFeeVatClp: p.platformFeeVatClp,
      gatewayFeeExpected: p.gatewayFeeClp ?? p.gatewayFeeExpected,
      producerNetClp: p.producerNetClp,
      currency: p.currency,
      person: people.get(p.personId) ?? null,
      event: p.eventId ? (events.get(p.eventId) ?? null) : null,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.payment.count({ where });
    return assemble(
      objects,
      total,
      (p) => [
        iso(p.createdAt),
        p.person?.name ?? "",
        p.event?.name ?? "",
        p.orderType,
        p.amount,
        p.net,
        p.status,
      ],
      (objs, t) => [
        `${t} pagos · en página: ${clp(
          objs
            .filter((p) => p.status === "PAID")
            .reduce((a, p) => a + p.amount, 0),
        )} pagados`,
      ],
    );
  },
};

// ─── tickets: status,eventId ──────────────────────────────────────────

interface TicketObject {
  id: string;
  status: string;
  listPrice: number;
  event: { id: string; name: string; startsAt: Date } | null;
  owner: { id: string; name: string } | null;
}

const tickets: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const status = whitelist(f.status, TICKET_STATUSES, "status");
    const where: Prisma.TicketWhereInput = {
      ...(status ? { status } : {}),
      ...(f.eventId ? { eventId: f.eventId } : {}),
    };
    const rows = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      skip: opts?.skip,
      select: {
        id: true,
        status: true,
        listPrice: true,
        eventId: true,
        ownerId: true,
      },
    });
    const [owners, events] = await Promise.all([
      peopleByIds(
        prisma,
        rows.map((t) => t.ownerId),
      ),
      eventsByIds(
        prisma,
        rows.map((t) => t.eventId),
      ),
    ]);
    const objects: TicketObject[] = rows.map((t) => ({
      id: t.id,
      status: t.status,
      listPrice: t.listPrice,
      event: events.get(t.eventId) ?? null,
      owner: owners.get(t.ownerId) ?? null,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.ticket.count({ where });
    return assemble(objects, total, (t) => [
      t.event?.name ?? "",
      iso(t.event?.startsAt),
      t.owner?.name ?? "",
      t.listPrice,
      t.status,
    ]);
  },
};

// ─── academies: q ─────────────────────────────────────────────────────

interface AcademyObject {
  id: string;
  name: string;
  students: number;
  seriesActive: number;
}

const academies: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const where: Prisma.AcademyWhereInput = f.q?.trim()
      ? { name: { contains: f.q.trim(), mode: "insensitive" } }
      : {};
    const rows = await prisma.academy.findMany({
      where,
      orderBy: { name: "asc" },
      take: opts?.take,
      skip: opts?.skip,
      select: { id: true, name: true },
    });
    const ids = rows.map((a) => a.id);
    const [students, seriesActive] = ids.length
      ? await Promise.all([
          prisma.enrollment.groupBy({
            by: ["academyId"],
            where: { academyId: { in: ids }, status: "ACTIVE" },
            _count: true,
          }),
          prisma.classSeries.groupBy({
            by: ["academyId"],
            where: { academyId: { in: ids }, active: true },
            _count: true,
          }),
        ])
      : [[], []];
    const studentsOf = new Map(students.map((s) => [s.academyId, s._count]));
    const seriesOf = new Map(seriesActive.map((s) => [s.academyId, s._count]));
    const objects: AcademyObject[] = rows.map((a) => ({
      id: a.id,
      name: a.name,
      students: studentsOf.get(a.id) ?? 0,
      seriesActive: seriesOf.get(a.id) ?? 0,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.academy.count({ where });
    return assemble(objects, total, (a) => [
      a.name,
      a.students,
      a.seriesActive,
    ]);
  },
};

// ─── venues: q ────────────────────────────────────────────────────────

interface VenueObject {
  id: string;
  name: string;
  address: string | null;
  rentalsCount: number;
}

const venues: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const where: Prisma.VenueWhereInput = f.q?.trim()
      ? { name: { contains: f.q.trim(), mode: "insensitive" } }
      : {};
    const rows = await prisma.venue.findMany({
      where,
      orderBy: { name: "asc" },
      take: opts?.take,
      skip: opts?.skip,
      select: {
        id: true,
        name: true,
        address: true,
        _count: { select: { rentals: true } },
      },
    });
    const objects: VenueObject[] = rows.map((v) => ({
      id: v.id,
      name: v.name,
      address: v.address,
      rentalsCount: v._count.rentals,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.venue.count({ where });
    return assemble(objects, total, (v) => [
      v.name,
      v.address ?? "",
      v.rentalsCount,
    ]);
  },
};

// ─── rentals: status,venueId ──────────────────────────────────────────

interface RentalObject {
  id: string;
  date: Date;
  status: string;
  venue: { id: string; name: string };
  event: { id: string; name: string; startsAt: Date } | null;
}

const rentals: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const status = whitelist(f.status, RENTAL_STATUSES, "status");
    const where: Prisma.VenueRentalWhereInput = {
      ...(status ? { status } : {}),
      ...(f.venueId ? { venueId: f.venueId } : {}),
    };
    const rows = await prisma.venueRental.findMany({
      where,
      orderBy: { date: "desc" },
      take: opts?.take,
      skip: opts?.skip,
      select: {
        id: true,
        date: true,
        status: true,
        eventId: true,
        venue: { select: { id: true, name: true } },
      },
    });
    const events = await eventsByIds(
      prisma,
      rows.map((r) => r.eventId).filter((e): e is string => !!e),
    );
    const objects: RentalObject[] = rows.map((r) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      venue: r.venue,
      event: r.eventId ? (events.get(r.eventId) ?? null) : null,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.venueRental.count({ where });
    return assemble(objects, total, (r) => [
      iso(r.date),
      r.venue.name,
      r.event?.name ?? "",
      r.status,
    ]);
  },
};

// ─── people: q,role - misma shape que /admin/users ────────────────────

interface PersonObject {
  id: string;
  name: string | null;
  email: string | null;
  isDemoAccount: boolean;
  createdAt: Date;
  roles: { id: string; role: string; status: string; createdAt: Date }[];
}

const people: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const term = f.q?.trim() ?? "";
    let role: string | undefined;
    if (f.role) {
      if (!ROLE_KEY.test(f.role)) {
        throw new BadRequestException("rol inválido");
      }
      const exists = await prisma.role.findUnique({
        where: { key: f.role },
        select: { key: true },
      });
      if (!exists) {
        throw new BadRequestException(`rol ${f.role} no existe en el catálogo`);
      }
      role = f.role;
    }
    // Igual que /admin/users: sin término ni filtro de rol nunca se
    // devuelve un listado masivo de personas.
    if (!role && term.length < 2) {
      return assemble<PersonObject>([], 0, personRow);
    }
    const where: Prisma.PersonWhereInput = {
      ...(term.length >= 2
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(role ? { roles: { some: { role } } } : {}),
    };
    const objects = (await prisma.person.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      skip: opts?.skip,
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
    })) as PersonObject[];
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.person.count({ where });
    return assemble(objects, total, personRow);
  },
};

const personRow = (p: PersonObject): unknown[] => [
  p.name ?? "",
  p.email ?? "",
  p.roles.map((r) => r.role).join(", "),
  iso(p.createdAt),
];

// ─── leads: q,status,intent,from,to ───────────────────────────────────

interface LeadObject {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  intent: string;
  status: string;
  personId: string | null;
  createdAt: Date;
  demoPending: boolean;
}

const leads: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const status = whitelist(f.status, LEAD_STATUSES, "status");
    const intent = whitelist(f.intent, LEAD_INTENTS, "intent");
    const term = f.q?.trim() ?? "";
    const range = dateRange(f.from, f.to);
    const where: Prisma.LeadWhereInput = {
      ...(term.length >= 2
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(intent ? { intent } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const rows = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      skip: opts?.skip,
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
    // demoPending = la persona ligada sigue en modo demo - habilita el
    // botón "Convertir a usuario real" en la UI admin.
    const personIds = rows.map((l) => l.personId).filter((x): x is string => !!x);
    const persons = personIds.length
      ? await prisma.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, isDemoAccount: true },
        })
      : [];
    const demoById = new Map(persons.map((p) => [p.id, p.isDemoAccount]));
    const objects: LeadObject[] = rows.map((l) => ({
      ...l,
      demoPending: l.personId ? (demoById.get(l.personId) ?? false) : false,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.lead.count({ where });
    return assemble(objects, total, (l) => [
      l.name,
      l.email,
      l.phone ?? "",
      l.roles.join(", "),
      l.intent,
      l.status,
      iso(l.createdAt),
    ]);
  },
};

// ─── payment-events: paymentId,type,actor,from,to - ledger BIAN ───────
// payload/prevHash/payloadHash se devuelven completos en objects: son la
// evidencia que verify-chain recalcula.

const paymentEvents: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const range = dateRange(f.from, f.to);
    const where: Prisma.PaymentEventWhereInput = {
      ...(f.paymentId ? { paymentId: f.paymentId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.actor ? { actor: f.actor } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const objects = await prisma.paymentEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { seq: "desc" }],
      take: opts?.take,
      skip: opts?.skip,
    });
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.paymentEvent.count({ where });
    return assemble(objects, total, (e) => [
      iso(e.createdAt),
      e.paymentId,
      e.seq,
      e.type,
      e.actor,
    ]);
  },
};

// ─── gateway-transactions: paymentId,endpoint,direction,ok,correlationId,from,to
// requestBody/responseBody salen tal cual en objects - ya sanitizados en
// escritura (firma "s" → huella sha256, nunca el secreto).

const gatewayTransactions: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const direction = whitelist(f.direction, GATEWAY_DIRECTIONS, "direction");
    const ok = whitelist(f.ok, ["true", "false"] as const, "ok");
    const range = dateRange(f.from, f.to);
    const where: Prisma.GatewayTransactionWhereInput = {
      ...(f.paymentId ? { paymentId: f.paymentId } : {}),
      ...(f.correlationId ? { correlationId: f.correlationId } : {}),
      ...(f.endpoint?.trim() ? { endpoint: { contains: f.endpoint.trim() } } : {}),
      ...(direction ? { direction } : {}),
      ...(ok ? { ok: ok === "true" } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const objects = await prisma.gatewayTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      skip: opts?.skip,
    });
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.gatewayTransaction.count({ where });
    return assemble(objects, total, (t) => [
      iso(t.createdAt),
      t.provider,
      t.endpoint,
      t.httpStatus ?? "",
      t.ok ? "si" : "no",
      t.paymentId ?? "",
    ]);
  },
};

// ─── membership-subscriptions: personId,academyId,status,from,to ──────

interface SubscriptionObject {
  id: string;
  status: string;
  flowSubscriptionId: string | null;
  nextInvoiceAt: Date | null;
  lastInvoiceId: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  plan: { id: string; name: string } | null;
  person: { id: string; name: string } | null;
  academy: { id: string; name: string } | null;
}

const membershipSubscriptions: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const status = whitelist(f.status, SUBSCRIPTION_STATUSES, "status");
    const range = dateRange(f.from, f.to);
    const where: Prisma.MembershipSubscriptionWhereInput = {
      ...(f.personId ? { personId: f.personId } : {}),
      ...(f.academyId ? { academyId: f.academyId } : {}),
      ...(status ? { status } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const rows = await prisma.membershipSubscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      skip: opts?.skip,
      select: {
        id: true,
        personId: true,
        academyId: true,
        status: true,
        flowSubscriptionId: true,
        nextInvoiceAt: true,
        lastInvoiceId: true,
        canceledAt: true,
        createdAt: true,
        plan: { select: { id: true, name: true } },
      },
    });
    const [people, academies] = await Promise.all([
      peopleByIds(
        prisma,
        rows.map((s) => s.personId),
      ),
      academiesByIds(
        prisma,
        rows.map((s) => s.academyId),
      ),
    ]);
    const objects: SubscriptionObject[] = rows.map(
      ({ personId, academyId, ...s }) => ({
        ...s,
        person: people.get(personId) ?? null,
        academy: academies.get(academyId) ?? null,
      }),
    );
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.membershipSubscription.count({ where });
    return assemble(objects, total, (s) => [
      s.person?.name ?? "",
      s.academy?.name ?? "",
      s.plan?.name ?? "",
      s.status,
      iso(s.nextInvoiceAt),
    ]);
  },
};

// ─── payouts: actorType,status,from,to (sobre periodStart) ────────────

interface PayoutObject {
  id: string;
  actorType: string;
  actor: { id: string; name: string } | null;
  periodStart: Date;
  periodEnd: Date;
  gross: number;
  platformFee: number;
  net: number;
  status: string;
  paidAt: Date | null;
}

const payouts: EntityHandler = {
  async execute(prisma, _scope, f, opts) {
    const actorType = whitelist(f.actorType, ACTOR_TYPES, "actorType");
    const status = whitelist(f.status, PAYOUT_STATUSES, "status");
    const range = dateRange(f.from, f.to);
    const where: Prisma.PayoutWhereInput = {
      ...(actorType ? { actorType } : {}),
      ...(status ? { status } : {}),
      ...(range ? { periodStart: range } : {}),
    };
    const rows = await prisma.payout.findMany({
      where,
      orderBy: { periodStart: "desc" },
      take: opts?.take,
      skip: opts?.skip,
    });
    // actorId → nombre según actorType (PRODUCER→Person, ACADEMY→Academy,
    // VENUE→Venue - FKs escalares sin relación en schema).
    const idsByType = (t: string) =>
      rows.filter((r) => r.actorType === t).map((r) => r.actorId);
    const [producers, academies, venues] = await Promise.all([
      peopleByIds(prisma, idsByType("PRODUCER")),
      academiesByIds(prisma, idsByType("ACADEMY")),
      (async () => {
        const ids = [...new Set(idsByType("VENUE"))];
        if (!ids.length) return new Map<string, { id: string; name: string }>();
        const vs = await prisma.venue.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        return new Map(vs.map((v) => [v.id, v]));
      })(),
    ]);
    const actorOf = (t: string, id: string) =>
      t === "PRODUCER"
        ? (producers.get(id) ?? null)
        : t === "ACADEMY"
          ? (academies.get(id) ?? null)
          : t === "VENUE"
            ? (venues.get(id) ?? null)
            : null;
    const objects: PayoutObject[] = rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actor: actorOf(r.actorType, r.actorId),
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      gross: r.gross,
      platformFee: r.platformFee,
      net: r.net,
      status: r.status,
      paidAt: r.paidAt,
    }));
    const total =
      opts?.total === false
        ? objects.length
        : await prisma.payout.count({ where });
    return assemble(
      objects,
      total,
      (p) => [
        `${p.periodStart.toISOString().slice(0, 10)} – ${p.periodEnd
          .toISOString()
          .slice(0, 10)}`,
        p.actor?.name ?? "",
        p.gross,
        p.platformFee,
        p.net,
        p.status,
        iso(p.paidAt),
      ],
      (objs, t) => [
        `${t} liquidaciones · en página: bruto ${clp(
          objs.reduce((a, p) => a + p.gross, 0),
        )} · neto ${clp(objs.reduce((a, p) => a + p.net, 0))}`,
      ],
    );
  },
};

export const ADMIN_ENTITIES: Record<string, EntityHandler> = {
  events,
  classes,
  payments,
  tickets,
  academies,
  venues,
  rentals,
  people,
  leads,
  "payment-events": paymentEvents,
  "gateway-transactions": gatewayTransactions,
  "membership-subscriptions": membershipSubscriptions,
  payouts,
};
