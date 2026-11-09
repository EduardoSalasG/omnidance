const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// backfill-churn-entitlements.cjs — ONE-SHOT (spec platform-trials, task 3b).
//
//   cd apps/api && node scripts/backfill-churn-entitlements.cjs          # lista afectados
//   cd apps/api && node scripts/backfill-churn-entitlements.cjs --apply  # aplica el corte
//
// Bug histórico: al cancelarse una PlatformSubscription el entitlement
// proyectado nunca se limpiaba - academias churned conservaban
// Academy.tier/billingCycle y productores su Person.proTier, por lo que
// seguían operando features de consola sin pagar. El corte en caliente
// quedó en applyChurnCut (platform-subscriptions.service); este script
// cubre a los YA cancelados antes del fix.
//
// Regla (idéntica a applyChurnCut): el actor pierde el entitlement solo
// si NO tiene otra sub viva del mismo scope. Cada corte deja
// ActivityEvent access.ended para la línea de vida admin.
//
// DRY-RUN por defecto: lista los afectados y sale. Revisar la lista
// ANTES de --apply (hay casos legítimos: tier manual ENTERPRISE,
// cortesías sin sub - revisar uno por uno).

const LIVE = [
  "ACTIVE",
  "CANCEL_PENDING",
  "PENDING_CARD",
  "ACTIVATING",
  "PENDING_PAYMENT",
];

(async () => {
  const apply = process.argv.includes("--apply");

  const academies = await prisma.academy.findMany({
    where: { tier: { not: null } },
    select: {
      id: true,
      name: true,
      tier: true,
      billingCycle: true,
      ownerId: true,
      platformSubscriptions: {
        where: { status: { in: LIVE } },
        select: { id: true },
        take: 1,
      },
    },
  });
  const staleAcademies = academies.filter(
    (a) => a.platformSubscriptions.length === 0,
  );

  const persons = await prisma.person.findMany({
    where: { proTier: { not: "FREE" } },
    select: {
      id: true,
      name: true,
      email: true,
      proTier: true,
      platformSubscriptionsAsProducer: {
        where: { kind: "PRODUCER", status: { in: LIVE } },
        select: { id: true },
        take: 1,
      },
    },
  });
  const staleProducers = persons.filter(
    (p) => p.platformSubscriptionsAsProducer.length === 0,
  );

  console.log(
    `${apply ? "APLICANDO" : "DRY-RUN"} corte de churn - actores con entitlement sin sub viva`,
  );
  console.log(`\nAcademias (tier → null): ${staleAcademies.length}`);
  for (const a of staleAcademies) {
    console.log(`  ${a.id}  ${a.name}  tier=${a.tier} cycle=${a.billingCycle} owner=${a.ownerId}`);
  }
  console.log(`\nProductores (proTier → FREE): ${staleProducers.length}`);
  for (const p of staleProducers) {
    console.log(`  ${p.id}  ${p.name}  <${p.email}>  proTier=${p.proTier}`);
  }

  if (!apply) {
    console.log(
      "\n(dry-run: sin escrituras - re-corre con --apply tras revisar la lista)",
    );
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  for (const a of staleAcademies) {
    await prisma.$transaction(async (tx) => {
      await tx.academy.update({
        where: { id: a.id },
        data: { tier: null, billingCycle: null },
      });
      await tx.activityEvent.create({
        data: {
          type: "access.ended",
          personId: a.ownerId,
          academyId: a.id,
          refType: "PlatformSubscription",
          data: { kind: "ACADEMY", tierCode: a.tier, via: "backfill-churn" },
          createdAt: now,
        },
      });
    });
  }
  for (const p of staleProducers) {
    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: p.id },
        data: { proTier: "FREE" },
      });
      await tx.activityEvent.create({
        data: {
          type: "access.ended",
          personId: p.id,
          refType: "PlatformSubscription",
          data: { kind: "PRODUCER", tierCode: p.proTier, via: "backfill-churn" },
          createdAt: now,
        },
      });
    });
  }
  console.log(
    `\nAplicado: ${staleAcademies.length} academia(s), ${staleProducers.length} productor(es)`,
  );
  await prisma.$disconnect();
})();
