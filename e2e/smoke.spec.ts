import { test, expect } from "@playwright/test";
import { statePath } from "./helpers";

// Tier smoke de golden paths (docs/qa-flows-inventory.md).

test.describe("@smoke dancer: descubrimiento", () => {
  test.use({ storageState: statePath("dancer") });

  test("cartelera lista → filtros → detalle sin crash", async ({ page }) => {
    await page.goto("/eventos");
    await expect(page).toHaveURL(/eventos/);
    // View mios (wallet) no debe crashear ni mostrar error.
    await page.goto("/eventos?view=mios");
    await expect(page.locator("main")).toBeVisible();
    // Primer evento de la cartelera → detalle. waitForURL con el click:
    // en dev la navegación RSC puede estar pending y un expect(URL)
    // suelto agota el timeout con el click ya tragado por la transición.
    await page.goto("/eventos");
    const first = page.locator('a[href^="/eventos/"]').first();
    await expect(first).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/eventos\/.+/),
      first.click(),
    ]);
  });
});

test.describe("@smoke admin: /admin/datos conmuta entidades", () => {
  test.use({ storageState: statePath("admin") });

  test("cambiar de píldora con datos cargados no crashea", async ({
    page,
  }) => {
    await page.goto("/admin/datos");
    // Scoped a <main>: en mobile el nav lateral queda off-canvas y su
    // <ul>/<li> resuelve hidden - el bare "ul li" lo encuentra primero.
    await expect(page.locator("main ul li").first()).toBeVisible({
      timeout: 30_000,
    });
    // Solo las pills de entidad (PillTabs → role="tab"). Cualquier
    // getByRole("button") arrastra el "Guardar consulta" deshabilitado y
    // los verify/convert de las filas - el bug RangeError de 2026-10-18
    // se cubre igual: es el cambio de entidad con rows cargadas.
    for (const pill of await page.getByRole("tab").all()) {
      await pill.click();
      // La lista recarga por effect - esperar a que la fase resuelva
      // (rows nuevas o empty) antes de seguir con la siguiente pill.
      await page
        .locator("main ul li")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {});
      await expect(page.locator("body")).not.toContainText(
        "Invalid time value",
      );
    }
  });
});

// El describe de productor migró a flows/productor-eventos.spec.ts
// (crear→publicar→cartelera + copiar link público).
