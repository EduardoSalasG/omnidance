import type { Prisma } from "@prisma/client";
import type { QueryFilters } from "@omnidance/shared";
import type { PrismaService } from "../../prisma.service";
import {
  clp,
  dateRange,
  iso,
  peopleByIds,
  personNames,
  whitelist,
  type EntityHandler,
  type QueryScope,
} from "./helpers";

/**
 * Entidades del lente ACADEMY_OWNER (spec analytics/query-console):
 * students/attendance/bookings/memberships/payments/private_lessons,
 * scopiadas a las academias del owner (scope.academyId ya validado -
 * academia ajena llega como `{in: []}` → vacío).
 */

const acad = (scope: QueryScope): string | { in: string[] } =>
  scope.academyId ?? { in: [] };

const ENROLLMENT_STATUS = [
  "ACTIVE",
  "PAUSED",
  "TRIAL",
  "FROZEN",
  "ONLINE",
] as const;
const BOOKING_STATUS = ["BOOKED", "WAITLIST", "CANCELLED"] as const;
const SUBSCRIPTION_STATUS = [
  "PENDING_CARD",
  "ACTIVATING",
  "ACTIVE",
  "CANCEL_PENDING",
  "CANCELED",
  "FAILED_CARD",
] as const;
const PAYMENT_STATUS = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
const ORDER_TYPES = [
  "TICKET",
  "SERIES_PASS",
  "MEMBERSHIP",
  "PRIVATE_LESSON",
  "WORKSHOP",
  "PLATFORM_SUB",
] as const;
const PRIVATE_LESSON_STATUS = [
  "REQUESTED",
  "CONFIRMED",
  "DONE",
  "CANCELLED",
] as const;
const COMMISSION_OPTS = ["all", "paid", "pending"] as const;

// ─── students: Enrollment + plan + persona ────────────────────────────

const students: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const status = whitelist(f.status, ENROLLMENT_STATUS, "status");
    const range = dateRange(f.from, f.to);
    const term = f.q?.trim() ?? "";
    // q filtra por nombre del alumno (Person FK escalar - join manual).
    let personIdIn: string[] | undefined;
    if (term.length >= 2) {
      const matches = await prisma.person.findMany({
        where: { name: { contains: term, mode: "insensitive" } },
        select: { id: true },
        take: 500,
      });
      personIdIn = matches.map((m) => m.id);
    } else if (term) {
      personIdIn = [];
    }
    const where: Prisma.EnrollmentWhereInput = {
      academyId: acad(scope),
      ...(status ? { status } : {}),
      ...(f.planId ? { planId: f.planId } : {}),
      ...(range ? { startedAt: range } : {}),
      ...(personIdIn ? { personId: { in: personIdIn } } : {}),
    };
    const rows = await prisma.enrollment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      select: {
        id: true,
        personId: true,
        status: true,
        startedAt: true,
        endsAt: true,
        plan: { select: { id: true, name: true } },
      },
    });
    const names = await personNames(
      prisma,
      rows.map((r) => r.personId),
    );
    const total =
      opts?.total === false
        ? rows.length
        : await prisma.enrollment.count({ where });
    return {
      rows: rows.map((r) => [
        names.get(r.personId) ?? "?",
        r.plan?.name ?? "",
        r.status,
        iso(r.startedAt),
        iso(r.endsAt),
      ]),
      objects: rows,
      total,
      summary: [`${total} alumnos`],
    };
  },
};

// ─── attendance: Attendance → Class → ClassSlot → ClassSeries ─────────

