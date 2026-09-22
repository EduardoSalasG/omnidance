import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import type { Request } from "express";
import type { EnrollmentStatus, PlanType } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import {
  assertEnrollmentTransition,
  computeDashboard,
  InvalidEnrollmentTransitionError,
} from "../domain/academy.service";
import { AcademyAccess } from "./academy-access.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import {
  AllowSandbox,
  RequirePermissions,
} from "../../common/rbac/roles.decorator";

const PLAN_TYPES: PlanType[] = ["MONTHLY", "CLASS_PACK", "PERIOD", "TRIAL"];
const ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "ACTIVE",
  "PAUSED",
  "TRIAL",
  "FROZEN",
  "ONLINE",
];

class CreateAcademyDto {
  @IsString()
  name!: string;
}

class CreatePlanDto {
  @IsString()
  name!: string;

  @IsIn(PLAN_TYPES)
  type!: PlanType;

  @IsInt()
  price!: number;

  /** Schema real: classCount (CLASS_PACK). */
  @IsOptional()
  @IsInt()
  classCount?: number;

  /** Alias aceptado por spec (classesPerPeriod → classCount). */
  @IsOptional()
  @IsInt()
  classesPerPeriod?: number;

  @IsOptional()
  @IsInt()
  periodDays?: number;
}

class CreateEnrollmentDto {
  @IsString()
  personId!: string;

  @IsString()
  planId!: string;

  @IsOptional()
  @IsIn(ENROLLMENT_STATUSES)
  status?: EnrollmentStatus;

  /** Spec: startsAt → columna real startedAt. */
  @IsOptional()
  @IsISO8601()
  startsAt?: string;
}

class UpdateEnrollmentDto {
  @IsIn(ENROLLMENT_STATUSES)
  status!: EnrollmentStatus;
}

class CreateSlotDto {
  /** Spec: dayOfWeek → columna real weekday (0-6). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsString()
  styleId?: string;

  @IsOptional()
  @IsString()
  instructorId?: string;

  /** null/omitido = hereda el quórum de la serie/academia. */
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** Modalidades del horario (slot legacy sin serie — no hay herencia). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  typeIds?: string[];
}

class UpdateAcademySettingsDto {
  /** null explícito limpia el override → vuelve al default (20). */
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultQuorum?: number | null;
}

