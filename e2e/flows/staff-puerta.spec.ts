import { test, expect } from "@playwright/test";
import { apiAs, dismissTours, statePath } from "../helpers";

// Consola de puerta (inventario §11 - diseño §8 #11): boot del
// manifiesto (la búsqueda manual solo existe cuando el manifest
// cargó), check-in manual por nombre → verde, y el re-check-in de la
// misma persona → duplicado rojo. El evento se arma por API
// (POST /events + publish) y al dancer se le da un EntryPass LIST
// por guest-list (admin) - sin pasar por la pasarela: en dev
// payments.default_gateway=FLOW sin key y toda orden sale 500.
// La variante offline/IndexedDB queda fuera del batch (@offline).
test.describe("@staff @puerta consola de puerta", () => {
  test.use({ storageState: statePath("staff") });

  test("check-in manual → duplicado en rojo", async ({ page }) => {
    const apiP = await apiAs("producer");
    const apiD = await apiAs("dancer");
    const apiA = await apiAs("admin");

    // Evento PUBLISHED (mañana) + EntryPass LIST del dancer vía
    // guest-list - lo pone en el door-manifest sin cobro.
    const start = new Date(Date.now() + 26 * 3600e3);
    const end = new Date(start.getTime() + 5 * 3600e3);
    const evRes = await apiP.post("/api/events", {
      data: {
        name: `QA Puerta ${Date.now()}`,
        type: "SOCIAL",
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      },
    });
    const ev = (await evRes.json().catch(() => null)) as {
      id: string;
      producerId: string;
    } | null;
    expect(evRes.ok()).toBeTruthy();
    const eventId = ev!.id;
    const pub = await apiP.post(`/api/events/${eventId}/publish`);
    expect(pub.ok()).toBeTruthy();

    const meRes = await apiD.get("/api/me");
    const me = (await meRes.json()) as { id: string; name: string };

    const listRes = await apiA.post(
      `/api/events/${eventId}/guest-lists`,
      { data: { ownerId: ev!.producerId, label: "QA" } },
    );
    const list = (await listRes.json().catch(() => null)) as {
      id: string;
    } | null;
    expect(listRes.ok()).toBeTruthy();
    const entryRes = await apiA.post(
      `/api/guest-lists/${list!.id}/entries`,
      { data: { personId: me.id } },
    );
    const entry = (await entryRes.json().catch(() => null)) as {
      id: string;
    } | null;
    expect(entryRes.ok()).toBeTruthy();
    const passRes = await apiA.post(
      `/api/guest-lists/${list!.id}/entries/${entry!.id}/pass`,
      { data: {} },
    );
    expect(passRes.ok()).toBeTruthy();

    await apiP.dispose();
    await apiD.dispose();
    await apiA.dispose();

    // Consola de puerta: el toggle de manual existe siempre; el input
    // de búsqueda solo cuando el manifiesto cargó (boot manifest).
    await page.goto(`/staff/${eventId}`);
    await dismissTours(page);
    const manualToggle = page.getByRole("button", {
      name: "Check-in manual",
    });
    await manualToggle.click();
    const search = page.getByPlaceholder(/buscar por nombre/i);
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill(me.name);
    const candidate = page
      .getByRole("listitem")
      .filter({ hasText: me.name })
      .getByRole("button");
    await candidate.click();

    // Verde: check-in registrado (overlay a pantalla completa ~2.5s).
    const okOverlay = page
      .getByRole("status")
      .filter({ hasText: "Entrada registrada" });
    await expect(okOverlay).toBeVisible({ timeout: 15_000 });
    await expect(okOverlay).toContainText(me.name);
    await expect(okOverlay).toBeHidden({ timeout: 10_000 });

    // La persona queda en la lista de la noche con badge MANUAL
    // (desktop ≥lg muestra la columna de lista junto al escáner; en
    // mobile la lista vive bajo el tab "Asistentes").
    const asistentesTab = page.getByRole("button", {
      name: /^Asistentes/,
    });
    if (await asistentesTab.isVisible().catch(() => false)) {
      await asistentesTab.click();
    }
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: me.name })
        .filter({ hasText: "MANUAL" }),
    ).toBeVisible({ timeout: 15_000 });

    // Re-check-in de la misma persona → duplicado en rojo (dedup
    // local si la lista ya refrescó, o 409 del server si todavía no -
    // el overlay es el mismo).
    if (!(await manualToggle.isVisible().catch(() => false))) {
      // En mobile quedó activo el tab de asistentes: volver al escáner.
      const scanTab = page.getByRole("button", { name: /^Escanear/ });
      if (await scanTab.isVisible().catch(() => false)) {
        await scanTab.click();
      }
    }
    await manualToggle.click();
    await search.fill(me.name);
    await candidate.click();
    const dupOverlay = page
      .getByRole("status")
      .filter({ hasText: "Ya hizo check-in" });
    await expect(dupOverlay).toBeVisible({ timeout: 15_000 });
    await expect(dupOverlay).toContainText(me.name);
  });
});
