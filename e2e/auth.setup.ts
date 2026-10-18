import { test as setup, expect } from "@playwright/test";
import { USERS, PASSWORD, statePath, type Role } from "./helpers";

for (const [role, email] of Object.entries(USERS)) {
  setup(`login ${role}`, async ({ page }) => {
    // /api/auth/login está throtteado (THROTTLE_AUTH_LIMIT, default
    // 8/min por IP - spec api-hardening): re-runs seguidos del setup
    // pueden pisar la ventana y el front muestra el genericError.
    // Reintento único tras ~65s cubre el caso sin debilitar el límite.
    setup.setTimeout(180_000);

    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto("/login");
      await page.getByLabel(/correo|email|e-mail/i).fill(email);
      // Por tipo, no por label: el radio del método "Contraseña" comparte
      // el texto accesible y viola strict mode.
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.getByRole("button", { name: /entrar|iniciar|login/i }).click();
      // El redirect full-reload a /inicio compila la ruta en dev la
      // primera vez (~15s+ observado) y /inicio es una página pesada.
      const landed = await page
        .waitForURL(/\/(inicio|bienvenida)/, { timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      if (landed) break;
      const hasError = await page
        .locator("#login-error")
        .isVisible()
        .catch(() => false);
      if (!hasError || attempt === 1) {
        // Sin error visible = otra causa (navegación rota, no throttle).
        await expect(page).toHaveURL(/\/(inicio|bienvenida)/, {
          timeout: 5_000,
        });
        break;
      }
      await page.waitForTimeout(65_000);
    }
    await page.context().storageState({ path: statePath(role as Role) });
  });
}
