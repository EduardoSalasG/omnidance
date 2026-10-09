import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AuthService } from "../../auth/domain/auth.service";
import { PrismaService } from "../../prisma.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import { AcademyAccess } from "./academy-access.service";
import { pageParams } from "./list-filters";
import {
  instructorInviteEmailHtml,
  staffInviteEmailHtml,
} from "./invite-emails";

/**
 * TTL del magic link de invitación (spec academy-staff-roles): un
 * colaborador invitado abre el correo días después, no en 15min.
 */
const INVITE_TOKEN_TTL = "7d";

class CapsDto {
  @IsOptional() @IsBoolean() students?: boolean;
  @IsOptional() @IsBoolean() payments?: boolean;
  @IsOptional() @IsBoolean() plans?: boolean;
  @IsOptional() @IsBoolean() schedule?: boolean;
  @IsOptional() @IsBoolean() profile?: boolean;
  @IsOptional() @IsBoolean() team?: boolean;
  @IsOptional() @IsBoolean() billing?: boolean;
}

class AddStaffDto extends CapsDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

class AddInstructorDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  // Acuerdo económico (spec academy-console-v3): PER_CLASS/MONTHLY.
  // La comisión % legacy salió del producto - la columna queda como
  // snapshot histórico pero ya no se edita por API ni UI.
  @IsOptional() @IsIn(["PER_CLASS", "MONTHLY"]) payType?: string;
  @IsOptional() @IsInt() @Min(0) payAmount?: number;
  @IsOptional() @IsInt() @Min(0) payClasses?: number;
}

const CAP_TO_FIELD = {
  students: "canStudents",
  payments: "canPayments",
  plans: "canPlans",
  schedule: "canSchedule",
  profile: "canProfile",
  team: "canTeam",
  billing: "canBilling",
} as const;

function capsToData(dto: CapsDto) {
  const data: Record<string, boolean> = {};
  for (const [cap, field] of Object.entries(CAP_TO_FIELD)) {
    const v = dto[cap as keyof CapsDto];
    if (typeof v === "boolean") data[field] = v;
  }
  return data;
}

