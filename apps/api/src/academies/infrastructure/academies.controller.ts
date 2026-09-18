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

  @IsInt()
  capacity!: number;
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

  @Get(":id/students")
  @UseGuards(SessionGuard)
  async listStudents(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
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
        capacity: dto.capacity,
      },
    });
  }

  @Get(":id/slots")
  @UseGuards(SessionGuard)
  async listSlots(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.classSlot.findMany({
      where: { academyId: id },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });
  }

  // ─── dashboard ───

  @Get(":id/dashboard")
  @UseGuards(SessionGuard)
  async dashboard(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [enrollments, plansCount, attendanceLast30d] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { academyId: id },
        select: { status: true },
      }),
      this.prisma.membershipPlan.count({ where: { academyId: id } }),
      this.prisma.attendance.count({
        where: { class: { slot: { academyId: id }, date: { gte: since } } },
      }),
    ]);
    return computeDashboard({ enrollments, plansCount, attendanceLast30d });
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
