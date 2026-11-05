// Smoke automatizado de tier gates (verificación del change
// tier-gates-audit-fixes). Corre contra el stack dev vivo:
//
//   cd apps/api && node scripts/smoke-tier-gates.cjs
//
//   BASE_URL=http://localhost:3000  (default)
//   SMOKE_PASSWORD=omnidance123     (password de las personas seed)
//
// Qué verifica (browser headless, chromium):
//   A) P0 AcademyTierGate: instructora de academia STUDIO abre
//      /academia/series y ve contenido - el gate usa academy.tier, no
//      los entitlements del owner (bug P0 del 2026-11-05).
//   B) Roster paywall: owner de academia COBROS abre
//      /academia/clases/[id] y ve TierPaywall (feature attendance,
//      requiredTier Studio) cuando GET /classes/:id/roster responde
//      403 tier.required - no el forbidden genérico.
//
// El fixture COBROS (serie+slot+clase para hoy) se crea al inicio con
// nombre "SMOKE tier-gate roster" y se borra al final - el script es
// idempotente y no deja residuo. La academia COBROS se toma por tier,
// no por nombre.
const { chromium } = require("@playwright/test");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "omnidance123";
const FIXTURE_NAME = "SMOKE tier-gate roster";

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
};

async function login(page, email) {
  await page.goto(`${BASE}/es-CL/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /entrar|iniciar|login/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), {
    timeout: 20_000,
  });
}

async function pickAcademy(page, academyId) {
  await page.evaluate(
    (id) => window.localStorage.setItem("omnidance:academy-id", id),
    academyId
  );
}

/** Serie+slot+clase de hoy en una academia COBROS (owner como profe). */
async function createFixture() {
  const academy = await prisma.academy.findFirst({
    where: { tier: "COBROS" },
    select: { id: true, ownerId: true, name: true },
  });
  if (!academy) throw new Error("no hay academia COBROS en la DB");
  const owner = await prisma.person.findUnique({
    where: { id: academy.ownerId },
    select: { email: true },
  });
  if (!owner?.email) throw new Error("owner COBROS sin email");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const series = await prisma.classSeries.create({
    data: {
      academyId: academy.id,
      name: FIXTURE_NAME,
      month: today.toISOString().slice(0, 7),
      instructorId: academy.ownerId,
    },
  });
  const slot = await prisma.classSlot.create({
    data: {
      academyId: academy.id,
      seriesId: series.id,
      weekday: today.getUTCDay(),
      startTime: "20:00",
      endTime: "21:00",
      instructorId: academy.ownerId,
    },
  });
  const cls = await prisma.class.create({
    data: { classSlotId: slot.id, date: today, instructorId: academy.ownerId },
  });
  return { academy, ownerEmail: owner.email, seriesId: series.id, slotId: slot.id, classId: cls.id };
}

async function deleteFixture(fx) {
  await prisma.class.deleteMany({ where: { classSlotId: fx.slotId } });
  await prisma.classSlot.deleteMany({ where: { seriesId: fx.seriesId } });
  await prisma.classSeries.deleteMany({ where: { id: fx.seriesId } });
}

(async () => {
  const fx = await createFixture();
  console.log(`fixture: ${fx.academy.name} (COBROS) · clase ${fx.classId} · owner ${fx.ownerEmail}`);
  try {
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();

    // ── A) P0: instructora de STUDIO en /academia/series ──
    // La Gozadera es STUDIO y profe@omnidance.dev es instructora suya.
    const profe = await prisma.person.findUnique({
      where: { email: "profe@omnidance.dev" },
      select: { id: true },
    });
    const studio = await prisma.academy.findFirst({
      where: { tier: "STUDIO", instructors: { some: { personId: profe?.id ?? "?" } } },
      select: { id: true, name: true },
    });
    if (!studio) throw new Error("profe no es instructora de ninguna STUDIO");
    await login(page, "profe@omnidance.dev");
    await pickAcademy(page, studio.id);
    await page.goto(`${BASE}/es-CL/academia/series`);
    await page.waitForFunction(
      () => !/cargando|loading/i.test(document.body.innerText) || document.body.innerText.length > 500,
      null,
      { timeout: 60_000 }
    );
    await page.waitForLoadState("networkidle");
    const bodyA = await page.locator("body").innerText();
    ok(
      !/de un plan superior/i.test(bodyA),
      "P0: instructora STUDIO sin paywall en /academia/series"
    );
    ok(
      !/Esta vista es para/i.test(bodyA),
      "P0: sin forbidden genérico en /academia/series"
    );

    // ── B) owner COBROS en ficha de clase → TierPaywall ──
    const page2 = await (await browser.newContext()).newPage();
    await login(page2, fx.ownerEmail);
    await pickAcademy(page2, fx.academy.id);
    await page2.goto(`${BASE}/es-CL/academia/clases/${fx.classId}`);
    // Espera estado terminal: en next dev la primera visita compila la
    // página y el roster llega después del networkidle inicial.
    await page2.waitForFunction(
      () =>
        /plan superior|Esta vista es para|no se encontró|error/i.test(
          document.body.innerText
        ),
      null,
      { timeout: 60_000 }
    );
    const bodyB = await page2.locator("body").innerText();
    ok(
      /Asistencia es de un plan superior/i.test(bodyB),
      "Roster: TierPaywall visible en clase COBROS"
    );
    ok(
      /Parte del plan Studio/i.test(bodyB),
      "Roster: paywall indica requiredTier Studio"
    );
    ok(
      !/Esta vista es para instructores/i.test(bodyB),
      "Roster: no cae al forbidden genérico"
    );

    await browser.close();
  } finally {
    await deleteFixture(fx);
    await prisma.$disconnect();
  }
  process.exit(failures ? 1 : 0);
})().catch(async (e) => {
  console.error("SMOKE ERROR:", e.message);
  await prisma.$disconnect();
  process.exit(2);
});
