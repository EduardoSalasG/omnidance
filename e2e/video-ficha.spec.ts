import { test, expect } from "@playwright/test";

import { PASSWORD } from "./helpers";
import fs from "node:fs";

// Smoke visual de la ficha /academia/videos/[id] (change
// videos-ficha-edit): la card admin navega a la ficha, que ahora es
// página de edición (GET by-id + PATCH) con zona roja delete.
// Corre a pedido contra el dev stack vivo; login inline con gabriel
// (owner de Mambo Madness, tier PRO - el módulo videos exige PRO).
const OUT = "e2e/polish-shots";

test.describe("ficha video (edit + delete)", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  for (const vp of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1280, height: 900 },
  ]) {
    test(`${vp.name}: card → ficha edición → guardar sin cambios`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      const consoleErrors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });

      await page.goto("/login");
      await page
        .getByLabel(/correo|email|e-mail/i)
        .fill("gabriel@omnidance.dev");
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page
        .getByRole("button", { name: /entrar|iniciar|login/i })
        .click();
      await page.waitForURL(/\/(inicio|bienvenida)/, { timeout: 60_000 });
      await page
        .getByRole("button", { name: /acepto|accept|omitir|skip/i })
        .click({ timeout: 5_000 })
        .catch(() => {});

      await page.goto("/academia/videos", {
        waitUntil: "domcontentloaded",
      });
      const firstCard = page
        .locator('a[href*="/academia/videos/"]:not([href$="/nuevo"])')
        .first();
      await expect(firstCard).toBeVisible({ timeout: 30_000 });
      await firstCard.click();

      await page.waitForURL(/\/academia\/videos\/(?!nuevo$)[^/]+$/, {
        timeout: 30_000,
      });
      // Ficha = form de edición precargado + link externo + zona roja.
      const titleInput = page.locator("form input").first();
      await expect(titleInput).toBeVisible({ timeout: 30_000 });
      await expect(titleInput).not.toHaveValue("");
      await expect(
        page.getByRole("link", { name: /ver video|watch/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /eliminar|delete/i }),
      ).toBeVisible();

      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({
        path: `${OUT}/${vp.name}-videos_ficha.png`,
        fullPage: false,
      });

      // Guardar sin cambios: PATCH feliz → ActionNotice + vuelta a la
      // lista (no muta datos del seed al enviar los mismos valores).
      await page
        .getByRole("button", { name: /guardar|save/i })
        .click();
      await page.waitForURL(/\/academia\/videos$/, { timeout: 30_000 });

      // Errores de consola a archivo (patrón polish-visual): los
      // "Failed to load resource" de dev (imágenes/chunks 404) no son
      // falla del flujo - se reportan, no assertan.
      fs.writeFileSync(
        `${OUT}/console-errors-videos-ficha-${vp.name}.json`,
        JSON.stringify(consoleErrors, null, 2),
      );
      await ctx.close();
    });
  }
});
