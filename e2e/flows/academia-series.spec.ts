import { test, expect } from "@playwright/test";
import { dismissTours, statePath } from "../helpers";

// Series de la academia (inventario §8 / diseño §8 #6): crear taller
// de una fecha (spec workshop-one-off-class) → la clase materializada
// aparece en Próximas → ficha de horario → cancelar la instancia desde
// la zona roja del roster → borrado lógico de la serie al final para
// no acumular fixtures (igual criterio de limpieza que enrich).
test.describe("@academia @series taller único", () => {
  test.use({ storageState: statePath("academy") });

  test("crear taller → clase → cancelar instancia → eliminar serie", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const name = `QA Taller ${Date.now()}`;
    const date = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await page.goto("/academia/series/nueva");
    await dismissTours(page);
    await page.getByLabel(/nombre de la serie/i).fill(name);
    await page
      .getByRole("radio", { name: /taller \/ clase única/i })
      .check();
    await page.getByLabel("Fecha", { exact: true }).fill(date);
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await page.waitForURL(/\/academia\/series$/, { timeout: 30_000 });

    // La serie recién creada entra al listado → ficha.
    const card = page.getByRole("link", { name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForURL(/\/academia\/series\/.+/),
      card.click(),
    ]);
    const seriesUrl = page.url();

    // Ficha de horario del taller (el slot lleva la fecha puntual y
    // el badge "Taller"): el header muestra fecha · horas.
    const slotLink = page
      .locator('a[href*="/horarios/"]')
      .first();
    await expect(slotLink).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForURL(/\/academia\/series\/.+\/horarios\/.+/),
      slotLink.click(),
    ]);
    await expect(
      page.getByRole("heading", { name: /·/ }),
    ).toBeVisible({ timeout: 30_000 });
    await page.goto(seriesUrl);

    // La clase del taller ya está materializada en Próximas clases →
    // abre el roster.
    const classLink = page
      .locator('a[href^="/academia/clases/"]')
      .first();
    await expect(classLink).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForURL(/\/academia\/clases\/.+/),
      classLink.click(),
    ]);

    // Zona roja: cancelar la instancia (ConfirmSheet role=dialog) →
    // badge "Cancelada" en el header del roster.
    await dismissTours(page);
    await page
      .getByRole("button", { name: "Cancelar clase" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar clase" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: /clase cancelada/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Cancelada", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Limpieza: borrado lógico de la serie (zona destructiva de la
    // ficha) - queda fuera de la consola.
    await page.goto(seriesUrl);
    await page
      .getByRole("button", { name: "Eliminar", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Eliminar" })
      .click();
    await page.waitForURL(/\/academia\/series$/, { timeout: 30_000 });
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  });
});
