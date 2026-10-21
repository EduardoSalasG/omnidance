// Dispatcher de seeds. Todos son idempotentes (upserts / find-or-create).
//
//   npx tsx prisma/seed.ts                → SEED_ENV o NODE_ENV decide
//   SEED_ENV=dev       → baseline + demo SBK Santiago
//   SEED_ENV=prod      → baseline + admin SOLAMENTE - la BD de prod sale
//                        limpia para uso real (sin dataset demo).
//   SEED_ENV=baseline  → alias explícito del mismo seed de prod.
//
// `prisma db seed` usa este archivo vía package.json → prisma.seed.
import { PrismaClient } from "@prisma/client";
import { ensurePerson } from "./seed-common";
import { seedDev } from "./seed-dev";
import { seedProdBaseline } from "./seed-prod-baseline";

const prisma = new PrismaClient();

async function main() {
  const env =
    process.env.SEED_ENV ??
    (process.env.NODE_ENV === "production" ? "prod" : "dev");

  if (env === "prod" || env === "baseline") {
    console.log("Seeding omnidance [baseline] - baseline + admin…");
    await seedProdBaseline(prisma);
  } else if (env === "dev") {
    console.log("Seeding omnidance [dev] - baseline + demo Santiago…");
    await seedDev(prisma);
    // Admin explícito adicional si viene SEED_ADMIN_EMAIL (antes vivía
    // en la rama prod del piloto - sigue disponible para cualquier env).
    const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "")
      .replace(/^[\s"']+|[\s"']+$/g, "")
      .toLowerCase();
    if (adminEmail) {
      const admin = await ensurePerson(
        prisma,
        adminEmail,
        process.env.SEED_ADMIN_NAME ?? "Admin Omnidance",
        [{ role: "ADMIN" }],
      );
      console.log("Admin adicional asegurado:", admin.email);
    }
  } else {
    throw new Error(`SEED_ENV inválido: "${env}" (usar dev|prod|baseline)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
