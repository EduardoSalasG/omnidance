// Smoke: suscripción de membresía con tarjeta ya registrada → primer cobro.
// Corre contra API viva :4000 con PAYMENT_GATEWAY=flow.
// node apps/api/scripts/smoke-membership-sub-charge.cjs <email> <planId>
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const API = "http://localhost:4000/api";
const SECRET = env.JWT_SECRET ?? "dev-secret-change-me";
const prisma = new PrismaClient();

const [email, planId, existingSubId] = process.argv.slice(2);
if (!email || !planId) {
  console.error(
    "uso: node smoke-membership-sub-charge.cjs <email> <planId> [subId-existente]",
  );
  process.exit(1);
}

const session = (personId) =>
  new SignJWT({ purpose: "session" })
    .setSubject(personId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));

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
  console.log(`persona ${person.id} flowCustomerId=${person.flowCustomerId}`);
  const tok = await session(person.id);

  const res = existingSubId
    ? { status: 0, body: { subscriptionId: existingSubId } }
    : await call("POST", "/checkout/membership-subscription", tok, {
        planId,
        acceptRecurring: true,
      });
  console.log(`subscribe → ${res.status}`, JSON.stringify(res.body));

  if (res.body?.subscriptionId) {
    // getForOwner hace subscription/get + reconcile inline (refresh activo)
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const sub = await prisma.membershipSubscription.findUnique({
        where: { id: res.body.subscriptionId },
      });
      const det = await call(
        "GET",
        `/subscriptions/${res.body.subscriptionId}`,
        tok,
      );
      console.log(
        `poll ${i}: local status=${sub?.status} lastInvoiceId=${sub?.lastInvoiceId} | GET →`,
        JSON.stringify(det.body).slice(0, 300),
      );
      const pay = await prisma.payment.findFirst({
        where: { refId: { startsWith: `mem_${planId}_` } },
        orderBy: { createdAt: "desc" },
      });
      if (pay) {
        console.log(
          `PAYMENT ${pay.id} status=${pay.status} amount=${pay.amount} refId=${pay.refId}`,
        );
        if (pay.status === "PAID") break;
      } else {
        console.log("sin Payment mem_ todavía");
      }
    }
  }
}

main()
  .catch((e) => {
    console.error("ERROR", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