@Controller("academies")
export class AcademiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
  ) {}

  /**
   * Directorio de academias activas para alumnos autenticados: id + nombre
   * + instructores (para el form de clase particular). Datos públicos de
   * negocio — sin métricas ni datos de alumnos.
   */
  @Get()
  @UseGuards(SessionGuard)
  async directory() {
    const academies = await this.prisma.academy.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        instructors: { select: { id: true, personId: true } },
      },
    });
    const instructorIds = [
      ...new Set(
        academies.flatMap((a) => a.instructors.map((i) => i.personId)),
      ),
    ];
    const people = await this.prisma.person.findMany({
      where: { id: { in: instructorIds } },
      select: { id: true, name: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return academies.map((a) => ({
      id: a.id,
      name: a.name,
      instructors: a.instructors.map((i) => ({
        id: i.id,
        personId: i.personId,
        name: byId.get(i.personId)?.name ?? null,
      })),
    }));
  }

  @Get("mine")
  @UseGuards(SessionGuard)
  mine(@Req() req: Request) {
    const personId = req.person!.id;
    return this.prisma.academy.findMany({
      where: {
        OR: [
          { ownerId: personId },
          { instructors: { some: { personId } } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Vista alumno (spec §9 "Mi Aprendizaje"): inscripciones del autenticado
   * con academia, estado (presencial/online/pausada), plan y asistencias
   * de los últimos 30 días por academia — progreso personal, no
   * competitivo. Distinto de /mine, que es la consola owner/instructor.
   */
  @Get("enrolled")
  @UseGuards(SessionGuard)
  async enrolled(@Req() req: Request) {
    const personId = req.person!.id;
    const enrollments = await this.prisma.enrollment.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        academy: { select: { id: true, name: true, active: true } },
        plan: { select: { name: true, type: true } },
      },
    });
    if (enrollments.length === 0) return [];
    const since = new Date(Date.now() - 30 * 86_400_000);
    const attendances = await this.prisma.attendance.findMany({
      where: {
        personId,
        checkedAt: { gte: since },
        class: {
          slot: {
            academyId: { in: enrollments.map((e) => e.academy.id) },
          },
        },
      },
      select: { class: { select: { slot: { select: { academyId: true } } } } },
    });
    const countByAcademy = new Map<string, number>();
    for (const a of attendances) {
      const academyId = a.class.slot.academyId;
      countByAcademy.set(academyId, (countByAcademy.get(academyId) ?? 0) + 1);
    }
    return enrollments.map((e) => ({
      id: e.id,
      academy: e.academy,
      status: e.status,
      plan: e.plan,
      startedAt: e.startedAt,
      attendance30d: countByAcademy.get(e.academy.id) ?? 0,
    }));
  }

  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("academies.create")
  @AllowSandbox() // spec: owners SANDBOX crean academia demo antes del APPROVED
  create(@Body() dto: CreateAcademyDto, @Req() req: Request) {
    // isDemo: el schema no tiene la columna — academias de owners no
    // APPROVED quedan indistinguibles (gap reportado).
    return this.prisma.academy.create({
      data: { name: dto.name, ownerId: req.person!.id },
    });
  }

  @Get(":id")
  @UseGuards(SessionGuard)
  async detail(@Param("id") id: string, @Req() req: Request) {
    const { academy } = await this.access.requireManage(id, req.person!);
    const [activeStudents, plansCount, slotsCount] = await Promise.all([
      this.prisma.enrollment.count({
        where: { academyId: id, status: "ACTIVE" },
      }),
      this.prisma.membershipPlan.count({ where: { academyId: id } }),
      this.prisma.classSlot.count({ where: { academyId: id } }),
    ]);
    return { ...academy, stats: { activeStudents, plansCount, slotsCount } };
  }

  /**
   * Settings de la academia (solo owner/ADMIN). defaultQuorum es el piso
   * de la cadena de quórum efectivo de las clases; null lo limpia.
   */
  @Patch(":id/settings")
  @UseGuards(SessionGuard)
  async updateSettings(
    @Param("id") id: string,
    @Body() dto: UpdateAcademySettingsDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.academy.update({
      where: { id },
      // undefined = no enviado → no toca; null explícito limpia el override.
      data: { defaultQuorum: dto.defaultQuorum },
    });
  }

  // ─── planes ───

  @Post(":id/plans")
  @UseGuards(SessionGuard)
  async createPlan(
    @Param("id") id: string,
    @Body() dto: CreatePlanDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.membershipPlan.create({
      data: {
        academyId: id,
        name: dto.name,
        type: dto.type,
        price: dto.price,
        classCount: dto.classCount ?? dto.classesPerPeriod ?? null,
        periodDays: dto.periodDays ?? null,
      },
    });
  }

  @Get(":id/plans")
  @UseGuards(SessionGuard)
  async listPlans(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.membershipPlan.findMany({
      where: { academyId: id },
      orderBy: { name: "asc" },
    });
  }

  // ─── enrollments ───

  @Post(":id/enrollments")
  @UseGuards(SessionGuard)
  async createEnrollment(
    @Param("id") id: string,
    @Body() dto: CreateEnrollmentDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);

    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
    });
    if (!person) throw new NotFoundException("persona no encontrada");

    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: dto.planId, academyId: id },
    });
    if (!plan) throw new NotFoundException("plan no encontrado en la academia");

    const duplicate = await this.prisma.enrollment.findFirst({
      where: { academyId: id, personId: dto.personId, planId: plan.id, status: "ACTIVE" },
    });
    if (duplicate) {
      throw new ConflictException({
        error: "DUPLICATE_ENROLLMENT",
        message: "ya existe un enrollment ACTIVE con ese plan",
        enrollment: duplicate,
      });
    }

    return this.prisma.enrollment.create({
      data: {
        academyId: id,
        personId: dto.personId,
        planId: plan.id,
        status: dto.status ?? "ACTIVE",
        ...(dto.startsAt ? { startedAt: new Date(dto.startsAt) } : {}),
      },
    });
  }

  // Listado de alumnos — requireManage: el instructor también lo ve
  // (necesita conocer a sus alumnos), no solo el owner.
  @Get(":id/students")
  @UseGuards(SessionGuard)
  async listStudents(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireManage(id, req.person!);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { academyId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        personId: true,
        plan: { select: { name: true } },
      },
    });
    // Enrollment.personId es FK plana (sin relación en schema) — join manual.
    const people = await this.prisma.person.findMany({
      where: { id: { in: enrollments.map((e) => e.personId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return enrollments.map((e) => ({
      id: e.id,
      person: byId.get(e.personId) ?? { id: e.personId, name: null, email: null },
      plan: e.plan,
      status: e.status,
      startsAt: e.startedAt,
    }));
  }

  /**
   * Ficha del alumno dentro de la academia: plan/enrollment vigente,
   * historial (asistencias + reservas pasadas, últimas 50 — la asistencia
   * prevalece sobre la reserva de la misma clase) y reservas futuras.
   * requireManage: también lo ve el instructor, no solo el owner.
   */
  @Get(":id/students/:personId")
  @UseGuards(SessionGuard)
  async studentDetail(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Req() req: Request,
  ) {
    await this.access.requireManage(id, req.person!);
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true },
    });
    if (!person) throw new NotFoundException("persona no encontrada");

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { academyId: id, personId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        plan: { select: { id: true, name: true, type: true, price: true } },
      },
    });

    const classSelect = {
      date: true,
      slot: {
        select: {
          styleId: true,
          series: {
            select: {
              name: true,
              style: { select: { name: true } },
            },
          },
        },
      },
    } as const;
    const now = new Date();
    const [attendances, bookings] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { personId, class: { slot: { academyId: id } } },
        select: { classId: true, checkedAt: true, class: { select: classSelect } },
      }),
      this.prisma.classBooking.findMany({
        where: { personId, class: { slot: { academyId: id } } },
        select: {
          classId: true,
          status: true,
          createdAt: true,
          class: { select: classSelect },
        },
      }),
    ]);

    // styleId del slot es FK plana (sin relación) — join manual para
    // slots legacy sin serie.
    const styleIds = [
      ...new Set(
        [...attendances, ...bookings]
          .map((r) => r.class.slot.styleId)
          .filter((x): x is string => !!x),
      ),
    ];
    const styles = styleIds.length
      ? await this.prisma.style.findMany({
          where: { id: { in: styleIds } },
          select: { id: true, name: true },
        })
      : [];
    const styleName = new Map(styles.map((s) => [s.id, s.name]));
    const meta = (c: { date: Date; slot: { styleId: string | null; series: { name: string; style: { name: string } | null } | null } }) => ({
      date: c.date,
      seriesName: c.slot.series?.name ?? null,
      styleName:
        c.slot.series?.style?.name ??
        (c.slot.styleId ? (styleName.get(c.slot.styleId) ?? null) : null),
    });

    // Historial: reservas en clases pasadas + asistencias (estas ganan el
    // dedup por classId). BOOKED → "booked"; WAITLIST/CANCELLED → "cancelled".
    const past = new Map<
      string,
      {
        classId: string;
        date: Date;
        seriesName: string | null;
        styleName: string | null;
        status: "attended" | "booked" | "cancelled";
      }
    >();
    for (const b of bookings) {
      if (b.class.date >= now) continue;
      past.set(b.classId, {
        classId: b.classId,
        ...meta(b.class),
        status: b.status === "BOOKED" ? "booked" : "cancelled",
      });
    }
    for (const a of attendances) {
      past.set(a.classId, {
        classId: a.classId,
        ...meta(a.class),
        status: "attended",
      });
    }
    const history = [...past.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 50);

    const upcoming = bookings
      .filter((b) => b.class.date >= now && b.status !== "CANCELLED")
      .sort((a, b) => a.class.date.getTime() - b.class.date.getTime())
      .map((b) => ({
        classId: b.classId,
        date: b.class.date,
        seriesName: b.class.slot.series?.name ?? null,
        status: b.status,
      }));

    return {
      person,
      plan: enrollment?.plan ?? null,
      enrollmentStatus: enrollment?.status ?? null,
      history,
      upcoming,
    };
  }

  // ─── slots ───

  @Post(":id/slots")
  @UseGuards(SessionGuard)
  async createSlot(
    @Param("id") id: string,
    @Body() dto: CreateSlotDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
    const weekday = dto.weekday ?? dto.dayOfWeek;
    if (weekday === undefined) {
      throw new BadRequestException("dayOfWeek (0-6) es requerido");
    }
    return this.prisma.classSlot.create({
      data: {
        academyId: id,
        weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        styleId: dto.styleId ?? null,
        instructorId: dto.instructorId ?? null,
        capacity: dto.capacity ?? null, // null = hereda serie/academia
        types: dto.typeIds?.length
          ? { create: dto.typeIds.map((typeId) => ({ typeId })) }
          : undefined,
      },
      include: { types: { include: { type: true } } },
    });
  }

  @Get(":id/slots")
  @UseGuards(SessionGuard)
  async listSlots(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.classSlot.findMany({
      where: { academyId: id },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      include: { types: { include: { type: true } } },
    });
  }

  // ─── dashboard ───

  @Get(":id/dashboard")
  @UseGuards(SessionGuard)
  async dashboard(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Class.date vive a medianoche UTC (misma convención que
    // ClassSeriesController.monthDates) — "hoy" = el día UTC actual.
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const [enrollments, plansCount, attendanceLast30d, today, todayAttendance] =
      await Promise.all([
        this.prisma.enrollment.findMany({
          where: { academyId: id },
          select: { status: true },
        }),
        this.prisma.membershipPlan.count({ where: { academyId: id } }),
        this.prisma.attendance.count({
          where: { class: { slot: { academyId: id }, date: { gte: since } } },
        }),
        // Clases del día — spec §13 Academia: "asistencia de hoy, clases
        // del día" en el dashboard de la consola.
        this.prisma.class.findMany({
          where: {
            cancelled: false,
            date: todayUTC,
            slot: { academyId: id },
          },
          orderBy: { slot: { startTime: "asc" } },
          select: {
            id: true,
            capacity: true,
            instructorId: true,
            slot: {
              select: {
                startTime: true,
                endTime: true,
                capacity: true,
                instructorId: true,
                series: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.attendance.count({
          where: { class: { slot: { academyId: id }, date: todayUTC } },
        }),
      ]);

    const classIds = today.map((c) => c.id);
    const bookedBy = classIds.length
      ? await this.prisma.classBooking.groupBy({
          by: ["classId"],
          where: { classId: { in: classIds }, status: "BOOKED" },
          _count: { _all: true },
        })
      : [];
    const booked = new Map(bookedBy.map((b) => [b.classId, b._count._all]));

    // instructorId es escalar (override de la clase o default del slot) —
    // nombres por join manual.
    const instructorIds = [
      ...new Set(
        today.map((c) => c.instructorId ?? c.slot.instructorId).filter(Boolean),
      ),
    ] as string[];
    const instructors = instructorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true },
        })
      : [];
    const instructorNameBy = new Map(instructors.map((p) => [p.id, p.name]));

    return {
      ...computeDashboard({ enrollments, plansCount, attendanceLast30d }),
      attendanceToday: todayAttendance,
      todayClasses: today.map((c) => ({
        id: c.id,
        startTime: c.slot.startTime,
        endTime: c.slot.endTime,
        seriesName: c.slot.series?.name ?? null,
        instructorName:
          instructorNameBy.get(c.instructorId ?? c.slot.instructorId ?? "") ??
          null,
        bookedCount: booked.get(c.id) ?? 0,
        capacity: c.capacity ?? c.slot.capacity,
      })),
    };
  }
}

@Controller("enrollments")
export class EnrollmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
  ) {}

  @Patch(":id")
  @UseGuards(SessionGuard)
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateEnrollmentDto,
    @Req() req: Request,
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id },
    });
    if (!enrollment) throw new NotFoundException("enrollment no encontrado");
    await this.access.requireAdminister(enrollment.academyId, req.person!);
    try {
      assertEnrollmentTransition(enrollment.status, dto.status);
    } catch (e) {
      if (e instanceof InvalidEnrollmentTransitionError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
    return this.prisma.enrollment.update({
      where: { id },
      data: {
        status: dto.status,
        // auditoría mínima disponible en schema (no hay endsAt/cancelledAt)
        pausedAt: dto.status === "PAUSED" ? new Date() : null,
      },
    });
  }
}
