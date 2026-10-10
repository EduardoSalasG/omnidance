import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { Request } from "express";
import type { EnrollmentStatus, PlanType, Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { ParamsService } from "../../params/params.service";
import { SubscriptionsService } from "../../payments/application/subscriptions.service";
import {
  assertEnrollmentTransition,
  computeActiveStudentsKpis,
  computeDashboard,
  computeUpcomingBirthdays,
  InvalidEnrollmentTransitionError,
} from "../domain/academy.service";
import { AcademyAccess } from "./academy-access.service";
import {
  CLASS_CARD_SELECT,
  classCardItem,
  classEnded,
} from "./class-card-projection";
import { RolesGuard } from "../../common/rbac/roles.guard";
import {
  AllowSandbox,
  RequirePermissions,
} from "../../common/rbac/roles.decorator";
import { dayRange, pageParams, whitelist } from "./list-filters";
import { agreementWrite, PAY_TYPES } from "./instructor-agreement";
import { ApiQuery } from "@nestjs/swagger";

const PLAN_TYPES: PlanType[] = [
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "SINGLE",
  "CLASS_PACK",
  "PERIOD",
  "TRIAL",
];
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

  /** Cuota semanal del plan (1 clase/semana → 1). Ausente = ilimitado. */
  @IsOptional()
  @IsInt()
  @Min(1)
  weeklyClasses?: number;

  @IsOptional()
  @IsInt()
  periodDays?: number;

  /** Bullets de venta: cada ítem es una línea del <ul> en la ficha. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  description?: string[];
}

class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(PLAN_TYPES)
  type?: PlanType;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  /** `null` explícito limpia el cupo/pack. */
  @IsOptional()
  @IsInt()
  classCount?: number | null;

  /** `null` explícito convierte el plan en ilimitado semanal. */
  @IsOptional()
  @IsInt()
  @Min(1)
  weeklyClasses?: number | null;

  @IsOptional()
  @IsInt()
  periodDays?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  description?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
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

  /** "Pagado hasta" - si falta y el plan es PERIOD se deriva de
      periodDays; otros tipos quedan abiertos (staff lo marca al cobrar). */
  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

class UpdateEnrollmentDto {
  @IsIn(ENROLLMENT_STATUSES)
  status!: EnrollmentStatus;

  /** Renovar/corregir la vigencia; null explícito la limpia. */
  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}

class UpdateAcademySettingsDto {
  /** null explícito limpia el override → vuelve al default (20). */
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultQuorum?: number | null;

  // Perfil público de la academia (lo consume GET /:id/profile y el
  // directorio). "" y null limpian el campo.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;

  /** Handle de Instagram (con o sin "@", se normaliza). */
  @IsOptional()
  @IsString()
  @MaxLength(31)
  instagram?: string | null;

  /** Teléfono WhatsApp - se normaliza a dígitos (+56…) para wa.me. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string | null;

  /** URL del sitio web público - se normaliza a https://… */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string | null;

  /** Precio único (CLP) de la clase particular; null desactiva la venta. */
  @IsOptional()
  @IsInt()
  @Min(0)
  privateLessonPrice?: number | null;
}

class UpdateInstructorDto {
  /** Acuerdo económico (spec instructor-commission-subtype):
      PER_CLASS | MONTHLY (payAmount/payClasses) | COMMISSION
      (commissionPct 0-100 = % que retiene la academia por particular).
      Un solo subtipo activo; los campos que no aplican quedan en null. */
  @IsOptional()
  @IsIn(PAY_TYPES)
  payType?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  payAmount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  payClasses?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPct?: number | null;
}

/** "" → null; trim. Campos de texto libre del perfil público. */
function cleanText(
  v: string | null | undefined,
): string | null | undefined {
  if (v === undefined) return undefined;
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** Handle de Instagram sin "@", validado; "" → null. */
function cleanInstagram(
  v: string | null | undefined,
): string | null | undefined {
  if (v === undefined) return undefined;
  const h = (v ?? "").trim().replace(/^@+/, "");
  if (h === "") return null;
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(h)) {
    throw new BadRequestException("instagram inválido");
  }
  return h;
}

/** Teléfono de contacto → dígitos E.164 sin "+" (wa.me); "" → null. */
function cleanWhatsapp(
  v: string | null | undefined,
): string | null | undefined {
  if (v === undefined) return undefined;
  const d = (v ?? "").replace(/[\s\-()+]/g, "");
  if (d === "") return null;
  if (!/^[0-9]{8,15}$/.test(d)) {
    throw new BadRequestException("whatsapp inválido");
  }
  return d;
}

/** URL del sitio web → normalizada a http(s) absoluta; "" → null. */
function cleanWebsite(
  v: string | null | undefined,
): string | null | undefined {
  if (v === undefined) return undefined;
  const t = (v ?? "").trim();
  if (t === "") return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) throw new Error("no host");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new BadRequestException("website inválido");
  }
}

