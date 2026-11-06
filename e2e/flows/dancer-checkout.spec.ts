import { test, expect } from "@playwright/test";
import { statePath } from "../helpers";

// Checkout de preventa con stub:// (inventario §2): el pago se
// simula con los botones dev "Simular aprobado/fallido" que disparan
// el webhook desde la propia página. PAID → fase success + entrada en
// Mis entradas; FAILED → role=alert + retry.
// PRECONDICIÓN: la API debe correr con gateway stub (sin
// PAYMENT_GATEWAY=flow / sin FLOW_API_KEY). Con Flow real el POST de
// la orden sale 500 (rechaza los emails *@omnidance.dev) y el form no
// avanza a "esperando confirmación".
test.describe("@dancer @checkout preventa stub", () => {
  test.use({ storageState: statePath("dancer") });

  async function openCheckout(page: import("@playwright/test").Page) {
    // Evento con preventa ABIERTA del seed (Viernes Sabroso, vie 7
    // nov): directo al checkout - la ficha/CTA la cubre dancer-eventos.
    // Ojo: si el seed envejece y la preventa cierra, el POST de la
    // orden falla y el form no avanza a "esperando confirmación".
    await page.goto("/eventos/cmubd9oq200n213hetp2cx88h/checkout");
    await expect(
      page.getByRole("button", { name: /ir a pagar|pagar|pay/i }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: /ir a pagar|pagar|pay/i })
      .click();
    // Esperando confirmación + panel de simulación dev (solo stub://).
    await expect(
      page.getByText(/esperando confirmación del pago/i),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: /simular aprobado/i }),
    ).toBeVisible();
  }

  test("pago PAID → success + entrada en Mis entradas", async ({
    page,
  }) => {
    await openCheckout(page);
    await page
      .getByRole("button", { name: /simular aprobado/i })
      .click();
    await expect(
      page.getByText(/pago confirmado|entrada.*lista/i),
    ).toBeVisible({ timeout: 30_000 });
    await page.goto("/eventos?view=mios");
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    // La wallet tiene al menos una entrada tras el PAID.
    await expect(
      page.locator('a[href^="/eventos/"]').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("pago FAILED → error con retry al form", async ({ page }) => {
    await openCheckout(page);
    await page
      .getByRole("button", { name: /simular fallido/i })
      .click();
    await expect(
      page.locator('[role="alert"]').filter({ hasText: /no se completó/i }),
    ).toBeVisible({ timeout: 30_000 });
    // Retry devuelve al form con el CTA de pago.
    await page
      .getByRole("button", { name: /ir a pagar|pagar|pay/i })
      .click();
    await expect(
      page.getByRole("button", { name: /ir a pagar|pagar|pay/i }),
    ).toBeVisible();
  });
});
