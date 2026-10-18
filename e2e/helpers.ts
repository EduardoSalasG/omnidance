import path from "node:path";

// Fixture de sesión: login con password dev de las personas seed
// (*@omnidance.dev / omnidance123 - ver docs/qa-flows-inventory.md §0).
// auth.setup.ts genera e2e/.auth/<rol>.json consumido por los specs
// via storageState. La magic-link/OTP queda fuera del smoke (se prueba
// aparte por API).
// Vive en módulo aparte: Playwright prohíbe que un spec importe otro
// test file ("test file should not import test file").

export const USERS = {
  dancer: "dancer@omnidance.dev",
  producer: "carlos@omnidance.dev",
  academy: "muvet@omnidance.dev",
  admin: "admin@omnidance.dev",
  staff: "staff@omnidance.dev",
  soporte: "soporte@omnidance.dev",
} as const;

export type Role = keyof typeof USERS;

export const PASSWORD = "omnidance123";

const authDir = path.join(__dirname, ".auth");
export const statePath = (role: Role) => path.join(authDir, `${role}.json`);
