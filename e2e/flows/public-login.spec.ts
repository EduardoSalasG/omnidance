import { test, expect } from "@playwright/test";
import { USERS, PASSWORD } from "../helpers";

// Flujo de autenticación en sí (inventario §1): corre SIN storageState
// - un contexto con sesión pre-armada no ejercita el login. Las rutas
// de la app que no son públicas rebotan a /login?next=<original>
// (middleware.ts).
test.describe("@public @login autenticación", () => {
  test("password login → /inicio", async ({ page }) => {
    await page.goto("/login");
    // Esperar la hidratación: en WebKit un fill previo puede ser pisado
    // por el render del form controlado (campo queda vacío).
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/correo|email|e-mail/i).fill(USERS.dancer);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page
      .getByRole("button", { name: /entrar|iniciar|login/i })
      .click();
    // toHaveURL (poll de la URL) en vez de waitForURL: el login navega
    // con window.location y esperar "load" expira si algún subrecurso
    // se demora bajo carga paralela.
    await expect(page).toHaveURL(/\/(inicio|bienvenida)/, {
      timeout: 60_000,
    });
  });

  test("anon → ruta protegida rebota a /login?next= y vuelve tras login", async ({
    page,
  }) => {
    await page.goto("/eventos");
    await page.waitForURL(/\/login\?next=/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/correo|email|e-mail/i).fill(USERS.dancer);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page
      .getByRole("button", { name: /entrar|iniciar|login/i })
      .click();
    await expect(page).toHaveURL(/\/eventos/, { timeout: 60_000 });
  });

  test("credenciales inválidas → role=alert sin navegar", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/correo|email|e-mail/i).fill(USERS.dancer);
    await page.locator('input[type="password"]').fill("clave-mala-123");
    await page
      .getByRole("button", { name: /entrar|iniciar|login/i })
      .click();
    await expect(page.locator("#login-error")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout → vuelve a la landing pública", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/correo|email|e-mail/i).fill(USERS.dancer);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page
      .getByRole("button", { name: /entrar|iniciar|login/i })
      .click();
    await expect(page).toHaveURL(/\/(inicio|bienvenida)/, {
      timeout: 60_000,
    });
    await page.goto("/perfil");
    await page
      .getByRole("button", { name: /salir|cerrar sesi[oó]n|log ?out/i })
      .click();
    // window.location a "/" - sin sesión el middleware sirve la landing.
    await page.waitForURL(/\/$/, { timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: /entrar|iniciar|login/i }).first(),
    ).toBeVisible();
  });
});
