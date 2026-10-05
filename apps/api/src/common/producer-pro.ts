import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { isProActive } from "../payments/domain/platform-tiers";

/**
 * Gating de features Producer Pro (spec producer-pro, S5
 * academy-saas-billing). NO es un guard RBAC ni un check de rol: es
 * feature-gating por actor — el caller ya pasó su autorización
 * (owner/admin/permiso) y acá se decide si la cuenta del productor tiene
 * Pro vigente (`isProActive`: tier Pro o trial de lanzamiento).
 *
 * Se invoca solo cuando el actor resuelto es el productor dueño del
 * recurso (caller.id === producerId, o actorType "PRODUCER" en el CRM):
 * admins operando sobre la cuenta de otro y actores academia pasan sin
 * gate. Un productor sin Pro obtiene 403 `{error:"pro.required",
 * upgrade:true}` — el front muestra el CTA de upgrade (S6).
 */
export const PRO_REQUIRED_BODY = {
  error: "pro.required",
  upgrade: true,
  message:
    "esta herramienta es parte de Producer Pro — activa tu suscripción para seguir usándola",
} as const;

/** 403 pro.required si el productor no tiene Pro efectivo. */
export async function assertProducerPro(
  prisma: PrismaService,
  producerId: string,
): Promise<void> {
  const producer = await prisma.person.findUnique({
    where: { id: producerId },
    select: { proTier: true, proTrialEndsAt: true },
  });
  if (!producer || !isProActive(producer)) {
    throw new ForbiddenException({ ...PRO_REQUIRED_BODY });
  }
}
