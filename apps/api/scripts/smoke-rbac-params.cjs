// Smoke test RBAC + params — corre contra API viva en :4000.
// node scripts/smoke-rbac-params.cjs
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
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const check = (name, cond, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);

async function main() {
  const admin = await prisma.person.findFirst({
    where: { roles: { some: { role: "ADMIN", status: "APPROVED" } } },
  });
  if (!admin) throw new Error("sin admin APPROVED en seed");
  const adminTok = await session(admin.id);

  // usuario con STAFF solo PENDING → no debe pasar el guard
  const pending = await prisma.person.upsert({
    where: { email: "smoke-pending@test.cl" },
    update: {},
    create: {
      email: "smoke-pending@test.cl",
      name: "Smoke Pending",
      roles: { create: { role: "STAFF", status: "PENDING" } },
    },
  });
  const pendingTok = await session(pending.id);

  // 1. público
  const pub = await call("GET", "/params/public");
  check("GET /params/public → 200", pub.status === 200);
  check("public expone presale fee", pub.body?.["service_fee.presale_clp"] === 500);

  // 2. admin params
  const list = await call("GET", "/admin/params", adminTok);
  check("GET /admin/params admin → 200", list.status === 200, `(${list.body?.length} params)`);

  const denied = await call("GET", "/admin/params", pendingTok);
  check("GET /admin/params PENDING → 403", denied.status === 403);

  const noauth = await call("GET", "/admin/params");
  check("GET /admin/params sin sesión → 401", noauth.status === 401);

  // 3. fee parametrizable: 500 → 750 → checkout lo refleja → restaurar
  const ev = await prisma.event.findFirst({
    where: { status: "PUBLISHED", presalePrice: { not: null } },
  });
  const dancer = await prisma.person.findFirst({
    where: { roles: { some: { role: "DANCER", status: "APPROVED" } } },
  });
  const dancerTok = await session(dancer.id);

  const upd = await call("PUT", "/admin/params/service_fee.presale_clp", adminTok, { value: 750 });
  check("PUT param fee=750 → 200", upd.status === 200);

  const q1 = await call("POST", "/checkout/ticket", dancerTok, { eventId: ev.id });
  check("checkout fee=750", q1.body?.quote?.serviceFee === 750, `got ${q1.body?.quote?.serviceFee}`);

  await call("PUT", "/admin/params/service_fee.presale_clp", adminTok, { value: 500 });
  // cache 30s — el segundo checkout puede seguir viendo 750
  const q2 = await call("POST", "/checkout/ticket", dancerTok, { eventId: ev.id });
  check(
    "fee restaurado o en cache (500|750)",
    [500, 750].includes(q2.body?.quote?.serviceFee),
    `got ${q2.body?.quote?.serviceFee}`,
  );

  // 4. RBAC por estado: PENDING no pasa, ruta con metadata exige APPROVED
  const checkin = await call("POST", "/checkins", pendingTok, { qr: "x" });
  check("POST /checkins STAFF PENDING → 403", checkin.status === 403);

  // 5. users + audit
  const users = await call("GET", "/admin/users", adminTok);
  check("GET /admin/users → 200", users.status === 200, `(${users.body?.length} users)`);

  const setRole = await call("POST", `/admin/users/${pending.id}/roles`, adminTok, {
    role: "STAFF",
    status: "APPROVED",
  });
  check("setRole STAFF→APPROVED → 200", setRole.status === 200);

  const approvedTok = await session(pending.id);
  const checkin2 = await call("POST", "/checkins", approvedTok, { qr: "x" });
  check("POST /checkins STAFF APPROVED → !403", checkin2.status !== 403, `got ${checkin2.status}`);

  const audit = await call("GET", "/admin/audit", adminTok);
  check("GET /admin/audit → 200", audit.status === 200, `(${audit.body?.length} rows)`);
  check("audit registró PARAM_UPDATE", audit.body?.some((a) => a.action === "PARAM_UPDATE"));

  // cleanup: el usuario smoke queda con STAFF APPROVED — revertir a PENDING
  await call("POST", `/admin/users/${pending.id}/roles`, adminTok, { role: "STAFF", status: "PENDING" });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
