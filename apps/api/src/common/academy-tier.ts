import {
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  assertAcademyFeature,
  requiredTierFor,
  tierMeets,
  type AcademyFeature,
} from "../academies/domain/academy-tiers";

/**
 * Gating de features por tier de academia (spec academy-tier-cobros) -
 * contraparte de `assertProducerPro`: NO es un guard RBAC ni un check de
 * rol, es feature-gating por cuenta - el caller ya pasó su autorización
 * (owner/staff/permiso) y acá se decide si el tier de la academia cubre
 * la feature. 403 `{error:"tier.required", upgrade:true, requiredTier}`.
 *
 * El bypass de admin NO vive acá: los callers que operan por actor
 * (p.ej. el CRM) chequean primero la identidad - admin pasa por su rama
 * sin llegar al gate, igual que en producer-pro.ts.
 */
export async function assertAcademyTier(
  prisma: PrismaService,
  academyId: string,
  feature: AcademyFeature,
): Promise<void> {
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { tier: true },
  });
  if (!academy) throw new NotFoundException("academia no encontrada");
  assertAcademyFeature(academy, feature);
}

/**
 * Variante por actor owner (multi-academia / lentes agregados): ¿alguna
 * academia del owner cubre la feature? La lente ACADEMY_OWNER agrega
 * sobre todas las academias - basta una con el nivel requerido.
 */
export async function anyOwnedAcademyMeets(
  prisma: PrismaService,
  ownerId: string,
  feature: AcademyFeature,
): Promise<boolean> {
  const academies = await prisma.academy.findMany({
    where: { ownerId },
    select: { tier: true },
  });
  return academies.some((a) => tierMeets(a.tier, feature));
}

/**
 * 403 tier.required si ninguna academia del owner cubre la feature.
 * Usado por superficies agregadas (query console / analítica por lente).
 */
export async function assertAnyOwnedAcademyMeets(
  prisma: PrismaService,
  ownerId: string,
  feature: AcademyFeature,
): Promise<void> {
  if (await anyOwnedAcademyMeets(prisma, ownerId, feature)) return;
  const requiredTier = requiredTierFor(feature);
  throw new ForbiddenException({
    error: "tier.required",
    upgrade: true,
    requiredTier,
    feature,
    message: `esta herramienta es parte del plan ${requiredTier} - sube de tier para seguir usándola`,
  });
}
