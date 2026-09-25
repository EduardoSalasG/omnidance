// Smoke de suscripciones + auditoría BIAN.
// Corre contra API viva en :4000.
//
// Modo stub (PAYMENT_GATEWAY=stub): valida que el endpoint existe, que las
// validaciones de negocio responden (acceptRecurring, plan no recurrente,
// gateway sin soporte) y que la auditoría funciona (mine/events/verify-chain).
//
// Modo flow (PAYMENT_GATEWAY=flow + credenciales sandbox): además valida el
// camino real — subscribe → needs_card + registerUrl de sandbox.flow.cl,
// MembershipSubscription PENDING_CARD, Person.flowCustomerId,
// MembershipPlan.flowPlanId y las GatewayTransaction de cada llamada Flow.
// node scripts/smoke-subscription.cjs
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");

const API = "http://localhost:4000/api";
const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const prisma = new PrismaClient();

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

let pass = 0,
  fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  cond ? pass++ : fail++;
};

async function main() {
  const dancer = await prisma.person.findUnique({
    where: { email: "dancer@omnidance.dev" },
  });
  const admin = await prisma.person.findFirst({
    where: { roles: { some: { role: "ADMIN", status: "APPROVED" } } },
  });
  if (!dancer || !admin) throw new Error("faltan personas seed (dancer/admin)");
  const dancerTok = await session(dancer.id);
  const adminTok = await session(admin.id);

  const monthlyPlan = await prisma.membershipPlan.findFirst({
    where: { type: "MONTHLY", active: true },
  });
  const singlePlan = await prisma.membershipPlan.findFirst({
    where: { type: "SINGLE", active: true },
  });
  if (!monthlyPlan || !singlePlan)
    throw new Error("faltan planes seed (MONTHLY/SINGLE)");

  // ---- validaciones de negocio (independientes del gateway) ----
  const noConsent = await call("POST", "/checkout/membership-subscription", dancerTok, {
    planId: monthlyPlan.id,
  });
  check("sin acceptRecurring → 400", noConsent.status === 400);

  const noAuth = await call("POST", "/checkout/membership-subscription", null, {
    planId: monthlyPlan.id,
    acceptRecurring: true,
  });
  check("sin sesión → 401", noAuth.status === 401);

  const notRecurring = await call("POST", "/checkout/membership-subscription", dancerTok, {
    planId: singlePlan.id,
    acceptRecurring: true,
  });
  check("plan SINGLE no suscribible → 400", notRecurring.status === 400);

  const notFound = await call("POST", "/checkout/membership-subscription", dancerTok, {
    planId: "plan_inexistente",
    acceptRecurring: true,
  });
  check("plan inexistente → 404", notFound.status === 404);

  // ---- camino con gateway ----
  const isFlow = process.env.PAYMENT_GATEWAY === "flow";
  const sub = await call("POST", "/checkout/membership-subscription", dancerTok, {
    planId: monthlyPlan.id,
    acceptRecurring: true,
  });
  if (isFlow) {
    check(
      "subscribe → needs_card + registerUrl sandbox",
      sub.status === 201 &&
        sub.body?.kind === "needs_card" &&
        typeof sub.body?.registerUrl === "string" &&
        sub.body.registerUrl.includes("sandbox.flow.cl"),
      JSON.stringify(sub.body).slice(0, 120),
    );
    const subRow = await prisma.membershipSubscription.findUnique({
      where: { id: sub.body.subscriptionId },
    });
    check("sub PENDING_CARD persistida", subRow?.status === "PENDING_CARD");
    const person = await prisma.person.findUnique({ where: { id: dancer.id } });
    check("flowCustomerId persistido", !!person?.flowCustomerId);
    const plan = await prisma.membershipPlan.findUnique({
      where: { id: monthlyPlan.id },
    });
    check("flowPlanId persistido", plan?.flowPlanId === `omni_${plan.id}`);
    const txs = await prisma.gatewayTransaction.findMany({
      where: { provider: "FLOW" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    check(
      "GatewayTransactions Flow registradas (plans/customer/register)",
      txs.length >= 3 &&
        txs.every((t) => t.direction === "OUTBOUND") &&
        txs.some((t) => t.endpoint === "customer/register"),
      `${txs.length} txs: ${txs.map((t) => t.endpoint).join(",")}`,
    );
    check(
      "sin firma 's' en claro en requestBody",
      txs.every((t) => {
        const req = JSON.stringify(t.requestBody ?? {});
        return !/"s":"[0-9a-f]{64}"/.test(req);
      }),
    );
    // cancelar la PENDING_CARD — cancelación local, sin Flow
    const cancel = await call(
      "POST",
      `/subscriptions/${sub.body.subscriptionId}/cancel`,
      dancerTok,
    );
    check(
      "cancel PENDING_CARD → ok (cancelación local)",
      cancel.status === 200 || cancel.status === 201,
      JSON.stringify(cancel.body).slice(0, 100),
    );
  } else {
    check(
      "gateway stub → 400 (suscripciones requieren Flow)",
      sub.status === 400,
      `status=${sub.status} ${JSON.stringify(sub.body).slice(0, 100)}`,
    );
  }

  // ---- endpoints de suscripción ----
  const mine = await call("GET", "/subscriptions/mine", dancerTok);
  check("GET /subscriptions/mine → 200 array", mine.status === 200 && Array.isArray(mine.body));

  const cancelBogus = await call("POST", "/subscriptions/nope/cancel", dancerTok);
  check("cancel ajena/inexistente → 404", cancelBogus.status === 404);

  const getBogus = await call("GET", "/subscriptions/nope", dancerTok);
  check("GET /subscriptions/:id ajena → 404", getBogus.status === 404);

  // ---- auditoría ----
  const payMine = await call("GET", "/payments/mine", dancerTok);
  check(
    "GET /payments/mine → 200 array con eventCount",
    payMine.status === 200 &&
      Array.isArray(payMine.body) &&
      (payMine.body.length === 0 || "eventCount" in payMine.body[0]),
  );

  const myPayment = payMine.body?.[0];
  if (myPayment) {
    const evts = await call("GET", `/payments/${myPayment.id}/events`, dancerTok);
    check(
      "GET /payments/:id/events (owner) → ledger ordenado",
      evts.status === 200 &&
        Array.isArray(evts.body) &&
        evts.body.every((e) => "seq" in e && "payloadHash" in e),
    );
    const verify = await call(
      "GET",
      `/admin/payments/${myPayment.id}/verify-chain`,
      adminTok,
    );
    check(
      "verify-chain admin → ok",
      verify.status === 200 && verify.body?.ok === true,
      JSON.stringify(verify.body),
    );
    const verifyAsDancer = await call(
      "GET",
      `/admin/payments/${myPayment.id}/verify-chain`,
      dancerTok,
    );
    check(
      "verify-chain como dancer → 403",
      verifyAsDancer.status === 403,
      `status=${verifyAsDancer.status}`,
    );
  }

  const eventsAjeno = await call(
    "GET",
    "/payments/by-event/evento_inexistente",
    dancerTok,
  );
  check("by-event inexistente → 404", eventsAjeno.status === 404);

  const webNoTok = await call("POST", "/payments/subscription-webhook", null, {});
  check(
    "subscription-webhook público → 200 (sin reconcile)",
    webNoTok.status === 200 || webNoTok.status === 201,
    `status=${webNoTok.status}`,
  );

  console.log(`\n${pass} PASS · ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main()
  .catch((e) => {
    console.error("ERROR", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
