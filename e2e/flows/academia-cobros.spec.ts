import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { apiAs, dismissTours, myAcademyId, statePath } from "../helpers";

// Cobros de la academia (inventario §8 / diseño §8 #4): cola de
// comprobantes → detalle → aprobar, rechazar con motivo obligatorio
// y error-retry del fetch de la cola. Los claims PENDING se crean por
// API como dancer (multipart receipt) dentro de cada test - aprobar/
// rechazar consume el claim y no se puede deshacer, así que el spec
// no depende de los fixtures de enrich.
test.describe("@academia @cobros cola de comprobantes", () => {
  test.use({ storageState: statePath("academy") });

  const RECEIPT = path.join(__dirname, "..", "fixtures", "receipt.png");

  async function createClaim(idAcademy: string, note: string) {
    const api = await apiAs("dancer");
    const res = await api.post(`/api/academies/${idAcademy}/claims`, {
      multipart: {
        amount: "15000",
        note,
        receipt: {
          name: "receipt.png",
          mimeType: "image/png",
          buffer: fs.readFileSync(RECEIPT),
        },
      },
    });
    // json() antes de dispose(): el body se descarta con el contexto.
    const body = (await res.json().catch(() => null)) as {
      id: string;
    } | null;
    await api.dispose();
    expect(res.ok()).toBeTruthy();
    expect(body?.id).toBeTruthy();
    return body!;
  }

  test("aprobar un comprobante lo saca de la cola", async ({ page }) => {
    const id = await myAcademyId();
    const note = `QA cobros ${Date.now()}`;
    await createClaim(id, note);

    await page.goto("/academia/cobros");
    await dismissTours(page);
    const claimCard = page
      .locator('a[href*="/academia/cobros/claim/"]')
      .filter({ hasText: note });
    await expect(claimCard).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForURL(/\/academia\/cobros\/claim\/.+/),
      claimCard.click(),
    ]);
    await page.getByRole("button", { name: "Aprobar" }).click();
    await page.waitForURL(/\/academia\/cobros$/);
    await expect(
      page.getByRole("status").filter({ hasText: /pago aprobado/i }),
    ).toBeVisible({ timeout: 15_000 });
    // El claim aprobado deja la cola accionable (queda en el historial,
    // que no renderiza el note como card linkeable bajo la cola).
    await expect(
      page
        .locator('a[href*="/academia/cobros/claim/"]')
        .filter({ hasText: note }),
    ).toHaveCount(0, { timeout: 15_000 });
  });

  test("rechazar exige motivo y saca el claim de la cola", async ({
    page,
  }) => {
    const id = await myAcademyId();
    const note = `QA rechazo ${Date.now()}`;
    const claim = await createClaim(id, note);

    await page.goto(`/academia/cobros/claim/${claim.id}`);
    await dismissTours(page);
    await page.getByRole("button", { name: "Rechazar" }).click();
    const confirm = page.getByRole("button", { name: "Confirmar" });
    // Sin motivo el confirmar queda deshabilitado (el backend también
    // lo rechaza con 400, pero la UI ni siquiera dispara).
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/motivo del rechazo/i).fill("Ilegible QA");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await page.waitForURL(/\/academia\/cobros$/);
    await expect(
      page.getByRole("status").filter({ hasText: /comprobante rechazado/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("error de fetch de la cola muestra alert + retry y recupera", async ({
    page,
  }) => {
    const id = await myAcademyId();
    // Solo los listados ?status=... (cola e historial): el detalle
    // /claims/:id y order-claims siguen sirviendo.
    const pattern = new RegExp(`/api/academies/${id}/claims\\?`);
    await page.route(pattern, (route) => route.fulfill({ status: 500 }));
    await page.goto("/academia/cobros");
    await dismissTours(page);
    const alert = page
      .getByRole("alert")
      .filter({ hasText: /algo salió mal/i });
    await expect(alert.first()).toBeVisible({ timeout: 30_000 });

    await page.unroute(pattern);
    // Cada retry exitoso desmonta su bloque de error: re-resolver el
    // locator en cada vuelta en vez de iterar un count() ya obsoleto.
    const retries = page.getByRole("button", { name: /reintentar/i });
    for (let i = 0; i < 4; i++) {
      const first = retries.first();
      if (!(await first.isVisible().catch(() => false))) break;
      await first.click();
      await first.waitFor({ state: "detached" }).catch(() => {});
    }
    await expect(alert).toHaveCount(0, { timeout: 30_000 });
  });
});
