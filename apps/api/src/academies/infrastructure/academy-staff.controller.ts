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
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AuthService } from "../../auth/domain/auth.service";
import { PrismaService } from "../../prisma.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import { AcademyAccess } from "./academy-access.service";
import { staffInviteEmailHtml } from "./invite-emails";

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

  @Get(":id/staff")
  async list(@Param("id") id: string, @Req() req: Request) {
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
    return rows.map((r) => ({
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
    const email = dto.email.trim().toLowerCase();

    let person = await this.prisma.person.findUnique({ where: { email } });
    const invited = !person;
    if (!person) {
      person = await this.prisma.person.create({
        data: {
          email,
          name: dto.name?.trim() || email.split("@")[0],
        },
      });
    }
    this.assertValidTarget(person.id, academy.ownerId, req.person!.id);

    const caps = capsToData(dto);
    await this.prisma.academyStaff.upsert({
      where: { academyId_personId: { academyId: id, personId: person.id } },
      create: { academyId: id, personId: person.id, ...caps },
      update: caps,
    });

    if (invited) {
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
          `${academy.name} te agregó a su equipo en Omnidance`,
          staffInviteEmailHtml({
            personName: person.name,
            academyName: academy.name,
            link,
          }),
        );
      } catch (e) {
        this.logger.error(
          `invitación staff falló (${email}): ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    return { personId: person.id, invited, caps };
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
