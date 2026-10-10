import {
  BadRequestException,
  Body,
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
import type { EnrollmentStatus } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { ParamsService } from "../../params/params.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import {
  classStart,
  effectiveCapacity,
} from "../domain/academy.service";
import { AcademyAccess } from "./academy-access.service";
import {
  CLASS_CARD_SELECT,
  classCardItem,
  classEnded,
  instantToCardDate,
  lessonCardItem,
  type ClassCardRow,
} from "./class-card-projection";
import { filterDate } from "./list-filters";
import { ApiQuery } from "@nestjs/swagger";

// Inscripción vigente: la que habilita ver la academia como "mía" en
// /clases y reservar cupo. PAUSED/FROZEN no cuentan (spec de producto:
// reservar exige inscripción vigente).
const BOOKABLE_ENROLLMENT: EnrollmentStatus[] = ["ACTIVE", "TRIAL", "ONLINE"];

// Ventana de marcación de asistencia: 30 minutos antes hasta 30
// minutos después del inicio real de la clase (classStart) - spec
// academies/class-series. El mismo número alimenta `attendanceWindow`
// del roster y el gate de POST /classes/:id/attendance.
const ATTENDANCE_WINDOW_MS = 30 * 60_000;

// Semana de la cuota: ISO lun–dom sobre Class.date (medianoche UTC del día
// de la clase - no hora local: la diferencia solo aparecería en una clase
// que cruza el lunes ~21:00 hora Chile, caso prácticamente inexistente).
function isoWeekRange(date: Date): { start: Date; end: Date } {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dow = (day.getUTCDay() + 6) % 7; // lunes = 0
  const start = new Date(day.getTime() - dow * 86_400_000);
  return { start, end: new Date(start.getTime() + 7 * 86_400_000) };
}

type QuotaResolution =
  | {
      ok: true;
      kind: "WEEKLY" | "PACK" | "UNLIMITED";
      enrollmentId: string;
      used: number | null;
      limit: number | null;
    }
  | {
      ok: false;
      reason: "exhausted";
      kind: "WEEKLY" | "PACK";
      used: number;
      limit: number;
    }
  | { ok: false; reason: "no_enrollment" };


/**
 * Vista alumno: explorar clases próximas (por día/estilo/nivel/academia)
 * y reservar cupo. Booking con capacidad real - si el slot está lleno la
 * reserva entra como WAITLIST y se promueve en orden al liberarse un cupo.
 */
