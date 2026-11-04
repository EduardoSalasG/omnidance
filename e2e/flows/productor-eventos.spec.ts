import { test, expect } from "@playwright/test";
import { dismissTours, statePath } from "../helpers";

// Ciclo de vida del evento del productor (inventario §4 - diseño §8
// #9): crear DRAFT → ficha → publicar → aparece en la cartelera
// pública + copiar el link público /e/<id> de captación. Absorbe el
// describe "productor: ciclo de vida" del smoke (borrado de
// smoke.spec.ts en el mismo commit).
test.describe("@productor @eventos ciclo de vida", () => {
  test.use({ storageState: statePath("producer") });
  // El assert del link copiado lee el clipboard real - sin el permiso
  // la API rechaza y la página mostraría el aviso de error.
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("crear → publicar → cartelera + copiar link público", async ({
    page,
  }) => {
    const name = `QA Evento ${Date.now()}`;

    await page.goto("/productor/eventos/nuevo");
    await dismissTours(page);
    await page.getByLabel(/nombre|name/i).first().fill(name);
    const start = new Date(Date.now() + 864e5);
    const end = new Date(start.getTime() + 5 * 3600e3);
    const iso = (d: Date) => d.toISOString().slice(0, 16);
    await page.locator('input[type="datetime-local"]').nth(0).fill(iso(start));
    await page.locator('input[type="datetime-local"]').nth(1).fill(iso(end));
    await page
      .getByRole("button", { name: /crear|guardar/i })
      .first()
      .click();
    await expect(page).toHaveURL(/productor\/eventos/, { timeout: 15_000 });

    // La card completa es el link (mismo aprendizaje del smoke:
    // getByText puede pisar otro nodo con el nombre).
    await page.getByRole("link", { name }).first().click();
    await expect(page).toHaveURL(/productor\/eventos\/.+/, {
      timeout: 30_000,
    });
    const eventId = page.url().match(/productor\/eventos\/([^/?]+)/)?.[1];
    expect(eventId).toBeTruthy();

    // DRAFT → publicar. Esperar el commit del POST antes de navegar:
    // salir antes cancela el publish in-flight.
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect(page.getByText(/evento publicado/i)).toBeVisible({
      timeout: 15_000,
    });

    // Link público de captación (/e/<id>): copia real al portapapeles.
    await page
      .getByRole("button", { name: /copiar link público/i })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: /link público copiado/i }),
    ).toBeVisible({ timeout: 15_000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(new RegExp(`/e/${eventId}$`));

    // En la cartelera pública.
    await page.goto("/eventos");
    await expect(page.getByText(name).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
