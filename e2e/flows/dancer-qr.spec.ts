import { test, expect } from "@playwright/test";
import { dismissTours, statePath } from "../helpers";

// Mi QR (inventario §3 / diseño §8 #14): el canvas del QR rotativo
// aparece en modo "mio"; fallo del mint (/qr/mine 500) muestra error
// + retry conservando el canvas montado, y el retry recupera.
test.describe("@dancer @qr mi qr", () => {
  test.use({ storageState: statePath("dancer") });

  test("canvas del QR visible en modo mio", async ({ page }) => {
    await page.goto("/qr?modo=mio");
    await dismissTours(page);
    await expect(
      page.getByRole("img", { name: "Mi QR" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("mint 500 muestra alert + retry y recupera", async ({ page }) => {
    await page.route("**/api/qr/mine", (route) =>
      route.fulfill({ status: 500 }),
    );
    await page.goto("/qr?modo=mio");
    await dismissTours(page);
    // role="alert" también lo usa el announcer de rutas de Next:
    // filtrar por el texto del estado de error del componente.
    const alert = page
      .getByRole("alert")
      .filter({ hasText: /no pudimos generar tu qr/i });
    await expect(alert).toBeVisible({ timeout: 30_000 });
    // El canvas queda montado durante el error (el último QR sigue
    // siendo escaneable mientras el re-mint falla): todavía sin QR
    // dibujado puede medir 0px - attached, no visible.
    await expect(
      page.getByRole("img", { name: "Mi QR" }),
    ).toBeAttached();

    await page.unroute("**/api/qr/mine");
    await page.getByRole("button", { name: /reintentar/i }).click();
    await expect(alert).toHaveCount(0, { timeout: 30_000 });
  });
});
