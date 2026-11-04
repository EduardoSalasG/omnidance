import { test, expect } from "@playwright/test";
import { USERS, PASSWORD } from "./helpers";
import fs from "node:fs";

// Smoke visual del polish de consola academia (spec
// academy-console-views-polish): recorre las secciones pulidas en
// viewport mobile (390) y desktop (1280), captura screenshot por
// página/viewport y colecta errores de consola JS. No es un spec de
// CI: corre a pedido contra el dev stack vivo.
const PAGES = [
  "/academia/alumnos",
  "/academia/planes",
  "/academia/promos",
  "/academia/cobros",
  "/academia/preventas",
  "/academia/equipo",
  "/academia/videos",
  "/academia/configuracion/clases",
  "/academia/configuracion/niveles",
  "/academia/configuracion/metodos-de-pago",
  "/academia/configuracion/perfil",
  "/academia/configuracion/apariencia",
  "/academia/configuracion/importar",
  "/academia/configuracion/suscripcion",
  "/academia/niveles", // redirect → configuracion/niveles
  "/academia/configuracion/general", // redirect → clases
  "/academia/configuracion/pagos", // redirect → metodos-de-pago
  "/academia/suscripcion", // redirect → configuracion/suscripcion
  "/analitica",
  "/analitica/usuarios",
  "/academia/configuracion/niveles/nuevo",
] as const;

const OUT = "e2e/polish-shots";

test.describe("polish visual academy console", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  for (const vp of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1280, height: 900 },
  ]) {
    test(`${vp.name}: recorrido`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      const consoleErrors: Record<string, string[]> = {};

      await page.goto("/login");
      await page.getByLabel(/correo|email|e-mail/i).fill(USERS.academy);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page
        .getByRole("button", { name: /entrar|iniciar|login/i })
        .click();
      await page.waitForURL(/\/(inicio|bienvenida)/, {
        timeout: 60_000,
      });
      // Descartar tour/banner si aparece.
      await page
        .getByRole("button", { name: /acepto|accept|omitir|skip/i })
        .click({ timeout: 5_000 })
        .catch(() => {});

      for (const path of PAGES) {
        consoleErrors[path] = [];
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors[path].push(m.text());
        });
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2_500);
        const name =
          `${vp.name}-` +
          path.replace(/\/academia\/?/, "").replace(/\//g, "_") || "home";
        fs.mkdirSync(OUT, { recursive: true });
        await page.screenshot({
          path: `${OUT}/${name}.png`,
          fullPage: false,
        });
      }
      fs.writeFileSync(
        `${OUT}/console-errors-${vp.name}.json`,
        JSON.stringify(consoleErrors, null, 2),
      );
      await ctx.close();
    });
  }
});
