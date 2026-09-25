// Smoke del flujo de compra de plan de academia:
//   POST /checkout/membership → orden PENDING stub → POST /payments/webhook
//   PAID → Enrollment ACTIVE con endsAt calendario · renovación extiende ·
//   TRIAL/inactivo rechazados · webhook idempotente.
// Corre contra API viva en :4000 con DB del docker-compose.
// node scripts/smoke-membership-checkout.cjs
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

const check = (name, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);

const refOf = (url) => url.replace(/^stub:\/\/pay\//, "");

async function main() {
  const dancer = await prisma.person.findUnique({
    where: { email: "dancer@omnidance.dev" },
  });
  const outsider = await prisma.person.findUnique({
    where: { email: "diego@omnidance.dev" },
  });
  if (!dancer || !outsider) throw new Error("faltan personas seed");
  const dancerTok = await session(dancer.id);
  const outsiderTok = await session(outsider.id);

  const muvet = await prisma.academy.findFirst({
    where: { name: "MuéveteOnTour" },
  });
  const tumbao = await prisma.academy.findFirst({
    where: { name: "Academia Tumbao" },
  });
  const plans = await prisma.membershipPlan.findMany({
    where: { academyId: { in: [muvet.id, tumbao.id] } },
  });
  const singleTumbao = plans.find(
    (p) => p.academyId === tumbao.id && p.type === "SINGLE",
  );

  // Idempotente: limpia el estado que deja una corrida previa.
  // PaymentEvent referencia Payment (FK) — el ledger del smoke se borra
  // primero (solo aplica a payments de prueba, nunca a datos reales).
  await prisma.enrollment.deleteMany({
    where: { academyId: tumbao.id, personId: outsider.id },
  });
  const stalePayments = await prisma.payment.findMany({
    where: { personId: outsider.id, orderType: "MEMBERSHIP" },
    select: { id: true },
  });
  await prisma.paymentEvent.deleteMany({
    where: { paymentId: { in: stalePayments.map((p) => p.id) } },
  });
  await prisma.payment.deleteMany({
    where: { personId: outsider.id, orderType: "MEMBERSHIP" },
  });
  const quarterlyMuvet = plans.find(
    (p) => p.academyId === muvet.id && p.type === "QUARTERLY",
  );
  const trialMuvet = plans.find(
    (p) => p.academyId === muvet.id && p.type === "TRIAL",
  );

  // ─── 1. Perfil público expone description (bullets) ───
  const prof = await call("GET", `/academies/${muvet.id}/profile`, dancerTok);
  check("GET profile → 200", prof.status === 200, `(${prof.status})`);
  const profPlan = prof.body?.plans?.find((p) => p.id === quarterlyMuvet.id);
  check(
    "profile: plan trae bullets",
    Array.isArray(profPlan?.description) && profPlan.description.length > 0,
    profPlan?.description?.[0] ?? "(sin description)",
  );
  check(
    "profile: myEnrollment trae plan.id + endsAt",
    !!prof.body?.myEnrollment?.plan?.id && !!prof.body?.myEnrollment?.endsAt,
  );

  // ─── 2. Compra nueva (outsider no tiene enrollment en Tumbao) ───
  const before = await prisma.enrollment.findFirst({
    where: { academyId: tumbao.id, personId: outsider.id },
  });
  check("pre: outsider sin enrollment en Tumbao", !before);

  const buy = await call("POST", "/checkout/membership", outsiderTok, {
    planId: singleTumbao.id,
  });
  check("POST /checkout/membership → 201", buy.status === 201, `(${buy.status})`);
  check(
    "devuelve paymentUrl stub + paymentId",
    !!buy.body?.paymentUrl?.startsWith("stub://") && !!buy.body?.paymentId,
    buy.body?.paymentUrl ?? "",
  );
  check(
    "amount = precio plan + fee",
    buy.body?.quote?.total === singleTumbao.price + (buy.body?.quote?.serviceFee ?? 0),
    `total=${buy.body?.quote?.total}`,
  );

  // webhook PAID → enrollment ACTIVE
  const wh = await call("POST", "/payments/webhook", null, {
    refId: refOf(buy.body.paymentUrl),
    status: "PAID",
  });
  check("webhook PAID → 200", wh.status === 200, `(${wh.status})`);
  const enr = await prisma.enrollment.findFirst({
    where: { academyId: tumbao.id, personId: outsider.id },
  });
  check("enrollment creado ACTIVE", enr?.status === "ACTIVE");
  check("enrollment SINGLE tiene endsAt ~mañana mediodía", !!enr?.endsAt, enr?.endsAt?.toISOString() ?? "");

  // webhook idempotente: re-notificación no duplica ni falla
  const wh2 = await call("POST", "/payments/webhook", null, {
    refId: refOf(buy.body.paymentUrl),
    status: "PAID",
  });
  check(
    "webhook re-notificación idempotente",
    wh2.status === 200 && wh2.body?.duplicated === true,
  );
  const enrCount = await prisma.enrollment.count({
    where: { academyId: tumbao.id, personId: outsider.id },
  });
  check("sin enrollment duplicado", enrCount === 1, `(${enrCount})`);

  // ─── 3. Renovación: dancer ACTIVE en Muvet (+25d) compra QUARTERLY ───
  const prev = await prisma.enrollment.findFirst({
    where: { academyId: muvet.id, personId: dancer.id },
  });
  check("pre: dancer ACTIVE en Muvet con endsAt", prev?.status === "ACTIVE" && !!prev.endsAt);

  const buy2 = await call("POST", "/checkout/membership", dancerTok, {
    planId: quarterlyMuvet.id,
  });
  check("renovación: checkout → 201", buy2.status === 201, `(${buy2.status})`);
  await call("POST", "/payments/webhook", null, {
    refId: refOf(buy2.body.paymentUrl),
    status: "PAID",
  });
  const enr2 = await prisma.enrollment.findFirst({
    where: { academyId: muvet.id, personId: dancer.id },
  });
  // base = endsAt previo + 1d → QUARTERLY = fin del 3er mes desde esa base
  const base = new Date(prev.endsAt.getTime() + 86_400_000);
  const cl = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).format(base);
  const [y, m] = cl.split("-").map(Number);
  const expected = Date.UTC(y, m + 2, 0, 15);
  check(
    "renovación extiende (QUARTERLY desde endsAt+1d)",
    enr2?.endsAt?.getTime() === expected,
    `${enr2?.endsAt?.toISOString()} vs ${new Date(expected).toISOString()}`,
  );
  check("renovación cambia planId al nuevo", enr2?.planId === quarterlyMuvet.id);
  check("renovación conserva startedAt", enr2?.startedAt?.getTime() === prev.startedAt?.getTime());

  // ─── 4. Rechazos ───
  const trial = await call("POST", "/checkout/membership", dancerTok, {
    planId: trialMuvet.id,
  });
  check("TRIAL no se vende → 400", trial.status === 400, `(${trial.status})`);

  const inactive = await prisma.membershipPlan.update({
    where: { id: singleTumbao.id },
    data: { active: false },
  });
  const inact = await call("POST", "/checkout/membership", outsiderTok, {
    planId: inactive.id,
  });
  check("plan inactivo → 400", inact.status === 400, `(${inact.status})`);
  await prisma.membershipPlan.update({
    where: { id: singleTumbao.id },
    data: { active: true },
  });

  const noAuth = await call("POST", "/checkout/membership", null, {
    planId: singleTumbao.id,
  });
  check("sin sesión → 401", noAuth.status === 401, `(${noAuth.status})`);

  const bad = await call("POST", "/checkout/membership", dancerTok, {
    planId: "noexiste",
  });
  check("plan inexistente → 404", bad.status === 404, `(${bad.status})`);

  // ─── 5. GET /payments/:id reporta orderType MEMBERSHIP ───
  const pay = await call("GET", `/payments/${buy.body.paymentId}`, outsiderTok);
  check(
    "GET /payments/:id → orderType MEMBERSHIP + PAID",
    pay.body?.orderType === "MEMBERSHIP" && pay.body?.status === "PAID",
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL fatal:", e);
  await prisma.$disconnect();
  process.exit(1);
});
