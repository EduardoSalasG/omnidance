import { test, expect } from "@playwright/test";
import { dismissTours, statePath } from "../helpers";

// Soporte (inventario §10 / diseño §8 #13): búsqueda con mínimo 2
// caracteres → resultados → ficha read-only del usuario → volver a
// la lista sin re-buscar. Superficie de solo lectura: la ficha no
// ofrece acciones de mutación.
test.describe("@soporte @buscar búsqueda de usuarios", () => {
  test.use({ storageState: statePath("soporte") });

  test("buscar → ficha → volver a resultados", async ({ page }) => {
    await page.goto("/soporte");
    await dismissTours(page);
    const box = page.getByRole("searchbox");
    await expect(box).toBeVisible({ timeout: 30_000 });

    // <2 chars no dispara búsqueda: hint visible.
    await box.fill("d");
    await expect(
      page.getByText("Escribe al menos 2 letras"),
    ).toBeVisible();

    await box.fill("dancer@omnidance.dev");
    const first = page
      .getByRole("button", { name: /dancer@omnidance\.dev/i })
      .first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();

    // Ficha read-only: datos + secciones; sin botones de mutación.
    await expect(
      page.getByRole("heading", { name: "Datos" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Roles" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: /volver a los resultados/i })
      .click();
    await expect(first).toBeVisible({ timeout: 15_000 });
  });
});
