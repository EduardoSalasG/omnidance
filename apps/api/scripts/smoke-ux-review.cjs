// Smoke UX post-review de consola academia por tier (2026-11-05).
// Requiere web :3000 + API :4000. Login por password dev.
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:3000";
const PASSWORD = "omnidance123";
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);

async function login(page, email) {
  // /api/auth/login throtteado 8/min por IP: un reintento tras ~65s
  // cubre el caso (mismo patrón que e2e/auth.setup.ts).
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    // Sin este wait el click cae antes de hidratar y el form hace GET
    // a /login? (submit nativo) en vez del POST /api/auth/login.
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/correo|email|e-mail/i).fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /entrar|iniciar|login/i }).click();
    const landed = await page
      .waitForURL(/\/(inicio|bienvenida)/, { timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    if (landed) return;
    if (attempt === 1) throw new Error(`login no resolvió para ${email}`);
    await page.waitForTimeout(65_000);
  }
}

const hasText = (page, re) => page.getByText(re).first().isVisible({ timeout: 8000 }).catch(() => false);
const drawer = async (page) => {
  // El chrome desktop lista el sidebar (lg+). Viewport 1280.
  return page.locator("nav, aside, [data-tour='app-sidebar']").first();
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // ─── gabriel@ PRO (Mambo Madness) ───
  await login(page, "gabriel@omnidance.dev");
  // P0 corregido: /crm no debe ser paywall para owner PRO.
  await page.goto(`${BASE}/crm`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  ok("PRO /crm sin paywall", !(await hasText(page, /parte del plan|sube de tier/i)));
  // Inicio: selector de academia presente? (gabriel tiene 1 academia + puede crear por PRO)
  await page.goto(`${BASE}/inicio`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  ok("PRO /inicio tiene selector academia", await page.locator("select").first().isVisible({ timeout: 5000 }).catch(() => false));
  ok("PRO /inicio sin toggle Simplificado", !(await hasText(page, /Simplificado/i)));
  // Nueva academia alcanzable (multiAcademy PRO)
  await page.goto(`${BASE}/academia/nueva`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  ok("PRO /academia/nueva sin paywall", !(await hasText(page, /parte del plan/i)));

  // ─── tumbao@ COBROS ───
  const page2 = await ctx.newPage();
  await login(page2, "tumbao@omnidance.dev");
  await page2.waitForTimeout(1500);
  const body = await page2.locator("body").innerText();
  ok("COBROS drawer sin Series/Equipo/Videos/CRM", !/Series|Equipo|Videos|Segmentos/i.test(body));
  await page2.goto(`${BASE}/academia/configuracion`, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(1500);
  ok("COBROS /configuracion → perfil", /perfil/.test(page2.url()));
  await page2.goto(`${BASE}/academia/series`, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(1500);
  ok("COBROS /series paywall", await hasText(page2, /parte del plan/i));
  await page2.goto(`${BASE}/academia/cobros`, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(2000);
  ok("COBROS /cobros sin botón Reporte", !(await page2.locator('a[href*="cobros/reporte"], button:has-text("Reporte")').first().isVisible({ timeout: 3000 }).catch(() => false)));
  ok("COBROS /cobros sin historial", !(await hasText(page2, /Historial de cobros/i)));

  // ─── muvet@ STUDIO ───
  const page3 = await ctx.newPage();
  await login(page3, "muvet@omnidance.dev");
  await page3.waitForTimeout(2000);
  const body3 = await page3.locator("body").innerText();
  ok("STUDIO drawer con Series+Equipo, sin Videos/CRM", /Series/i.test(body3) && !/Videos|Segmentos/i.test(body3));
  await page3.goto(`${BASE}/academia/videos`, { waitUntil: "domcontentloaded" });
  await page3.waitForTimeout(1500);
  ok("STUDIO /videos paywall tier", await hasText(page3, /parte del plan/i));
  await page3.goto(`${BASE}/academia/configuracion/niveles`, { waitUntil: "domcontentloaded" });
  await page3.waitForTimeout(1500);
  ok("STUDIO niveles accesible", !(await hasText(page3, /parte del plan/i)));

  await browser.close();
  console.log(results.join("\n"));
  const fails = results.filter((r) => r.startsWith("FAIL"));
  console.log(`\n${results.length - fails.length}/${results.length} PASS`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error("SMOKE_ERROR", e);
  process.exit(1);
});
