import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
import { InvalidPhoneError, normalizePhone } from "@omnidance/shared";
import type { Request } from "express";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { ConsentService } from "../legal/consent.service";
import type { ConsentScopes } from "../legal/consent.service";
import { PENDING_USABLE_ROLES } from "../common/rbac/roles.guard";
import { roleProfileChecks } from "../common/role-checks";
import { AuthService } from "../auth/domain/auth.service";
import { NotificationsService } from "../notifications/domain/notifications.service";
import { PrismaService } from "../prisma.service";
import {
  mimeForKey,
  STORAGE,
  type FileStorage,
} from "../storage/storage.service";
import { isProActive } from "../payments/domain/platform-tiers";
import {
  resolveAcademyEntitlements,
  resolveProducerEntitlement,
} from "../common/actor-entitlements";
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

  // Hint ISO-2 para interpretar `phone` en formato nacional (spec
  // multipais-phone); un "+" inicial en phone lo ignora. Default "CL".
  @IsOptional()
  @IsString()
  @MaxLength(2)
  phoneCountryCode?: string;

  // Opcional: la cuenta también puede operar solo por magic link.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

// Cambio de contraseña propia (spec cambiar-password). currentPassword
// es opcional a nivel DTO: su exigencia depende del estado persistido
// (la valida el handler - cuentas magic-link-only no tienen actual).
export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
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

  // Teléfono de contacto - "" o null limpia. Se normaliza a E.164 con
  // "+" vía libphonenumber (spec multipais-phone).
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  // Hint ISO-2 del país para interpretar `phone` en formato nacional
  // (spec multipais-phone). No se persiste: el que se guarda sale del
  // número parseado. Un "+" inicial en phone lo ignora.
  @IsOptional()
  @IsString()
  @MaxLength(2)
  phoneCountryCode?: string;

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

  // Idioma de la app - whitelist de locales soportados (spec
  // i18n-multi-locale). Persistido en Person.language: viaja entre
  // dispositivos; el front además setea la cookie NEXT_LOCALE.
  @IsOptional()
  @IsIn(["es-CL", "en", "fr", "pt-PT"])
  language?: string;

  // Jurisdicción legal (spec consent-por-jurisdiccion): editable en
  // /perfil/datos. Cambia qué texto de consentimiento aplica.
  @IsOptional()
  @IsIn(["CL", "EU"])
  jurisdiction?: "CL" | "EU";
}

// Nivel autodeclarado del bailarín - valores sembrados por el seed y
// elegidos en /perfil/datos ("Tu baile").
const DANCE_LEVELS = ["iniciacion", "basico", "intermedio", "avanzado"] as const;
const DANCE_ROLES = ["LEADER", "FOLLOWER", "SWITCH"] as const;

/** Normaliza a E.164 (spec multipais-phone) traduciendo el error
 * tipado de shared al 400 del contrato vigente. `hint` es el país por
 * defecto para formato nacional (default CL). */
function normalizePhoneOr400(raw: string, hint?: string) {
  try {
    const normalized = normalizePhone(raw, hint ?? "CL");
    if (!normalized) throw new InvalidPhoneError(raw);
    return normalized;
  } catch (e) {
    if (e instanceof InvalidPhoneError) {
      throw new BadRequestException("teléfono inválido");
    }
    throw e;
  }
}

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

// Scopes granulares del consentimiento (spec consent-por-jurisdiccion):
// el cliente declara los opt-in que marcó (EU: marketing/analytics);
// el servidor solo persiste los declarados en requiredScopes del
// LegalText vigente - "essential" queda siempre true.
class ConsentScopesDto {
  @IsOptional()
  @IsBoolean()
  essential?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @IsOptional()
  @IsBoolean()
  analytics?: boolean;
}

class ConsentDto {
  // Versión que el cliente dice aceptar - informativa: el servidor
  // siempre estampa la vigente de la jurisdicción de la persona. Se
  // acepta para que el front pueda declarar qué vio.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsentScopesDto)
  scopes?: ConsentScopesDto;
}

