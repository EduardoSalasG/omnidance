// Dispatcher de seeds. Ambos son idempotentes (upserts / find-or-create).
//
//   npx tsx prisma/seed.ts            → SEED_ENV o NODE_ENV decide
//   SEED_ENV=dev  npx tsx prisma/seed.ts   → baseline + demo SBK Santiago
//   SEED_ENV=prod npx tsx prisma/seed.ts   → baseline + admin (SEED_ADMIN_EMAIL)
//
// `prisma db seed` usa este archivo vía package.json → prisma.seed.
import { PrismaClient } from "@prisma/client";
import { seedDev } from "./seed-dev";
import { seedProd } from "./seed-prod";

const prisma = new PrismaClient();

async function main() {
  const env =
    process.env.SEED_ENV ??
    (process.env.NODE_ENV === "production" ? "prod" : "dev");

  if (env === "prod") {
    console.log("Seeding omnidance [prod] — baseline + admin…");
    await seedProd(prisma);
  } else if (env === "dev") {
    console.log("Seeding omnidance [dev] — baseline + demo Santiago…");
    await seedDev(prisma);
  } else {
    throw new Error(`SEED_ENV inválido: "${env}" (usar dev|prod)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
