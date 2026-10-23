import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import {
  academyEntitlement,
  producerEntitlement,
  producerRequiredTierFor,
  producerTierMeets,
  type ActorEntitlement,
  type ActorType,
  type ProducerFeature,
} from "../payments/domain/actor-entitlements";
import {
  assertAcademyFeature,
  requiredTierFor,
  tierMeets,
  tierRequiredError,
  type AcademyFeature,
} from "../academies/domain/academy-tiers";

/**
 * Gating de features por suscripción de plataforma (spec
 * unified-actor-entitlements) - unifica lo que antes era
 * `assertProducerPro` (producer-pro.ts) y `assertAcademyTier`
 * (academy-tier.ts). NO es un guard RBAC ni un check de rol: es
 * feature-gating por actor - el caller ya pasó su autorización
 * (owner/admin/permiso) y acá se decide si la cuenta del actor cubre
 * la feature declarada por el endpoint.
 *
 * Error único: 403 `{error:"tier.required", upgrade:true, requiredTier,
 * feature}` (`tierRequiredError`) - `pro.required` ya no se emite.
 *
 * El bypass NO vive acá (misma semántica que antes): admins operando
 * la cuenta de otro y actores ajenos nunca llegan al gate - los call
 * sites chequean primero la identidad (requireFeatureSelf en eventos,
 * assertActorAccess en CRM, person.isAdmin en AcademyAccess).
 */

// ─── Resolución (GET /me/entitlements) ─────────────────────────────

/**
 * Entitlements del productor: null si la persona no existe o no tiene
 * el rol PRODUCER aprobado (un PENDING de landing no compra ni usa
 * Pro - primero pasa por la cola del admin). Nunca lanza: el contrato
 * de /me/entitlements expone `producer:null` en ese caso.
 */
export async function resolveProducerEntitlement(
  prisma: PrismaService,
  personId: string,
): Promise<ActorEntitlement | null> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      proTier: true,
      proTrialEndsAt: true,
      roles: {
        select: { status: true },
        where: { role: "PRODUCER" },
      },
    },
  });
  if (!person || !person.roles.some((r) => r.status === "APPROVED")) {
    return null;
  }
  return producerEntitlement(person);
}

/** Entitlements de cada academia del owner (orden de creación). */
export async function resolveAcademyEntitlements(
  prisma: PrismaService,
  ownerId: string,
): Promise<(ActorEntitlement & { id: string })[]> {
  const academies = await prisma.academy.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
    select: { id: true, tier: true },
  });
  return academies.map((a) => ({ id: a.id, ...academyEntitlement(a) }));
}

// ─── Gating por actor ──────────────────────────────────────────────

export function assertActorFeature(
  prisma: PrismaService,
  actorType: "PRODUCER",
  actorId: string,
  feature: ProducerFeature,
): Promise<void>;
export function assertActorFeature(
  prisma: PrismaService,
  actorType: "ACADEMY",
  actorId: string,
  feature: AcademyFeature,
): Promise<void>;

/**
 * 403 tier.required si el actor no cubre la feature con su
 * suscripción. PRODUCER sin rol aprobado/persona → gate (no 404 - no
 * revela existencia, mismo criterio que assertProducerPro); ACADEMY
 * inexistente → 404 (igual que assertAcademyTier).
 */
export async function assertActorFeature(
  prisma: PrismaService,
  actorType: ActorType,
  actorId: string,
  feature: string,
): Promise<void> {
  if (actorType === "PRODUCER") {
    const entitlement = await resolveProducerEntitlement(prisma, actorId);
    if (!entitlement || !producerTierMeets(entitlement.tier, feature)) {
      throw tierRequiredError(producerRequiredTierFor(feature), feature);
    }
    return;
  }
  const academy = await prisma.academy.findUnique({
    where: { id: actorId },
    select: { tier: true },
  });
  if (!academy) throw new NotFoundException("academia no encontrada");
  assertAcademyFeature(academy, feature as AcademyFeature);
}

// ─── Lente agregado del owner (multi-academia) ─────────────────────

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
  throw tierRequiredError(requiredTierFor(feature), feature);
}

