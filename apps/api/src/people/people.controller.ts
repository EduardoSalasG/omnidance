import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Gender } from "@prisma/client";
import { CONSENT_VERSION } from "@omnidance/shared";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { AuthService } from "../auth/domain/auth.service";
import { NotificationsService } from "../notifications/domain/notifications.service";
import { PrismaService } from "../prisma.service";
import { isProActive } from "../payments/domain/platform-tiers";
import {
  monthRange,
  prevMonthKey,
} from "../academies/infrastructure/academy-surveys.service";

class CompleteProfileDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(6)
  phone!: string;

  // Opcional: la cuenta también puede operar solo por magic link.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateMeDto {
  // Handle de Instagram autodeclarado - público por naturaleza (se muestra
  // en el perfil de amistad). "" o null limpia el campo.
  @IsOptional()
  @IsString()
  @MaxLength(31) // 30 + '@' inicial tolerado (se normaliza abajo)
  instagram?: string | null;

  // Nombre visible - requerido por el modelo (no nullable); se valida
  // no-vacío tras trim en el handler.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  // Teléfono de contacto - "" o null limpia. Se normaliza a "+ dígitos".
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  // Género autodeclarado - solo alimenta analítica agregada (k-anonymity
  // en /events/:id/analytics). null limpia (no declarar).
  @IsOptional()
  @IsIn([Gender.M, Gender.F, Gender.OTHER])
  gender?: Gender | null;

  // Fecha de nacimiento autodeclarada - alimenta "cumpleaños próximos"
  // del dashboard de academia (solo día/mes se expone). null/"" limpia.
  @IsOptional()
  @IsString()
  birthDate?: string | null;
}

// Nivel autodeclarado del bailarín - valores sembrados por el seed y
// elegidos en /perfil/datos ("Tu baile").
const DANCE_LEVELS = ["principiante", "intermedio", "avanzado"] as const;
const DANCE_ROLES = ["LEADER", "FOLLOWER", "SWITCH"] as const;

// Ventana de encuesta post-evento - la misma de POST /events/:id/ratings.
const SURVEY_WINDOW_MS = 24 * 60 * 60 * 1000;

class StyleRoleItemDto {
  @IsString()
  styleId!: string;

  @IsIn(DANCE_ROLES)
  role!: (typeof DANCE_ROLES)[number];

  @IsOptional()
  @IsIn(DANCE_LEVELS)
  level?: (typeof DANCE_LEVELS)[number] | null;
}

class UpdateStyleRolesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StyleRoleItemDto)
  items!: StyleRoleItemDto[];
}

// Encuesta mensual de curso: rating 1-5 del curso (obligatorio) + del
// profe (opcional - null si la serie no tenía profe asignado) +
// observaciones. Una por alumno × serie × mes.
class CourseSurveyDto {
  @IsString()
  seriesId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  courseRating!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  instructorRating?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}

class OnboardingDto {
  // Clave del tour (p.ej. "home", "eventos", "productor") - slug corto.
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/)
  tour!: string;
}

class ConsentDto {
  // Versión que el cliente dice aceptar - informativa: el servidor
  // siempre estampa la vigente (CONSENT_VERSION). Se acepta para que el
  // front pueda declarar qué vio, y para compat si el shape crece.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;
}

