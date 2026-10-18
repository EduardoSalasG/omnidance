import { defineConfig, devices } from "@playwright/test";

// Capa e2e-browser de la pirámide QA (docs/qa-flows-inventory.md).
// Specs en e2e/ - tier smoke sobre golden paths por rol.
// Requiere stack vivo: `pnpm db:up` + `pnpm db:seed` + `pnpm dev`.
// API en :4000 (pagos stub://) y web en :3000.
export default defineConfig({
  testDir: "./e2e",
  // El timeout del test debe exceder navigationTimeout: en dev la primera
  // navegación a una ruta compila (~10-60s en frío) y un goto cortado a
  // los 30s reporta ERR_ABORTED en vez de esperar el compile.
  timeout: 120_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.QA_BASE_URL ?? "http://localhost:3000",
    locale: "es-CL",
    navigationTimeout: 90_000,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
  },
  projects: [
    // Setup: genera storageState por rol (login password dev).
    // Serial: en dev Next compila al primer hit - 6 workers paralelos
    // esperaban el mismo compile y el goto expiraba (ERR_ABORTED).
    { name: "setup", testMatch: /auth\.setup\.ts/, workers: 1 },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"] },
      dependencies: ["setup"],
    },
  ],
});
