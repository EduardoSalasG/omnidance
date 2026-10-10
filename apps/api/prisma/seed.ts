// Dispatcher de seeds. Todos son idempotentes (upserts / find-or-create).
//
//   npx tsx prisma/seed.ts                → SEED_ENV o NODE_ENV decide
//   SEED_ENV=dev       → baseline + demo SBK Santiago
//   SEED_ENV=prod      → idéntico a dev (PILOTO temporal: prod recibe el
//                        dataset demo con usuarios reales). El "bypass"
//                        ya existe: SEED_ENV=dev corre lo mismo en
//                        cualquier DB - lo único que cambia es
//                        DATABASE_URL.
//   SEED_ENV=baseline  → solo baseline + admin - el seed REAL de prod,
//                        preservado en seed-prod-baseline.ts para
//                        restaurar el dispatch cuando termine el piloto.
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

  if (env === "prod") {
    // Piloto: prod corre el dataset demo (usuarios reales de prueba:
    // Mónica, María, Gabriel). Si viene SEED_ADMIN_EMAIL se asegura ese
    // admin además del admin demo que crea seedDev.
    console.log("Seeding omnidance [prod] - dataset demo (piloto)…");
    await seedDev(prisma);
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
      console.log("Admin de prod asegurado:", admin.email);
    }
  } else if (env === "baseline") {
    console.log("Seeding omnidance [baseline] - baseline + admin…");
    await seedProdBaseline(prisma);
  } else if (env === "dev") {
    console.log("Seeding omnidance [dev] - baseline + demo Santiago…");
    await seedDev(prisma);
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