@Controller()
export class PeopleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE) private readonly storage: FileStorage,
    private readonly consentService: ConsentService,
  ) {}

  /**
   * Upload del avatar alojado por nosotros (mismo patrón que la foto de
   * academia): multipart → storage "people-photos" → photoUrl apunta al
   * stream público /api/people/photos/<key> (avatares se muestran en
   * superficies públicas: amigos, clases, pareja, etc.).
   */
  @Post("me/photo")
  @UseGuards(SessionGuard)
  @UseInterceptors(
    FileInterceptor("photo", { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadMyPhoto(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException("falta el archivo photo");
    let key: string;
    try {
      key = await this.storage.save(
        {
          originalname: file.originalname,
          mimetype: file.mimetype,
          buffer: file.buffer,
          size: file.size,
        },
        "people-photos",
      );
    } catch {
      throw new BadRequestException("tipo de archivo no soportado");
    }
    // key trae el folder (people-photos/<uuid>.<ext>) - la URL pública
    // va solo con el filename: /api/people/photos/<uuid>.<ext>.
    const filename = key.split("/").pop() ?? key;
    const photoUrl = `/api/people/photos/${filename}`;
    await this.prisma.person.update({
      where: { id: req.person!.id },
      data: { photoUrl },
    });
    return { photoUrl };
  }

  /** Stream público del avatar alojado (uuid - anti-traversal en resolve). */
  @Get("people/photos/:key")
  async servePersonPhoto(@Param("key") key: string, @Res() res: Response) {
    return this.streamPhoto("people-photos", key, res);
  }

  /** Compat: photoUrls guardadas con el folder duplicado en la URL. */
  @Get("people/photos/people-photos/:key")
  async servePersonPhotoCompat(
    @Param("key") key: string,
    @Res() res: Response,
  ) {
    return this.streamPhoto("people-photos", key, res);
  }

  private async streamPhoto(folder: string, key: string, res: Response) {
    const full = `${folder}/${key}`;
    let buffer: Buffer;
    try {
      buffer = await this.storage.read(full);
    } catch {
      throw new NotFoundException("foto no encontrada");
    }
    res.setHeader("content-type", mimeForKey(full));
    res.setHeader("cache-control", "public, max-age=86400, immutable");
    res.send(buffer);
  }

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
      phoneCountryCode: person.phoneCountryCode,
      photoUrl: person.photoUrl,
      instagram: person.instagram,
      gender: person.gender,
      language: person.language,
      birthDate: person.birthDate,
      createdAt: person.createdAt,
      verifiedAt: person.verifiedAt,
      roles: person.roles
        .filter(
          (r) =>
            r.status === "APPROVED" ||
            // PENDING usable (spec role-registration-pipeline): el
            // rol existe en /me.roles para que los gates de consola
            // pasen; roleStates sigue distinguiendo el estado real.
            (r.status === "PENDING" && PENDING_USABLE_ROLES.has(r.role)),
        )
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
      // Jurisdicción legal (spec consent-por-jurisdiccion): el banner
      // consulta GET /legal/consent?jurisdiction= con este valor.
      jurisdiction: person.jurisdiction,
      // Spec cambiar-password: solo el flag, NUNCA el hash - el front
      // decide si pedir la contraseña actual o es establecimiento
      // inicial (magic-link-only).
      hasPassword: !!person.passwordHash,
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
   * GET /me/entitlements (spec unified-actor-entitlements): entitlements
   * de suscripción del actor autenticado - `producer` (null si no es
   * productor aprobado) + `academias` propias. Es la fuente única del
   * front para gating (reemplaza a effectivePro y a
   * /me/academy/entitlements): {producer:{tier,features}|null,
   * academies:[{id,tier,features}]}.
   */
  @Get("me/entitlements")
  @UseGuards(SessionGuard)
  async entitlements(@Req() req: Request) {
    const personId = req.person!.id;
    const [producer, academies] = await Promise.all([
      resolveProducerEntitlement(this.prisma, personId),
      resolveAcademyEntitlements(this.prisma, personId),
    ]);
    return { producer, academies };
  }

  /**
   * GET /me/academy/entitlements - DEPRECADO (spec
   * unified-actor-entitlements): subconjunto academia de
   * GET /me/entitlements, mismo shape {academies:[{id,tier,features}]}.
   * Se mantiene mientras el front migra al endpoint unificado.
   */
  @Get("me/academy/entitlements")
  @UseGuards(SessionGuard)
  async academyEntitlements(@Req() req: Request) {
    return {
      academies: await resolveAcademyEntitlements(
        this.prisma,
        req.person!.id,
      ),
    };
  }

  /**
   * Checklist de validación del propio actor (spec rbac): misma
   * evaluación que la cola admin, expuesta al dueño para que vea qué le
   * falta mientras su rol está PENDING. Solo roles de validación.
   */
  @Get("me/role-checks")
  @UseGuards(SessionGuard)
  async roleChecks(@Req() req: Request) {
    const personId = req.person!.id;
    const pendings = await this.prisma.personRole.findMany({
      where: {
        personId,
        role: { in: [...PENDING_USABLE_ROLES] },
        status: "PENDING",
      },
      select: { role: true },
    });
    if (pendings.length === 0) return [];
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { name: true, email: true, phone: true, verifiedAt: true },
    });
    const [academiesCount, eventsCount] = await Promise.all([
      this.prisma.academy.count({ where: { ownerId: personId } }),
      this.prisma.event.count({ where: { producerId: personId } }),
    ]);
    return pendings.map((p) => {
      const checks = roleProfileChecks(
        person,
        p.role,
        academiesCount,
        eventsCount,
      );
      return {
        role: p.role,
        checks,
        complete: Object.values(checks).every(Boolean),
      };
    });
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
      phoneCountryCode?: string | null;
      gender?: Gender | null;
      birthDate?: Date | null;
      language?: string;
      jurisdiction?: string;
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
      const raw = (dto.phone ?? "").trim();
      if (raw === "" || raw === "+") {
        data.phone = null;
        data.phoneCountryCode = null;
      } else {
        // Spec multipais-phone: normaliza a E.164 con el país declarado
        // como hint (default CL); el phoneCountryCode persistido sale
        // del número parseado, nunca del body.
        const normalized = normalizePhoneOr400(raw, dto.phoneCountryCode);
        // Person.phone es unique - sin el check el update explotaba en
        // 500 (P2002). Mismo contrato que POST /me/complete-profile.
        const phoneTaken = await this.prisma.person.findUnique({
          where: { phone: normalized.e164 },
          select: { id: true },
        });
        if (phoneTaken && phoneTaken.id !== personId) {
          throw new ConflictException("phone_exists");
        }
        data.phone = normalized.e164;
        data.phoneCountryCode = normalized.countryCode;
      }
    }
    if (dto.language !== undefined) {
      data.language = dto.language;
    }
    if (dto.jurisdiction !== undefined) {
      data.jurisdiction = dto.jurisdiction;
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
   * PUT /me/password - cambio de contraseña propia (spec
   * cambiar-password). Con passwordHash existente exige la actual
   * verificada (verifyPassword scrypt) - cierra el cambio silencioso
   * con solo sesión activa. Cuentas magic-link-only (passwordHash
   * null) establecen la primera sin actual. La respuesta nunca expone
   * el hash.
   */
  @Put("me/password")
  @UseGuards(SessionGuard)
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const personId = req.person!.id;
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { passwordHash: true },
    });
    if (person.passwordHash) {
      const ok =
        !!dto.currentPassword &&
        (await this.auth.verifyPassword(
          dto.currentPassword,
          person.passwordHash,
        ));
      if (!ok) throw new BadRequestException("password.incorrect");
      if (dto.newPassword === dto.currentPassword) {
        throw new BadRequestException("password.same");
      }
    }
    await this.prisma.person.update({
      where: { id: personId },
      data: { passwordHash: await this.auth.hashPassword(dto.newPassword) },
    });
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
   * cambio de versión). Escribe el ConsentRecord auditable de la
   * jurisdicción de la persona + el snapshot Person (spec
   * consent-por-jurisdiccion). Siempre estampa la versión vigente del
   * servidor: aceptar una versión antigua no tiene sentido.
   */
  @Post("me/consent")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async consent(@Req() req: Request, @Body() dto: ConsentDto) {
    const personId = req.person!.id;
    const { version, acceptedAt } = await this.consentService.recordAcceptance(
      personId,
      dto.scopes as ConsentScopes | undefined,
    );
    return {
      ok: true,
      consentVersion: version,
      consentAcceptedAt: acceptedAt,
    };
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
    if (name.length < 2 || !dto.phone.trim()) {
      throw new BadRequestException("datos inválidos");
    }
    // Spec multipais-phone: E.164 + país derivado del número (el
    // phoneCountryCode del body es solo el hint para formato nacional).
    const normalized = normalizePhoneOr400(dto.phone, dto.phoneCountryCode);
    // Person.phone es unique - si el teléfono ya está en otra cuenta el
    // update explotaría en 500. 409 explícito para el frontend.
    const phoneTaken = await this.prisma.person.findUnique({
      where: { phone: normalized.e164 },
      select: { id: true },
    });
    if (phoneTaken && phoneTaken.id !== personId) {
      throw new ConflictException("phone_exists");
    }
    await this.prisma.person.update({
      where: { id: personId },
      data: {
        name,
        phone: normalized.e164,
        phoneCountryCode: normalized.countryCode,
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
