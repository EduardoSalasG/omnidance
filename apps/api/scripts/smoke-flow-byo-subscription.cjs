// Smoke academy-card-subs-byo (FLOW): cuenta Flow sandbox en Academia
// Tumbao + subscribe CARD → needs_card registerUrl hosted → el humano
// registra tarjeta en sandbox.flow.cl → Flow POSTea al customer-return
// (via API_URL público - devtunnel) → sub ACTIVE.
//
// Credenciales: las lee del .env RAÍZ (FLOW_API_KEY/FLOW_SECRET_KEY
// sandbox). Uso:
//   node apps/api/scripts/smoke-flow-byo-subscription.cjs [--person <email>]
//   node apps/api/scripts/smoke-flow-byo-subscription.cjs --verify <subId>
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
const fs = require("node:fs");
const path = require("node:path");

const parseEnv = (f) =>
  Object.fromEntries(
    fs.readFileSync(f, "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
const env = { ...parseEnv(path.join(__dirname, "..", "..", "..", ".env")), ...parseEnv(path.join(__dirname, "..", ".env")) };
const API = "http://localhost:4000/api";
const ACADEMY = "cmua3gao7003buas59g9fyxn5";
const PLAN = "cmua3garn003puas5a917tpia";
const prisma = new PrismaClient();
const session = (pid) =>
  new SignJWT({ purpose: "session" }).setSubject(pid)
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt()
    .setExpirationTime("1h").sign(new TextEncoder().encode(env.JWT_SECRET));
const call = (method, p, tok, body) =>
  fetch(`${API}${p}`, {
    method, redirect: "manual",
    headers: { "content-type": "application/json", ...(tok ? { cookie: `omnidance_session=${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));

const argMode = process.argv[2];
const argSub = process.argv[3];

async function setup() {
  const personEmail = argMode === "--person" && argSub ? argSub : "salas.eduardo03@gmail.com";
  const academy = await prisma.academy.findUnique({ where: { id: ACADEMY } });
  console.log("academia:", academy?.name, "owner:", academy?.ownerId);
  const dancer = await prisma.person.findUnique({ where: { email: personEmail } });
  if (!dancer) throw new Error(`persona ${personEmail} no existe`);
  // 1. Alta cuenta FLOW sandbox (keys del .env raíz)
  const up = await call("PUT", `/academies/${ACADEMY}/gateway-account`, await session(academy.ownerId), {
    provider: "FLOW", apiKey: env.FLOW_API_KEY, secret: env.FLOW_SECRET_KEY ?? env.FLOW_SECRET,
  });
  console.log("PUT gateway-account →", up.status, JSON.stringify(up.body?.account ?? up.body));
  const accountId = up.body?.account?.id;
  // 2. Subscribe CARD
  const sub = await call("POST", "/checkout/membership-subscription", await session(dancer.id), {
    planId: PLAN, acceptRecurring: true,
  });
  console.log("subscribe →", sub.status, JSON.stringify(sub.body));
  const subId = sub.body?.subscriptionId;
  if (!subId) throw new Error("sin subscriptionId");
  const row = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  console.log("local:", row.status, "account:", row.gatewayAccountId);
  console.log("\n=== REGISTRA LA TARJETA EN ===");
  console.log(sub.body?.registerUrl, "\n");
  console.log("subId =", subId, "| accountId =", accountId);
  console.log("Tras registrar: node apps/api/scripts/smoke-flow-byo-subscription.cjs --verify", subId);
}

async function verify(subId) {
  const row = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  console.log("local:", row?.status, "| gatewayAccountId:", row?.gatewayAccountId, "| remoteId:", row?.flowSubscriptionId ?? null, "| nextInvoice:", row?.nextInvoiceAt);
  const pay = await prisma.payment.findMany({ where: { refId: { contains: PLAN } }, select: { refId: true, status: true, amount: true, gateway: true }, orderBy: { createdAt: "desc" }, take: 2 });
  console.log("payments:", JSON.stringify(pay));
}

async function main() {
  if (argMode === "--verify") await verify(argSub);
  else await setup();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