@Controller("academies")
export class AcademiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly subscriptions: SubscriptionsService,
    private readonly params: ParamsService,
  ) {}

  /**
   * Directorio de academias activas para alumnos autenticados: perfil
   * público (nombre, descripción, dirección, coords), estilos que imparte
   * (derivados de sus series activas), instructores y flag `enrolled`
   * (alguna inscripción del autenticado, cualquier estado - "Mis
   * academias" vs "Explorar" lo resuelve el front con esto). Datos
   * públicos de negocio - sin métricas ni datos de alumnos.
   * Las academias bloqueadas por mora (billingBlockedAt, spec
   * academy-saas-billing) quedan fuera del directorio - el alumno las
   * sigue viendo en /academies/enrolled con su flag.
   */
  @Get()
  @UseGuards(SessionGuard)
  async directory(@Req() req: Request) {
    const academies = await this.prisma.academy.findMany({
      where: { active: true, billingBlockedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        lat: true,
        lng: true,
        instructors: { select: { id: true, personId: true } },
        classSeries: {
          where: { active: true },
          select: {
            style: { select: { id: true, name: true, genre: true } },
          },
        },
      },
    });
    const instructorIds = [
      ...new Set(
        academies.flatMap((a) => a.instructors.map((i) => i.personId)),
      ),
    ];
    const [people, myEnrollments] = await Promise.all([
      this.prisma.person.findMany({
        where: { id: { in: instructorIds } },
        select: { id: true, name: true },
      }),
      this.prisma.enrollment.findMany({
        where: { personId: req.person!.id },
        select: { academyId: true },
      }),
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const enrolledIds = new Set(myEnrollments.map((e) => e.academyId));
    return academies.map((a) => {
      // Estilos que imparte = estilos de sus series activas (dedup).
      const styles = new Map<string, { id: string; name: string; genre: string | null }>();
      for (const s of a.classSeries) {
        if (s.style && !styles.has(s.style.id)) styles.set(s.style.id, s.style);
      }
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        address: a.address,
        lat: a.lat,
        lng: a.lng,
        styles: [...styles.values()].sort((x, y) =>
          x.name.localeCompare(y.name, "es"),
        ),
        instructors: a.instructors.map((i) => ({
          id: i.id,
          personId: i.personId,
          name: byId.get(i.personId)?.name ?? null,
        })),
        enrolled: enrolledIds.has(a.id),
      };
    });
  }

  /**
   * Directorio público mínimo (spec academies/owner-insights): alimenta
   * el strip de prueba social de /para-academias. Sin sesión y con
   * exposición mínima - solo id, nombre y estilos de las series
   * activas. Nada de dirección, instructores ni métricas.
   */
  @Get("public")
  async publicDirectory() {
    const academies = await this.prisma.academy.findMany({
      where: { active: true, billingBlockedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        classSeries: {
          where: { active: true },
          select: {
            style: { select: { id: true, name: true } },
          },
        },
      },
    });
    return academies.map((a) => {
      const styles = new Map<string, { id: string; name: string }>();
      for (const s of a.classSeries) {
        if (s.style && !styles.has(s.style.id)) styles.set(s.style.id, s.style);
      }
      return {
        id: a.id,
        name: a.name,
        styles: [...styles.values()].sort((x, y) =>
          x.name.localeCompare(y.name, "es"),
        ),
      };
    });
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
          // Colaboradores (academy-staff-roles): su academia también
          // aparece en la consola; los flags granulares mandan dentro.
          { staff: { some: { personId } } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Vista alumno (spec §9 "Mi Aprendizaje"): inscripciones del autenticado
   * con academia, estado (presencial/online/pausada), plan y asistencias
   * de los últimos 30 días por academia - progreso personal, no
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
        endsAt: true,
        academy: {
          select: {
            id: true,
            name: true,
            active: true,
            description: true,
            address: true,
            lat: true,
            lng: true,
            // Mora SaaS (S3): la academia bloqueada SIGUE listándose en
            // "mis academias" - el flag le permite a la UI marcarla
            // ("no disponible") sin castigar el historial del alumno.
            billingBlockedAt: true,
          },
        },
        plan: { select: { name: true, type: true } },
      },
    });
    if (enrollments.length === 0) return [];
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [attendances, subscriptions] = await Promise.all([
      this.prisma.attendance.findMany({
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
      }),
      // Suscripción vigente del viewer por academia (la más reciente) -
      // alimenta el badge "se cancela el…" de Mis academias.
      this.prisma.membershipSubscription.findMany({
        where: {
          personId,
          academyId: { in: enrollments.map((e) => e.academy.id) },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          academyId: true,
          planId: true,
          status: true,
          nextInvoiceAt: true,
          canceledAt: true,
        },
      }),
    ]);
    const countByAcademy = new Map<string, number>();
    for (const a of attendances) {
      const academyId = a.class.slot.academyId;
      countByAcademy.set(academyId, (countByAcademy.get(academyId) ?? 0) + 1);
    }
    const subByAcademy = new Map<string, (typeof subscriptions)[number]>();
    for (const s of subscriptions) {
      if (!subByAcademy.has(s.academyId)) subByAcademy.set(s.academyId, s);
    }
    return enrollments.map((e) => ({
      id: e.id,
      academy: {
        ...e.academy,
        billingBlocked: e.academy.billingBlockedAt != null,
      },
      status: e.status,
      plan: e.plan,
      startedAt: e.startedAt,
      endsAt: e.endsAt,
      attendance30d: countByAcademy.get(e.academy.id) ?? 0,
      subscription: subByAcademy.get(e.academy.id) ?? null,
    }));
  }

  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("academies.create")
  @AllowSandbox() // spec: owners SANDBOX crean academia demo antes del APPROVED
  async create(@Body() dto: CreateAcademyDto, @Req() req: Request) {
    // isDemo: el schema no tiene la columna - academias de owners no
    // APPROVED quedan indistinguibles (gap reportado).
    // Trial SaaS (spec academy-saas-billing): `academy_billing.trial_days`
    // días gratis desde la creación; las academias existentes recibieron
    // la grace de lanzamiento por backfill (migration_grace_days).
    const trialDays = await this.params.getNumber(
      "academy_billing.trial_days",
      30,
    );
    return this.prisma.academy.create({
      data: {
        name: dto.name,
        ownerId: req.person!.id,
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60_000),
      },
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
   * Perfil público de la academia (cualquier autenticado - la vista de
   * gestión es GET /:id con requireManage). Datos de negocio públicos:
   * descripción, dirección/coords, estilos impartidos (derivados de
   * series activas), profesores, planes activos y próximas clases
   * materializadas (mismo shape ClassCardData que /classes/browse).
   * `myEnrollment` = inscripción del viewer si existe (cualquier estado);
   * `mySubscription` = su suscripción Flow más reciente a esta academia.
   */
  @Get(":id/profile")
  @UseGuards(SessionGuard)
  async profile(@Param("id") id: string, @Req() req: Request) {
    const me = req.person!.id;
    const academy = await this.prisma.academy.findFirst({
      where: { id, active: true },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        lat: true,
        lng: true,
        instagram: true,
        whatsapp: true,
        website: true,
        privateLessonPrice: true,
        // Mora SaaS (S3): la ficha pública sigue respondiendo pero el
        // flag `billingBlocked` le dice a la UI que la muestre como "no
        // disponible" (sin CTAs de compra/reserva - S6).
        billingBlockedAt: true,
        instructors: { select: { personId: true } },
        classSeries: {
          where: { active: true },
          select: {
            style: { select: { id: true, name: true, genre: true } },
          },
        },
        plans: {
          where: { active: true },
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            classCount: true,
            weeklyClasses: true,
            periodDays: true,
            description: true,
          },
          orderBy: { price: "asc" },
        },
      },
    });
    if (!academy) throw new NotFoundException("academia no encontrada");

    const instructorIds = academy.instructors.map((i) => i.personId);
    const [people, myEnrollment, mySubscription, upcoming] =
      await Promise.all([
        this.prisma.person.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true, photoUrl: true },
        }),
        this.prisma.enrollment.findFirst({
          where: { personId: me, academyId: id },
          select: {
            status: true,
            startedAt: true,
            endsAt: true,
            plan: { select: { id: true, name: true, type: true } },
          },
        }),
        // Suscripción del viewer a esta academia (la más reciente) - la
        // ficha muestra el estado/badge igual que myEnrollment.
        this.prisma.membershipSubscription.findFirst({
          where: { personId: me, academyId: id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            planId: true,
            status: true,
            nextInvoiceAt: true,
            canceledAt: true,
          },
        }),
        // Próximas clases no terminadas de la academia (cap razonable -
        // la página muestra las primeras y la ficha de clase tiene el resto).
        this.prisma.class.findMany({
          where: {
            cancelled: false,
            date: { gte: new Date() },
            slot: { academyId: id, series: { active: true } },
          },
          orderBy: { date: "asc" },
          take: 30,
          select: CLASS_CARD_SELECT,
        }),
      ]);
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const photoOf = new Map(people.map((p) => [p.id, p.photoUrl]));
    const enrolledIds = new Set(myEnrollment ? [id] : []);
    const instructorName = new Map(
      upcoming
        .filter((c) => c.instructorId)
        .map(
          (c) =>
            [c.instructorId!, nameOf.get(c.instructorId!) ?? null] as const,
        ),
    );
    const styles = new Map<
      string,
      { id: string; name: string; genre: string | null }
    >();
    for (const s of academy.classSeries) {
      if (s.style && !styles.has(s.style.id)) styles.set(s.style.id, s.style);
    }
    return {
      id: academy.id,
      name: academy.name,
      description: academy.description,
      address: academy.address,
      lat: academy.lat,
      lng: academy.lng,
      instagram: academy.instagram,
      whatsapp: academy.whatsapp,
      website: academy.website,
      privateLessonPrice: academy.privateLessonPrice,
      billingBlocked: academy.billingBlockedAt != null,
      styles: [...styles.values()].sort((x, y) =>
        x.name.localeCompare(y.name, "es"),
      ),
      instructors: instructorIds.map((pid) => ({
        personId: pid,
        name: nameOf.get(pid) ?? null,
        photoUrl: photoOf.get(pid) ?? null,
      })),
      plans: academy.plans,
      myEnrollment: myEnrollment ?? null,
      mySubscription: mySubscription ?? null,
      classes: upcoming
        .filter((c) => !classEnded(c))
        .slice(0, 12)
        .map((c) => classCardItem(c, me, enrolledIds, instructorName)),
    };
  }

  /**
   * Settings de la academia (solo owner/ADMIN). defaultQuorum es el piso
   * de la cadena de quórum efectivo de las clases; null lo limpia.
   * También edita el perfil público (descripción, dirección, coords y
   * contacto) - undefined no toca el campo; null/"" lo limpian.
   */
  @Patch(":id/settings")
  @UseGuards(SessionGuard)
  async updateSettings(
    @Param("id") id: string,
    @Body() dto: UpdateAcademySettingsDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "profile");
    const data: Prisma.AcademyUpdateInput = {
      // undefined = no enviado → no toca; null explícito limpia el override.
      defaultQuorum: dto.defaultQuorum,
      description: cleanText(dto.description),
      address: cleanText(dto.address),
      lat: dto.lat,
      lng: dto.lng,
      instagram: cleanInstagram(dto.instagram),
      whatsapp: cleanWhatsapp(dto.whatsapp),
      website: cleanWebsite(dto.website),
      privateLessonPrice: dto.privateLessonPrice,
    };
    return this.prisma.academy.update({ where: { id }, data });
  }

  /**
   * Acuerdo económico del instructor (cap "team": owner/ADMIN/staff):
   * PER_CLASS | MONTHLY sobre payAmount/payClasses. null limpia el campo.
   */
  @Patch(":id/instructors/:personId")
  @UseGuards(SessionGuard)
  async updateInstructor(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Body() dto: UpdateInstructorDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "team");
    const instructor = await this.prisma.academyInstructor.findUnique({
      where: { academyId_personId: { academyId: id, personId } },
    });
    if (!instructor) {
      throw new NotFoundException("instructor no encontrado en la academia");
    }
    const data = agreementWrite(dto, instructor);
    return this.prisma.academyInstructor.update({
      where: { academyId_personId: { academyId: id, personId } },
      data,
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
    await this.access.requireCapabilityWrite(id, req.person!, "plans");
    return this.prisma.membershipPlan.create({
      data: {
        academyId: id,
        name: dto.name,
        type: dto.type,
        price: dto.price,
        classCount: dto.classCount ?? dto.classesPerPeriod ?? null,
        weeklyClasses: dto.weeklyClasses ?? null,
        periodDays: dto.periodDays ?? null,
        description:
          dto.description?.map((d) => d.trim()).filter(Boolean) ?? [],
      },
    });
  }

  @Get(":id/plans")
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "sort", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @UseGuards(SessionGuard)
  async listPlans(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("sort") sort?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "plans");
    // Filtros del contrato compartido (spec analytics/query-console):
    // q = nombre contiene (case-insensitive), status = active|inactive
    // (whitelist → 400). sort = name|price con sufijo -desc.
    const term = q?.trim();
    const pg = pageParams(page, pageSize);
    const statusF = whitelist(status, ["active", "inactive"] as const, "status");
    const sortF = whitelist(
      sort,
      ["name", "name-desc", "price", "price-desc"] as const,
      "sort",
    );
    const orderBy =
      sortF === "price"
        ? [{ price: "asc" as const }, { name: "asc" as const }]
        : sortF === "price-desc"
          ? [{ price: "desc" as const }, { name: "asc" as const }]
          : sortF === "name-desc"
            ? [{ name: "desc" as const }]
            : [{ name: "asc" as const }];
    const where = {
      academyId: id,
      ...(term ? { name: { contains: term, mode: "insensitive" as const } } : {}),
      ...(statusF ? { active: statusF === "active" } : {}),
    };
    const [plans, total] = await Promise.all([
      this.prisma.membershipPlan.findMany({
        where,
        orderBy,
        skip: pg.skip,
        take: pg.take,
        include: {
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      }),
      this.prisma.membershipPlan.count({ where }),
    ]);
    return {
      items: plans.map(({ _count, ...p }) => ({
        ...p,
        activeStudents: _count.enrollments,
      })),
      total,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }

  /**
   * KPIs del módulo de planes: total activos y top 3 por alumnos con
   * enrollment ACTIVE, con comparativa MTD del mes anterior
   * (alumnos con plan activo cuyo startedAt cae dentro del tramo previo
   * equivalente).
   */
  @Get(":id/plans/kpis")
  @UseGuards(SessionGuard)
  async plansKpis(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "plans");
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const prevStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    // Mismo tramo del mes anterior (MTD): día 1 → día N del mes previo.
    const prevEnd = new Date(
      prevStart.getTime() + (now.getTime() - monthStart.getTime()),
    );

    const [activePlans, grouped, groupedPrev, boughtMonth] =
      await Promise.all([
        this.prisma.membershipPlan.count({
          where: { academyId: id, active: true },
        }),
        this.prisma.enrollment.groupBy({
          by: ["planId"],
          where: { academyId: id, status: "ACTIVE" },
          _count: { _all: true },
        }),
        this.prisma.enrollment.groupBy({
          by: ["planId"],
          where: {
            academyId: id,
            status: "ACTIVE",
            startedAt: { gte: prevStart, lte: prevEnd },
          },
          _count: { _all: true },
        }),
        // Compras del mes: altas de enrollment en el mes en curso (cada
        // alta es una compra/renovación del plan - spec: top 5 más
        // comprados con su conteo).
        this.prisma.enrollment.groupBy({
          by: ["planId"],
          where: {
            academyId: id,
            planId: { not: null },
            startedAt: { gte: monthStart },
          },
          _count: { _all: true },
        }),
      ]);
    const prevByPlan = new Map(groupedPrev.map((g) => [g.planId, g._count._all]));
    const top = grouped
      .filter((g) => g.planId)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 3);
    const topBought = boughtMonth
      .filter((g) => g.planId)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5);
    const names = top.length || topBought.length
      ? await this.prisma.membershipPlan.findMany({
          where: {
            id: {
              in: [
                ...top.map((g) => g.planId!),
                ...topBought.map((g) => g.planId!),
              ],
            },
          },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    return {
      activePlans,
      topPlans: top.map((g) => ({
        planId: g.planId!,
        name: nameById.get(g.planId!) ?? null,
        students: g._count._all,
        studentsPrev: prevByPlan.get(g.planId!) ?? 0,
      })),
      topPurchasedMonth: topBought.map((g) => ({
        planId: g.planId!,
        name: nameById.get(g.planId!) ?? null,
        count: g._count._all,
      })),
    };
  }

  /**
   * Detalle del plan + alumnos con enrollment ACTIVE (inicio/fin) -
   * la página del plan los muestra para gestión y contexto.
   */
  @Get(":id/plans/:planId")
  @UseGuards(SessionGuard)
  async planDetail(
    @Param("id") id: string,
    @Param("planId") planId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "plans");
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, academyId: id },
      include: {
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
    });
    if (!plan) throw new NotFoundException("plan no encontrado");
    const enrollments = await this.prisma.enrollment.findMany({
      where: { planId: plan.id, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: { personId: true, startedAt: true, endsAt: true },
    });
    // Enrollment.personId es FK plana - join manual (mismo patrón que
    // GET /:id/students).
    const people = enrollments.length
      ? await this.prisma.person.findMany({
          where: { id: { in: enrollments.map((e) => e.personId) } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(people.map((p) => [p.id, p.name]));
    const { _count, ...rest } = plan;
    return {
      ...rest,
      activeStudents: _count.enrollments,
      students: enrollments.map((e) => ({
        personId: e.personId,
        name: nameById.get(e.personId) ?? null,
        startedAt: e.startedAt,
        endsAt: e.endsAt,
      })),
    };
  }

  /**
   * GET /academies/:id/surveys - resultados de las encuestas mensuales de
   * curso, agrupados por serie × mes (spec academy-console-v3). SOLO
   * owner/ADMIN (requireAdminister): los resultados son privados del
   * dueño y siempre anónimos - nunca sale personId ni el nombre del
   * evaluador; los comentarios viajan como texto plano.
   * Filtros opcionales: ?seriesId= & ?month=YYYY-MM.
   */
  @Get(":id/surveys")
  @ApiQuery({ name: "seriesId", required: false })
  @ApiQuery({ name: "month", required: false })
  @UseGuards(SessionGuard)
  async courseSurveys(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("seriesId") seriesId?: string,
    @Query("month") month?: string,
  ) {
    await this.access.requireAdminister(id, req.person!);
    const surveys = await this.prisma.courseSurvey.findMany({
      where: {
        academyId: id,
        ...(seriesId ? { seriesId } : {}),
        ...(month ? { month } : {}),
      },
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    });
    return this.groupCourseSurveys(surveys);
  }

  /**
   * GET /academies/:id/instructors/:personId/surveys - encuestas donde el
   * snapshot del profe evaluado es esa persona, agrupadas mes × serie.
   * Mismo gate y anonimato que /surveys (solo owner/ADMIN).
   */
  @Get(":id/instructors/:personId/surveys")
  @UseGuards(SessionGuard)
  async instructorSurveys(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!);
    const surveys = await this.prisma.courseSurvey.findMany({
      where: { academyId: id, instructorId: personId },
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    });
    return this.groupCourseSurveys(surveys);
  }

  /** Agrega CourseSurvey[] por (seriesId, month) - shape anónimo. */
  private async groupCourseSurveys(
    surveys: {
      seriesId: string;
      month: string;
      courseRating: number;
      instructorRating: number | null;
      comment: string | null;
      createdAt: Date;
    }[],
  ) {
    const seriesIds = [...new Set(surveys.map((s) => s.seriesId))];
    const series = seriesIds.length
      ? await this.prisma.classSeries.findMany({
          where: { id: { in: seriesIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(series.map((s) => [s.id, s.name]));
    const groups = new Map<
      string,
      {
        seriesId: string;
        seriesName: string;
        month: string;
        count: number;
        courseSum: number;
        instructorSum: number;
        instructorCount: number;
        comments: string[];
      }
    >();
    for (const s of surveys) {
      const key = `${s.seriesId}:${s.month}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          seriesId: s.seriesId,
          seriesName: nameById.get(s.seriesId) ?? "",
          month: s.month,
          count: 0,
          courseSum: 0,
          instructorSum: 0,
          instructorCount: 0,
          comments: [],
        };
        groups.set(key, g);
      }
      g.count++;
      g.courseSum += s.courseRating;
      if (s.instructorRating != null) {
        g.instructorSum += s.instructorRating;
        g.instructorCount++;
      }
      if (s.comment) g.comments.push(s.comment);
    }
    return [...groups.values()].map((g) => ({
      seriesId: g.seriesId,
      seriesName: g.seriesName,
      month: g.month,
      count: g.count,
      avgCourse: Math.round((g.courseSum / g.count) * 10) / 10,
      avgInstructor:
        g.instructorCount > 0
          ? Math.round((g.instructorSum / g.instructorCount) * 10) / 10
          : null,
      comments: g.comments,
    }));
  }

  /**
   * GET /academies/:id/cobros/kpis - facturación del mes (MTD), ticket
   * promedio y top 3 medios de pago, cada uno con la comparativa del
   * tramo equivalente del mes anterior. Mismas fuentes del dashboard
   * (claims APPROVED + pagos PAID por pasarela atribuidos por refId).
   */
  @Get(":id/cobros/kpis")
  @UseGuards(SessionGuard)
  async cobrosKpis(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "payments");
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const prevStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const prevEnd = new Date(
      prevStart.getTime() + (now.getTime() - monthStart.getTime()),
    );
    const planIds = await this.prisma.membershipPlan.findMany({
      where: { academyId: id },
      select: { id: true },
    });
    const gatewayWhere = (createdAt: { gte: Date; lte?: Date }) => ({
      status: "PAID" as const,
      createdAt,
      OR: [
        ...planIds.map((p) => ({
          orderType: "MEMBERSHIP",
          refId: { startsWith: `mem_${p.id}_` },
        })),
        { orderType: "PRIVATE", refId: { startsWith: `pvt_${id}_` } },
      ],
    });
    const [claimsMonth, gatewayMonth, claimsPrev, gatewayPrev] =
      await Promise.all([
        this.prisma.paymentClaim.findMany({
          where: {
            academyId: id,
            status: "APPROVED",
            createdAt: { gte: monthStart },
          },
          select: { amount: true, personId: true, methodLabel: true },
        }),
        this.prisma.payment.findMany({
          where: gatewayWhere({ gte: monthStart }),
          select: {
            amount: true,
            personId: true,
            gateway: true,
            gatewayMedia: true,
          },
        }),
        this.prisma.paymentClaim.findMany({
          where: {
            academyId: id,
            status: "APPROVED",
            createdAt: { gte: prevStart, lte: prevEnd },
          },
          select: { amount: true, personId: true, methodLabel: true },
        }),
        this.prisma.payment.findMany({
          where: gatewayWhere({ gte: prevStart, lte: prevEnd }),
          select: {
            amount: true,
            personId: true,
            gateway: true,
            gatewayMedia: true,
          },
        }),
      ]);

    const rows = [
      ...claimsMonth.map((c) => ({
        amount: c.amount,
        personId: c.personId,
        label: c.methodLabel,
      })),
      ...gatewayMonth.map((p) => ({
        amount: p.amount,
        personId: p.personId,
        label: p.gatewayMedia ?? p.gateway,
      })),
    ];
    const prevRows = [
      ...claimsPrev.map((c) => ({
        amount: c.amount,
        personId: c.personId,
        label: c.methodLabel,
      })),
      ...gatewayPrev.map((p) => ({
        amount: p.amount,
        personId: p.personId,
        label: p.gatewayMedia ?? p.gateway,
      })),
    ];

    const billedMonth = rows.reduce((a, r) => a + r.amount, 0);
    const billedMonthPrev = prevRows.reduce((a, r) => a + r.amount, 0);
    const payers = new Set(rows.map((r) => r.personId));
    const prevPayers = new Set(prevRows.map((r) => r.personId));
    const avgTicketMonth = payers.size
      ? Math.round(billedMonth / payers.size)
      : null;
    const avgTicketMonthPrev = prevPayers.size
      ? Math.round(billedMonthPrev / prevPayers.size)
      : null;

    const prevByLabel = new Map<string, number>();
    for (const r of prevRows) {
      prevByLabel.set(r.label, (prevByLabel.get(r.label) ?? 0) + r.amount);
    }
    const byLabel = new Map<string, number>();
    for (const r of rows) {
      byLabel.set(r.label, (byLabel.get(r.label) ?? 0) + r.amount);
    }
    const topMethods = [...byLabel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, amount]) => ({
        label,
        amount,
        amountPrev: prevByLabel.get(label) ?? 0,
      }));

    return {
      billedMonth,
      billedMonthPrev,
      avgTicketMonth,
      avgTicketMonthPrev,
      topMethods,
    };
  }

  /**
   * GET /academies/:id/payments/:paymentId - detalle de un cobro de la
   * academia para la página de detalle. El pago se adjudica por refId
   * (mem_<planId>_* / wks_<classId>_* / pvt_<academyId>_* /
   * claim-<claimId>); fuera de la academia → 404 (anti-enumeración,
   * misma política de GET /payments/:id).
   */
  @Get(":id/payments/:paymentId")
  @UseGuards(SessionGuard)
  async academyPaymentDetail(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "payments");
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("pago no encontrado");

    // Adjudicación por refId - mismo decode que by-academy.
    const ref = payment.refId;
    let contextName: string | null = null;
    if (ref.startsWith("mem_")) {
      const plan = await this.prisma.membershipPlan.findFirst({
        where: { id: ref.split("_")[1], academyId: id },
        select: { name: true },
      });
      if (!plan) throw new NotFoundException("pago no encontrado");
      contextName = plan.name;
    } else if (ref.startsWith("wks_")) {
      const cls = await this.prisma.class.findFirst({
        where: { id: ref.split("_")[1], slot: { academyId: id } },
        select: { slot: { select: { series: { select: { name: true } } } } },
      });
      if (!cls) throw new NotFoundException("pago no encontrado");
      contextName = cls.slot.series?.name ?? null;
    } else if (ref.startsWith(`pvt_${id}_`)) {
      contextName = null;
    } else if (ref.startsWith("claim-")) {
      const claim = await this.prisma.paymentClaim.findFirst({
        where: { id: ref.slice("claim-".length), academyId: id },
        select: { plan: { select: { name: true } } },
      });
      if (!claim) throw new NotFoundException("pago no encontrado");
      contextName = claim.plan?.name ?? null;
    } else {
      throw new NotFoundException("pago no encontrado");
    }

    const person = await this.prisma.person.findUnique({
      where: { id: payment.personId },
      select: { id: true, name: true },
    });
    const eventCount = await this.prisma.paymentEvent.count({
      where: { paymentId: payment.id },
    });
    const { gatewayRaw, ...rest } = payment;
    return {
      ...rest,
      eventCount,
      personName: person?.name ?? null,
      contextName,
    };
  }

  /**
   * Edición de plan. Si el plan ya tiene espejo en Flow (algún
   * subscribe lo materializó) y cambia nombre/precio, se empuja
   * plans/edit ANTES del update local: si Flow rechaza, la fila local
   * queda intacta y ambos lados siguen consistentes; el reintento
   * converge (syncPlan es idempotente con los mismos valores). El tipo
   * queda bloqueado cuando hay espejo - Flow plans/edit no admite
   * cambiar el intervalo de un plan ya creado.
   */
  @Patch(":id/plans/:planId")
  @UseGuards(SessionGuard)
  async updatePlan(
    @Param("id") id: string,
    @Param("planId") planId: string,
    @Body() dto: UpdatePlanDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "plans");
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, academyId: id },
      include: { academy: { select: { name: true } } },
    });
    if (!plan) throw new NotFoundException("plan no encontrado");
    if (
      plan.flowPlanId &&
      dto.type !== undefined &&
      dto.type !== plan.type
    ) {
      throw new BadRequestException(
        "el tipo no se puede cambiar en un plan con cobro recurrente",
      );
    }
    if (
      plan.flowPlanId &&
      (dto.name !== undefined || dto.price !== undefined)
    ) {
      try {
        await this.subscriptions.syncMirrorPlan(plan, {
          name: dto.name ?? plan.name,
          price: dto.price ?? plan.price,
        });
      } catch {
        throw new BadGatewayException(
          "Flow no pudo actualizar el plan de cobro. Reintenta",
        );
      }
    }
    const data: Prisma.MembershipPlanUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.classCount !== undefined
        ? { classCount: dto.classCount }
        : {}),
      ...(dto.weeklyClasses !== undefined
        ? { weeklyClasses: dto.weeklyClasses }
        : {}),
      ...(dto.periodDays !== undefined
        ? { periodDays: dto.periodDays }
        : {}),
      ...(dto.description !== undefined
        ? {
            description: dto.description.map((d) => d.trim()).filter(Boolean),
          }
        : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };
    return this.prisma.membershipPlan.update({
      where: { id: plan.id },
      data,
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
    await this.access.requireCapabilityWrite(id, req.person!, "students");

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

    const startedAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    // "Pagado hasta": explícito, o derivado del plan PERIOD
    // (startedAt + periodDays). MONTHLY/CLASS_PACK/TRIAL quedan sin
    // fecha - el staff la marca al cobrar (PATCH /enrollments/:id).
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : plan.type === "PERIOD" && plan.periodDays
        ? new Date(startedAt.getTime() + plan.periodDays * 86_400_000)
        : null;

    return this.prisma.enrollment.create({
      data: {
        academyId: id,
        personId: dto.personId,
        planId: plan.id,
        status: dto.status ?? "ACTIVE",
        startedAt,
        endsAt,
      },
    });
  }

  // Listado de alumnos - requireManage: el instructor también lo ve
  // (necesita conocer a sus alumnos), no solo el owner.
  // Filtros del contrato compartido (spec analytics/query-console,
  // entidad `students`): q = nombre del alumno (misma semántica del
  // engine: ≥2 chars, contains insensitive), status por whitelist,
  // planId exacto y from/to = rango inclusivo por día sobre startedAt.
  @Get(":id/students")
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "planId", required: false })
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @UseGuards(SessionGuard)
  async listStudents(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("planId") planId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    await this.access.requireManage(id, req.person!);
    const statusF = whitelist(status, ENROLLMENT_STATUSES, "status");
    const range = dayRange(from, to);
    const pg = pageParams(page, pageSize);
    const term = q?.trim() ?? "";
    // q filtra por nombre del alumno (personId es FK plana - join manual,
    // misma semántica que la entidad students del query engine).
    let personIdIn: string[] | undefined;
    if (term.length >= 2) {
      const matches = await this.prisma.person.findMany({
        where: { name: { contains: term, mode: "insensitive" } },
        select: { id: true },
        take: 500,
      });
      personIdIn = matches.map((m) => m.id);
    } else if (term) {
      personIdIn = [];
    }
    const where = {
      academyId: id,
      ...(statusF ? { status: statusF } : {}),
      ...(planId ? { planId } : {}),
      ...(range ? { startedAt: range } : {}),
      ...(personIdIn ? { personId: { in: personIdIn } } : {}),
    };
    const [enrollments, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pg.skip,
        take: pg.take,
        select: {
          id: true,
          status: true,
          startedAt: true,
          endsAt: true,
          personId: true,
          plan: { select: { id: true, name: true } },
        },
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    // Enrollment.personId es FK plana (sin relación en schema) - join manual.
    const people = await this.prisma.person.findMany({
      where: { id: { in: enrollments.map((e) => e.personId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      items: enrollments.map((e) => ({
        id: e.id,
        person: byId.get(e.personId) ?? {
          id: e.personId,
          name: null,
          email: null,
        },
        plan: e.plan,
        status: e.status,
        startsAt: e.startedAt,
        endsAt: e.endsAt,
      })),
      total,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }

  /**
   * Insights del módulo Alumnos (spec academy-console-v3): top 5 por
   * asistencia histórica y top 5 por monto pagado en el mes en curso
   * (claims APPROVED + pasarela PAID atribuida por refId - mismo ledger
   * que cobros/kpis). Declarado antes de :personId - "insights" sería
   * capturado como id.
   */
  @Get(":id/students/insights")
  @UseGuards(SessionGuard)
  async studentsInsights(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireManage(id, req.person!);
    // Montos detrás de la capacidad `payments` (spec academies/
    // staff-roles): el instructor lee asistencia pero nunca ve quién
    // pagó más - topPayersMonth responde [] sin la cap.
    const canSeePayments = await this.access
      .requireCapability(id, req.person!, "payments")
      .then(() => true)
      .catch(() => false);
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const planIds = canSeePayments
      ? await this.prisma.membershipPlan.findMany({
          where: { academyId: id },
          select: { id: true },
        })
      : [];
    const [attGrouped, claimsMonth, gatewayMonth] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ["personId"],
        where: { class: { slot: { academyId: id } } },
        _count: { _all: true },
      }),
      canSeePayments
        ? this.prisma.paymentClaim.findMany({
            where: {
              academyId: id,
              status: "APPROVED",
              createdAt: { gte: monthStart },
            },
            select: { amount: true, personId: true },
          })
        : Promise.resolve([]),
      canSeePayments
        ? this.prisma.payment.findMany({
            where: {
              status: "PAID",
              createdAt: { gte: monthStart },
              OR: [
                ...planIds.map((p) => ({
                  orderType: "MEMBERSHIP",
                  refId: { startsWith: `mem_${p.id}_` },
                })),
                { orderType: "PRIVATE", refId: { startsWith: `pvt_${id}_` } },
              ],
            },
            select: { amount: true, personId: true },
          })
        : Promise.resolve([]),
    ]);

    const paidByPerson = new Map<string, number>();
    for (const r of [...claimsMonth, ...gatewayMonth]) {
      paidByPerson.set(
        r.personId,
        (paidByPerson.get(r.personId) ?? 0) + r.amount,
      );
    }
    const topAttendance = attGrouped
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 5);
    const topPayers = [...paidByPerson.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // personId es escalar sin FK - nombres por join manual (patrón del
    // dashboard).
    const ids = [
      ...new Set([
        ...topAttendance.map((g) => g.personId),
        ...topPayers.map(([pid]) => pid),
      ]),
    ];
    const people = ids.length
      ? await this.prisma.person.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(people.map((p) => [p.id, p.name]));

    return {
      topAttendance: topAttendance.map((g) => ({
        personId: g.personId,
        name: nameById.get(g.personId) ?? null,
        count: g._count._all,
      })),
      topPayersMonth: topPayers.map(([personId, amount]) => ({
        personId,
        name: nameById.get(personId) ?? null,
        amount,
      })),
    };
  }

  /**
   * Ficha del alumno dentro de la academia: plan/enrollment vigente,
   * historial (asistencias + reservas pasadas, últimas 50 - la asistencia
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

    // La capacidad "students" habilita la edición (status/endsAt) en la
    // ficha - owner, ADMIN o staff con el flag; el instructor lee pero
    // no edita (PATCH /enrollments/:id exige la misma capacidad).
    const canEdit = await this.access
      .requireCapability(id, req.person!, "students")
      .then(() => true)
      .catch(() => false);

    // Todos los enrollments de la persona en la academia - el header
    // usa el más reciente y la lista completa es su historial de
    // membresías pagadas (plan, inicio, fin).
    const enrollments = await this.prisma.enrollment.findMany({
      where: { academyId: id, personId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endsAt: true,
        plan: { select: { id: true, name: true, type: true, price: true } },
      },
    });
    const enrollment = enrollments[0] ?? null;

    const classSelect = {
      date: true,
      slot: {
        select: {
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
    const [attendances, bookings, relScore] = await Promise.all([
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
      // Score de relación academia↔alumno (CRM transversal): privado
      // por actor - solo la propia academia lo ve en su consola.
      this.prisma.relationshipScore.findUnique({
        where: {
          actorType_actorId_personId: {
            actorType: "ACADEMY",
            actorId: id,
            personId,
          },
        },
        select: { score: true, segment: true, computedAt: true },
      }),
    ]);

    const meta = (c: {
      date: Date;
      slot: { series: { name: string; style: { name: string } | null } };
    }) => ({
      date: c.date,
      seriesName: c.slot.series.name,
      styleName: c.slot.series.style?.name ?? null,
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
        seriesName: b.class.slot.series.name,
        status: b.status,
      }));

    return {
      person,
      plan: enrollment?.plan ?? null,
      enrollmentId: enrollment?.id ?? null,
      enrollmentStatus: enrollment?.status ?? null,
      enrollmentStartedAt: enrollment?.startedAt ?? null,
      enrollmentEndsAt: enrollment?.endsAt ?? null,
      canEdit,
      enrollments: enrollments.map((e) => ({
        id: e.id,
        status: e.status,
        startedAt: e.startedAt,
        endsAt: e.endsAt,
        plan: e.plan,
      })),
      score: relScore?.score ?? null,
      segment: relScore?.segment ?? null,
      history,
      upcoming,
    };
  }

  // ─── slots ───
  // Los horarios solo se crean vía serie (POST /academies/:id/series y
  // /series/:id/slots) - todo slot pertenece a una serie por invariante
  // de schema. Este GET es la parrilla semanal completa de la academia.

  @Get(":id/slots")
  @ApiQuery({ name: "seriesId", required: false })
  @UseGuards(SessionGuard)
  async listSlots(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("seriesId") seriesId?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "schedule");
    return this.prisma.classSlot.findMany({
      where: { academyId: id, ...(seriesId ? { seriesId } : {}) },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      include: {
        series: { select: { id: true, name: true } },
        types: { include: { type: true } },
      },
    });
  }

  // ─── dashboard ───

  @Get(":id/dashboard")
  @UseGuards(SessionGuard)
  async dashboard(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireStaff(id, req.person!);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Class.date vive a medianoche UTC (misma convención que
    // ClassSeriesController.monthDates) - "hoy" = el día UTC actual.
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // Mes calendario UTC (misma convención que class.date a medianoche
    // UTC) - los KPIs del dashboard son "este mes".
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    // Comparativa honesta: mismo tramo month-to-date del mes anterior
    // (p.ej. oct 1-9 vs sep 1-9), nunca MTD vs mes completo.
    const prevMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const prevMtdEnd = new Date(
      prevMonthStart.getTime() + (todayUTC.getTime() - monthStart.getTime()),
    );
    const [
      enrollments,
      plansCount,
      attendanceLast30d,
      today,
      todayAttendance,
      activeNowRows,
      activePrevRows,
      purchasablePlans,
      classesMonth,
      attendanceMonth,
      weeklyClasses,
      pendingClaimsAgg,
      pendingClaimsRows,
      pendingLessonsCount,
      pendingLessonsRows,
      staffCount,
      instructorCount,
      methodsCount,
    ] =
      await Promise.all([
        this.prisma.enrollment.findMany({
          where: { academyId: id },
          select: { status: true, personId: true },
        }),
        this.prisma.membershipPlan.count({ where: { academyId: id } }),
        this.prisma.attendance.count({
          where: { class: { slot: { academyId: id }, date: { gte: since } } },
        }),
        // Clases del día - spec §13 Academia: "asistencia de hoy, clases
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
            instructors: { select: { personId: true } },
            slot: {
              select: {
                startTime: true,
                endTime: true,
                capacity: true,
                instructorId: true,
                instructors: { select: { personId: true } },
                series: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.attendance.count({
          where: { class: { slot: { academyId: id }, date: todayUTC } },
        }),
        // ─── KPIs del mes (consola del owner) ───
        // Alumnos con plan vigente: estados que habilitan asistir
        // (mismo set que los insights) y endsAt no vencido o sin fecha.
        // findMany de personIds (no count) - el KPI cuenta personas
        // únicas y el mismo set alimenta el split de género.
        this.prisma.enrollment.findMany({
          where: {
            academyId: id,
            status: { in: ["ACTIVE", "TRIAL", "ONLINE"] },
            OR: [{ endsAt: null }, { endsAt: { gte: todayUTC } }],
          },
          select: { personId: true },
        }),
        // Set equivalente del tramo MTD del mes anterior: vigencia que
        // intersecta la ventana (sin histórico de estados - el actual
        // aproxima; spec academies/owner-insights).
        this.prisma.enrollment.findMany({
          where: {
            academyId: id,
            status: { in: ["ACTIVE", "TRIAL", "ONLINE"] },
            startedAt: { lte: prevMtdEnd },
            OR: [{ endsAt: null }, { endsAt: { gte: prevMonthStart } }],
          },
          select: { personId: true },
        }),
        this.prisma.membershipPlan.count({
          where: { academyId: id, active: true },
        }),
        // Asistencia promedio por clase: solo clases ya dictadas
        // (pasadas + hoy), las futuras no tienen asistencia posible.
        this.prisma.class.count({
          where: {
            cancelled: false,
            date: { gte: monthStart, lte: todayUTC },
            slot: { academyId: id },
          },
        }),
        this.prisma.attendance.count({
          where: {
            class: {
              slot: { academyId: id },
              date: { gte: monthStart, lte: todayUTC },
            },
          },
        }),
        // Clases semanales ofrecidas: slots de recurrencia de series
        // activas (un slot = una clase por semana).
        this.prisma.classSlot.count({
          where: { academyId: id, series: { active: true } },
        }),
        // Cobros declarados por alumnos pendientes de revisión (la
        // sección "Cobros por revisar" del home).
        this.prisma.paymentClaim.aggregate({
          where: { academyId: id, status: "PENDING" },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.paymentClaim.findMany({
          where: { academyId: id, status: "PENDING" },
          orderBy: { createdAt: "asc" },
          take: 5,
          select: { personId: true, amount: true, createdAt: true },
        }),
        // Particulares REQUESTED pendientes de confirmar (asignadas o
        // no) - cola operativa del home junto a los cobros por revisar.
        this.prisma.privateLesson.count({
          where: { academyId: id, status: "REQUESTED" },
        }),
        this.prisma.privateLesson.findMany({
          where: { academyId: id, status: "REQUESTED" },
          orderBy: { createdAt: "asc" },
          take: 5,
          select: {
            id: true,
            personId: true,
            instructorId: true,
            scheduledAt: true,
          },
        }),
        this.prisma.academyStaff.count({ where: { academyId: id } }),
        this.prisma.academyInstructor.count({ where: { academyId: id } }),
        // Medios de pago activos - insumo del paso "método de pago" del
        // checklist de activación (owner-onboarding).
        this.prisma.academyPaymentMethod.count({
          where: { academyId: id, active: true },
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

    // instructorId es escalar (override de la clase o default del slot) -
    // nombres por join manual.
    const instructorIds = [
      ...new Set(
        today.flatMap((c) =>
          [
            c.instructorId ?? c.slot.instructorId,
            ...c.instructors.map((i) => i.personId),
            ...c.slot.instructors.map((i) => i.personId),
          ].filter(Boolean),
        ),
      ),
    ] as string[];
    const instructors = instructorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: instructorIds } },
          select: { id: true, name: true },
        })
      : [];
    const instructorNameBy = new Map(instructors.map((p) => [p.id, p.name]));

    // Ticket promedio por alumno del mes: claims APPROVED (ledger propio
    // de la academia) + pagos PAID por pasarela atribuidos por refId
    // (mem_<planId>_* / pvt_<academyId>_*). Los claims materializan su
    // Payment con refId claim-<id> - prefijos distintos, sin doble cargo.
    const planIds = await this.prisma.membershipPlan.findMany({
      where: { academyId: id },
      select: { id: true },
    });
    // Rango del mes anterior MTD para las comparativas de KPIs.
    const prevRange = {
      gte: prevMonthStart,
      lte: prevMtdEnd,
    };
    const [
      claimsMonth,
      gatewayMonth,
      claimsPrev,
      gatewayPrev,
      classesPrev,
      attendancePrev,
    ] = await Promise.all([
      this.prisma.paymentClaim.findMany({
        where: {
          academyId: id,
          status: "APPROVED",
          createdAt: { gte: monthStart },
        },
        select: { amount: true, personId: true },
      }),
      this.prisma.payment.findMany({
        where: {
          status: "PAID",
          createdAt: { gte: monthStart },
          OR: [
            ...planIds.map((p) => ({
              orderType: "MEMBERSHIP",
              refId: { startsWith: `mem_${p.id}_` },
            })),
            { orderType: "PRIVATE", refId: { startsWith: `pvt_${id}_` } },
          ],
        },
        select: { amount: true, personId: true },
      }),
      // Mismas fuentes sobre el tramo equivalente del mes anterior.
      this.prisma.paymentClaim.findMany({
        where: {
          academyId: id,
          status: "APPROVED",
          createdAt: prevRange,
        },
        select: { amount: true, personId: true },
      }),
      this.prisma.payment.findMany({
        where: {
          status: "PAID",
          createdAt: prevRange,
          OR: [
            ...planIds.map((p) => ({
              orderType: "MEMBERSHIP",
              refId: { startsWith: `mem_${p.id}_` },
            })),
            { orderType: "PRIVATE", refId: { startsWith: `pvt_${id}_` } },
          ],
        },
        select: { amount: true, personId: true },
      }),
      this.prisma.class.count({
        where: {
          cancelled: false,
          date: prevRange,
          slot: { academyId: id },
        },
      }),
      this.prisma.attendance.count({
        where: {
          class: {
            slot: { academyId: id },
            date: prevRange,
          },
        },
      }),
    ]);
    const paidRows = [...claimsMonth, ...gatewayMonth];
    const billedMonth = paidRows.reduce((acc, p) => acc + p.amount, 0);
    const payers = new Set(paidRows.map((p) => p.personId));
    const avgTicketMonth = payers.size
      ? Math.round(billedMonth / payers.size)
      : null;
    const avgAttendanceMonth = classesMonth
      ? Math.round((attendanceMonth / classesMonth) * 10) / 10
      : null;
    const prevPaidRows = [...claimsPrev, ...gatewayPrev];
    const billedMonthPrev = prevPaidRows.reduce(
      (acc, p) => acc + p.amount,
      0,
    );
    const prevPayers = new Set(prevPaidRows.map((p) => p.personId));
    const avgTicketMonthPrev = prevPayers.size
      ? Math.round(billedMonthPrev / prevPayers.size)
      : null;
    const avgAttendancePerClassMonthPrev = classesPrev
      ? Math.round((attendancePrev / classesPrev) * 10) / 10
      : null;

    // ─── Insights de retención (spec academies/owner-insights):
    // planes por vencer y cumpleaños de alumnos en ventanas
    // configurables por PlatformParam. ───
    const [expiringDays, birthdayDays] = await Promise.all([
      this.params.getNumber("academy.insights.expiring_days", 14),
      this.params.getNumber("academy.insights.birthday_days", 30),
    ]);
    const expiringRows = await this.prisma.enrollment.findMany({
      where: {
        academyId: id,
        status: { in: ["ACTIVE", "TRIAL", "ONLINE"] },
        endsAt: {
          gte: todayUTC,
          lte: new Date(todayUTC.getTime() + expiringDays * 86_400_000),
        },
      },
      orderBy: { endsAt: "asc" },
      select: {
        personId: true,
        status: true,
        endsAt: true,
        plan: { select: { name: true } },
      },
    });
    // personId es escalar sin FK - nombres y cumpleaños por join manual
    // (mismo patrón que instructorNameBy arriba).
    const studentIds = [
      ...new Set([
        ...enrollments.map((e) => e.personId),
        ...expiringRows.map((e) => e.personId),
        ...pendingClaimsRows.map((c) => c.personId),
        ...pendingLessonsRows.flatMap((l) =>
          l.instructorId ? [l.personId, l.instructorId] : [l.personId],
        ),
      ]),
    ];
    const students = studentIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, name: true, birthDate: true },
        })
      : [];
    const studentById = new Map(students.map((p) => [p.id, p]));

    // Alumnos activos (personas únicas) + split de género, este mes y
    // el tramo MTD anterior - join manual de Person.gender (personId es
    // escalar sin FK, mismo patrón que studentById).
    const genderIds = [
      ...new Set([
        ...activeNowRows.map((e) => e.personId),
        ...activePrevRows.map((e) => e.personId),
      ]),
    ];
    const genderRows = genderIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: genderIds } },
          select: { id: true, gender: true },
        })
      : [];
    const genderById = new Map(genderRows.map((p) => [p.id, p.gender]));
    const studentKpis = computeActiveStudentsKpis({
      nowIds: activeNowRows.map((e) => e.personId),
      prevIds: activePrevRows.map((e) => e.personId),
      genderById,
    });

    return {
      ...computeDashboard({ enrollments, plansCount, attendanceLast30d }),
      // KPIs del mes para la consola (inicio del owner + primera
      // sección de alumnos/clases/planes).
      kpis: {
        ...studentKpis,
        purchasablePlans,
        avgAttendancePerClassMonth: avgAttendanceMonth,
        avgTicketMonth,
        billedMonth,
        weeklyClasses,
        billedMonthPrev,
        avgTicketMonthPrev,
        avgAttendancePerClassMonthPrev,
      },
      pendingClaims: {
        count: pendingClaimsAgg._count._all,
        amount: pendingClaimsAgg._sum.amount ?? 0,
        items: pendingClaimsRows.map((c) => ({
          personId: c.personId,
          personName: studentById.get(c.personId)?.name ?? null,
          amount: c.amount,
          createdAt: c.createdAt,
        })),
      },
      pendingLessons: {
        count: pendingLessonsCount,
        items: pendingLessonsRows.map((l) => ({
          id: l.id,
          personId: l.personId,
          personName: studentById.get(l.personId)?.name ?? null,
          scheduledAt: l.scheduledAt,
          instructorName: l.instructorId
            ? (studentById.get(l.instructorId)?.name ?? null)
            : null,
        })),
      },
      teamCount: staffCount + instructorCount,
      methodsCount,
      expiringEnrollments: expiringRows.map((e) => ({
        personId: e.personId,
        personName: studentById.get(e.personId)?.name ?? null,
        planName: e.plan?.name ?? null,
        status: e.status,
        endsAt: e.endsAt,
      })),
      upcomingBirthdays: computeUpcomingBirthdays(
        students.map((p) => ({
          id: p.id,
          name: p.name,
          birthDate: p.birthDate,
        })),
        todayUTC,
        birthdayDays,
      ),
      attendanceToday: todayAttendance,
      todayClasses: today.map((c) => {
        // Plantel (multi-instructor): primario primero + co-profes de
        // clase y slot, sin duplicar.
        const primaryId = c.instructorId ?? c.slot.instructorId;
        const rosterIds = [
          ...new Set(
            [
              primaryId,
              ...(c.slot.instructors ?? []).map((i) => i.personId),
              ...(c.instructors ?? []).map((i) => i.personId),
            ].filter((x): x is string => !!x),
          ),
        ];
        return {
          id: c.id,
          startTime: c.slot.startTime,
          endTime: c.slot.endTime,
          seriesName: c.slot.series.name,
          instructorName:
            instructorNameBy.get(primaryId ?? "") ?? null,
          instructors: rosterIds.map((pid) => ({
            id: pid,
            name: instructorNameBy.get(pid) ?? null,
          })),
          bookedCount: booked.get(c.id) ?? 0,
          capacity: c.capacity ?? c.slot.capacity,
        };
      }),
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
    await this.access.requireCapabilityWrite(enrollment.academyId, req.person!, "students");
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
        // auditoría mínima disponible en schema (no hay cancelledAt)
        pausedAt: dto.status === "PAUSED" ? new Date() : null,
        // endsAt=null limpia la vigencia; undefined no la toca.
        ...(dto.endsAt !== undefined
          ? { endsAt: dto.endsAt === null ? null : new Date(dto.endsAt) }
          : {}),
      },
    });
  }
}
