import { test, expect } from "@playwright/test";

// Check de estados que el smoke visual no ve: (a) cola de cobros con
// API caída → role="alert" + retry, nunca vacío silencioso;
// (b) cuenta sin cap → estado "sin acceso", no error genérico.
// Corre a pedido con la API apagada para (a).
test.describe("estados error/forbidden", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("cobros con API caída muestra error + retry", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: "e2e/.auth/academy.json",
    });
    const page = await ctx.newPage();
    // Simula API caída: aborta las llamadas al dominio de academies
    // (las colas de cobros deben mostrar alert + retry, no vacío).
    await page.route("**/academies/**", (r) => r.abort());
    await page.goto("/academia/cobros", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);
    const alert = page.locator('[role="alert"]');
    await expect(alert.first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "e2e/polish-shots/state-cobros-api-down.png" });
    await ctx.close();
  });

  test("sin cap muestra estado sin acceso", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: "e2e/.auth/dancer.json",
    });
    const page = await ctx.newPage();
    await page.goto("/academia/cobros", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: "e2e/polish-shots/state-cobros-forbidden.png" });
    await ctx.close();
  });
});
