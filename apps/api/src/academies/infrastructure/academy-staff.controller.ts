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
  @IsOptional() @IsInt() @Min(0) @Max(100) commissionPct?: number;
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
  ) {
    await this.access.requireCapability(id, req.person!, "team");
    const rows = await this.prisma.academyStaff.findMany({
      where: { academyId: id },
      orderBy: { createdAt: "asc" },
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
    const people = new Map(
      (
        await this.prisma.person.findMany({
          where: { id: { in: rows.map((r) => r.personId) } },
          select: { id: true, name: true, email: true },
        })
      ).map((p) => [p.id, p]),
    );
    const term = q?.trim().toLowerCase();
    const filtered = term
      ? rows.filter((r) => {
          const p = people.get(r.personId);
          return (
            (p?.name ?? "").toLowerCase().includes(term) ||
            (p?.email ?? "").toLowerCase().includes(term)
          );
        })
      : rows;
    return filtered.map((r) => ({
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
    }));
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

  /** Lista de profesores con comisión vigente. */
  @Get(":id/instructors")
  async listInstructors(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "team");
    const rows = await this.prisma.academyInstructor.findMany({
      where: { academyId: id },
      orderBy: { createdAt: "asc" },
      select: { personId: true, commissionPct: true, createdAt: true },
    });
    const people = new Map(
      (
        await this.prisma.person.findMany({
          where: { id: { in: rows.map((r) => r.personId) } },
          select: { id: true, name: true, email: true },
        })
      ).map((p) => [p.id, p]),
    );
    return rows.map((r) => ({
      person: people.get(r.personId) ?? {
        id: r.personId,
        name: "(cuenta eliminada)",
        email: null,
      },
      commissionPct: r.commissionPct,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Agrega profesor por email - mismo find-or-stub + invitación que el
   * alta de colaborador. commissionPct se snapshottea a cada
   * PrivateLesson suya al crearla (spec instructor-commission).
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

    const data =
      dto.commissionPct === undefined
        ? {}
        : { commissionPct: dto.commissionPct };
    await this.prisma.academyInstructor.upsert({
      where: { academyId_personId: { academyId: id, personId: person.id } },
      create: {
        academyId: id,
        personId: person.id,
        commissionPct: dto.commissionPct ?? null,
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
      commissionPct: dto.commissionPct ?? null,
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
