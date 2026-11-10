// Smoke mercadopago-subscriptions: alta cuenta MP TEST en Academia Tumbao
// + subscribe CARD → needs_card init_point + preapproval pending en MP.
//
// Uso:
//   node apps/api/scripts/smoke-mp-subscription.cjs [--person <email>]
//     → setup: crea todo e imprime registerUrl (init_point). El humano
//     abre la URL,
//     completa el checkout hosted de MP y MP lo redirige al back_url
//     (GET /payments/mp/subscription-return → activa → /checkout/return).
//   node apps/api/scripts/smoke-mp-subscription.cjs --verify <subId>
//     → estado local + preapproval MP (esperado ACTIVE + authorized).
//   node apps/api/scripts/smoke-mp-subscription.cjs --cleanup <subId>
//     → cancela sub local + preapproval remoto.
//   node apps/api/scripts/smoke-mp-subscription.cjs --auto <subId>
//     → simula el retorno GET sin pago humano (pending → error, legacy).
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");
const fs = require("node:fs");
const path = require("node:path");

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const API = "http://localhost:4000/api";
const ACADEMY = "cmua3gao7003buas59g9fyxn5";
const PLAN = "cmua3garn003puas5a917tpia";
const MP_TOKEN = env.MP_SMOKE_ACCESS_TOKEN;
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
const mp = (p, method = "GET", body) =>
  fetch(`https://api.mercadopago.com/${p}`, {
    method,
    headers: { authorization: `Bearer ${MP_TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const argMode = process.argv[2];
const argSub = process.argv[3];

async function setup() {
  // --person <email>: suscribe como otra persona (QA con mail real:
  // salas.eduardo03@gmail.com → el payer_email del preapproval calza
  // con el mail que el humano ingresa en el checkout hosted de MP).
  const personEmail = argMode === "--person" && argSub ? argSub : "dancer@omnidance.dev";
  const academy = await prisma.academy.findUnique({ where: { id: ACADEMY } });
  console.log("academia:", academy?.name, "owner:", academy?.ownerId);
  const dancer = await prisma.person.findUnique({ where: { email: personEmail } });
  if (!dancer) throw new Error(`persona ${personEmail} no existe`);
  // 1. Alta cuenta MP TEST
  const up = await call("PUT", `/academies/${ACADEMY}/gateway-account`, await session(academy.ownerId), {
    provider: "MERCADOPAGO", apiKey: MP_TOKEN,
  });
  console.log("PUT gateway-account →", up.status, JSON.stringify(up.body?.account));
  const accountId = up.body?.account?.id;
  // 2. Subscribe CARD como dancer
  const sub = await call("POST", "/checkout/membership-subscription", await session(dancer.id), {
    planId: PLAN, acceptRecurring: true,
  });
  console.log("subscribe →", sub.status, JSON.stringify(sub.body));
  const subId = sub.body?.subscriptionId;
  if (!subId) throw new Error("sin subscriptionId");
  const row = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  console.log("local:", row.status, "account:", row.gatewayAccountId);
  console.log("\n=== COMPLETA EL CHECKOUT EN ===");
  console.log(sub.body?.registerUrl, "\n");
  // 3. Preapproval en MP por external_reference
  const found = await mp(`preapproval/search?external_reference=${subId}`);
  console.log("MP preapprovals:", JSON.stringify(found.results?.map((p) => ({ id: p.id, status: p.status, amount: p.auto_recurring?.transaction_amount }))));
  console.log("subId =", subId, "| accountId =", accountId);
  console.log("Tras pagar: node apps/api/scripts/smoke-mp-subscription.cjs --verify", subId);
}

async function verify(subId) {
  const row = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  console.log("local:", row?.status, "| gatewayAccountId:", row?.gatewayAccountId, "| remoteId:", row?.flowSubscriptionId ?? null);
  const found = await mp(`preapproval/search?external_reference=${subId}`);
  console.log("MP preapprovals:", JSON.stringify(found.results?.map((p) => ({ id: p.id, status: p.status, amount: p.auto_recurring?.transaction_amount }))));
  const payments = await prisma.payment.findMany({ where: { refId: { contains: subId } }, select: { id: true, status: true, amount: true, gateway: true } });
  console.log("payments:", JSON.stringify(payments));
}

async function cleanup(subId) {
  const row = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  if (row) {
    const dancer = await prisma.person.findUnique({ where: { id: row.personId } });
    const res = await call("POST", `/subscriptions/${subId}/cancel`, await session(dancer.id)).catch(() => null);
    console.log("cancel local →", res?.status);
  }
  const found = await mp(`preapproval/search?external_reference=${subId}`);
  const preId = found.results?.[0]?.id;
  if (preId) console.log("MP cancel preapproval:", JSON.stringify(await mp(`preapproval/${preId}`, "PUT", { status: "cancelled" })));
}

async function autoReturn(subId) {
  const row = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  const ret = await call("GET", `/payments/mp/subscription-return?account=${row.gatewayAccountId}&sub=${subId}`, null);
  console.log("return GET →", ret.status, ret.headers.get("location"));
  const row2 = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  console.log("local post-return:", row2.status);
}

async function main() {
  if (argMode === "--verify") await verify(argSub);
  else if (argMode === "--cleanup") await cleanup(argSub);
  else if (argMode === "--auto") await autoReturn(argSub);
  else await setup();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
