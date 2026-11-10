import { Logger } from "@nestjs/common";
import { emitActivity } from "./activity-log";
import type { PrismaService } from "../prisma.service";

/**
 * Consumo de invitación de academia (spec academies/student-invites):
 * marca consumidas las invitaciones pendientes de `email` en
 * `academyId` (personId + consumedAt), crea el Referral INVITE
 * (referrer = quien invitó, dedup por triple) y emite
 * invite.registered. Fuente única para los dos caminos de llegada:
 * verify del magic link (auth.controller) y tap del push
 * `academy.invite` (academy-invites.controller). Best-effort: nunca
 * rompe al caller - devuelve si consumió algo.
 */
export async function consumeAcademyInvites(
  prisma: PrismaService,
  {
    email,
    personId,
    academyId,
  }: { email: string; personId: string; academyId: string },
  logger?: Logger,
): Promise<boolean> {
  let consumed = false;
  try {
    const pending = await prisma.academyInvite.findMany({
      where: { academyId, email, consumedAt: null },
    });
    for (const invite of pending) {
      await prisma.academyInvite.update({
        where: { id: invite.id },
        data: { consumedAt: new Date(), personId },
      });
      // Referral INVITE (CRM): dedup por referrer+referred+source -
      // la tabla no tiene @@unique (mismo patrón que GIFT_TICKET).
      const dup = await prisma.referral.findFirst({
        where: {
          referrerId: invite.invitedById,
          referredId: personId,
          source: "INVITE",
        },
        select: { id: true },
      });
      if (!dup) {
        await prisma.referral.create({
          data: {
            referrerId: invite.invitedById,
            referredId: personId,
            source: "INVITE",
          },
        });
      }
      await emitActivity(prisma, {
        type: "invite.registered",
        personId,
        academyId,
        refType: "AcademyInvite",
        refId: invite.id,
      });
      consumed = true;
    }
  } catch (err) {
    (logger ?? new Logger("ConsumeAcademyInvites")).warn(
      `consumo de invitación de ${email} falló: ${(err as Error).message}`,
    );
  }
  return consumed;
}