const attendance: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const range = dateRange(f.from, f.to);
    const classWhere: Prisma.ClassWhereInput = {
      slot: {
        academyId: acad(scope),
        ...(f.seriesId ? { seriesId: f.seriesId } : {}),
      },
      ...(range ? { date: range } : {}),
      // instructorId matchea el override de la clase o el default del slot.
      ...(f.instructorId
        ? {
            OR: [
              { instructorId: f.instructorId },
              {
                instructorId: null,
                slot: { instructorId: f.instructorId },
              },
            ],
          }
        : {}),
    };
    const where: Prisma.AttendanceWhereInput = { class: classWhere };
    const rows = await prisma.attendance.findMany({
      where,
      orderBy: { class: { date: "desc" } },
      take: opts?.take,
      select: {
        personId: true,
        checkedAt: true,
        class: {
          select: {
            date: true,
            instructorId: true,
            slot: {
              select: {
                instructorId: true,
                series: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const instructorOf = (r: (typeof rows)[number]) =>
      r.class.instructorId ?? r.class.slot.instructorId;
    const names = await personNames(prisma, [
      ...rows.map((r) => r.personId),
      ...rows.map(instructorOf).filter((x): x is string => !!x),
    ]);
    const total =
      opts?.total === false
        ? rows.length
        : await prisma.attendance.count({ where });
    return {
      rows: rows.map((r) => [
        iso(r.class.date),
        r.class.slot.series?.name ?? "",
        names.get(r.personId) ?? "?",
        names.get(instructorOf(r) ?? "") ?? "",
      ]),
      objects: rows,
      total,
      summary: [`${total} asistencias`],
    };
  },
};

// ─── bookings: ClassBooking → Class → ClassSlot ───────────────────────

const bookings: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const status = whitelist(f.status, BOOKING_STATUS, "status");
    const range = dateRange(f.from, f.to);
    const where: Prisma.ClassBookingWhereInput = {
      ...(status ? { status } : {}),
      class: {
        slot: {
          academyId: acad(scope),
          ...(f.seriesId ? { seriesId: f.seriesId } : {}),
        },
        ...(range ? { date: range } : {}),
      },
    };
    const rows = await prisma.classBooking.findMany({
      where,
      orderBy: { class: { date: "desc" } },
      take: opts?.take,
      select: {
        id: true,
        personId: true,
        status: true,
        refunded: true,
        createdAt: true,
        class: {
          select: {
            date: true,
            slot: { select: { series: { select: { name: true } } } },
          },
        },
      },
    });
    const names = await personNames(
      prisma,
      rows.map((r) => r.personId),
    );
    const total =
      opts?.total === false
        ? rows.length
        : await prisma.classBooking.count({ where });
    return {
      rows: rows.map((r) => [
        iso(r.class.date),
        r.class.slot.series?.name ?? "",
        names.get(r.personId) ?? "?",
        r.status,
        r.refunded ? "si" : "no",
      ]),
      objects: rows,
      total,
      summary: [`${total} reservas de clase`],
    };
  },
};

// ─── memberships: MembershipSubscription + plan ───────────────────────

const memberships: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const status = whitelist(f.status, SUBSCRIPTION_STATUS, "status");
    const range = dateRange(f.from, f.to);
    const where: Prisma.MembershipSubscriptionWhereInput = {
      academyId: acad(scope),
      ...(status ? { status } : {}),
      ...(f.planId ? { planId: f.planId } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const rows = await prisma.membershipSubscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      select: {
        id: true,
        personId: true,
        status: true,
        nextInvoiceAt: true,
        createdAt: true,
        plan: { select: { id: true, name: true } },
      },
    });
    const names = await personNames(
      prisma,
      rows.map((r) => r.personId),
    );
    const total =
      opts?.total === false
        ? rows.length
        : await prisma.membershipSubscription.count({ where });
    return {
      rows: rows.map((r) => [
        names.get(r.personId) ?? "?",
        r.plan?.name ?? "",
        r.status,
        iso(r.nextInvoiceAt),
      ]),
      objects: rows,
      total,
      summary: [`${total} suscripciones`],
    };
  },
};

// ─── payments: órdenes atribuibles a la academia ──────────────────────
// Payment no tiene columna academy - la atribución replica la regla del
// settlement (payout-settlement.service): MEMBERSHIP por refId
// mem_<planId>_*, PRIVATE por refId pvt_<academyId>_*, WORKSHOP/claims por
// los paymentId materializados en ClassBooking / PrivateLesson /
// PaymentClaim (post-settle; una orden PENDING aún no atribuible no
// aparece hasta que se liquida).

const payments: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const academyId = acad(scope);
    const status = whitelist(f.status, PAYMENT_STATUS, "status");
    const orderType = whitelist(f.orderType, ORDER_TYPES, "orderType");
    // El catálogo nombra el tipo "PRIVATE_LESSON"; en Payment.orderType se
    // persiste como "PRIVATE" (checkout pvt_<academyId>_) - se traduce.
    const orderTypeWhere =
      orderType === "PRIVATE_LESSON"
        ? { orderType: { in: ["PRIVATE", "PRIVATE_LESSON"] } }
        : orderType
          ? { orderType }
          : {};
    const range = dateRange(f.from, f.to);

    const academyIds =
      typeof academyId === "string" ? [academyId] : academyId.in;
    const [plans, linkedIds] = await Promise.all([
      academyIds.length
        ? prisma.membershipPlan.findMany({
            where: { academyId },
            select: { id: true },
          })
        : Promise.resolve([]),
      academyIds.length
        ? Promise.all([
            prisma.classBooking.findMany({
              where: {
                class: { slot: { academyId } },
                paymentId: { not: null },
              },
              select: { paymentId: true },
            }),
            prisma.privateLesson.findMany({
              where: { academyId, paymentId: { not: null } },
              select: { paymentId: true },
            }),
            prisma.paymentClaim.findMany({
              where: { academyId, paymentId: { not: null } },
              select: { paymentId: true },
            }),
          ]).then((g) =>
            [
              ...new Set(
                g.flatMap((l) =>
                  l.map((x) => x.paymentId).filter((x): x is string => !!x),
                ),
              ),
            ],
          )
        : Promise.resolve([]),
    ]);

    const scopeOr: Prisma.PaymentWhereInput[] = [
      ...plans.map((p) => ({
        orderType: "MEMBERSHIP",
        refId: { startsWith: `mem_${p.id}_` },
      })),
      ...academyIds.map((id) => ({
        orderType: "PRIVATE",
        refId: { startsWith: `pvt_${id}_` },
      })),
      ...(linkedIds.length ? [{ id: { in: linkedIds } }] : []),
    ];
    if (!scopeOr.length) {
      return { rows: [], objects: [], total: 0, summary: ["0 pagos"] };
    }
    const where: Prisma.PaymentWhereInput = {
      AND: [
        {
          ...(status ? { status } : {}),
          ...orderTypeWhere,
          ...(range ? { createdAt: range } : {}),
        },
        { OR: scopeOr },
      ],
    };
    const rows = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
      select: {
        id: true,
        personId: true,
        orderType: true,
        amount: true,
        net: true,
        status: true,
        createdAt: true,
      },
    });
    const people = await peopleByIds(
      prisma,
      rows.map((p) => p.personId),
    );
    const total =
      opts?.total === false
        ? rows.length
        : await prisma.payment.count({ where });
    const paid = rows
      .filter((p) => p.status === "PAID")
      .reduce((a, p) => a + p.amount, 0);
    return {
      rows: rows.map((p) => [
        iso(p.createdAt),
        people.get(p.personId)?.name ?? "",
        p.orderType,
        p.amount,
        p.net,
        p.status,
      ]),
      objects: rows,
      total,
      summary: [`${total} pagos · ${clp(paid)} pagados en esta página`],
    };
  },
};

