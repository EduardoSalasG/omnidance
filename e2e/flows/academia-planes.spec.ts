import { test, expect } from "@playwright/test";
import { dismissTours, statePath } from "../helpers";

// Planes de membresía (inventario §8 / diseño §8 #15): crear plan →
// ficha → desactivar/reactivar (PATCH active) con reflejo en el
// estado de la ficha.
test.describe("@academia @planes membresías", () => {
  test.use({ storageState: statePath("academy") });

  test("crear plan → desactivar y reactivar en la ficha", async ({
    page,
  }) => {
    const name = `QA Plan ${Date.now()}`;

    await page.goto("/academia/planes/nueva");
    await dismissTours(page);
    // Esperar la hidratación del form: en WebKit un click previo puede
    // caer en el botón SSR sin handler (no navega ni postea).
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/nombre del plan/i).fill(name);
    await page.getByLabel(/precio/i).fill("15000");
    await page
      .getByRole("button", { name: "Crear", exact: true })
      .click();
    await expect(page).toHaveURL(/\/academia\/planes$/, {
      timeout: 30_000,
    });

    // El listado pagina (pageSize 12, sort por nombre): con >=12
    // planes el nuevo puede caer en otra página - se filtra por q.
    await page.getByRole("searchbox").fill(name);
    const card = page.getByRole("link", { name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(page).toHaveURL(/\/academia\/planes\/.+/, {
      timeout: 30_000,
    });

    await page
      .getByRole("button", { name: "Desactivar plan" })
      .click();
    await expect(page.getByText("Inactivo")).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: "Reactivar plan" })
      .click();
    await expect(
      page.getByRole("button", { name: "Desactivar plan" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Inactivo")).toHaveCount(0);
  });
});
