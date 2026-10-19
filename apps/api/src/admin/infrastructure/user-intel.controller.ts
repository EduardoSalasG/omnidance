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
import { clMonthStart, clWeekStart } from "../../common/cl-time";
import {
  decodeClassRef,
  decodeMembershipRef,
  decodePlatformSubRef,
  decodePrivateRef,
} from "../../payments/domain/order-ref";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { effectiveCapacity } from "../../academies/domain/academy.service";
import { ApiProperty } from "@nestjs/swagger";

const DAY_MS = 86_400_000;
const ROLE_KEY = /^[A-Z0-9_]+$/;

/** Primer día del mes calendario en curso (para métricas "del mes"). */
const monthStart = (d = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1);

class AnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(ROLE_KEY, { message: "rol inválido" })
  @ApiProperty()
  role!: string;
}

type EventLite = { id: string; name: string; startsAt: Date };

/**
 * Intel de usuarios para la consola admin: ficha 360° por persona
 * (detail) y analítica por lente de rol (analytics). Read-only; la
 * gestión de roles sigue en AdminController.
 *
 * Notas de schema (Ticket/Checkin/StaffAssignment/Payment/VenueRental
 * no declaran relaciones Prisma - eventId/personId son FKs peladas):
 * los nombres de evento/persona se resuelven con lookups batch.
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class UserIntelController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Ficha 360° ──────────────────────────────────────────────────────

  /**
   * GET /api/admin/users/:personId/detail - datos personales (nunca
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

    const scores = await this.personScores(personId);
    return { person: personData, roles, roleData, scores };
  }

  /**
   * Scores de relación de la persona por actor (spec
   * academy-score-refine): RelationshipScore ordenado por score desc,
   * con el nombre del actor resuelto por su tabla (ACADEMY→Academy,
   * VENUE→Venue; PRODUCER/DJ/INSTRUCTOR → Person).
   */
  private async personScores(personId: string) {
    const rows = await this.prisma.relationshipScore.findMany({
      where: { personId },
      orderBy: { score: "desc" },
      select: {
        actorType: true,
        actorId: true,
        score: true,
        segment: true,
        breakdown: true,
        computedAt: true,
      },
    });
    if (!rows.length) return [];

    const academyIds = rows
      .filter((r) => r.actorType === "ACADEMY")
      .map((r) => r.actorId);
    const venueIds = rows
      .filter((r) => r.actorType === "VENUE")
      .map((r) => r.actorId);
    const personIds = rows
      .filter((r) => !["ACADEMY", "VENUE"].includes(r.actorType))
      .map((r) => r.actorId);
    const [academies, venues, actors] = await Promise.all([
      academyIds.length
        ? this.prisma.academy.findMany({
            where: { id: { in: academyIds } },
            select: { id: true, name: true },
          })
        : [],
      venueIds.length
        ? this.prisma.venue.findMany({
            where: { id: { in: venueIds } },
            select: { id: true, name: true },
          })
        : [],
      personIds.length
        ? this.prisma.person.findMany({
            where: { id: { in: personIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const name = new Map<string, string>();
    for (const a of academies) name.set(`ACADEMY:${a.id}`, a.name);
    for (const v of venues) name.set(`VENUE:${v.id}`, v.name);
    for (const p of actors) name.set(`${p.id}`, p.name);

    return rows.map((r) => ({
      actorType: r.actorType,
      actorId: r.actorId,
      actorName:
        name.get(`${r.actorType}:${r.actorId}`) ?? name.get(r.actorId) ?? null,
      score: r.score,
      segment: r.segment,
      breakdown: r.breakdown,
      computedAt: r.computedAt,
    }));
  }

  /**
   * GET /api/admin/academies/score-health - salud de alumnos por
   * academia (spec academy-score-refine): distribución de segmentos,
   * score medio, top-3 y en-riesgo. Ordenado por avgScore desc.
   */
  @Get("academies/score-health")
  async academyScoreHealth() {
    const scores = await this.prisma.relationshipScore.findMany({
      where: { actorType: "ACADEMY" },
      select: {
        actorId: true,
        personId: true,
        score: true,
        segment: true,
        computedAt: true,
      },
    });
    if (!scores.length) return { items: [] };

    const academies = await this.prisma.academy.findMany({
      where: { id: { in: [...new Set(scores.map((s) => s.actorId))] } },
      select: { id: true, name: true, tier: true, billingBlockedAt: true },
    });
    const academyName = new Map(academies.map((a) => [a.id, a.name]));
    const academyTier = new Map(academies.map((a) => [a.id, a.tier]));
    const academyBlocked = new Map(
      academies.map((a) => [a.id, a.billingBlockedAt != null]),
    );

    const byAcademy = new Map<string, typeof scores>();
    for (const s of scores) {
      (byAcademy.get(s.actorId) ?? byAcademy.set(s.actorId, []).get(s.actorId)!).push(s);
    }

    // Facturación por academia: pagos PAID que resuelven a actor ACADEMY
    // (misma resolución que finance/accrual) del mes CL vigente y el
    // anterior — para la comparación mes vs mes del card.
    const mStart = clMonthStart(new Date());
    const mPrevStart = clMonthStart(new Date(mStart.getTime() - DAY_MS));
    const [billingPays, payEvents, payPlans, payClasses] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: "PAID", createdAt: { gte: mPrevStart } },
        select: {
          orderType: true,
          refId: true,
          eventId: true,
          amount: true,
          createdAt: true,
        },
      }),
      this.prisma.event.findMany({
        where: { academyId: { not: null } },
        select: { id: true, academyId: true },
      }),
      this.prisma.membershipPlan.findMany({
        select: { id: true, academyId: true },
      }),
      this.prisma.class.findMany({
        select: { id: true, slot: { select: { academyId: true } } },
      }),
    ]);
    const evAcademy = new Map(payEvents.map((e) => [e.id, e.academyId!]));
    const planAcademy = new Map(payPlans.map((p) => [p.id, p.academyId]));
    const classAcademy = new Map(
      payClasses.map((c) => [c.id, c.slot.academyId]),
    );
    const academyOfPay = (p: (typeof billingPays)[number]) => {
      switch (p.orderType) {
        case "TICKET":
          return p.eventId ? (evAcademy.get(p.eventId) ?? null) : null;
        case "MEMBERSHIP": {
          const id = decodeMembershipRef(p.refId)?.planId;
          return id ? (planAcademy.get(id) ?? null) : null;
        }
        case "WORKSHOP": {
          const id = decodeClassRef(p.refId)?.classId;
          return id ? (classAcademy.get(id) ?? null) : null;
        }
        case "PRIVATE":
          return decodePrivateRef(p.refId)?.academyId ?? null;
        default:
          return null;
      }
    };
    const billing = new Map<string, { month: number; prev: number }>();
    for (const p of billingPays) {
      const academyId = academyOfPay(p);
      if (!academyId) continue;
      const b = billing.get(academyId) ?? { month: 0, prev: 0 };
      if (p.createdAt >= mStart) b.month += p.amount;
      else b.prev += p.amount;
      billing.set(academyId, b);
    }

    // Inscritos (Enrollment ACTIVE) por academia + los que ya existían
    // al inicio del mes (startedAt < mStart) para la comparación.
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        academyId: { in: [...byAcademy.keys()] },
        status: "ACTIVE",
      },
      select: { academyId: true, startedAt: true, planId: true },
    });
    const enrolledBy = new Map<string, { now: number; prev: number }>();
    const planBy = new Map<string, { now: number; prev: number }>();
    for (const e of enrollments) {
      const b = enrolledBy.get(e.academyId) ?? { now: 0, prev: 0 };
      b.now++;
      if (e.startedAt < mStart) b.prev++;
      enrolledBy.set(e.academyId, b);
      // Activos con plan comprado (vigente) - pueden no asistir.
      if (e.planId) {
        const p = planBy.get(e.academyId) ?? { now: 0, prev: 0 };
        p.now++;
        if (e.startedAt < mStart) p.prev++;
        planBy.set(e.academyId, p);
      }
    }

    // Activos = alumnos únicos con check-in a clases de la academia en
    // el período (Attendance→class→slot.academyId). Mes vigente vs
    // anterior — comparable porque la asistencia sí tiene timestamp.
    const attendances = await this.prisma.attendance.findMany({
      where: {
        checkedAt: { gte: mPrevStart },
        class: { slot: { academyId: { in: [...byAcademy.keys()] } } },
      },
      select: {
        personId: true,
        checkedAt: true,
        class: { select: { slot: { select: { academyId: true } } } },
      },
    });
    const activeBy = new Map<
      string,
      { now: Set<string>; prev: Set<string> }
    >();
    for (const at of attendances) {
      const academyId = at.class.slot.academyId;
      if (!academyId) continue;
      const b =
        activeBy.get(academyId) ?? { now: new Set(), prev: new Set() };
      (at.checkedAt >= mStart ? b.now : b.prev).add(at.personId);
      activeBy.set(academyId, b);
    }

    // Segmentos de la semana anterior: último snapshot previo al lunes
    // CL vigente (job academies.segment_snapshots). null si aún no hay.
    const weekStart = clWeekStart(new Date());
    const prevSnaps = await this.prisma.academySegmentSnapshot.findMany({
      where: {
        academyId: { in: [...byAcademy.keys()] },
        weekStart: { lt: weekStart },
      },
      orderBy: { weekStart: "desc" },
      select: { academyId: true, segments: true },
    });
    const prevSegs = new Map<string, Record<string, number>>();
    for (const s of prevSnaps) {
      if (!prevSegs.has(s.academyId))
        prevSegs.set(s.academyId, s.segments as Record<string, number>);
    }

    const items = [...byAcademy.entries()].map(([academyId, rows]) => {
      const segments: Record<string, number> = {};
      for (const r of rows) {
        const k = r.segment ?? "NONE";
        segments[k] = (segments[k] ?? 0) + 1;
      }
      return {
        academyId,
        academyName: academyName.get(academyId) ?? null,
        studentCount: rows.length,
        avgScore: Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length),
        // Última recomputación del set (el score más reciente manda).
        computedAt: rows.reduce(
          (m, r) => (r.computedAt > m ? r.computedAt : m),
          rows[0].computedAt,
        ),
        segments,
        billingMonthClp: billing.get(academyId)?.month ?? 0,
        billingPrevMonthClp: billing.get(academyId)?.prev ?? 0,
        enrolledCount: enrolledBy.get(academyId)?.now ?? 0,
        enrolledPrev: enrolledBy.get(academyId)?.prev ?? 0,
        planCount: planBy.get(academyId)?.now ?? 0,
        planPrev: planBy.get(academyId)?.prev ?? 0,
        activeNow: activeBy.get(academyId)?.now.size ?? 0,
        activePrev: activeBy.get(academyId)?.prev.size ?? 0,
        segmentsPrev: prevSegs.get(academyId) ?? null,
        tier: academyTier.get(academyId) ?? null,
        billingBlocked: academyBlocked.get(academyId) ?? false,
      };
    });
    items.sort((a, b) => b.avgScore - a.avgScore);
    return { items };
  }

  /**
   * GET /api/admin/academies/:id/detail - ficha admin de una academia:
   * datos generales, KPIs operativos (misma semántica que score-health)
   * y listas de trabajo (clases próximas, top alumnos, pagos recientes).
   */
  @Get("academies/:id/detail")
  async academyDetail(@Param("id") id: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        active: true,
        createdAt: true,
        address: true,
        description: true,
        instagram: true,
        whatsapp: true,
        website: true,
        tier: true,
        billingCycle: true,
        trialEndsAt: true,
        billingGraceUntil: true,
        billingBlockedAt: true,
        ownerId: true,
        defaultQuorum: true,
        instructors: {
          select: {
            personId: true,
            payType: true,
            payAmount: true,
            payClasses: true,
            commissionPct: true,
          },
        },
        staff: {
          select: {
            personId: true,
            canStudents: true,
            canPayments: true,
            canPlans: true,
            canSchedule: true,
            canProfile: true,
            canTeam: true,
            canBilling: true,
          },
        },
        plans: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            classCount: true,
            weeklyClasses: true,
            periodDays: true,
            active: true,
            _count: { select: { enrollments: true } },
          },
        },
        classSlots: { select: { id: true } },
      },
    });
    if (!academy) throw new NotFoundException("academia no encontrada");

    const mStart = clMonthStart(new Date());
    const mPrevStart = clMonthStart(new Date(mStart.getTime() - DAY_MS));

    const [scores, enrollments, attendances, payments, payEvents, payPlans, payClasses, upcoming] =
      await Promise.all([
        this.prisma.relationshipScore.findMany({
          where: { actorType: "ACADEMY", actorId: id },
          select: { personId: true, score: true, segment: true, computedAt: true },
          orderBy: { score: "desc" },
        }),
        this.prisma.enrollment.findMany({
          where: { academyId: id, status: "ACTIVE" },
          select: { startedAt: true, planId: true },
        }),
        this.prisma.attendance.findMany({
          where: {
            checkedAt: { gte: mPrevStart },
            class: { slot: { academyId: id } },
          },
          select: { personId: true, checkedAt: true },
        }),
        this.prisma.payment.findMany({
          where: { status: "PAID", createdAt: { gte: mPrevStart } },
          select: {
            orderType: true,
            refId: true,
            eventId: true,
            amount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        this.prisma.event.findMany({
          where: { academyId: { not: null } },
          select: { id: true, academyId: true },
        }),
        this.prisma.membershipPlan.findMany({
          select: { id: true, academyId: true },
        }),
        this.prisma.class.findMany({
          select: { id: true, slot: { select: { academyId: true } } },
        }),
        this.prisma.class.findMany({
          where: {
            slot: { academyId: id },
            date: { gte: new Date() },
            cancelled: false,
          },
          select: {
            id: true,
            date: true,
            capacity: true,
            _count: { select: { attendances: true } },
            slot: {
              select: {
                startTime: true,
                types: { select: { type: { select: { name: true } } } },
                series: { select: { name: true } },
              },
            },
          },
          orderBy: { date: "asc" },
          take: 20,
        }),
      ]);

    const evAcademy = new Map(payEvents.map((e) => [e.id, e.academyId!]));
    const planAcademy = new Map(payPlans.map((p) => [p.id, p.academyId]));
    const classAcademy = new Map(
      payClasses.map((c) => [c.id, c.slot.academyId]),
    );
    const academyOfPay = (p: (typeof payments)[number]) => {
      switch (p.orderType) {
        case "TICKET":
          return p.eventId ? (evAcademy.get(p.eventId) ?? null) : null;
        case "MEMBERSHIP": {
          const pid = decodeMembershipRef(p.refId)?.planId;
          return pid ? (planAcademy.get(pid) ?? null) : null;
        }
        case "WORKSHOP": {
          const cid = decodeClassRef(p.refId)?.classId;
          return cid ? (classAcademy.get(cid) ?? null) : null;
        }
        case "PRIVATE":
          return decodePrivateRef(p.refId)?.academyId ?? null;
        default:
          return null;
      }
    };

    let billingMonthClp = 0;
    let billingPrevMonthClp = 0;
    const recentPays: { amount: number; createdAt: Date; orderType: string }[] = [];
    for (const p of payments) {
      if (academyOfPay(p) !== id) continue;
      if (p.createdAt >= mStart) billingMonthClp += p.amount;
      else billingPrevMonthClp += p.amount;
      if (recentPays.length < 10)
        recentPays.push({
          amount: p.amount,
          createdAt: p.createdAt,
          orderType: p.orderType,
        });
    }

    const segments: Record<string, number> = {};
    let scoreSum = 0;
    let computedAt: Date | null = null;
    for (const s of scores) {
      const k = s.segment ?? "NONE";
      segments[k] = (segments[k] ?? 0) + 1;
      scoreSum += s.score;
      if (!computedAt || s.computedAt > computedAt) computedAt = s.computedAt;
    }
    const enrolledPrev = enrollments.filter(
      (e) => e.startedAt < mStart,
    ).length;
    const activeNow = new Set(
      attendances.filter((a) => a.checkedAt >= mStart).map((a) => a.personId),
    ).size;
    const activePrev = new Set(
      attendances.filter((a) => a.checkedAt < mStart).map((a) => a.personId),
    ).size;

    const personNames = await this.peopleByIds([
      academy.ownerId,
      ...scores.slice(0, 15).map((s) => s.personId),
      ...academy.instructors.map((i) => i.personId),
      ...academy.staff.map((s) => s.personId),
    ]);

    return {
      academy: {
        id: academy.id,
        name: academy.name,
        active: academy.active,
        createdAt: academy.createdAt,
        address: academy.address,
        description: academy.description,
        instagram: academy.instagram,
        whatsapp: academy.whatsapp,
        website: academy.website,
        tier: academy.tier,
        billingCycle: academy.billingCycle,
        trialEndsAt: academy.trialEndsAt,
        billingGraceUntil: academy.billingGraceUntil,
        billingBlockedAt: academy.billingBlockedAt,
        defaultQuorum: academy.defaultQuorum,
        ownerName: personNames.get(academy.ownerId)?.name ?? null,
        instructorCount: academy.instructors.length,
        staffCount: academy.staff.length,
      },
      kpis: {
        studentCount: scores.length,
        avgScore: scores.length ? Math.round(scoreSum / scores.length) : 0,
        computedAt,
        segments,
        enrolledCount: enrollments.length,
        enrolledPrev,
        planCount: enrollments.filter((e) => e.planId).length,
        activeNow,
        activePrev,
        billingMonthClp,
        billingPrevMonthClp,
        classSlotCount: academy.classSlots.length,
        planTotal: academy.plans.length,
      },
      upcoming: upcoming.map((c) => ({
        id: c.id,
        date: c.date,
        startTime: c.slot.startTime,
        capacity: c.capacity,
        bookedCount: c._count.attendances,
        title: c.slot.series?.name ?? "Clase",
        types: c.slot.types.map((x) => x.type.name),
      })),
      topStudents: scores.slice(0, 15).map((s) => ({
        personId: s.personId,
        name: personNames.get(s.personId)?.name ?? null,
        score: Math.round(s.score),
        segment: s.segment,
      })),
      recentPayments: recentPays,
      plans: academy.plans.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        price: p.price,
        classCount: p.classCount,
        weeklyClasses: p.weeklyClasses,
        periodDays: p.periodDays,
        active: p.active,
        enrollments: p._count.enrollments,
      })),
      team: {
        instructors: academy.instructors.map((i) => ({
          personId: i.personId,
          name: personNames.get(i.personId)?.name ?? null,
          payType: i.payType,
          payAmount: i.payAmount,
          payClasses: i.payClasses,
          commissionPct: i.commissionPct,
        })),
        staff: academy.staff.map((s) => ({
          personId: s.personId,
          name: personNames.get(s.personId)?.name ?? null,
          perms: (
            [
              "canStudents",
              "canPayments",
              "canPlans",
              "canSchedule",
              "canProfile",
              "canTeam",
              "canBilling",
            ] as const
          ).filter((k) => s[k]),
        })),
      },
    };
  }

  /**
   * GET /api/admin/academies/:id/planes/:planId - ficha admin de un plan:
   * todos sus campos + alumnos inscritos + pagos recientes del plan.
   */
  @Get("academies/:id/planes/:planId")
  async academyPlanDetail(
    @Param("id") id: string,
    @Param("planId") planId: string,
  ) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: planId },
      include: {
        academy: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!plan || plan.academyId !== id)
      throw new NotFoundException("plan no encontrado");

    const [enrollments, payments] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { planId },
        orderBy: { startedAt: "desc" },
        take: 50,
        select: { personId: true, status: true, startedAt: true },
      }),
      this.prisma.payment.findMany({
        where: { orderType: "MEMBERSHIP", status: "PAID" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { amount: true, createdAt: true, refId: true },
      }),
    ]);

    const names = await this.peopleByIds(enrollments.map((e) => e.personId));
    const planPays = payments
      .filter((p) => decodeMembershipRef(p.refId)?.planId === planId)
      .slice(0, 10)
      .map(({ amount, createdAt }) => ({ amount, createdAt }));

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        type: plan.type,
        price: plan.price,
        classCount: plan.classCount,
        weeklyClasses: plan.weeklyClasses,
        periodDays: plan.periodDays,
        description: plan.description,
        active: plan.active,
        flowPlanId: plan.flowPlanId,
        enrollmentTotal: plan._count.enrollments,
      },
      academy: plan.academy,
      enrollments: enrollments.map((e) => ({
        personId: e.personId,
        name: names.get(e.personId)?.name ?? null,
        status: e.status,
        startedAt: e.startedAt,
      })),
      recentPayments: planPays,
    };
  }

  /**
   * GET /api/admin/academies/:id/clases/:classId - ficha admin de una
   * clase: datos del horario + reservas + check-ins.
   */
  @Get("academies/:id/clases/:classId")
  async academyClassDetail(
    @Param("id") id: string,
    @Param("classId") classId: string,
  ) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        capacity: true,
        cancelled: true,
        instructorId: true,
        slot: {
          select: {
            startTime: true,
            endTime: true,
            capacity: true,
            academyId: true,
            academy: { select: { name: true } },
            series: { select: { name: true } },
            types: { select: { type: { select: { name: true } } } },
          },
        },
        instructors: { select: { personId: true } },
        attendances: {
          select: { personId: true, checkedAt: true },
          orderBy: { checkedAt: "desc" },
        },
        bookings: {
          select: { personId: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!cls || cls.slot.academyId !== id)
      throw new NotFoundException("clase no encontrada");

    const names = await this.peopleByIds([
      ...(cls.instructorId ? [cls.instructorId] : []),
      ...cls.instructors.map((i) => i.personId),
      ...cls.attendances.map((a) => a.personId),
      ...cls.bookings.map((b) => b.personId),
    ]);
    const booked = cls.bookings.filter((b) => b.status === "BOOKED").length;

    return {
      cls: {
        id: cls.id,
        date: cls.date,
        cancelled: cls.cancelled,
        startTime: cls.slot.startTime,
        endTime: cls.slot.endTime,
        title: cls.slot.series?.name ?? "Clase",
        types: cls.slot.types.map((x) => x.type.name),
        capacity: cls.capacity ?? cls.slot.capacity,
        bookedCount: booked,
        checkedIn: cls.attendances.length,
        instructors: [
          ...(cls.instructorId ? [cls.instructorId] : []),
          ...cls.instructors
            .map((i) => i.personId)
            .filter((p) => p !== cls.instructorId),
        ].map((p) => ({
          personId: p,
          name: names.get(p)?.name ?? null,
        })),
      },
      academyName: cls.slot.academy.name,
      bookings: cls.bookings.map((b) => ({
        personId: b.personId,
        name: names.get(b.personId)?.name ?? null,
        status: b.status,
        createdAt: b.createdAt,
      })),
      attendances: cls.attendances.map((a) => ({
        personId: a.personId,
        name: names.get(a.personId)?.name ?? null,
        checkedAt: a.checkedAt,
      })),
    };
  }

  /**
   * GET /api/admin/academies/:id/suscripcion - ficha de la suscripción
   * SaaS de la academia: estado, ciclo, cambios pendientes y cobros.
   */
  @Get("academies/:id/suscripcion")
  async academySubscription(@Param("id") id: string) {
    const [academy, sub, payments] = await Promise.all([
      this.prisma.academy.findUnique({
        where: { id },
        select: {
          name: true,
          tier: true,
          billingCycle: true,
          trialEndsAt: true,
          billingGraceUntil: true,
          billingBlockedAt: true,
        },
      }),
      this.prisma.platformSubscription.findFirst({
        where: { academyId: id, kind: "ACADEMY" },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.findMany({
        where: { orderType: "PLATFORM_SUB", status: "PAID" },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { amount: true, createdAt: true, refId: true },
      }),
    ]);
    if (!academy) throw new NotFoundException("academia no encontrada");

    const payerName = sub
      ? ((await this.peopleByIds([sub.personId])).get(sub.personId)?.name ??
        null)
      : null;

    return {
      academyName: academy.name,
      academy: {
        tier: academy.tier,
        billingCycle: academy.billingCycle,
        trialEndsAt: academy.trialEndsAt,
        billingGraceUntil: academy.billingGraceUntil,
        billingBlockedAt: academy.billingBlockedAt,
      },
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            tierCode: sub.tierCode,
            billingCycle: sub.billingCycle,
            pendingTierCode: sub.pendingTierCode,
            pendingBillingCycle: sub.pendingBillingCycle,
            nextInvoiceAt: sub.nextInvoiceAt,
            createdAt: sub.createdAt,
            canceledAt: sub.canceledAt,
            flowSubscriptionId: sub.flowSubscriptionId,
            payerName,
          }
        : null,
      payments: payments
        .filter(
          (p) =>
            sub && decodePlatformSubRef(p.refId)?.subscriptionId === sub.id,
        )
        .slice(0, 15)
        .map((p) => ({
          amount: p.amount,
          createdAt: p.createdAt,
          invoiceId: decodePlatformSubRef(p.refId)?.invoiceId ?? null,
        })),
      // Ingresos de la academia (tickets/membresías/talleres/particulares).
      revenue: await this.academyRevenue(id),
    };
  }

  /** Pagos PAID que resuelven a la academia — misma regla que score-health. */
  private async academyRevenue(academyId: string) {
    const [payments, evs, plans, classes] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: "PAID" },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          orderType: true,
          refId: true,
          eventId: true,
          amount: true,
          createdAt: true,
        },
      }),
      this.prisma.event.findMany({
        where: { academyId: { not: null } },
        select: { id: true, academyId: true },
      }),
      this.prisma.membershipPlan.findMany({
        select: { id: true, academyId: true },
      }),
      this.prisma.class.findMany({
        select: { id: true, slot: { select: { academyId: true } } },
      }),
    ]);
    const evAcademy = new Map(evs.map((e) => [e.id, e.academyId!]));
    const planAcademy = new Map(plans.map((p) => [p.id, p.academyId]));
    const classAcademy = new Map(classes.map((c) => [c.id, c.slot.academyId]));
    const resolve = (p: (typeof payments)[number]) => {
      switch (p.orderType) {
        case "TICKET":
          return p.eventId ? (evAcademy.get(p.eventId) ?? null) : null;
        case "MEMBERSHIP": {
          const pid = decodeMembershipRef(p.refId)?.planId;
          return pid ? (planAcademy.get(pid) ?? null) : null;
        }
        case "WORKSHOP": {
          const cid = decodeClassRef(p.refId)?.classId;
          return cid ? (classAcademy.get(cid) ?? null) : null;
        }
        case "PRIVATE":
          return decodePrivateRef(p.refId)?.academyId ?? null;
        default:
          return null;
      }
    };
    return payments
      .filter((p) => resolve(p) === academyId)
      .slice(0, 15)
      .map((p) => ({
        amount: p.amount,
        createdAt: p.createdAt,
        orderType: p.orderType,
      }));
  }

  // ── Analítica por usuario ───────────────────────────────────────────

  /**
   * GET /api/admin/users/:personId/analytics?role=X - sections por lente.
   * Rol no poseído (sin PersonRole APPROVED/PENDING) → 400 ROLE_NOT_HELD.
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
        status: { in: ["APPROVED", "PENDING"] },
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
    return {
      academies: memberships.map((m) => m.academy),
      // Class.date se expone como startsAt (instante de la clase).
      classesUpcoming: upcoming.map((c) => ({
        id: c.id,
        startsAt: c.date,
        style: c.slot.series.style?.name ?? null,
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
      const styleId = slot.series.styleId;
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
}
