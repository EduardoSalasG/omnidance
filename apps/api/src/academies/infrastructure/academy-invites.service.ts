import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Academy, AcademyInvite } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { AuthService } from "../../auth/domain/auth.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import { emitActivity } from "../../common/activity-log";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { academyInviteEmailHtml } from "./invite-emails";

/**
 * TTL del magic link de invitación (mismo criterio que staff/students):
 * la invitada abre el correo días después, no en 15min.
 */
const INVITE_TOKEN_TTL = "7d";

export interface InviteOutcome {
  /** La fila persistida (null en dryRun). */
  invite: AcademyInvite | null;
  /** Ya existía pendiente → solo se reenvió el correo. */
  resent: boolean;
  /** El email tiene cuenta registrada (recibió push además del mail). */
  personExists: boolean;
  /** El correo salió (best-effort: la fila queda aunque falle). */
  sent: boolean;
}

/**
 * Invitaciones de registro de la academia (spec academies/student-invites):
 * dedup por pendiente `(academyId,email)`, correo con magic link a la
 * ficha pública, push si el email ya tiene cuenta. Fuente única para el
 * alta individual (controller) y el canal bulk (import de alumnos,
 * change academy-import-invites).
 */
@Injectable()
export class AcademyInvitesService {
  private readonly logger = new Logger(AcademyInvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
    // Opcional: el push a cuentas existentes es best-effort (spec
    // notifications/admin-alerts inyecta igual - specs manuales no).
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Crea (o reenvía) la invitación pendiente de `email` en `academy` y
   * envía el correo con magic link (`next` → ficha pública). Cuenta
   * existente → push "te invitó" además del mail. Con `dryRun` solo
   * clasifica el resultado (resent/personExists) sin escribir ni enviar.
   */
  async sendInvite(
    academy: Academy,
    input: {
      email: string;
      name: string;
      invitedById: string;
      dryRun?: boolean;
    },
  ): Promise<InviteOutcome> {
    const existing = await this.prisma.academyInvite.findFirst({
      where: { academyId: academy.id, email: input.email, consumedAt: null },
    });
    const person = await this.prisma.person.findUnique({
      where: { email: input.email },
      select: { id: true, deletedAt: true },
    });
    const personExists = !!person && !person.deletedAt;

    if (input.dryRun) {
      return {
        invite: null,
        resent: !!existing,
        personExists,
        sent: false,
      };
    }

    const invite =
      existing ??
      (await this.prisma.academyInvite.create({
        data: {
          academyId: academy.id,
          email: input.email,
          name: input.name,
          invitedById: input.invitedById,
        },
      }));
    // Línea de vida admin (spec platform-trials §5b): solo el alta real
    // - el re-envío no duplica el evento.
    if (!existing) {
      await emitActivity(this.prisma, {
        type: "invite.sent",
        academyId: academy.id,
        refType: "AcademyInvite",
        refId: invite.id,
        data: { email: input.email, invitedById: input.invitedById },
      });
    }

    // Correo con magic link → verify aterriza en la ficha pública de la
    // academia tras el onboarding. Best-effort: la fila queda igual si
    // el envío falla (mismo criterio que las otras invitaciones).
    let sent = false;
    try {
      const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
      const token = await this.auth.createMagicToken(
        input.email,
        false,
        INVITE_TOKEN_TTL,
        { next: `/academias/${academy.id}` },
      );
      const link = `${webUrl}/api/auth/verify?token=${token}`;
      await this.mailer.send(
        input.email,
        `${academy.name} te invitó a Omnidance`,
        academyInviteEmailHtml({
          personName: input.name,
          academyName: academy.name,
          link,
        }),
      );
      sent = true;
    } catch (e) {
      this.logger.error(
        `invitación a ${input.email} falló: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }

    // Cuenta existente: además del correo, push "la academia te invitó"
    // (cuentas nuevas no tienen tokens de push aún). `url` es la ruta
    // bridge que consume la invite desde el push de dispositivo - la
    // ficha directa saltaría el consumo (spec academies/student-invites).
    if (personExists) {
      await this.notifications?.notifySafe(person.id, {
        category: "TRANSACTIONAL",
        type: "academy.invite",
        title: `${academy.name} te invitó a Omnidance`,
        body: "Revisa tu correo para entrar y encontrarla.",
        data: {
          academyId: academy.id,
          inviteId: invite.id,
          url: `/i/${invite.id}`,
        },
      });
    }

    return { invite, resent: !!existing, personExists, sent };
  }
}