@Controller("classes")
@UseGuards(SessionGuard)
export class ClassesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly access: AcademyAccess,
    private readonly params: ParamsService,
  ) {}

  // Reservas que consumen crédito: BOOKED + CANCELLED sin refund
  // (cancelación tardía - la clase se perdió). WAITLIST no consume;
  // CANCELLED con refunded=true devuelve. Ver resolveQuota.

  /**
   * Qué inscripción responde por la cuota de una reserva en `classDate`.
   * Orden: plan semanal con saldo → pack con saldo → ilimitado. Una fila
   * con plan null (inscripción legacy/administrativa) cuenta ilimitada.
   */
  private async resolveQuota(
    tx: Pick<PrismaService, "enrollment" | "classBooking">,
    personId: string,
    academyId: string,
    classDate: Date,
  ): Promise<QuotaResolution> {
    const enrollments = await tx.enrollment.findMany({
      where: {
        personId,
        academyId,
        status: { in: BOOKABLE_ENROLLMENT },
      },
      select: {
        id: true,
        startedAt: true,
        endsAt: true,
        plan: {
          select: { type: true, weeklyClasses: true, classCount: true },
        },
      },
    });
    if (!enrollments.length) return { ok: false, reason: "no_enrollment" };

    // Vigencia efectiva (spec academy-renewal-reminders): una inscripción
    // con endsAt vencido solo habilita clases dentro de la gracia
    // (endsAt + grace_days - el mismo número que anuncia el mail de
    // aviso). Vigente (now <= endsAt) agenda libre; endsAt null nunca
    // expira (pack, legado).
    const graceDays = await this.params.getNumber(
      "academy.renewal.grace_days",
      5,
    );
    const now = new Date();

    const countIn = async (range: { gte: Date; lt?: Date }) =>
      tx.classBooking.count({
        where: {
          personId,
          class: {
            slot: { academyId },
            date: { gte: range.gte, ...(range.lt ? { lt: range.lt } : {}) },
          },
          // Un asiento pagado (clase suelta / taller, orderType WORKSHOP)
          // ocupa cupo físico pero NO consume crédito del plan.
          paymentId: null,
          OR: [
            { status: "BOOKED" },
            { status: "CANCELLED", refunded: false },
          ],
        },
      });

    const { start, end } = isoWeekRange(classDate);
    let packFallback: QuotaResolution | null = null;
    let unlimited: QuotaResolution | null = null;
    let exhausted: QuotaResolution | null = null;

    for (const e of enrollments) {
      if (e.endsAt != null) {
        const graceEnd = new Date(
          e.endsAt.getTime() + graceDays * 24 * 60 * 60 * 1000,
        );
        if (now > e.endsAt && classDate > graceEnd) continue;
      }
      const plan = e.plan;
      if (plan?.weeklyClasses != null) {
        const used = await countIn({ gte: start, lt: end });
        if (used < plan.weeklyClasses) {
          return {
            ok: true,
            kind: "WEEKLY",
            enrollmentId: e.id,
            used,
            limit: plan.weeklyClasses,
          };
        }
        exhausted ??= {
          ok: false,
          reason: "exhausted",
          kind: "WEEKLY",
          used,
          limit: plan.weeklyClasses,
        };
        continue;
      }
      if (plan?.type === "CLASS_PACK" && plan.classCount != null) {
        const used = await countIn({ gte: e.startedAt });
        if (used < plan.classCount && !packFallback) {
          packFallback = {
            ok: true,
            kind: "PACK",
            enrollmentId: e.id,
            used,
            limit: plan.classCount,
          };
        } else if (used >= plan.classCount) {
          exhausted ??= {
            ok: false,
            reason: "exhausted",
            kind: "PACK",
            used,
            limit: plan.classCount,
          };
        }
        continue;
      }
      // Sin cuota definida (plan ilimitado o inscripción sin plan).
      unlimited ??= {
        ok: true,
        kind: "UNLIMITED",
        enrollmentId: e.id,
        used: null,
        limit: null,
      };
    }
    if (packFallback) return packFallback;
    if (unlimited) return unlimited;
    return exhausted ?? { ok: false, reason: "no_enrollment" };
  }

  /**
   * Promueve al primer WAITLIST **con crédito disponible** (orden
   * createdAt). Un candidato sin cuota o sin inscripción vigente queda en
   * espera y se evalúa el siguiente - el cupo no se regala a quien ya no
   * puede pagarlo con su plan.
   */
  private async promoteWaitlist(
    tx: Pick<PrismaService, "enrollment" | "classBooking">,
    cls: {
      id: string;
      date: Date;
      slot: {
        academyId: string;
        series: { name: string };
        academy: { name: string };
      };
    },
  ) {
    const waiters = await tx.classBooking.findMany({
      where: { classId: cls.id, status: "WAITLIST" },
      orderBy: { createdAt: "asc" },
      select: { id: true, personId: true },
    });
    for (const w of waiters) {
      const q = await this.resolveQuota(
        tx,
        w.personId,
        cls.slot.academyId,
        cls.date,
      );
      if (!q.ok) continue; // sin cuota/inscripción → queda en espera
      await tx.classBooking.update({
        where: { id: w.id },
        data: { status: "BOOKED", enrollmentId: q.enrollmentId },
      });
      await this.notifications.notifySafe(w.personId, {
        category: "SOCIAL",
        type: "class.waitlist.promoted",
        title: "Conseguiste cupo",
        body: cls.slot.series.name ?? cls.slot.academy.name,
        data: { classId: cls.id, bookingId: w.id },
      });
      return;
    }
  }


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
   * Todo slot pertenece a una serie (invariante de schema), así que los
   * filtros de estilo/nivel resuelven siempre sobre slot.series.
   */
  @Get("browse")
  @ApiQuery({ name: "weekday", required: false })
  @ApiQuery({ name: "styleId", required: false })
  @ApiQuery({ name: "levelId", required: false })
  @ApiQuery({ name: "academyId", required: false })
  @ApiQuery({ name: "days", required: false })
  @ApiQuery({ name: "scope", required: false })
  async browse(
    @Req() req: Request,
    @Query("weekday") weekday?: string,
    @Query("styleId") styleId?: string,
    @Query("levelId") levelId?: string,
    @Query("academyId") academyId?: string,
    @Query("days") days?: string,
    @Query("scope") scope?: string,
  ) {
    const me = req.person!.id;
    const horizon = Math.min(Math.max(Number(days) || 14, 1), 60);
    const until = new Date(Date.now() + horizon * 86_400_000);

    // Academias con inscripción vigente - scope=enrolled acota el listado
    // y el flag `enrolled` por item resuelve el CTA sin query extra.
    const enrollments = await this.prisma.enrollment.findMany({
      where: { personId: me, status: { in: BOOKABLE_ENROLLMENT } },
      select: { academyId: true },
    });
    const enrolledIds = new Set(enrollments.map((e) => e.academyId));

    // scope=enrolled ∩ academyId: si se piden ambos y no calzan, vacío.
    const academyScope =
      scope === "enrolled"
        ? academyId
          ? enrolledIds.has(academyId)
            ? [academyId]
            : []
          : [...enrolledIds]
        : null;
    if (academyScope !== null && academyScope.length === 0) return [];

    const classes = await this.prisma.class.findMany({
      where: {
        cancelled: false,
        date: { gte: new Date(), lte: until },
        slot: {
          ...(academyScope
            ? { academyId: { in: academyScope } }
            : academyId
              ? { academyId }
              : {}),
          // Academias bloqueadas por mora (S3) fuera de explorar -
          // también bajo scope=enrolled: sus clases no son reservables.
          academy: { active: true, billingBlockedAt: null },
          series: {
            active: true,
            ...(styleId ? { styleId } : {}),
            ...(levelId ? { levelId } : {}),
          },
        },
      },
      orderBy: { date: "asc" },
      take: 200,
      select: CLASS_CARD_SELECT,
    });

    const weekdayFilter =
      weekday !== undefined && weekday !== "" ? Number(weekday) : null;
    const instructorName = await this.instructorNames(classes);

    return classes
      .filter((c) => weekdayFilter === null || c.slot.weekday === weekdayFilter)
      .map((c) => classCardItem(c, me, enrolledIds, instructorName));
  }

  /** Nombres de instructores (override de instancia) en batch. */
  private async instructorNames(classes: { instructorId: string | null }[]) {
    const ids = [
      ...new Set(classes.map((c) => c.instructorId).filter(Boolean)),
    ] as string[];
    const people = ids.length
      ? await this.prisma.person.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    return new Map<string, string | null>(people.map((i) => [i.id, i.name]));
  }

  /** Inscripciones vigentes del learner → Set de academyIds. */
  private async enrolledAcademyIds(personId: string) {
    const rows = await this.prisma.enrollment.findMany({
      where: { personId, status: { in: BOOKABLE_ENROLLMENT } },
      select: { academyId: true },
    });
    return new Set(rows.map((e) => e.academyId));
  }

  /** Mis reservas activas (BOOKED/WAITLIST) en clases futuras -
      mismo shape del card que browse. Las particulares compradas
      (aforo 1, sin recurrencia) viajan en la MISMA respuesta -
      series:null, date:null cuando aún no se agendan. */
  @Get("mine")
  @ApiQuery({ name: "scope", required: false })
  async mine(@Req() req: Request, @Query("scope") scope?: string) {
    if (scope === "past") return this.history(req.person!.id);
    const me = req.person!.id;
    // La frontera reservada/historial es el fin real de la clase, no
    // Class.date (medianoche UTC): una clase de hoy sigue vigente. Se
    // acota a ayer+ para no barrer toda la tabla y se filtra por el
    // instante de término (cubre clases que cruzan medianoche).
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    yesterday.setUTCHours(0, 0, 0, 0);
    const [enrolledIds, rows, lessons] = await Promise.all([
      this.enrolledAcademyIds(me),
      this.prisma.classBooking.findMany({
        where: {
          personId: me,
          status: { in: ["BOOKED", "WAITLIST"] },
          class: { date: { gte: yesterday }, cancelled: false },
        },
        orderBy: { class: { date: "asc" } },
        select: { class: { select: CLASS_CARD_SELECT } },
      }),
      // Particulares activas del alumno (compradas o en curso) - una
      // reserva más; sin ellas el pago quedaría invisible en /clases.
      this.prisma.privateLesson.findMany({
        where: { personId: me, status: { in: ["REQUESTED", "CONFIRMED"] } },
      }),
    ]);
    const classes = rows
      .map((r) => r.class)
      .filter((c) => !classEnded(c));
    const instructorName = await this.instructorNames([
      ...classes,
      ...lessons,
    ]);
    const lessonAcademies = lessons.length
      ? new Map(
          (
            await this.prisma.academy.findMany({
              where: {
                id: { in: [...new Set(lessons.map((l) => l.academyId))] },
              },
              select: { id: true, name: true, billingBlockedAt: true },
            })
          ).map((a) => [a.id, a] as const),
        )
      : new Map<
          string,
          { id: string; name: string; billingBlockedAt: Date | null }
        >();
    // Créditos del plan vigente por (academia, semana ISO de la clase) -
    // mismo resolveQuota de la ficha; el card muestra "n/m esta semana".
    const creditsByKey = new Map<
      string,
      { kind: string; used: number | null; limit: number | null } | null
    >();
    for (const c of classes) {
      const key = `${c.slot.academy.id}:${isoWeekRange(c.date).start.getTime()}`;
      if (creditsByKey.has(key)) continue;
      const q = await this.resolveQuota(
        this.prisma,
        me,
        c.slot.academy.id,
        c.date,
      );
      creditsByKey.set(
        key,
        "kind" in q && q.kind !== "UNLIMITED"
          ? { kind: q.kind, used: q.used, limit: q.limit }
          : null,
      );
    }
    return [
      ...classes.map((c) => ({
        ...classCardItem(c, me, enrolledIds, instructorName),
        credits:
          creditsByKey.get(
            `${c.slot.academy.id}:${isoWeekRange(c.date).start.getTime()}`,
          ) ?? null,
      })),
      ...lessons.map((l) =>
        lessonCardItem(
          l,
          lessonAcademies.get(l.academyId),
          enrolledIds,
          instructorName,
        ),
      ),
    ];
  }

  /**
   * Historial del alumno (spec §9): solo resultados cerrados -
   * asistencias y reservas canceladas. Una reserva vigente NO aparece
   * acá aunque Class.date ya pasó: sigue en "reservadas" hasta que la
   * clase termine (classEnded). Dedup por classId - la asistencia
   * prevalece sobre la cancelación. Últimas 50.
   */
  private async history(personId: string) {
    const [enrolledIds, attendances, bookings, lessons] =
      await Promise.all([
        this.enrolledAcademyIds(personId),
        this.prisma.attendance.findMany({
          where: { personId },
          select: { class: { select: CLASS_CARD_SELECT } },
        }),
        this.prisma.classBooking.findMany({
          where: { personId, status: "CANCELLED" },
          select: { class: { select: CLASS_CARD_SELECT } },
        }),
        // Particulares terminales también son historial - misma fila
        // del card (DONE → attended, CANCELLED → cancelled).
        this.prisma.privateLesson.findMany({
          where: { personId, status: { in: ["DONE", "CANCELLED"] } },
        }),
      ]);

    // Dedup por classId con el shape completo del card + status de
    // resultado ("attended" gana sobre la cancelación de la misma clase).
    const past = new Map<
      string,
      { cls: ClassCardRow; status: "attended" | "cancelled" }
    >();
    for (const b of bookings) {
      past.set(b.class.id, { cls: b.class, status: "cancelled" });
    }
    for (const a of attendances) {
      past.set(a.class.id, { cls: a.class, status: "attended" });
    }
    const rows = [...past.values()].sort(
      (a, b) => b.cls.date.getTime() - a.cls.date.getTime(),
    );
    const lessonAcademies = lessons.length
      ? new Map(
          (
            await this.prisma.academy.findMany({
              where: {
                id: { in: [...new Set(lessons.map((l) => l.academyId))] },
              },
              select: { id: true, name: true, billingBlockedAt: true },
            })
          ).map((a) => [a.id, a] as const),
        )
      : new Map<
          string,
          { id: string; name: string; billingBlockedAt: Date | null }
        >();
    const instructorName = await this.instructorNames([
      ...rows.map((r) => r.cls),
      ...lessons,
    ]);
    return [
      ...rows.map((r) => ({
        ...classCardItem(r.cls, personId, enrolledIds, instructorName),
        date: r.cls.date.toISOString(),
        status: r.status,
      })),
      ...lessons.map((l) => {
        // La particular cancelada sin agendar no tiene fecha propia -
        // el historial la ubica por su día de compra.
        const when = instantToCardDate(l.scheduledAt ?? l.createdAt);
        return {
          ...lessonCardItem(
            l,
            lessonAcademies.get(l.academyId),
            enrolledIds,
            instructorName,
          ),
          date: when.date,
          startTime: when.startTime,
          status: l.status === "DONE" ? ("attended" as const) : ("cancelled" as const),
        };
      }),
    ]
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      .slice(0, 50);
  }

  /**
   * Consola del instructor: clases futuras (~30 días) donde es profesor -
   * por override de la instancia (class.instructorId), del slot o de la
   * serie. Requiere rol INSTRUCTOR aprobado, membresía AcademyInstructor
   * o admin.access.
   * Filtros del contrato compartido (spec analytics/query-console):
   * from/to acotan class.date (días inclusivos; default = próximos 30d),
   * seriesId/academyId por slot. Fecha inválida → 400.
   */
  @Get("teaching")
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiQuery({ name: "seriesId", required: false })
  @ApiQuery({ name: "academyId", required: false })
  async teaching(
    @Req() req: Request,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("seriesId") seriesId?: string,
    @Query("academyId") academyId?: string,
  ) {
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

    // Class.date es día a medianoche UTC: lte = el propio día `to`.
    const gte = filterDate(from, "from") ?? new Date();
    const lte = filterDate(to, "to") ?? new Date(Date.now() + 30 * 86_400_000);
    const classes = await this.prisma.class.findMany({
      where: {
        cancelled: false,
        date: { gte, lte },
        OR: [
          { instructorId: me.id },
          { instructors: { some: { personId: me.id } } },
          { slot: { instructorId: me.id } },
          { slot: { instructors: { some: { personId: me.id } } } },
          { slot: { series: { instructorId: me.id } } },
        ],
        ...(seriesId || academyId
          ? {
              slot: {
                ...(seriesId ? { seriesId } : {}),
                ...(academyId ? { academyId } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
      take: 200,
      select: {
        id: true,
        date: true,
        instructorId: true,
        instructors: {
          include: { person: { select: { id: true, name: true } } },
        },
        capacity: true,
        slot: {
          select: {
            startTime: true,
            endTime: true,
            capacity: true,
            instructorId: true,
            instructors: {
              include: { person: { select: { id: true, name: true } } },
            },
            academy: {
              select: { id: true, name: true, defaultQuorum: true },
            },
            series: {
              select: {
                id: true,
                name: true,
                quorum: true,
                instructorId: true,
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

    // instructorId es FK plana en class/slot/series - join manual de
    // personas; el estilo ya viene por la relación series.style.
    const instructorIds = [
      ...new Set(
        classes
          .map(
            (c) =>
              c.instructorId ??
              c.slot.instructorId ??
              c.slot.series.instructorId,
          )
          .filter((x): x is string => !!x),
      ),
    ];
    const people = instructorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true },
        })
      : [];
    const personName = new Map(people.map((p) => [p.id, p.name]));

    return classes.map((c) => {
      const instructorId =
        c.instructorId ?? c.slot.instructorId ?? c.slot.series.instructorId;
      // Plantel: primario + co-profes (clase y slot), sin duplicar.
      const rosterMap = new Map<string, { id: string; name: string | null }>();
      for (const i of [
        ...(c.slot.instructors ?? []),
        ...(c.instructors ?? []),
      ]) {
        rosterMap.set(i.person.id, i.person);
      }
      rosterMap.delete(instructorId ?? "");
      const instructors = [
        ...(instructorId
          ? [{ id: instructorId, name: personName.get(instructorId) ?? null }]
          : []),
        ...rosterMap.values(),
      ];
      return {
        id: c.id,
        date: c.date,
        startTime: c.slot.startTime,
        endTime: c.slot.endTime,
        academyId: c.slot.academy.id,
        academyName: c.slot.academy.name,
        seriesId: c.slot.series.id,
        seriesName: c.slot.series.name,
        styleName: c.slot.series.style?.name ?? null,
        levelName: c.slot.series.level?.name ?? null,
        instructorName: instructorId
          ? (personName.get(instructorId) ?? null)
          : null,
        instructors,
        quorum: effectiveCapacity({
          classCapacity: c.capacity,
          slotCapacity: c.slot.capacity,
          seriesQuorum: c.slot.series.quorum,
          academyDefaultQuorum: c.slot.academy.defaultQuorum,
        }),
        bookedCount: c.bookings.filter((b) => b.status === "BOOKED").length,
        waitlistCount: c.bookings.filter((b) => b.status === "WAITLIST")
          .length,
      };
    });
  }

  /**
   * Detalle de una clase para el alumno: serie (estilo/nivel/modalidad/
   * precio suelta), academia, instructor efectivo (clase → slot → serie),
   * cupos/espera y mi estado de reserva/asistencia. Además las próximas
   * sesiones de la misma serie.
   */
  @Get(":id")
  async detail(@Param("id") classId: string, @Req() req: Request) {
    const me = req.person!.id;
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        instructorId: true,
        instructors: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                photoUrl: true,
                instagram: true,
              },
            },
          },
        },
        capacity: true,
        cancelled: true,
        slot: {
          select: {
            weekday: true,
            startTime: true,
            endTime: true,
            capacity: true,
            instructorId: true,
            instructors: {
              include: {
                person: {
                  select: {
                    id: true,
                    name: true,
                    photoUrl: true,
                    instagram: true,
                  },
                },
              },
            },
            academyId: true,
            academy: {
              select: {
                id: true,
                name: true,
                defaultQuorum: true,
                // Mora SaaS (S3/S6): la ficha de clase del alumno muestra
                // "academia no disponible" en el CTA (book/checkout ya
                // rechazan con academy.unavailable - el flag lo anticipa).
                billingBlockedAt: true,
              },
            },
            series: {
              select: {
                id: true,
                name: true,
                description: true,
                quorum: true,
                dropInPrice: true,
                instructorId: true,
                level: { select: { name: true, order: true } },
                style: { select: { name: true, genre: true } },
                types: {
                  include: { type: { select: { id: true, name: true } } },
                },
              },
            },
            types: {
              include: { type: { select: { id: true, name: true } } },
            },
          },
        },
        bookings: {
          where: { status: { in: ["BOOKED", "WAITLIST"] } },
          select: { personId: true, status: true, paymentId: true },
        },
        attendances: {
          where: { personId: me },
          select: { id: true },
        },
      },
    });
    if (!cls) throw new NotFoundException();

    // Instructor efectivo: override de la clase → del slot → default de la
    // serie (misma cadena que `teaching`). El plantel completo sale de
    // los joins (clase = snapshot materializado, slot = recurrente) -
    // union sin duplicar, primario primero (spec multi-instructor).
    const instructorId =
      cls.instructorId ?? cls.slot.instructorId ?? cls.slot.series.instructorId;
    const instructor = instructorId
      ? await this.prisma.person.findUnique({
          where: { id: instructorId },
          select: {
            id: true,
            name: true,
            photoUrl: true,
            instagram: true,
          },
        })
      : null;
    const rosterMap = new Map<
      string,
      {
        id: string;
        name: string | null;
        photoUrl: string | null;
        instagram: string | null;
      }
    >();
    for (const i of [
      ...(cls.slot.instructors ?? []),
      ...(cls.instructors ?? []),
    ]) {
      rosterMap.set(i.person.id, i.person);
    }
    rosterMap.delete(instructorId ?? "");
    const instructors = [
      ...(instructor ? [instructor] : []),
      ...rosterMap.values(),
    ];

    // Próximas sesiones de la misma serie (el alumno puede mirar otra fecha).
    const upcoming = await this.prisma.class.findMany({
      where: {
        slot: { seriesId: cls.slot.series.id },
        cancelled: false,
        date: { gt: cls.date },
      },
      orderBy: { date: "asc" },
      take: 4,
      select: {
        id: true,
        date: true,
        slot: { select: { startTime: true, endTime: true } },
      },
    });

    // Inscripción vigente en la academia de la clase - el CTA de la
    // ficha depende de esto (book también lo exige).
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        personId: me,
        academyId: cls.slot.academyId,
        status: { in: BOOKABLE_ENROLLMENT },
      },
      select: { id: true },
    });

    const booked = cls.bookings.filter((b) => b.status === "BOOKED").length;
    const mine = cls.bookings.find((b) => b.personId === me);
    const capacity = effectiveCapacity({
      classCapacity: cls.capacity,
      slotCapacity: cls.slot.capacity,
      seriesQuorum: cls.slot.series.quorum,
      academyDefaultQuorum: cls.slot.academy.defaultQuorum,
    });

    // Créditos del plan vigente para esta clase (el CTA y el copy de
    // cancelación lo muestran) + ventana de devolución operativa.
    const [quota, cancelRefundMinutes] = await Promise.all([
      this.resolveQuota(this.prisma, me, cls.slot.academyId, cls.date),
      this.params.getNumber("classes.cancel_refund_minutes", 60),
    ]);
    // Spec class-credits: null si ilimitado o sin inscripción - el front
    // distingue "no inscrito" con el flag `enrolled` aparte.
    const myCredits =
      "kind" in quota && quota.kind !== "UNLIMITED"
        ? { kind: quota.kind, used: quota.used, limit: quota.limit }
        : null;
    return {
      id: cls.id,
      date: cls.date,
      startTime: cls.slot.startTime,
      endTime: cls.slot.endTime,
      weekday: cls.slot.weekday,
      cancelled: cls.cancelled,
      capacity,
      bookedCount: booked,
      spotsLeft: Math.max(capacity - booked, 0),
      waitlistCount: cls.bookings.filter((b) => b.status === "WAITLIST").length,
      myBooking: mine?.status ?? null,
      // Asiento comprado suelto (taller/clase) - el CTA cambia el copy
      // ("comprado" vs "reservado") y la cancelación no devuelve dinero.
      myBookingPaid: !!mine?.paymentId,
      attended: cls.attendances.length > 0,
      enrolled: !!enrollment,
      cancelRefundMinutes,
      myCredits,
      academy: {
        ...cls.slot.academy,
        billingBlocked: cls.slot.academy.billingBlockedAt != null,
      },
      instructor,
      instructors,
      series: {
        id: cls.slot.series.id,
        name: cls.slot.series.name,
        description: cls.slot.series.description,
        level: cls.slot.series.level,
        style: cls.slot.series.style,
        dropInPrice: cls.slot.series.dropInPrice,
        types: (cls.slot.types.length
          ? cls.slot.types
          : cls.slot.series.types
        ).map((t) => t.type),
      },
      upcoming: upcoming.map((u) => ({
        id: u.id,
        date: u.date,
        startTime: u.slot.startTime,
        endTime: u.slot.endTime,
      })),
    };
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
        instructors: { select: { personId: true } },
        capacity: true,
        slot: {
          select: {
            academyId: true,
            startTime: true,
            endTime: true,
            capacity: true,
            instructorId: true,
            instructors: { select: { personId: true } },
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

    // Ventana de marcación [inicio-30min, inicio+30min] sobre el inicio
    // real de la clase (spec academies/class-series). Fuera de ella la
    // UI no muestra el control; una reserva sin asistencia queda BOOKED
    // (sigue ocupando cupo y consumiendo el crédito del plan).
    const start = classStart(cls.date, cls.slot.startTime);
    const attendanceWindow = {
      opensAt: new Date(start.getTime() - ATTENDANCE_WINDOW_MS),
      closesAt: new Date(start.getTime() + ATTENDANCE_WINDOW_MS),
    };

    const bookings = await this.prisma.classBooking.findMany({
      where: { classId, status: { in: ["BOOKED", "WAITLIST"] } },
      orderBy: { createdAt: "asc" },
      select: { personId: true, status: true, createdAt: true },
    });
    const attendances = await this.prisma.attendance.findMany({
      where: { classId },
      select: { personId: true },
    });
    const attendedIds = new Set(attendances.map((a) => a.personId));
    // ClassBooking.personId es FK plana - join manual (mismo patrón que
    // GET /academies/:id/students).
    const instructorId =
      cls.instructorId ?? cls.slot.instructorId ?? cls.slot.series.instructorId;
    // Plantel completo: primario + co-profes de clase y slot (spec
    // multi-instructor) - cualquiera de ellos marca presente.
    const rosterIds = new Set(
      [
        instructorId,
        ...(cls.instructors ?? []).map((i) => i.personId),
        ...(cls.slot.instructors ?? []).map((i) => i.personId),
      ].filter((x): x is string => !!x),
    );
    const personIds = [
      ...new Set([...bookings.map((b) => b.personId), ...rosterIds]),
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
      attended: attendedIds.has(b.personId),
    });
    // Cualquier instructor del plantel de la clase (o admin de
    // plataforma) puede marcar presente - el owner no (spec
    // academies/class-series: asistencia la registra el profe).
    const canMark =
      (await this.access.isPlatformAdmin(req.person!)) ||
      rosterIds.has(req.person!.id);
    return {
      class: {
        id: cls.id,
        date: cls.date,
        startTime: cls.slot.startTime,
        endTime: cls.slot.endTime,
        academyId: cls.slot.academyId,
        seriesName: cls.slot.series.name,
        styleName: cls.slot.series.style?.name ?? null,
        levelName: cls.slot.series.level?.name ?? null,
        instructor: instructorId
          ? { id: instructorId, name: personName.get(instructorId) ?? null }
          : null,
        instructors: [...rosterIds].map((pid) => ({
          id: pid,
          name: personName.get(pid) ?? null,
        })),
      },
      quorum: effectiveCapacity({
        classCapacity: cls.capacity,
        slotCapacity: cls.slot.capacity,
        seriesQuorum: cls.slot.series.quorum,
        academyDefaultQuorum: cls.slot.academy.defaultQuorum,
      }),
      canMark,
      attendanceWindow,
      booked: bookings.filter((b) => b.status === "BOOKED").map(toRow),
      waitlist: bookings.filter((b) => b.status === "WAITLIST").map(toRow),
    };
  }

  /**
   * Marcar presente a un alumno con reserva activa (BOOKED) de la clase.
   * Solo lo hace quien la imparte (instructor efectivo: override de la
   * clase > slot > serie) o un admin de plataforma - el dueño de la
   * academia no registra asistencia. 409 si ya está marcado.
   */
  @Post(":id/attendance")
  async markAttendance(
    @Param("id") classId: string,
    @Body() dto: { personId?: string },
    @Req() req: Request,
  ) {
    if (!dto.personId) {
      throw new BadRequestException("personId requerido");
    }
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        cancelled: true,
        instructorId: true,
        instructors: { select: { personId: true } },
        slot: {
          select: {
            academyId: true,
            startTime: true,
            instructorId: true,
            instructors: { select: { personId: true } },
            series: { select: { instructorId: true } },
          },
        },
      },
    });
    if (!cls) throw new NotFoundException("clase no encontrada");
    if (cls.cancelled) {
      throw new BadRequestException("la clase está cancelada");
    }
    // Miembro de la academia + no bloqueada por billing; luego la regla
    // de quién marca (cualquiera del plantel de la clase o admin).
    await this.access.requireManageWrite(cls.slot.academyId, req.person!);
    const roster = new Set(
      [
        cls.instructorId,
        cls.slot.instructorId,
        cls.slot.series.instructorId,
        ...(cls.instructors ?? []).map((i) => i.personId),
        ...(cls.slot.instructors ?? []).map((i) => i.personId),
      ].filter(Boolean),
    );
    const isAdmin = await this.access.isPlatformAdmin(req.person!);
    if (!isAdmin && !roster.has(req.person!.id)) {
      throw new ForbiddenException(
        "solo el profesor de la clase puede marcar asistencia",
      );
    }

    // Ventana de marcación [inicio-30min, inicio+30min] - aplica a todos
    // (admin incluido): fuera de ella la asistencia no se registra y el
    // alumno queda no confirmado conservando su cupo (spec
    // academies/class-series).
    const start = classStart(cls.date, cls.slot.startTime);
    const now = new Date();
    const opensAt = new Date(start.getTime() - ATTENDANCE_WINDOW_MS);
    const closesAt = new Date(start.getTime() + ATTENDANCE_WINDOW_MS);
    if (now < opensAt || now > closesAt) {
      throw new BadRequestException({
        error: "attendance.out_of_window",
        message:
          "la asistencia solo se marca entre 30 minutos antes y 30 minutos después del inicio",
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
      });
    }

    const booking = await this.prisma.classBooking.findFirst({
      where: { classId, personId: dto.personId, status: "BOOKED" },
    });
    if (!booking) {
      throw new BadRequestException(
        "el alumno no tiene una reserva activa en esta clase",
      );
    }
    const existing = await this.prisma.attendance.findUnique({
      where: {
        classId_personId: { classId, personId: dto.personId },
      },
    });
    if (existing) {
      throw new ConflictException("asistencia ya registrada");
    }
    return this.prisma.attendance.create({
      data: { classId, personId: dto.personId },
    });
  }

  /**
   * Reservar: cupo libre → BOOKED; lleno → WAITLIST (orden de llegada).
   * Re-reservar una reserva cancelada reactiva la misma fila. Exige
   * inscripción vigente (ACTIVE/TRIAL/ONLINE) en la academia de la clase.
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
            startTime: true,
            academyId: true,
            series: { select: { quorum: true } },
            academy: {
              select: { defaultQuorum: true, billingBlockedAt: true },
            },
          },
        },
      },
    });
    if (!cls) throw new NotFoundException("clase no encontrada");
    // Academia bloqueada por mora (S3): no hay reservas nuevas - copy
    // honesto para el alumno (la falta es del owner, no de él).
    if (cls.slot.academy.billingBlockedAt != null) {
      throw new BadRequestException({
        error: "academy.unavailable",
        message: "la academia no está disponible por el momento",
      });
    }
    if (cls.cancelled) throw new BadRequestException("la clase fue cancelada");
    // "Ya pasó" = el inicio real (día + hora), no la medianoche UTC -
    // una clase de hoy 20:00 se puede reservar hasta que empiece.
    if (classStart(cls.date, cls.slot.startTime) < new Date()) {
      throw new BadRequestException("la clase ya pasó");
    }

    return this.prisma.$transaction(async (tx) => {
      // Regla de producto: reservar exige inscripción vigente en la
      // academia + crédito disponible en la cuota del plan (semana ISO o
      // pack). Dentro de la tx para que una desinscripción concurrente
      // no deje pasar la reserva.
      const quota = await this.resolveQuota(
        tx,
        me,
        cls.slot.academyId,
        cls.date,
      );
      if (!quota.ok && quota.reason === "no_enrollment") {
        throw new ForbiddenException(
          "necesitas una inscripción vigente en la academia",
        );
      }

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
        seriesQuorum: cls.slot.series.quorum,
        academyDefaultQuorum: cls.slot.academy.defaultQuorum,
      });
      const status = booked < quorum ? "BOOKED" : "WAITLIST";

      // La cuota solo se exige para ocupar cupo real - entrar a la
      // waitlist no consume ni bloquea (se re-chequea al promover).
      // Re-activar un asiento pagado cancelado tampoco: el pago ya
      // ocurrió, el cupo no vuelve a consumir crédito.
      if (status === "BOOKED" && !existing?.paymentId && !quota.ok) {
        throw new ConflictException(
          `agotaste tus ${quota.limit} clases de esta semana`,
        );
      }

      if (existing) {
        return tx.classBooking.update({
          where: { id: existing.id },
          data: {
            status,
            createdAt: new Date(),
            cancelledAt: null,
            refunded: true,
            // paymentId se preserva: un asiento pagado que se reactiva
            // sigue siendo compra - no consume crédito del plan.
            enrollmentId:
              status === "BOOKED" && quota.ok ? quota.enrollmentId : null,
          },
        });
      }
      return tx.classBooking.create({
        data: {
          classId,
          personId: me,
          status,
          enrollmentId:
            status === "BOOKED" && quota.ok ? quota.enrollmentId : null,
        },
      });
    });
  }

  /**
   * Cancelar mi reserva. Política de crédito (spec class-credit-
   * cancellation): dentro de la ventana `classes.cancel_refund_minutes`
   * (default 60) antes del inicio, la clase se devuelve (`refunded:true`);
   * pasado el corte el alumno puede cancelar igual - libera el asiento -
   * pero pierde la clase (`refunded:false`). Una WAITLIST cancelada nunca
   * consumió → refunded:true siempre.
   *
   * Si era BOOKED, el primer WAITLIST con cuota se promueve y se le
   * notifica.
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
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        date: true,
        slot: {
          select: {
            startTime: true,
            academyId: true,
            series: { select: { name: true } },
            academy: { select: { name: true } },
          },
        },
      },
    });
    if (!cls) throw new NotFoundException("clase no encontrada");

    const cutoffMin = await this.params.getNumber(
      "classes.cancel_refund_minutes",
      60,
    );
    const start = classStart(cls.date, cls.slot.startTime);
    // Asiento pagado: la cancelación libera el cupo pero nunca "devuelve
    // el crédito" - no consumió cuota; la devolución del dinero es gestión
    // manual de la academia (acuerdo comercial, no regla del sistema).
    const refunded =
      booking.status === "WAITLIST" ||
      (!booking.paymentId &&
        Date.now() <= start.getTime() - cutoffMin * 60_000);

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.classBooking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          refunded,
        },
      });

      // El asiento se libera siempre - la política solo decide el
      // crédito. La promoción re-chequea cuota del candidato.
      if (booking.status === "BOOKED") {
        await this.promoteWaitlist(tx, cls);
      }
      return { ...cancelled, refunded };
    });
  }
}
