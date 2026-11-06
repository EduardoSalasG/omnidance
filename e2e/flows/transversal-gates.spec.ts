import { test, expect } from "@playwright/test";
import { statePath } from "../helpers";

// Gates por rol (inventario §0): una consola ajena nunca filtra datos -
// responde el estado "sin acceso" explícito o el bounce a login.
// staff@ no tiene academia ni rol ACADEMY_OWNER: mine=[] y canCreate
// false -> el gate muestra el estado forbidden con CTA de salida.
test.describe("@transversal @gates acceso por rol", () => {
  test("staff sin academia en /academia → sin acceso con salida", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: statePath("staff"),
    });
    const page = await ctx.newPage();
    await page.goto("/academia");
    await expect(
      page.getByText(/no tienes acceso/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: /inicio|home/i }).first(),
    ).toBeVisible();
    await ctx.close();
  });

  test("anon en /eventos rebota a /login?next=", async ({ page }) => {
    await page.goto("/eventos");
    await page.waitForURL(/\/login\?next=%2Feventos/, { timeout: 30_000 });
  });

  test("instructor puro en /academia → grilla de módulos, sin error+retry", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: statePath("profe"),
    });
    const page = await ctx.newPage();
    await page.goto("/academia", { waitUntil: "domcontentloaded" });
    // La grilla aparece cuando /access resuelve (regresión
    // academia-hub-instructor: el dashboard staff-gated 403 no se
    // monta para instructor puro).
    await expect(
      page.locator('[data-tour="academy-modules"]'),
    ).toBeVisible({ timeout: 30_000 });
    // Ni el error del dashboard ni el del fetch de /access (hay un
    // role=alert vacío de host en el DOM - se aserta por contenido).
    await expect(page.getByText(/algo salió mal/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /reintentar|retry/i }),
    ).toHaveCount(0);
    await ctx.close();
  });

  test("instructor en /academia/particulares ve su vista, no el gate", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: statePath("profe"),
    });
    const page = await ctx.newPage();
    await page.goto("/academia/particulares", {
      waitUntil: "domcontentloaded",
    });
    // Instructor puro: la página renderiza (listado scopeado o empty),
    // nunca el "sin acceso" del gate.
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/no tienes acceso a esta acci[oó]n/i),
    ).toHaveCount(0);
    await ctx.close();
  });
});
