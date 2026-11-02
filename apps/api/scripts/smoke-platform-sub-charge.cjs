// Smoke: primer cobro PLATFORM_SUB (academia SaaS) con tarjeta ya registrada.
// node apps/api/scripts/smoke-platform-sub-charge.cjs <ownerEmail> <academyName>
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
const fs = require("node:fs");
const path = require("node:path");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const API = "http://localhost:4000/api";
const prisma = new PrismaClient();
const [email, academyName] = process.argv.slice(2);
if (!email || !academyName) {
  console.error("uso: node smoke-platform-sub-charge.cjs <email> <academyName>");
  process.exit(1);
}

const session = (personId) =>
  new SignJWT({ purpose: "session" })
    .setSubject(personId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env.JWT_SECRET));

const call = (method, path, tok, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(tok ? { cookie: `omnidance_session=${tok}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({
    status: r.status,
    body: await r.json().catch(() => null),
  }));

async function main() {
  const person = await prisma.person.findUnique({ where: { email } });
  if (!person) throw new Error(`persona ${email} no existe`);
  const tok = await session(person.id);

  const create = await call("POST", "/academies", tok, { name: academyName });
  console.log(`create academy → ${create.status}`, JSON.stringify(create.body).slice(0, 200));
  const academyId = create.body?.id ?? create.body?.academy?.id;
  if (!academyId) throw new Error("sin academyId");

  const sub = await call("POST", `/academies/${academyId}/subscribe`, tok, {
    tier: "COBROS",
    cycle: "MONTHLY",
    acceptRecurring: true,
  });
  console.log(`subscribe COBROS MONTHLY → ${sub.status}`, JSON.stringify(sub.body).slice(0, 300));

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const s = await prisma.platformSubscription.findFirst({
      where: { academyId },
      orderBy: { createdAt: "desc" },
    });
    const pay = await prisma.payment.findFirst({
      where: { refId: { startsWith: `platsub_` }, orderType: "PLATFORM_SUB" },
      orderBy: { createdAt: "desc" },
    });
    console.log(
      `poll ${i}: sub ${s?.status} remote=${s?.flowSubscriptionId} lastInv=${s?.lastInvoiceId} | pay ${pay?.status} ${pay?.refId} $${pay?.amount}`,
    );
    if (pay?.status === "PAID") break;
  }
}

main()
  .catch((e) => {
    console.error("ERROR", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
