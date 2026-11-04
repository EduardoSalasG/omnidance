import path from "node:path";
import { request } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

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
  profe: "profe@omnidance.dev",
  admin: "admin@omnidance.dev",
  staff: "staff@omnidance.dev",
  soporte: "soporte@omnidance.dev",
} as const;

export type Role = keyof typeof USERS;

export const PASSWORD = "omnidance123";

export const API_URL = process.env.QA_API_URL ?? "http://localhost:4000";

const authDir = path.join(__dirname, ".auth");
export const statePath = (role: Role) => path.join(authDir, `${role}.json`);

// OnboardingRunner puede tapar CTAs en la primera visita de un
// storageState nuevo (diseño §3): descarta el tour si aparece; si no
// hay tour no bloquea. Corre tras cada goto a una superficie "nueva"
// para ese usuario.
export async function dismissTours(page: Page) {
  const skip = page.getByRole("button", {
    name: /omitir|saltar|skip|cerrar|close|entendido/i,
  });
  await skip
    .first()
    .click({ timeout: 3_000 })
    .catch(() => {});
}

// Segundo contexto dentro de un test multi-actor: el ConsentBanner
// vuelve a aparecer para esa persona si aún no aceptó (mismo dismiss
// que auth.setup.ts).
export async function acceptConsent(page: Page) {
  const consent = page
    .getByRole("region", { name: /términos|terms|privacidad/i })
    .getByRole("button", { name: /acepto|accept/i });
  await consent
    .waitFor({ timeout: 3_000 })
    .then(() => consent.click())
    .catch(() => {});
}

// Pagos stub://: el driver dispara el webhook por request fixture, no
// por UI (diseño §3). `ref` es el refId de la orden; status PAID|FAILED.
export async function firePaymentWebhook(
  request: APIRequestContext,
  refId: string,
  status: "PAID" | "FAILED",
) {
  return request.post(`${API_URL}/api/payments/webhook`, {
    data: { refId, status },
  });
}

// Contexto de API autenticado como `role` (cookies del storageState).
// Sesión por cookie sobre dominio localhost - aplica a :4000 igual que
// al proxy :3000. Recordar `await ctx.dispose()` y leer `res.json()`
// ANTES de dispose (el body muere con el contexto).
export async function apiAs(role: Role) {
  return request.newContext({
    storageState: statePath(role),
    baseURL: API_URL,
  });
}

// Primera academia de `mine` del rol academy (la que AcademyGate
// selecciona por defecto en la consola).
export async function myAcademyId(): Promise<string> {
  const api = await apiAs("academy");
  const res = await api.get("/api/academies/mine");
  const list = (await res.json().catch(() => [])) as { id: string }[];
  await api.dispose();
  if (!res.ok() || list.length === 0) {
    throw new Error("academies/mine sin academias para el rol academy");
  }
  return list[0].id;
}
