// Seed de producción: solo baseline operativa (RBAC, permisos, estilos,
// params) + el admin inicial. Sin data demo — venues/eventos/personas se
// crean por la app real. Idempotente: correr N veces no duplica ni pisa
// valores editados desde /admin.
import { PrismaClient } from "@prisma/client";
import { ensurePerson, seedCommon } from "./seed-common";

export async function seedProd(prisma: PrismaClient) {
  await seedCommon(prisma);

  // Admin inicial — requerido: prod sin admin no es operable.
  //   SEED_ADMIN_EMAIL=admin@tu-dominio.cl SEED_ENV=prod npx tsx prisma/seed.ts
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) {
    throw new Error(
      "SEED_ADMIN_EMAIL es requerido para el seed de producción " +
        "(será el primer usuario ADMIN por magic link).",
    );
  }
  const admin = await ensurePerson(
    prisma,
    email,
    process.env.SEED_ADMIN_NAME ?? "Admin Omnidance",
    [{ role: "ADMIN" }],
  );

  console.log("Seed prod listo:", { admin: admin.email });
}
