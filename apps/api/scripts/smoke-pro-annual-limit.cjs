// Smoke: reintento del cobro anual PRO tras alza de límite Cargo Automático
// Flow ($250.000/tx default -> pedido alza a soporte). Suscribe una academia
// existente a PRO ANNUAL (~$1.223.898) con el payer que ya tiene tarjeta
// registrada en Flow sandbox, y hace poll del estado local + remoto.
// Uso: node apps/api/scripts/smoke-pro-annual-limit.cjs <ownerEmail> <academyId>
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
const [email, academyId] = process.argv.slice(2);
if (!email || !academyId) {
  console.error("uso: node smoke-pro-annual-limit.cjs <email> <academyId>");
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

  const sub = await call("POST", `/academies/${academyId}/subscribe`, tok, {
    tier: "PRO",
    cycle: "ANNUAL",
    acceptRecurring: true,
  });
  console.log(`subscribe PRO ANNUAL -> ${sub.status}`, JSON.stringify(sub.body).slice(0, 400));

  const localSubId = sub.body?.subscriptionId;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await prisma.platformSubscription.findFirst({
      where: { academyId },
      orderBy: { createdAt: "desc" },
    });
    const pay = await prisma.payment.findFirst({
      where: {
        refId: { startsWith: "platsub_" },
        orderType: "PLATFORM_SUB",
        ...(localSubId ? { refId: { contains: localSubId.slice(0, 20) } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    const anyPay = pay ?? (await prisma.payment.findFirst({
      where: { refId: { startsWith: "platsub_" }, orderType: "PLATFORM_SUB" },
      orderBy: { createdAt: "desc" },
    }));
    console.log(
      `poll ${i}: sub ${s?.status} remote=${s?.flowSubscriptionId} lastInv=${s?.lastInvoiceId} | pay ${anyPay?.status} ${anyPay?.refId} $${anyPay?.amount}`,
    );
    if (anyPay?.status === "PAID" || s?.status === "ACTIVE") break;
  }
  await prisma.$disconnect();
}

main();