// ─── private_lessons: PrivateLesson + instructor ──────────────────────

const privateLessons: EntityHandler = {
  async execute(prisma, scope, f, opts) {
    const status = whitelist(f.status, PRIVATE_LESSON_STATUS, "status");
    const commission = whitelist(f.commission, COMMISSION_OPTS, "commission");
    const range = dateRange(f.from, f.to);
    const where: Prisma.PrivateLessonWhereInput = {
      academyId: acad(scope),
      ...(status ? { status } : {}),
      ...(f.instructorId ? { instructorId: f.instructorId } : {}),
      ...(commission === "paid"
        ? { commissionPaidAt: { not: null } }
        : commission === "pending"
          ? { commissionPaidAt: null }
          : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const rows = await prisma.privateLesson.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts?.take,
    });
    const names = await personNames(prisma, [
      ...rows.map((r) => r.personId),
      ...rows.map((r) => r.instructorId).filter((x): x is string => !!x),
    ]);
    const total =
      opts?.total === false
        ? rows.length
        : await prisma.privateLesson.count({ where });
    return {
      rows: rows.map((r) => [
        iso(r.createdAt),
        names.get(r.personId) ?? "?",
        names.get(r.instructorId ?? "") ?? "",
        iso(r.scheduledAt),
        r.price,
        r.commissionPct,
        r.commissionPaidAt ? "si" : "",
        r.status,
      ]),
      objects: rows,
      total,
      summary: [`${total} clases particulares`],
    };
  },
};

export const ACADEMY_ENTITIES: Record<string, EntityHandler> = {
  students,
  attendance,
  bookings,
  memberships,
  payments,
  private_lessons: privateLessons,
};