/**
 * Mantenedor de colaboradores de la academia (spec academy-staff-roles)
 * + resolución de acceso del viewer. Gated por capacidad `team`
 * (owner implícito); el owner no es una fila staff.
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyStaffController {
  private readonly logger = new Logger(AcademyStaffController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Acceso del viewer - la consola lo usa para ocultar secciones. */
  @Get(":id/access")
  async myAccess(@Param("id") id: string, @Req() req: Request) {
    const { academy, ctx } = await this.access.loadContext(id);
    const me = req.person!;
    const isOwner = academy.ownerId === me.id;
    const staff = ctx.staff?.find((s) => s.personId === me.id);
    const all = {
      students: true,
      payments: true,
      plans: true,
      schedule: true,
      profile: true,
      team: true,
      billing: true,
    };
    // ADMIN de plataforma pasa cualquier check (mismo criterio que los
    // gates) - el endpoint lo reporta para que la consola no lo oculte.
    const isAdmin = await this.access.isPlatformAdmin(me);
    const caps =
      isOwner || isAdmin
        ? all
        : (staff?.caps ?? {
            students: false,
            payments: false,
            plans: false,
            schedule: false,
            profile: false,
            team: false,
            billing: false,
          });
    return {
      isOwner,
      isAdmin,
      isInstructor: ctx.instructorIds.includes(me.id),
      isStaff: !!staff,
      caps,
    };
  }

  /**
   * Lista del equipo. Filtro del contrato compartido (spec
   * analytics/query-console): q = nombre o email contiene
   * (case-insensitive); personId es FK plana → post-filtro tras el join.
   */
  @Get(":id/staff")
  async list(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "team");
    const pg = pageParams(page, pageSize);
    // q filtra por nombre/email de la persona (personId FK plana -
    // join manual previo, como en students) para que pagine bien.
    const term = q?.trim();
    let personIdIn: string[] | undefined;
    if (term && term.length >= 2) {
      personIdIn = (
        await this.prisma.person.findMany({
          where: {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
            ],
          },
          select: { id: true },
          take: 500,
        })
      ).map((p) => p.id);
    } else if (term) {
      personIdIn = [];
    }
    const where = {
      academyId: id,
      ...(personIdIn ? { personId: { in: personIdIn } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.academyStaff.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: pg.skip,
        take: pg.take,
        select: {
          personId: true,
          canStudents: true,
          canPayments: true,
          canPlans: true,
          canSchedule: true,
          canProfile: true,
          canTeam: true,
          canBilling: true,
          createdAt: true,
        },
      }),
      this.prisma.academyStaff.count({ where }),
    ]);
    const people = new Map(
      (
        await this.prisma.person.findMany({
          where: { id: { in: rows.map((r) => r.personId) } },
          select: { id: true, name: true, email: true },
        })
      ).map((p) => [p.id, p]),
    );
    return {
      items: rows.map((r) => ({
        person: people.get(r.personId) ?? {
          id: r.personId,
          name: "(cuenta eliminada)",
          email: null,
        },
        caps: {
          students: r.canStudents,
          payments: r.canPayments,
          plans: r.canPlans,
          schedule: r.canSchedule,
          profile: r.canProfile,
          team: r.canTeam,
          billing: r.canBilling,
        },
        createdAt: r.createdAt,
      })),
      total,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }

  /**
   * Detalle de un colaborador (página de detalle del equipo): datos de
   * la persona + flags vigentes. Misma capacidad `team` que el listado.
   */
  @Get(":id/staff/:personId")
  async staffDetail(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "team");
    const row = await this.prisma.academyStaff.findUnique({
      where: { academyId_personId: { academyId: id, personId } },
      select: {
        personId: true,
        canStudents: true,
        canPayments: true,
        canPlans: true,
        canSchedule: true,
        canProfile: true,
        canTeam: true,
        canBilling: true,
        createdAt: true,
      },
    });
    if (!row) throw new NotFoundException("colaborador no encontrado");
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, email: true, phone: true },
    });
    return {
      person: person ?? { id: personId, name: "(cuenta eliminada)", email: null },
      caps: {
        students: row.canStudents,
        payments: row.canPayments,
        plans: row.canPlans,
        schedule: row.canSchedule,
        profile: row.canProfile,
        team: row.canTeam,
        billing: row.canBilling,
      },
      createdAt: row.createdAt,
    };
  }

  /**
   * Agrega colaborador por email. Person inexistente → stub
   * `{email, name}` + email de invitación con magic link largo; el
   * upsert por (academyId, personId) permite re-enviar/editar flags.
   */
  @Post(":id/staff")
  async add(
    @Param("id") id: string,
    @Body() dto: AddStaffDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "team",
    );
    const { person, invited, email } = await this.resolvePerson(
      dto.email,
      dto.name,
    );
    this.assertValidTarget(person.id, academy.ownerId, req.person!.id);

    const caps = capsToData(dto);
    await this.prisma.academyStaff.upsert({
      where: { academyId_personId: { academyId: id, personId: person.id } },
      create: { academyId: id, personId: person.id, ...caps },
      update: caps,
    });

    if (invited) {
      await this.sendInvite(
        email,
        person.name,
        academy.name,
        staffInviteEmailHtml,
        `${academy.name} te agregó a su equipo en Omnidance`,
      );
    }

    return { personId: person.id, invited, caps };
  }

  // ─── instructores (spec academy-team-instructors) ───
  // Misma capacidad `team` que los colaboradores: el equipo es una sola
  // consola. La membresía AcademyInstructor habilita los endpoints de
  // instructor (clases, asistencia) sin PersonRole INSTRUCTOR.

  /** Lista de profesores con su acuerdo económico (paginada). */
  @Get(":id/instructors")
  async listInstructors(
    @Param("id") id: string,
    @Req() req: Request,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    await this.access.requireCapability(id, req.person!, "team");
    const pg = pageParams(page, pageSize);
    const [rows, total] = await Promise.all([
      this.prisma.academyInstructor.findMany({
        where: { academyId: id },
        orderBy: { createdAt: "asc" },
        skip: pg.skip,
        take: pg.take,
        select: {
          personId: true,
          payType: true,
          payAmount: true,
          payClasses: true,
          createdAt: true,
        },
      }),
      this.prisma.academyInstructor.count({ where: { academyId: id } }),
    ]);
    const people = new Map(
      (
        await this.prisma.person.findMany({
          where: { id: { in: rows.map((r) => r.personId) } },
          select: { id: true, name: true, email: true },
        })
      ).map((p) => [p.id, p]),
    );
    return {
      items: rows.map((r) => ({
        person: people.get(r.personId) ?? {
          id: r.personId,
          name: "(cuenta eliminada)",
          email: null,
        },
        payType: r.payType,
        payAmount: r.payAmount,
        payClasses: r.payClasses,
        createdAt: r.createdAt,
      })),
      total,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }

  /**
   * Detalle del profesor (página del equipo): datos, acuerdo económico
   * y métricas de clases impartidas. "Clase impartida" = instancia no
   * cancelada ya pasada cuyo instructor efectivo (override de la clase
   * o default del slot) es la persona. Capacidad `team`.
   */
  @Get(":id/instructors/:personId")
  async instructorDetail(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "team");
    const instructor = await this.prisma.academyInstructor.findUnique({
      where: { academyId_personId: { academyId: id, personId } },
    });
    if (!instructor) {
      throw new NotFoundException("profesor no encontrado en la academia");
    }
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, email: true, phone: true },
    });

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    // Instructor efectivo: override de la clase, si no el del slot.
    const taughtWhere = {
      cancelled: false,
      slot: { academyId: id },
      OR: [
        { instructorId: personId },
        { instructorId: null, slot: { academyId: id, instructorId: personId } },
        {
          instructorId: null,
          slot: { academyId: id, instructorId: null, series: { instructorId: personId } },
        },
      ],
    };
    const [taughtTotal, taughtMonth, upcoming] = await Promise.all([
      this.prisma.class.count({
        where: { ...taughtWhere, date: { lt: now } },
      }),
      this.prisma.class.count({
        where: { ...taughtWhere, date: { gte: monthStart, lt: now } },
      }),
      this.prisma.class.findMany({
        where: { ...taughtWhere, date: { gte: now } },
        orderBy: { date: "asc" },
        take: 10,
        select: {
          id: true,
          date: true,
          slot: {
            select: {
              startTime: true,
              series: { select: { name: true } },
            },
          },
          _count: { select: { bookings: { where: { status: "BOOKED" } } } },
        },
      }),
    ]);
    // Asistencias del mes en clases impartidas por este instructor.
    const taughtIds = await this.prisma.class.findMany({
      where: { ...taughtWhere, date: { gte: monthStart, lt: now } },
      select: { id: true },
    });
    const attendanceMonth = taughtIds.length
      ? await this.prisma.attendance.count({
          where: { classId: { in: taughtIds.map((c) => c.id) } },
        })
      : 0;

    return {
      person: person ?? {
        id: personId,
        name: "(cuenta eliminada)",
        email: null,
        phone: null,
      },
      payType: instructor.payType,
      payAmount: instructor.payAmount,
      payClasses: instructor.payClasses,
      createdAt: instructor.createdAt,
      stats: { taughtTotal, taughtMonth, attendanceMonth },
      upcoming: upcoming.map((c) => ({
        id: c.id,
        date: c.date,
        startTime: c.slot.startTime,
        seriesName: c.slot.series?.name ?? null,
        bookings: c._count.bookings,
      })),
    };
  }

  /**
   * Agrega profesor por email - mismo find-or-stub + invitación que el
   * alta de colaborador. El acuerdo económico (payType/payAmount/
   * payClasses) se edita en el detalle del profesor.
   */
  @Post(":id/instructors")
  async addInstructor(
    @Param("id") id: string,
    @Body() dto: AddInstructorDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "team",
    );
    const { person, invited, email } = await this.resolvePerson(
      dto.email,
      dto.name,
    );
    this.assertValidTarget(person.id, academy.ownerId, req.person!.id);

    const data = {
      ...(dto.payType !== undefined ? { payType: dto.payType } : {}),
      ...(dto.payAmount !== undefined ? { payAmount: dto.payAmount } : {}),
      ...(dto.payClasses !== undefined ? { payClasses: dto.payClasses } : {}),
    };
    await this.prisma.academyInstructor.upsert({
      where: { academyId_personId: { academyId: id, personId: person.id } },
      create: {
        academyId: id,
        personId: person.id,
        payType: dto.payType ?? null,
        payAmount: dto.payAmount ?? null,
        payClasses: dto.payClasses ?? null,
      },
      update: data,
    });

    if (invited) {
      await this.sendInvite(
        email,
        person.name,
        academy.name,
        instructorInviteEmailHtml,
        `${academy.name} te agregó como profesor en Omnidance`,
      );
    }

    return {
      personId: person.id,
      invited,
    };
  }

  /** Quita la membresía de instructor (la cuenta sobrevive). */
  @Delete(":id/instructors/:personId")
  async removeInstructor(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "team",
    );
    this.assertValidTarget(personId, academy.ownerId, req.person!.id);
    const { count } = await this.prisma.academyInstructor.deleteMany({
      where: { academyId: id, personId },
    });
    if (!count) throw new NotFoundException("instructor no encontrado");
    return { removed: true };
  }

  @Patch(":id/staff/:personId")
  async update(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Body() dto: CapsDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "team",
    );
    this.assertValidTarget(personId, academy.ownerId, req.person!.id);
    const caps = capsToData(dto);
    const { count } = await this.prisma.academyStaff.updateMany({
      where: { academyId: id, personId },
      data: caps,
    });
    if (!count) throw new NotFoundException("colaborador no encontrado");
    return { personId, caps };
  }

  @Delete(":id/staff/:personId")
  async remove(
    @Param("id") id: string,
    @Param("personId") personId: string,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "team",
    );
    this.assertValidTarget(personId, academy.ownerId, req.person!.id);
    const { count } = await this.prisma.academyStaff.deleteMany({
      where: { academyId: id, personId },
    });
    if (!count) throw new NotFoundException("colaborador no encontrado");
    return { removed: true };
  }

  /**
   * Find-or-stub por email (alta de staff e instructores): Person
   * inexistente → stub `{email, name}` que se activa con la invitación.
   */
  private async resolvePerson(rawEmail: string, name?: string) {
    const email = rawEmail.trim().toLowerCase();
    const existing = await this.prisma.person.findUnique({
      where: { email },
    });
    if (existing) return { person: existing, invited: false, email };
    const person = await this.prisma.person.create({
      data: { email, name: name?.trim() || email.split("@")[0] },
    });
    return { person, invited: true, email };
  }

  /** Magic link largo + email de invitación (staff e instructores). */
  private async sendInvite(
    email: string,
    personName: string | null,
    academyName: string,
    template: typeof staffInviteEmailHtml,
    subject: string,
  ) {
    try {
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      const token = await this.auth.createMagicToken(
        email,
        false,
        INVITE_TOKEN_TTL,
      );
      const link = `${webUrl}/api/auth/verify?token=${token}`;
      await this.mailer.send(
        email,
        subject,
        template({ personName, academyName, link }),
      );
    } catch (e) {
      this.logger.error(
        `invitación falló (${email}): ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** El owner no es una fila staff y nadie se gestiona a sí mismo. */
  private assertValidTarget(
    personId: string,
    ownerId: string,
    actorId: string,
  ) {
    if (personId === ownerId) {
      throw new BadRequestException({
        error: "owner_not_staff",
        message: "el dueño ya administra la academia - no es colaborador",
      });
    }
    if (personId === actorId) {
      throw new BadRequestException({
        error: "cannot_modify_self",
        message: "no puedes gestionarte a ti mismo como colaborador",
      });
    }
  }
}
