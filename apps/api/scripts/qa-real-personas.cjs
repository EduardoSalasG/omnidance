// ═══════════════════════════════════════════════════════════════════
// qa-real-personas.cjs — prepara las personas reales (correos de verdad)
// para QA con PAYMENT_GATEWAY=flow.
//
//   cd apps/api && node scripts/qa-real-personas.cjs
//
// Contexto: Flow rechaza emails *@omnidance.dev (dominio inexistente no
// pasa su validación), así que el checkout sandbox necesita personas con
// correo real. Magic link no sirve en dev (SMTP no sale a transport
// real), por eso cada persona recibe el password dev `omnidance123`
// (mismo formato scrypt$N$r$p$salt$hash que AuthService/seed-dev) -
// login por /auth/login o por la UI sin abrir el correo.
//
// Idempotente: upsert de PersonRole por (personId, role) con status
// APPROVED (los roles que la persona ya tenga no se tocan ni se quitan)
// y update de passwordHash. Re-correr no duplica ni degrada nada.
//
// Mapa de cuentas (handoff 2026-11-05):
//   salas.eduardo03@gmail.com    → dancer (booking, attendances, payment)
//   salas.eduardo.cl@gmail.com   → academy (owner "La Casa del Mambo")
//   salas.eduardo03@outlook.com  → producer (cuenta nueva; aquí nace el rol)
//   salas.eduardo.backup@gmail.com → segundo dancer / academy backup
// ═══════════════════════════════════════════════════════════════════
const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

const prisma = new PrismaClient();

const DEV_PASSWORD = "omnidance123";

const QA_PERSONAS = [
  {
    email: "salas.eduardo03@gmail.com",
    roles: ["DANCER"],
    label: "dancer",
  },
  {
    email: "salas.eduardo.cl@gmail.com",
    roles: ["DANCER", "ACADEMY_OWNER", "INSTRUCTOR"],
    label: "academy",
  },
  {
    email: "salas.eduardo03@outlook.com",
    roles: ["DANCER", "PRODUCER"],
    label: "producer",
  },
  {
    email: "salas.eduardo.backup@gmail.com",
    roles: ["DANCER", "ACADEMY_OWNER"],
    label: "academy backup",
  },
];

const hash = (password) => {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
};

async function main() {
  const passwordHash = hash(DEV_PASSWORD);
  const report = [];

  for (const qa of QA_PERSONAS) {
    const person = await prisma.person.findUnique({
      where: { email: qa.email },
      include: { roles: true },
    });
    if (!person) {
      report.push({ email: qa.email, error: "no existe - saltada" });
      continue;
    }
    if (person.deletedAt) {
      report.push({ email: qa.email, error: "deletedAt - saltada" });
      continue;
    }

    for (const role of qa.roles) {
      await prisma.personRole.upsert({
        where: { personId_role: { personId: person.id, role } },
        update: { status: "APPROVED" },
        create: { personId: person.id, role, status: "APPROVED" },
      });
    }
    await prisma.person.update({
      where: { id: person.id },
      data: { passwordHash },
    });

    const roles = await prisma.personRole.findMany({
      where: { personId: person.id },
      select: { role: true, status: true },
    });
    report.push({
      email: qa.email,
      uso: qa.label,
      verified: person.verifiedAt ? "sí" : "no",
      roles: roles.map((r) => `${r.role}:${r.status}`).join(", "),
      password: DEV_PASSWORD,
    });
  }

  console.table(report);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
