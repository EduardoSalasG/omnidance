// Smoke private-lesson-product - corre contra API viva en :4000.
// node scripts/smoke-private-lesson.cjs
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
  const academy = await prisma.academy.findFirst({
    where: { name: "MuéveteOnTour" },
  });
  if (!academy) throw new Error("sin MuéveteOnTour en seed");
  console.log(`academy=${academy.id} privateLessonPrice=${academy.privateLessonPrice}`);

  const dancer = await prisma.person.findFirst({
    where: { email: "daniela@omnidance.dev" },
  });
  const owner = await prisma.person.findUnique({
    where: { id: academy.ownerId },
  });
  const instructorLink = await prisma.academyInstructor.findFirst({
    where: { academyId: academy.id },
  });
  const dancerTok = await session(dancer.id);
  const ownerTok = await session(owner.id);

  // Perfil público expone el precio
  const profile = await call("GET", `/academies/${academy.id}/profile`, dancerTok);
  check("profile expone privateLessonPrice", profile.status === 200 && profile.body.privateLessonPrice === 25000, JSON.stringify(profile.body?.privateLessonPrice));

  // Quote
  const quote = await call("GET", `/checkout/private-class-quote?academyId=${academy.id}`, dancerTok);
  check("quote 200 con academy+price+total", quote.status === 200 && quote.body.academy?.id === academy.id && quote.body.listPrice === 25000 && quote.body.total === 25500, JSON.stringify(quote.body));

  // Academia sin precio → 400 (crear una temporal)
  const noSell = await prisma.academy.create({
    data: { name: `smoke-nosell-${Date.now()}`, ownerId: owner.id },
  });
  const quoteNoSell = await call("GET", `/checkout/private-class-quote?academyId=${noSell.id}`, dancerTok);
  check("academia sin privateLessonPrice → 400", quoteNoSell.status === 400, String(quoteNoSell.status));
  await prisma.academy.delete({ where: { id: noSell.id } });

  // Purchase → orden PENDING PRIVATE con refId pvt_
  const order = await call("POST", "/checkout/private-class", dancerTok, { academyId: academy.id });
  check("POST /checkout/private-class → 201 + paymentUrl", (order.status === 201 || order.status === 200) && !!order.body.paymentUrl, `${order.status} ${order.body?.paymentUrl ?? JSON.stringify(order.body)}`);
  const payment = order.body.paymentId
    ? await prisma.payment.findUnique({ where: { id: order.body.paymentId } })
    : await prisma.payment.findFirst({ where: { orderType: "PRIVATE", personId: dancer.id }, orderBy: { createdAt: "desc" } });
  check("Payment PRIVATE + refId pvt_", payment?.orderType === "PRIVATE" && payment.refId.startsWith(`pvt_${academy.id}_`), payment?.refId);

  // Alumno no puede crear clase manual (staff-only)
  const manual = await call("POST", `/academies/${academy.id}/private-lessons`, dancerTok, {
    instructorId: instructorLink.personId,
    scheduledAt: "2026-10-01T20:00:00Z",
  });
  check("POST private-lessons alumno → 403", manual.status === 403, String(manual.status));

  // Lección comprada sin asignar → owner assign → CONFIRMED
  const purchased = await prisma.privateLesson.create({
    data: {
      academyId: academy.id,
      personId: dancer.id,
      instructorId: null,
      scheduledAt: null,
      price: 25000,
      status: "REQUESTED",
    },
  });
  const assign = await call("PATCH", `/private-lessons/${purchased.id}`, ownerTok, {
    action: "assign",
    instructorId: instructorLink.personId,
    scheduledAt: "2026-10-05T20:00:00Z",
  });
  check("assign owner → 200 CONFIRMED", assign.status === 200 && assign.body.status === "CONFIRMED" && assign.body.instructorId === instructorLink.personId, `${assign.status} ${JSON.stringify(assign.body?.status)}`);

  const notif = await prisma.notification.findFirst({
    where: { personId: dancer.id, type: "academy.private_lesson.assigned" },
  });
  check("notificación al alumno", !!notif);

  // Instructor no asigna
  const instructorTok = await session(instructorLink.personId);
  const pending2 = await prisma.privateLesson.create({
    data: { academyId: academy.id, personId: dancer.id, instructorId: null, scheduledAt: null, price: 25000, status: "REQUESTED" },
  });
  const assignNo = await call("PATCH", `/private-lessons/${pending2.id}`, instructorTok, {
    action: "assign",
    instructorId: instructorLink.personId,
    scheduledAt: "2026-10-06T20:00:00Z",
  });
  check("assign instructor → 403", assignNo.status === 403, String(assignNo.status));

  // Limpieza
  await prisma.privateLesson.deleteMany({ where: { id: { in: [purchased.id, pending2.id] } } });
  await prisma.notification.deleteMany({ where: { personId: { in: [dancer.id, instructorLink.personId] }, type: "academy.private_lesson.assigned" } });
  await prisma.$disconnect();
  console.log("smoke done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
