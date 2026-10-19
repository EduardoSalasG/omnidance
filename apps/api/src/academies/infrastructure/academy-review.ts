import type { PrismaService } from "../../prisma.service";

/**
 * Control de calidad por academia (spec academy-approval-gate): la
 * academia solo es pública con el checklist completo (auto-aprobación)
 * u override admin. REJECTED la oculta aunque el checklist pase.
 */
export interface AcademyReviewChecks {
  name: boolean;
  description: boolean;
  address: boolean;
  contact: boolean; // instagram | whatsapp | website
  photo: boolean; // photoUrl
  activeSeries: boolean;
  upcomingClass: boolean;
  plan: boolean;
  ownerApproved: boolean;
}

export const ACADEMY_CHECK_KEYS: (keyof AcademyReviewChecks)[] = [
  "name",
  "description",
  "address",
  "contact",
  "photo",
  "activeSeries",
  "upcomingClass",
  "plan",
  "ownerApproved",
];

/** ¿Todos los checks pasan? = auto-publicable. */
export function checksComplete(c: AcademyReviewChecks): boolean {
  return ACADEMY_CHECK_KEYS.every((k) => c[k]);
}

/** Visibilidad efectiva: APPROVED siempre; PENDING solo si completa. */
export function isAcademyVisible(
  reviewStatus: string,
  checks: AcademyReviewChecks,
): boolean {
  if (reviewStatus === "APPROVED") return true;
  if (reviewStatus === "REJECTED") return false;
  return checksComplete(checks);
}

/**
 * Evalúa el checklist en batch (groupBy, sin N+1). Devuelve id → checks.
 * Reusa la misma evaluación para directorios públicos, la cola admin y
 * la card de visibilidad del owner.
 */
export async function evaluateAcademyChecks(
  prisma: PrismaService,
  academyIds: string[],
): Promise<Map<string, AcademyReviewChecks>> {
  const out = new Map<string, AcademyReviewChecks>();
  if (academyIds.length === 0) return out;

  const academies = await prisma.academy.findMany({
    where: { id: { in: academyIds } },
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      instagram: true,
      whatsapp: true,
      website: true,
      photoUrl: true,
      ownerId: true,
    },
  });
  const ids = academies.map((a) => a.id);
  const ownerIds = [...new Set(academies.map((a) => a.ownerId))];
  const todayUTC = new Date(new Date().setUTCHours(0, 0, 0, 0));

  const [seriesGroups, slots, planGroups, ownerRoles] = await Promise.all([
    prisma.classSeries.groupBy({
      by: ["academyId"],
      where: { academyId: { in: ids }, active: true },
      _count: { _all: true },
    }),
    prisma.classSlot.findMany({
      where: { academyId: { in: ids } },
      select: { id: true, academyId: true },
    }),
    prisma.membershipPlan.groupBy({
      by: ["academyId"],
      where: { academyId: { in: ids }, active: true },
      _count: { _all: true },
    }),
    prisma.personRole.findMany({
      where: {
        personId: { in: ownerIds },
        role: "ACADEMY_OWNER",
        status: "APPROVED",
      },
      select: { personId: true },
    }),
  ]);

  const slotIds = slots.map((s) => s.id);
  const classGroups = slotIds.length
    ? await prisma.class.groupBy({
        by: ["classSlotId"],
        where: { classSlotId: { in: slotIds }, cancelled: false, date: { gte: todayUTC } },
        _count: { _all: true },
      })
    : [];

  const seriesByAcademy = new Map(seriesGroups.map((g) => [g.academyId, g._count._all]));
  const plansByAcademy = new Map(planGroups.map((g) => [g.academyId, g._count._all]));
  const classesBySlot = new Map(classGroups.map((g) => [g.classSlotId, g._count._all]));
  const upcomingByAcademy = new Map<string, number>();
  for (const s of slots) {
    upcomingByAcademy.set(
      s.academyId,
      (upcomingByAcademy.get(s.academyId) ?? 0) + (classesBySlot.get(s.id) ?? 0),
    );
  }
  const approvedOwners = new Set(ownerRoles.map((r) => r.personId));

  for (const a of academies) {
    out.set(a.id, {
      name: a.name.trim().length >= 2,
      description: !!a.description?.trim(),
      address: !!a.address?.trim(),
      contact: !!(a.instagram || a.whatsapp || a.website),
      photo: !!a.photoUrl?.trim(),
      activeSeries: (seriesByAcademy.get(a.id) ?? 0) > 0,
      upcomingClass: (upcomingByAcademy.get(a.id) ?? 0) > 0,
      plan: (plansByAcademy.get(a.id) ?? 0) > 0,
      ownerApproved: approvedOwners.has(a.ownerId),
    });
  }
  return out;
}

/**
 * Auto-aprobación best-effort (spec academy-approval-gate): promueve
 * las PENDING con checklist completo a APPROVED en el mismo request.
 * Devuelve el set de ids promovidos. REJECTED nunca entra acá.
 */
export async function promoteCompletedAcademies(
  prisma: PrismaService,
  academyIds: string[],
): Promise<Set<string>> {
  if (academyIds.length === 0) return new Set();
  const checks = await evaluateAcademyChecks(prisma, academyIds);
  const promote = [...checks.entries()]
    .filter(([, c]) => checksComplete(c))
    .map(([id]) => id);
  if (promote.length > 0) {
    await prisma.academy.updateMany({
      where: { id: { in: promote }, reviewStatus: "PENDING" },
      data: { reviewStatus: "APPROVED" },
    });
  }
  return new Set(promote);
}
