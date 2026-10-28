// Seed REAL de producción - baseline operativa (RBAC, permisos,
// estilos, params) + el admin inicial. Sin data demo: venues/eventos/
// personas se crean por la app real.
//
// Es el seed que corre `SEED_ENV=prod` (y `baseline`) - la DB de prod
// queda limpia para uso real desde el primer deploy.
//
// Idempotente: correr N veces no duplica ni pisa valores editados
// desde /admin.
import { PrismaClient } from "@prisma/client";
import { ensurePerson, seedCommon } from "./seed-common";

export async function seedProdBaseline(prisma: PrismaClient) {
  await seedCommon(prisma);

  // Admin inicial - requerido: prod sin admin no es operable.
  //   SEED_ADMIN_EMAIL=admin@tu-dominio.cl SEED_ENV=baseline npx tsx prisma/seed.ts
  // Defensa: el valor puede venir entre comillas o con espacios si el
  // .env los trae - auth guarda emails en minúscula, así que el seed
  // normaliza igual para que el magic link encuentre a esta persona.
  const email = (process.env.SEED_ADMIN_EMAIL ?? "")
    .replace(/^[\s"']+|[\s"']+$/g, "")
    .toLowerCase();
  if (email) {
    const admin = await ensurePerson(
      prisma,
      email,
      process.env.SEED_ADMIN_NAME ?? "Admin Omnidance",
      [{ role: "ADMIN" }],
    );
    console.log("Seed prod baseline listo:", { admin: admin.email });
    return;
  }
  // Sin email: solo se omite cuando la DB ya tiene un ADMIN aprobado
  // (re-correr el seed en cada deploy para validar baseline/params);
  // primer boot sin admin sigue exigiendo el email.
  const admins = await prisma.personRole.count({
    where: { role: "ADMIN", status: "APPROVED" },
  });
  if (admins === 0) {
    throw new Error(
      "SEED_ADMIN_EMAIL es requerido para el seed baseline de producción " +
        "(será el primer usuario ADMIN por magic link).",
    );
  }
  console.log("Seed prod baseline listo (admin existente, email omitido)");
}
