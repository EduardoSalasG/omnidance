import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AuthService } from "../../auth/domain/auth.service";
import { PrismaService } from "../../prisma.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import { AcademyAccess } from "./academy-access.service";
import { emitActivity } from "../../common/activity-log";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { academyInviteEmailHtml } from "./invite-emails";

/**
 * TTL del magic link de invitación (mismo criterio que staff/students):
 * la invitada abre el correo días después, no en 15min.
 */
const INVITE_TOKEN_TTL = "7d";

class CreateInviteDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
}

/**
 * Invitaciones de registro de la academia (spec academies/student-invites):
 * el staff invita a personas SIN crearles enrollment - la invitada se
 * registra por el magic link, aterriza en la ficha pública de la academia
 * (`next=/academias/:id`, consumo en auth.controller) y se inscribe sola.
 * Canal de adquisición del dancer, no gestión de nómina.
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyInvitesController {
  private readonly logger = new Logger(AcademyInvitesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
    // Opcional: el push a cuentas existentes es best-effort (spec
    // notifications/admin-alerts inyecta igual - specs manuales no).
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  /**
   * POST /academies/:id/invites (cap `students`): email + nombre y
   * apellido. Crea AcademyInvite pendiente y envía correo con magic
   * link (next → ficha pública). Idempotente por pendiente: un re-envío
   * sobre (academy, email) pendiente reenvía el correo sin duplicar fila.
   * Email con cuenta existente: correo igual + push "te invitó".
   */
  @Post(":id/invites")
  async invite(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() dto: CreateInviteDto,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "students",
    );
    const email = dto.email.trim().toLowerCase();
    const name = `${dto.name.trim()} ${dto.lastName?.trim() ?? ""}`.trim();

    const existing = await this.prisma.academyInvite.findFirst({
      where: { academyId: id, email, consumedAt: null },
    });
    const invite =
      existing ??
      (await this.prisma.academyInvite.create({
        data: { academyId: id, email, name, invitedById: req.person!.id },
      }));
    // Línea de vida admin (spec platform-trials §5b): solo el alta real
    // - el re-envío no duplica el evento.
    if (!existing) {
      await emitActivity(this.prisma, {
        type: "invite.sent",
        academyId: id,
        refType: "AcademyInvite",
        refId: invite.id,
        data: { email, invitedById: req.person!.id },
      });
    }

    // Correo con magic link → verify aterriza en la ficha pública de la
    // academia tras el onboarding. Best-effort: la fila queda igual si
    // el envío falla (mismo criterio que las otras invitaciones).
    try {
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      const token = await this.auth.createMagicToken(
        email,
        false,
        INVITE_TOKEN_TTL,
        { next: `/academias/${id}` },
      );
      const link = `${webUrl}/api/auth/verify?token=${token}`;
      await this.mailer.send(
        email,
        `${academy.name} te invitó a Omnidance`,
        academyInviteEmailHtml({
          personName: name,
          academyName: academy.name,
          link,
        }),
      );
    } catch (e) {
      this.logger.error(
        `invitación a ${email} falló: ${e instanceof Error ? e.message : e}`,
      );
    }

    // Cuenta existente: además del correo, push "la academia te invitó"
    // (cuentas nuevas no tienen tokens de push aún).
    const person = await this.prisma.person.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    });
    if (person && !person.deletedAt) {
      await this.notifications?.notifySafe(person.id, {
        category: "TRANSACTIONAL",
        type: "academy.invite",
        title: `${academy.name} te invitó a Omnidance`,
        body: "Revisa tu correo para entrar y encontrarla.",
        data: { academyId: id, inviteId: invite.id },
      });
    }

    return { invite, resent: !!existing };
  }

  /**
   * GET /academies/:id/invites (cap `students`): seguimiento de la
   * invitación - pendientes primero (consumedAt null arriba), dentro de
   * cada grupo las más recientes primero.
   */
  @Get(":id/invites")
  async list(@Param("id") id: string, @Req() req: Request) {
    await this.access.requireCapability(id, req.person!, "students");
    const items = await this.prisma.academyInvite.findMany({
      where: { academyId: id },
      orderBy: [
        { consumedAt: { sort: "desc", nulls: "first" } },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        email: true,
        name: true,
        consumedAt: true,
        createdAt: true,
      },
    });
    return { items };
  }
}
