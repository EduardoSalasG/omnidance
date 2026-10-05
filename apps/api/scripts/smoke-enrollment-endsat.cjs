// Smoke Enrollment.endsAt ("pagado hasta"):
//   GET /academies/enrolled expone endsAt · POST /enrollments con endsAt
//   explícito y derivación PERIOD · PATCH /enrollments/:id renueva/limpia.
// Corre contra API viva en :4000 con DB del docker-compose.
// node scripts/smoke-enrollment-endsat.cjs
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
  const muvet = await prisma.person.findUnique({ where: { email: "muvet@omnidance.dev" } });
  const dancer = await prisma.person.findUnique({ where: { email: "dancer@omnidance.dev" } });
  if (!muvet || !dancer) throw new Error("faltan personas seed");
  const muvetTok = await session(muvet.id);
  const dancerTok = await session(dancer.id);

  const academy = await prisma.academy.findFirst({ where: { ownerId: muvet.id } });
  const plans = await prisma.membershipPlan.findMany({ where: { academyId: academy.id } });
  const periodPlan = await prisma.membershipPlan.create({
    data: {
      academyId: academy.id,
      name: "Trimestre smoke",
      type: "PERIOD",
      price: 90000,
      periodDays: 90,
    },
  });
  const pack = plans.find((p) => p.type === "CLASS_PACK");

  // ─── 1. GET /academies/enrolled expone endsAt (dancer seed +25d) ───
  const enrolled = await call("GET", "/academies/enrolled", dancerTok);
  check("GET /enrolled → 200", enrolled.status === 200, `(${enrolled.status})`);
  const mine = (enrolled.body ?? []).find((e) => e.academy?.id === academy.id);
  check("enrolled trae endsAt seedeado", !!mine?.endsAt, mine?.endsAt ?? "(null)");
  check("enrolled trae startedAt", !!mine?.startedAt);

  // ─── 2. POST con endsAt explícito ───
  const guest = await prisma.person.create({
    data: { email: `smoke-ends-${Date.now()}@omnidance.dev`, name: "Smoke EndsAt" },
  });
  const explicit = "2027-03-15T12:00:00.000Z";
  const postExplicit = await call("POST", `/academies/${academy.id}/enrollments`, muvetTok, {
    personId: guest.id,
    planId: pack.id,
    endsAt: explicit,
  });
  check("POST endsAt explícito → 201", postExplicit.status === 201, `(${postExplicit.status})`);
  check(
    "endsAt persistido",
    postExplicit.body?.endsAt?.startsWith("2027-03-15"),
    postExplicit.body?.endsAt ?? "(sin campo)",
  );

  // ─── 3. POST PERIOD deriva endsAt = startedAt + periodDays ───
  const guest2 = await prisma.person.create({
    data: { email: `smoke-period-${Date.now()}@omnidance.dev`, name: "Smoke Period" },
  });
  const postPeriod = await call("POST", `/academies/${academy.id}/enrollments`, muvetTok, {
    personId: guest2.id,
    planId: periodPlan.id,
    startsAt: "2026-10-01T12:00:00.000Z",
  });
  const derived = postPeriod.body?.endsAt ? new Date(postPeriod.body.endsAt) : null;
  const expected = new Date("2026-10-01T12:00:00.000Z").getTime() + 90 * 86400000;
  check("POST PERIOD deriva endsAt", postPeriod.status === 201, `(${postPeriod.status})`);
  check(
    "endsAt = startedAt + 90d",
    derived?.getTime() === expected,
    derived?.toISOString() ?? "(null)",
  );

  // ─── 4. PATCH renueva endsAt y null lo limpia ───
  const enrId = postExplicit.body?.id;
  const renew = "2027-06-01T12:00:00.000Z";
  const patch = await call("PATCH", `/enrollments/${enrId}`, muvetTok, {
    status: "ACTIVE",
    endsAt: renew,
  });
  check("PATCH renueva endsAt", patch.status === 200 && patch.body?.endsAt?.startsWith("2027-06-01"),
    patch.body?.endsAt ?? `(${patch.status})`);
  const clear = await call("PATCH", `/enrollments/${enrId}`, muvetTok, {
    status: "ACTIVE",
    endsAt: null,
  });
  check("PATCH endsAt:null limpia", clear.status === 200 && clear.body?.endsAt === null,
    clear.body?.endsAt ?? `(${clear.status})`);

  // ─── 5. Listado staff trae endsAt ───
  const students = await call("GET", `/academies/${academy.id}/students`, muvetTok);
  const sGuest = (students.body ?? []).find((s) => s.person?.id === guest.id);
  check("students[] trae endsAt", sGuest !== undefined && "endsAt" in sGuest,
    sGuest ? `(endsAt=${sGuest.endsAt})` : "(sin fila)");

  // ─── 6. Ficha del alumno trae vigencia ───
  const detail = await call("GET", `/academies/${academy.id}/students/${guest.id}`, muvetTok);
  check("student detail trae enrollmentEndsAt",
    detail.status === 200 && "enrollmentEndsAt" in (detail.body ?? {}),
    `(endsAt=${detail.body?.enrollmentEndsAt})`);

  // limpieza: guests + plan smoke
  await prisma.enrollment.deleteMany({ where: { personId: { in: [guest.id, guest2.id] } } });
  await prisma.membershipPlan.delete({ where: { id: periodPlan.id } });
  await prisma.person.deleteMany({ where: { id: { in: [guest.id, guest2.id] } } });
}

main().finally(() => prisma.$disconnect());
