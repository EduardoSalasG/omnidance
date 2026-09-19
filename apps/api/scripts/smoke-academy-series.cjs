// Smoke ola academia: addSlots + reactivación con notificación + browse legacy.
// Corre contra API viva en :4000 con DB del docker-compose.
// node scripts/smoke-academy-series.cjs
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
  const series = await prisma.classSeries.findFirst({
    where: { academyId: academy.id, active: true },
    include: { slots: true },
  });
  if (!series) throw new Error("sin serie activa seed");
  console.log(`academy=${academy.name} series="${series.name}" month=${series.month} slots=${series.slots.length}`);

  // ─── 1. PATCH addSlots ───
  const before = await prisma.class.count({
    where: { slot: { seriesId: series.id } },
  });
  const add = await call("PATCH", `/academies/${academy.id}/series/${series.id}`, muvetTok, {
    addSlots: [{ weekday: 4, startTime: "21:00", endTime: "22:00" }],
  });
  check("PATCH addSlots → 200/201", add.status === 200 || add.status === 201, `(${add.status})`);
  const newSlot = (add.body?.slots ?? []).find((s) => s.startTime === "21:00");
  check("respuesta incluye slot nuevo", !!newSlot, newSlot ? `(cap=${newSlot.capacity})` : "");
  const after = await prisma.class.count({ where: { slot: { seriesId: series.id } } });
  const expected = (() => {
    const [y, m] = series.month.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const today = new Date(new Date().toISOString().slice(0, 10));
    let n = 0;
    for (let d = 1; d <= days; d++) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt >= today && dt.getUTCDay() === 4) n++;
    }
    return n;
  })();
  check("clases materializadas (date>=hoy, weekday=4)", after - before === expected, `+${after - before} esperado ${expected}`);

  // addSlots inválido: endTime <= startTime
  const bad = await call("PATCH", `/academies/${academy.id}/series/${series.id}`, muvetTok, {
    addSlots: [{ weekday: 5, startTime: "22:00", endTime: "21:00" }],
  });
  check("addSlots start>=end → 400", bad.status === 400, `(${bad.status})`);

  // addSlots idéntico → reutiliza slot, no duplica
  const dup = await call("PATCH", `/academies/${academy.id}/series/${series.id}`, muvetTok, {
    addSlots: [{ weekday: 4, startTime: "21:00", endTime: "22:00" }],
  });
  const slotsAfter = await prisma.classSlot.count({
    where: { seriesId: series.id, weekday: 4, startTime: "21:00", endTime: "22:00" },
  });
  const clsAfter = await prisma.class.count({ where: { slot: { seriesId: series.id } } });
  check("PATCH duplicado no crea slot extra", slotsAfter === 1 && dup.status === 200, `(slots=${slotsAfter})`);
  check("PATCH duplicado no duplica clases", clsAfter === after, `(${clsAfter} vs ${after})`);

  // ─── 2. notificación class.series.resumed al reactivar ───
  // enrollment ACTIVE para dancer (planId nullable en schema)
  await prisma.enrollment.deleteMany({ where: { academyId: academy.id, personId: dancer.id } });
  await prisma.enrollment.create({
    data: { academyId: academy.id, personId: dancer.id, status: "ACTIVE" },
  });
  await prisma.notification.deleteMany({ where: { personId: dancer.id, type: "class.series.resumed" } });

  const deact = await call("DELETE", `/academies/${academy.id}/series/${series.id}`, muvetTok);
  check("DELETE serie → 200", deact.status === 200, `(${deact.status})`);
  const react = await call("PATCH", `/academies/${academy.id}/series/${series.id}`, muvetTok, { active: true });
  check("PATCH active:true → 200", react.status === 200, `(${react.status})`);
  const notif = await prisma.notification.findFirst({
    where: { personId: dancer.id, type: "class.series.resumed" },
    orderBy: { createdAt: "desc" },
  });
  check(
    "notificación class.series.resumed creada",
    !!notif && notif.data?.seriesId === series.id && notif.data?.academyId === academy.id,
    notif ? `(title="${notif.title}")` : "(ninguna)",
  );

  // segundo ciclo desactivar→reactivar: no duplica la no-leída
  await call("DELETE", `/academies/${academy.id}/series/${series.id}`, muvetTok);
  await call("PATCH", `/academies/${academy.id}/series/${series.id}`, muvetTok, { active: true });
  const notifCount = await prisma.notification.count({
    where: { personId: dancer.id, type: "class.series.resumed", readAt: null },
  });
  check("segunda reactivación no duplica no-leída", notifCount === 1, `(${notifCount})`);

  // ─── 3. browse incluye clases legacy (slot sin serie) ───
  const legacySlot = await prisma.classSlot.create({
    data: {
      academyId: academy.id,
      weekday: 6,
      startTime: "11:00",
      endTime: "12:30",
      capacity: 8,
    },
  });
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const legacyClass = await prisma.class.create({
    data: { classSlotId: legacySlot.id, date: tomorrow },
  });
  const browse = await call("GET", "/classes/browse?days=14", dancerTok);
  const legacyItem = (browse.body ?? []).find((c) => c.id === legacyClass.id);
  check("browse incluye clase legacy", !!legacyItem, legacyItem ? "(series=null esperado)" : "");
  check("clase legacy con series:null", legacyItem ? legacyItem.series === null : false);

  // con filtro levelId el legacy no aplica (no tiene nivel)
  const someLevel = await prisma.classLevel.findFirst();
  if (someLevel) {
    const browseLvl = await call("GET", `/classes/browse?days=14&levelId=${someLevel.id}`, dancerTok);
    check(
      "filtro levelId excluye legacy",
      !(browseLvl.body ?? []).some((c) => c.id === legacyClass.id),
    );
  }

  // ─── cleanup: deja la data como estaba ───
  await prisma.class.delete({ where: { id: legacyClass.id } });
  await prisma.classSlot.delete({ where: { id: legacySlot.id } });
  await prisma.enrollment.deleteMany({ where: { academyId: academy.id, personId: dancer.id } });
  await prisma.notification.deleteMany({ where: { personId: dancer.id, type: "class.series.resumed" } });
  // dejar la serie activa y sin el slot de prueba 21:00
  const testSlot = await prisma.classSlot.findFirst({
    where: { seriesId: series.id, weekday: 4, startTime: "21:00" },
  });
  if (testSlot) {
    await prisma.class.deleteMany({ where: { classSlotId: testSlot.id } });
    await prisma.classSlot.delete({ where: { id: testSlot.id } });
  }
  await prisma.classSeries.update({ where: { id: series.id }, data: { active: true } });
  console.log("cleanup ok");
}

main()
  .catch((e) => {
    console.error("SMOKE ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
