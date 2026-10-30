import { test, expect } from "@playwright/test";
import { statePath } from "./helpers";

// Smoke del estándar `unified-action-notice`: el aviso post-acción es
// el ActionNotice fijo ([role="status"|"alert"] sobre la BottomNav);
// el global (showActionNotice) sobrevive la navegación al listado.

const NOTICE = '[role="status"], [role="alert"]';

test.describe("dancer: notice local tras guardar perfil", () => {
  test.use({ storageState: statePath("dancer") });

  test("guardar datos personales muestra el aviso", async ({ page }) => {
    await page.goto("/perfil/datos");
    // "Editar" abre el form inline; recién ahí existe "Guardar".
    await page
      .getByRole("button", { name: /editar|edit/i })
      .first()
      .click();
    await page
      .getByRole("button", { name: /guardar|save/i })
      .click();
    await expect(page.locator(NOTICE).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("academia: notice global tras crear (navega al listado)", () => {
  test.use({ storageState: statePath("academy") });

  test("crear taller muestra el toast en el listado destino", async ({
    page,
  }) => {
    await page.goto("/academia/series/nueva");
    await page
      .getByLabel(/nombre|name/i)
      .first()
      .fill("Taller PW");
    // Selector de tipo: modo taller = fecha única (radio/checkbox).
    await page
      .getByRole("radio", { name: /taller|única|one.?off/i })
      .check()
      .catch(() =>
        page.getByText(/taller \/ clase única/i).click(),
      );
    const day = new Date(Date.now() + 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await page.locator('input[type="date"]').first().fill(day);
    const times = page.locator('input[type="time"]');
    await times.nth(0).fill("19:00");
    await times.nth(1).fill("21:00");
    await page
      .getByRole("button", { name: /crear|create|guardar/i })
      .last()
      .click();
    // El listado destino monta el toast vía host global.
    await expect(page.locator(NOTICE).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
