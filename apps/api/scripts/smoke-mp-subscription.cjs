// Smoke mercadopago-subscriptions: alta cuenta MP TEST en Academia Tumbao
// + subscribe CARD → needs_card init_point + preapproval pending en MP.
// node apps/api/scripts/smoke-mp-subscription.cjs
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
const API = "http://localhost:4001/api";
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

async function main() {
  const academy = await prisma.academy.findUnique({ where: { id: ACADEMY } });
  console.log("academia:", academy?.name, "owner:", academy?.ownerId);
  const dancer = await prisma.person.findUnique({ where: { email: "dancer@omnidance.dev" } });
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
  console.log("registerUrl =", sub.body?.registerUrl);
  // 3. Preapproval en MP por external_reference
  const found = await mp(`preapproval/search?external_reference=${subId}`);
  console.log("MP preapprovals:", JSON.stringify(found.results?.map((p) => ({ id: p.id, status: p.status, amount: p.auto_recurring?.transaction_amount }))));
  // 4. Retorno GET (pending → redirect error, sub sigue PENDING_CARD)
  const ret = await call("GET", `/payments/mp/subscription-return?account=${accountId}&sub=${subId}`, null);
  console.log("return GET →", ret.status, ret.headers.get("location"));
  const row2 = await prisma.membershipSubscription.findUnique({ where: { id: subId } });
  console.log("local post-return:", row2.status);
  // 5. Cleanup: cancel local sub + preapproval remoto
  await call("POST", `/subscriptions/${subId}/cancel`, await session(dancer.id)).catch(() => {});
  const preId = found.results?.[0]?.id;
  if (preId) console.log("MP cancel preapproval:", JSON.stringify(await mp(`preapproval/${preId}`, "PUT", { status: "cancelled" })));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