@Controller()
export class PeopleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@Req() req: Request) {
    const personId = req.person!.id;
    const [person, enrollments] = await Promise.all([
      this.prisma.person.findUniqueOrThrow({
        where: { id: personId },
        include: {
          roles: { select: { role: true, status: true } },
          // Roles de baile autodeclarados (leader/follower por estilo +
          // nivel) - sección "Tu baile" de /perfil/datos.
          styleRoles: {
            select: {
              role: true,
              level: true,
              style: { select: { id: true, name: true, genre: true } },
            },
          },
        },
      }),
      // Inscripciones a academias - sección academy de /perfil/datos.
      // Person no tiene back-relation a Enrollment → query aparte.
      this.prisma.enrollment.findMany({
        where: { personId },
        orderBy: { startedAt: "desc" },
        select: {
          status: true,
          startedAt: true,
          academy: { select: { id: true, name: true } },
          plan: { select: { name: true } },
        },
      }),
    ]);
    // Estado Producer Pro (S5) - solo para personas con rol PRODUCER
    // aprobado: el front gatea las features Pro sin llamada extra
    // (paywall en analítica/exports/CRM cuando effectivePro es false).
    const isProducer = person.roles.some(
      (r) => r.role === "PRODUCER" && r.status === "APPROVED",
    );
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      photoUrl: person.photoUrl,
      instagram: person.instagram,
      gender: person.gender,
      birthDate: person.birthDate,
      createdAt: person.createdAt,
      verifiedAt: person.verifiedAt,
      roles: person.roles
        .filter((r) => r.status === "APPROVED")
        .map((r) => r.role),
      roleStates: person.roles,
      ...(isProducer
        ? {
            proTier: person.proTier,
            proTrialEndsAt: person.proTrialEndsAt,
            effectivePro: isProActive(person),
          }
        : {}),
      styleRoles: person.styleRoles,
      enrollments,
      // Consentimiento legal (spec legal-consent): el front muestra el
      // aviso de aceptación si consentAcceptedAt es null o la versión
      // difiere de CONSENT_VERSION (shared).
      consentAcceptedAt: person.consentAcceptedAt,
      consentVersion: person.consentVersion,
      // Flags de ciclo de vida: demo (lead /pro, solo lectura) y
      // pendingProfile (admin convirtió el lead - falta completar datos).
      isDemo: person.isDemoAccount,
      pendingProfile: !!person.pendingProfileAt,
      // Tours de onboarding ya vistos: {tourKey: ISO} - el front corre
      // el tour de una superficie solo si su clave falta.
      onboarding: (person.onboarding as Record<string, string> | null) ?? {},
    };
  }

  /**
   * PATCH /me - edición de datos propios: instagram, nombre y teléfono.
   * Normaliza "@handle"/espacios y valida formatos reales; el nombre no
   * puede quedar vacío (el modelo lo exige).
   */
  @Patch("me")
  @UseGuards(SessionGuard)
  async updateMe(@Req() req: Request, @Body() dto: UpdateMeDto) {
    const personId = req.person!.id;
    const data: {
      instagram?: string | null;
      name?: string;
      phone?: string | null;
      gender?: Gender | null;
      birthDate?: Date | null;
    } = {};
    if (dto.instagram !== undefined) {
      const handle = (dto.instagram ?? "").trim().replace(/^@+/, "");
      if (handle === "") {
        data.instagram = null;
      } else {
        if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
          throw new BadRequestException("instagram inválido");
        }
        data.instagram = handle;
      }
    }
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name === "") {
        throw new BadRequestException("nombre requerido");
      }
      data.name = name;
    }
    if (dto.phone !== undefined) {
      const digits = (dto.phone ?? "").replace(/[\s()-]/g, "");
      if (digits === "" || digits === "+") {
        data.phone = null;
      } else {
        if (!/^\+?[0-9]{8,15}$/.test(digits)) {
          throw new BadRequestException("teléfono inválido");
        }
        // Person.phone es unique - sin el check el update explotaba en
        // 500 (P2002). Mismo contrato que POST /me/complete-profile.
        const phoneTaken = await this.prisma.person.findUnique({
          where: { phone: digits },
          select: { id: true },
        });
        if (phoneTaken && phoneTaken.id !== personId) {
          throw new ConflictException("phone_exists");
        }
        data.phone = digits;
      }
    }
    if (dto.gender !== undefined) {
      data.gender = dto.gender; // null = prefiere no declarar
    }
    if (dto.birthDate !== undefined) {
      if (dto.birthDate === null || dto.birthDate.trim() === "") {
        data.birthDate = null;
      } else {
        const parsed = new Date(dto.birthDate);
        const now = new Date();
        if (
          Number.isNaN(parsed.getTime()) ||
          parsed.getTime() > now.getTime() ||
          parsed.getUTCFullYear() < 1900
        ) {
          throw new BadRequestException("birthDate inválida");
        }
        data.birthDate = parsed;
      }
    }
    await this.prisma.person.update({ where: { id: personId }, data });
    return { ok: true };
  }

  /**
   * GET /me/pending-surveys - eventos evaluables del viewer: check-in
   * válido, terminados hace <24h y sin EventRating propia. Más reciente
   * primero. Además dispara el fan-out lazy de la encuesta: el primer
   * request que encuentra un evento elegible reclama
   * `surveyNotifiedAt` (updateMany atómico - sin findUnique+update por
   * race) y notifica a TODOS los asistentes una sola vez por evento.
   */
  @Get("me/pending-surveys")
  @UseGuards(SessionGuard)
  async pendingSurveys(@Req() req: Request) {
    const personId = req.person!.id;
    const now = new Date();
    const windowStart = new Date(now.getTime() - SURVEY_WINDOW_MS);
    const checkins = await this.prisma.checkin.findMany({
      where: { personId, voidedAt: null },
      select: { eventId: true },
    });
    if (checkins.length === 0) return [];
    const eventIds = [...new Set(checkins.map((c) => c.eventId))];
    const [events, ratings] = await Promise.all([
      this.prisma.event.findMany({
        where: { id: { in: eventIds }, endsAt: { lt: now, gte: windowStart } },
        orderBy: { endsAt: "desc" },
        select: { id: true, name: true, endsAt: true },
      }),
      this.prisma.eventRating.findMany({
        where: { raterId: personId, eventId: { in: eventIds } },
        select: { eventId: true },
      }),
    ]);
    const rated = new Set(ratings.map((r) => r.eventId));
    const pending = events.filter((e) => !rated.has(e.id));
    // El fan-out corre sobre TODOS los eventos en ventana (no solo los
    // pendientes del viewer): si el único asistente que reabre la app
    // ya evaluó durante el LIVE, el claim igual debe ocurrir para que
    // el resto reciba su notificación.
    for (const event of events) {
      const claim = await this.prisma.event.updateMany({
        where: { id: event.id, surveyNotifiedAt: null },
        data: { surveyNotifiedAt: now },
      });
      if (claim.count !== 1) continue; // otro request ya fan-out (o va en ello)
      const attendees = await this.prisma.checkin.findMany({
        where: { eventId: event.id, voidedAt: null },
        distinct: ["personId"],
        select: { personId: true },
      });
      // Trade-off conocido: el flag ya quedó - si el request muere a la
      // mitad del fan-out, los restantes no se re-notifican (lazy 1-shot).
      await Promise.allSettled(
        attendees.map((attendee) =>
          this.notifications.notifySafe(attendee.personId, {
            category: "SOCIAL",
            type: "event.survey",
            title: "Cuéntanos cómo estuvo",
            body: event.name,
            data: { eventId: event.id },
          }),
        ),
      );
    }
    return pending.map((e) => ({
      eventId: e.id,
      name: e.name,
      endsAt: e.endsAt,
    }));
  }

  /**
   * GET /me/pending-course-surveys - series que el viewer cursó el mes
   * calendario anterior (≥1 asistencia) y aún no evaluó. El fan-out por
   * notificación corre en el job academies.course_surveys (día 1); esta
   * lista es pull para la card del home.
   */
  @Get("me/pending-course-surveys")
  @UseGuards(SessionGuard)
  async pendingCourseSurveys(@Req() req: Request) {
    const personId = req.person!.id;
    const month = prevMonthKey();
    const { gte, lt } = monthRange(month);
    const attendances = await this.prisma.attendance.findMany({
      where: {
        personId,
        class: { date: { gte, lt }, cancelled: false },
      },
      select: {
        class: {
          select: {
            slot: {
              select: {
                seriesId: true,
                academyId: true,
                series: {
                  select: {
                    name: true,
                    academy: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const bySeries = new Map<
      string,
      { seriesId: string; seriesName: string; academyId: string; academyName: string }
    >();
    for (const a of attendances) {
      const s = a.class.slot;
      if (!s.seriesId || bySeries.has(s.seriesId)) continue;
      bySeries.set(s.seriesId, {
        seriesId: s.seriesId,
        seriesName: s.series?.name ?? "Clase",
        academyId: s.academyId,
        academyName: s.series?.academy.name ?? "",
      });
    }
    if (bySeries.size === 0) return [];
    const submitted = await this.prisma.courseSurvey.findMany({
      where: {
        personId,
        month,
        seriesId: { in: [...bySeries.keys()] },
      },
      select: { seriesId: true },
    });
    const done = new Set(submitted.map((s) => s.seriesId));
    return [...bySeries.values()]
      .filter((s) => !done.has(s.seriesId))
      .map((s) => ({ ...s, month }));
  }

  /**
   * POST /me/course-surveys - responde la encuesta mensual de una serie.
   * Elegibilidad: ≥1 asistencia a clases de esa serie en el mes
   * declarado. instructorId queda como snapshot del profe evaluado
   * (el más frecuente entre las clases asistidas, con fallback al
   * instructor default de la serie). Idempotente por
   * personId+seriesId+month (re-envío corrige la respuesta).
   */
  @Post("me/course-surveys")
  @UseGuards(SessionGuard)
  async submitCourseSurvey(@Req() req: Request, @Body() dto: CourseSurveyDto) {
    const personId = req.person!.id;
    const { gte, lt } = monthRange(dto.month);
    const attendances = await this.prisma.attendance.findMany({
      where: {
        personId,
        class: {
          date: { gte, lt },
          cancelled: false,
          slot: { seriesId: dto.seriesId },
        },
      },
      select: {
        class: {
          select: {
            instructorId: true,
            slot: {
              select: {
                instructorId: true,
                academyId: true,
                series: { select: { instructorId: true, academyId: true } },
              },
            },
          },
        },
      },
    });
    if (attendances.length === 0) {
      throw new ForbiddenException(
        "sin asistencias a esa serie en ese mes",
      );
    }
    // Snapshot del profe evaluado: el instructor más frecuente entre las
    // clases asistidas (class → slot → serie, en ese orden de override).
    const counts = new Map<string, number>();
    let academyId = "";
    for (const a of attendances) {
      academyId = a.class.slot.academyId || a.class.slot.series?.academyId || academyId;
      const iid =
        a.class.instructorId ??
        a.class.slot.instructorId ??
        a.class.slot.series?.instructorId ??
        null;
      if (iid) counts.set(iid, (counts.get(iid) ?? 0) + 1);
    }
    const instructorId =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const survey = await this.prisma.courseSurvey.upsert({
      where: {
        personId_seriesId_month: {
          personId,
          seriesId: dto.seriesId,
          month: dto.month,
        },
      },
      create: {
        academyId,
        seriesId: dto.seriesId,
        personId,
        instructorId,
        month: dto.month,
        courseRating: dto.courseRating,
        instructorRating: dto.instructorRating ?? null,
        comment: dto.comment?.trim() || null,
      },
      update: {
        instructorId,
        courseRating: dto.courseRating,
        instructorRating: dto.instructorRating ?? null,
        comment: dto.comment?.trim() || null,
      },
    });
    return { ok: true, id: survey.id };
  }

  /**
   * PUT /me/style-roles - reemplazo total de los roles de baile
   * autodeclarados (sección "Tu baile" de /perfil/datos). Semántica
   * PUT: la lista enviada ES el estado final - filas ausentes se borran.
   * Dedupe por la unique key (styleId, role): el último ítem gana.
   */
  @Put("me/style-roles")
  @UseGuards(SessionGuard)
  async updateStyleRoles(@Req() req: Request, @Body() dto: UpdateStyleRolesDto) {
    const personId = req.person!.id;
    const byKey = new Map<string, StyleRoleItemDto>();
    for (const item of dto.items) {
      byKey.set(`${item.styleId}:${item.role}`, item);
    }
    const items = [...byKey.values()];
    const styleIds = [...new Set(items.map((i) => i.styleId))];
    const found = await this.prisma.style.count({
      where: { id: { in: styleIds } },
    });
    if (found !== styleIds.length) {
      throw new BadRequestException("estilo inválido");
    }
    await this.prisma.$transaction([
      this.prisma.personStyleRole.deleteMany({ where: { personId } }),
      this.prisma.personStyleRole.createMany({
        data: items.map((i) => ({
          personId,
          styleId: i.styleId,
          role: i.role,
          level: i.level ?? null,
        })),
      }),
    ]);
    // Devuelve la lista fresca con el mismo shape de GET /me - el front
    // actualiza su estado sin refetch.
    const styleRoles = await this.prisma.personStyleRole.findMany({
      where: { personId },
      select: {
        role: true,
        level: true,
        style: { select: { id: true, name: true, genre: true } },
      },
    });
    return { ok: true, styleRoles };
  }

  /**
   * POST /me/consent - registra la aceptación de Términos+Privacidad de
   * la versión vigente (aviso in-app para cuentas legadas o tras un
   * cambio de versión). Siempre estampa CONSENT_VERSION del servidor:
   * aceptar una versión antigua no tiene sentido.
   */
  @Post("me/consent")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async consent(@Req() req: Request, @Body() _dto: ConsentDto) {
    const personId = req.person!.id;
    const person = await this.prisma.person.update({
      where: { id: personId },
      data: {
        consentAcceptedAt: new Date(),
        consentVersion: CONSENT_VERSION,
      },
      select: { consentAcceptedAt: true, consentVersion: true },
    });
    return { ok: true, ...person };
  }

  /** Marca un tour de primera visita como visto (merge sobre el JSON). */
  @Post("me/onboarding")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async completeOnboarding(@Req() req: Request, @Body() dto: OnboardingDto) {
    const personId = req.person!.id;
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { onboarding: true },
    });
    const current =
      (person.onboarding as Record<string, string> | null) ?? {};
    await this.prisma.person.update({
      where: { id: personId },
      data: {
        onboarding: { ...current, [dto.tour]: new Date().toISOString() },
      },
    });
    return { ok: true };
  }

  /**
   * Cierre del flujo lead → real: el admin convirtió el lead
   * (pendingProfileAt) y la persona confirma/completa sus datos.
   * Apaga isDemoAccount → ya puede escribir en la app, y el lead ligado
   * pasa a CONVERTED. Whitelisted en la barrera demo del SessionGuard.
   */
  @Post("me/complete-profile")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async completeProfile(@Req() req: Request, @Body() dto: CompleteProfileDto) {
    const personId = req.person!.id;
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { pendingProfileAt: true, isDemoAccount: true },
    });
    if (!person.pendingProfileAt && !person.isDemoAccount) {
      throw new ForbiddenException("nada que completar");
    }
    const name = dto.name.trim();
    const phone = dto.phone.trim();
    if (name.length < 2 || !phone) {
      throw new BadRequestException("datos inválidos");
    }
    // Person.phone es unique - si el teléfono ya está en otra cuenta el
    // update explotaría en 500. 409 explícito para el frontend.
    const phoneTaken = await this.prisma.person.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (phoneTaken && phoneTaken.id !== personId) {
      throw new ConflictException("phone_exists");
    }
    await this.prisma.person.update({
      where: { id: personId },
      data: {
        name,
        phone,
        pendingProfileAt: null,
        isDemoAccount: false,
        ...(dto.password
          ? { passwordHash: await this.auth.hashPassword(dto.password) }
          : {}),
      },
    });
    // Si vino de un lead, queda CONVERTED - el pipeline admin lo refleja.
    await this.prisma.lead.updateMany({
      where: { personId },
      data: { status: "CONVERTED" },
    });
    return { ok: true };
  }
}
