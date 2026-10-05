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
  computeDashboard,
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
  /** % de comisión de la academia sobre sus clases particulares (0-100). */
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPct!: number;
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
    await this.access.requireAdministerWrite(id, req.person!);
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
   * Comisión del instructor (solo owner/ADMIN): % que la academia retiene
   * del precio de cada clase particular suya. Se snapshottea a
   * PrivateLesson.commissionPct al crear la solicitud - cambiarlo no
   * retroactúa sobre lecciones ya pedidas.
   */
  @Patch(":id/instructors/:personId")
  @UseGuards(SessionGuard)
  async updateInstructor(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Body() dto: UpdateInstructorDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdministerWrite(id, req.person!);
    const pct = dto.commissionPct;
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      throw new BadRequestException("commissionPct debe ser entero 0-100");
    }
    const instructor = await this.prisma.academyInstructor.findUnique({
      where: { academyId_personId: { academyId: id, personId } },
    });
    if (!instructor) {
      throw new NotFoundException("instructor no encontrado en la academia");
    }
    return this.prisma.academyInstructor.update({
      where: { academyId_personId: { academyId: id, personId } },
      data: { commissionPct: pct },
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
    await this.access.requireAdministerWrite(id, req.person!);
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
  @UseGuards(SessionGuard)
  async listPlans(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.membershipPlan.findMany({
      where: { academyId: id },
      orderBy: { name: "asc" },
    });
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
    await this.access.requireAdministerWrite(id, req.person!);
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
    await this.access.requireAdministerWrite(id, req.person!);

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
        endsAt: true,
        personId: true,
        plan: { select: { name: true } },
      },
    });
    // Enrollment.personId es FK plana (sin relación en schema) - join manual.
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
      endsAt: e.endsAt,
    }));
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

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { academyId: id, personId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        startedAt: true,
        endsAt: true,
        plan: { select: { id: true, name: true, type: true, price: true } },
      },
    });

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
      enrollmentStatus: enrollment?.status ?? null,
      enrollmentStartedAt: enrollment?.startedAt ?? null,
      enrollmentEndsAt: enrollment?.endsAt ?? null,
      history,
      upcoming,
    };
  }

  // ─── slots ───
  // Los horarios solo se crean vía serie (POST /academies/:id/series y
  // /series/:id/slots) - todo slot pertenece a una serie por invariante
  // de schema. Este GET es la parrilla semanal completa de la academia.

  @Get(":id/slots")
  @UseGuards(SessionGuard)
  async listSlots(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireAdminister(id, req.person!);
    return this.prisma.classSlot.findMany({
      where: { academyId: id },
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
    await this.access.requireAdminister(id, req.person!);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // Class.date vive a medianoche UTC (misma convención que
    // ClassSeriesController.monthDates) - "hoy" = el día UTC actual.
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

    // instructorId es escalar (override de la clase o default del slot) -
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
        seriesName: c.slot.series.name,
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
    await this.access.requireAdministerWrite(enrollment.academyId, req.person!);
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
