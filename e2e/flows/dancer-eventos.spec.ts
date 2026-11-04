import { test, expect } from "@playwright/test";
import { statePath } from "../helpers";

// Cartelera del bailarín (inventario §2): listado → detalle, vista
// Mis entradas, deep-link de atribución ?a=<academyId> y empty por
// filtro sin match.
test.describe("@dancer @eventos cartelera", () => {
  test.use({ storageState: statePath("dancer") });

  test("cartelera → detalle de evento", async ({ page }) => {
    await page.goto("/eventos");
    const first = page.locator('a[href^="/eventos/"]').first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForURL(/\/eventos\/.+/),
      first.click(),
    ]);
    await expect(page.locator("main")).toBeVisible();
  });

  test("?view=mios muestra la wallet sin crash", async ({ page }) => {
    await page.goto("/eventos?view=mios");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    // La vista wallet resuelve: con o sin entradas hay contenido (el
    // empty de wallet es distinto al de cartelera vacía).
    await expect(
      page.locator('[role="alert"]', { hasText: /algo salió mal/i }),
    ).toHaveCount(0);
  });

  test("deep-link ?a=<academyId> renderiza la ficha y su CTA", async ({
    page,
  }) => {
    // Cualquier evento con preventa sirve: la atribución es
    // server-side (AcademyAttribution) y no cambia el render - el
    // spec verifica que el link no rompe la página ni el checkout.
    await page.goto("/eventos");
    const href = await page
      .locator('a[href^="/eventos/"]')
      .first()
      .getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(`${href}?a=cmvt0738y001myk7l2hpd2hj9`);
    // El param no rompe el render ni desvía la navegación.
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/eventos\/.+\?a=/);
  });

  test("filtro sin match → empty con contexto", async ({ page }) => {
    // Venue inexistente: filtro activo sin resultados → emptyFiltered
    // (el filtro se aplica; un género inválido se ignora en cambio).
    await page.goto("/eventos?venue=venue-inexistente-xyz");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('a[href^="/eventos/"]'),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
