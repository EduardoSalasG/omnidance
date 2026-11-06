import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  acceptConsent,
  apiAs,
  dismissTours,
  myAcademyId,
  statePath,
} from "../helpers";

// Checkout de membresía por transferencia (inventario §2/§8 - diseño
// §8 #8): modo sub → vía TRANSFER → orden MANUAL PENDING → el alumno
// sube el comprobante → la academia lo aprueba en la cola
// order-claims de /academia/cobros → la suscripción queda ACTIVE.
// Dos contextos: dancer compra, academy aprueba. El plan se crea por
// API en cada corrida: una corrida previa deja la sub ACTIVE y el
// checkout solo mostraría alreadySubscribed.
test.describe("@dancer @membresia suscripción por transferencia", () => {
  test.use({ storageState: statePath("dancer") });

  const RECEIPT = path.join(__dirname, "..", "fixtures", "receipt.png");

  async function createPlan() {
    const academyId = await myAcademyId();
    const api = await apiAs("academy");
    const res = await api.post(`/api/academies/${academyId}/plans`, {
      data: {
        name: `QA Membresía ${Date.now()}`,
        type: "MONTHLY",
        price: 15000,
        periodDays: 30,
      },
    });
    const body = (await res.json().catch(() => null)) as {
      id: string;
    } | null;
    await api.dispose();
    expect(res.ok()).toBeTruthy();
    expect(body?.id).toBeTruthy();
    return { academyId, planId: body!.id };
  }

  test("orden manual → comprobante → aprobación → sub ACTIVE", async ({
    page,
    browser,
  }) => {
    const { academyId, planId } = await createPlan();
    const note = `QA membresia ${Date.now()}`;

    // 1) Dancer: checkout en modo suscripción, vía transferencia.
    await page.goto(
      `/academias/${academyId}/checkout?plan=${planId}&mode=sub`,
    );
    await dismissTours(page);
    // La elección de vía solo aparece cuando la academia publica
    // métodos TRANSFER (muvet los tiene por enrich).
    await page
      .getByRole("radio", { name: "Transferencia" })
      .check({ timeout: 30_000 });
    await page
      .getByLabel(/pagaré por transferencia cada período/i)
      .check();
    await page
      .getByRole("button", { name: /Transferencia ·/ })
      .click();

    // 2) Orden MANUAL creada: datos bancarios + upload del comprobante.
    await expect(
      page.getByText("Orden creada · pago manual"),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(/nota para la academia/i).fill(note);
    await page.locator('input[type="file"]').setInputFiles(RECEIPT);
    await page
      .getByRole("button", { name: /enviar comprobante/i })
      .click();
    // El claim quedó PENDING: aviso global + vuelta a la ficha. El
    // ActionNotice auto-cierra ~3s y puede expirar antes del assert
    // en corridas lentas - el estado real lo confirma el claim mismo
    // (PENDING con el note QA) por API.
    await page.waitForURL(new RegExp(`/academias/${academyId}$`), {
      timeout: 30_000,
    });

    // 3) Academy: la orden aparece en la cola order-claims y se aprueba.
    const actx = await browser.newContext({
      storageState: statePath("academy"),
    });
    const ap = await actx.newPage();
    try {
      await ap.goto("/academia/cobros");
      await dismissTours(ap);
      await acceptConsent(ap);
      const claimCard = ap
        .locator('a[href*="/academia/cobros/orden/"]')
        .filter({ hasText: note });
      await expect(claimCard).toBeVisible({ timeout: 30_000 });
      await Promise.all([
        ap.waitForURL(/\/academia\/cobros\/orden\/.+/),
        claimCard.click(),
      ]);
      await ap.getByRole("button", { name: "Aprobar" }).click();
      // ConfirmSheet: el confirm vive dentro del diálogo (mismo label
      // "Aprobar" que el botón de la ficha).
      await ap
        .getByRole("dialog")
        .getByRole("button", { name: "Aprobar" })
        .click();
      await ap.waitForURL(/\/academia\/cobros$/, { timeout: 15_000 });
      await expect(
        ap
          .getByRole("status")
          .filter({ hasText: /suscripción quedó activa/i }),
      ).toBeVisible({ timeout: 15_000 });
      // Sale de la cola accionable (queda solo en historial, que no
      // renderiza el note).
      await expect(
        ap
          .locator('a[href*="/academia/cobros/orden/"]')
          .filter({ hasText: note }),
      ).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await actx.close();
    }

    // 4) La suscripción del dancer a este plan quedó ACTIVE.
    const api = await apiAs("dancer");
    const res = await api.get("/api/subscriptions/mine");
    const subs = (await res.json().catch(() => [])) as {
      status: string;
      plan: { id: string };
    }[];
    await api.dispose();
    expect(res.ok()).toBeTruthy();
    const sub = subs.find((s) => s.plan.id === planId);
    expect(sub?.status).toBe("ACTIVE");
  });
});
