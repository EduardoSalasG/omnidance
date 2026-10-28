import { test, expect } from "@playwright/test";
import { statePath } from "./helpers";

// Tier smoke de golden paths (docs/qa-flows-inventory.md).
// Pagos: stub:// → POST /payments/webhook para PAID/FAILED determinístico.

test.describe("dancer: descubrimiento", () => {
  test.use({ storageState: statePath("dancer") });

  test("cartelera lista → filtros → detalle sin crash", async ({ page }) => {
    await page.goto("/eventos");
    await expect(page).toHaveURL(/eventos/);
    // View mios (wallet) no debe crashear ni mostrar error.
    await page.goto("/eventos?view=mios");
    await expect(page.locator("main")).toBeVisible();
    // Primer evento de la cartelera → detalle. waitForURL con el click:
    // en dev la navegación RSC puede estar pending y un expect(URL)
    // suelto agota el timeout con el click ya tragado por la transición.
    await page.goto("/eventos");
    const first = page.locator('a[href^="/eventos/"]').first();
    await expect(first).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/eventos\/.+/),
      first.click(),
    ]);
  });
});

test.describe("dancer: checkout ticket (stub)", () => {
  test.use({ storageState: statePath("dancer") });

  test("compra con pasarela stub → success", async ({ page, request }) => {
    // Evento determinístico vía API (el request fixture hereda la cookie
    // del storageState): PUBLISHED, futuro, con precio. PRACTICA es
    // gratis sin checkout; el primer card de la lista no garantiza
    // ticket comprable (dancer seed ya tiene entradas → el CTA pasa a
    // ser el dialog "ya tienes tu entrada").
    const res = await request.get("/api/events");
    const events = (await res.json()) as Array<{
      id: string;
      type: string;
      status: string;
      startsAt: string;
      presalePrice: number | null;
      doorPrice: number | null;
    }>;
    const now = Date.now();
    const target = events.find(
      (e) =>
        e.status === "PUBLISHED" &&
        e.type !== "PRACTICA" &&
        new Date(e.startsAt).getTime() > now &&
        (e.presalePrice ?? e.doorPrice ?? 0) > 0,
    );
    test.skip(!target, "sin evento ticketeado futuro en el seed");

    await page.goto(`/eventos/${target!.id}/checkout`);
    await page
      .getByRole("button", { name: /ir a pagar/i })
      .first()
      .click();
    // En dev la pasarela es stub:// → simulación determinística.
    await page
      .getByRole("button", { name: /simular aprobado/i })
      .click();
    await expect(
      page.getByText(/pago confirmado|entrada está lista/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("admin: /admin/datos conmuta entidades", () => {
  test.use({ storageState: statePath("admin") });

  test("cambiar de píldora con datos cargados no crashea", async ({
    page,
  }) => {
    await page.goto("/admin/datos");
    // Scoped a <main>: en mobile el nav lateral queda off-canvas y su
    // <ul>/<li> resuelve hidden - el bare "ul li" lo encuentra primero.
    await expect(page.locator("main ul li").first()).toBeVisible({
      timeout: 30_000,
    });
    // Solo las pills de entidad (PillTabs → role="tab"). Cualquier
    // getByRole("button") arrastra el "Guardar consulta" deshabilitado y
    // los verify/convert de las filas - el bug RangeError de 2026-10-18
    // se cubre igual: es el cambio de entidad con rows cargadas.
    for (const pill of await page.getByRole("tab").all()) {
      await pill.click();
      // La lista recarga por effect - esperar a que la fase resuelva
      // (rows nuevas o empty) antes de seguir con la siguiente pill.
      await page
        .locator("main ul li")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .catch(() => {});
      await expect(page.locator("body")).not.toContainText(
        "Invalid time value",
      );
    }
  });
});

test.describe("productor: ciclo de vida de evento", () => {
  test.use({ storageState: statePath("producer") });

  test("crear → publicar → aparece en cartelera", async ({ page }) => {
    const name = `QA Evento ${Date.now()}`;
    await page.goto("/productor/eventos/nuevo");
    await page.getByLabel(/nombre|name/i).first().fill(name);
    // fechas: hoy +1d → +5h
    const start = new Date(Date.now() + 864e5);
    const end = new Date(start.getTime() + 5 * 3600e3);
    const iso = (d: Date) => d.toISOString().slice(0, 16);
    await page.locator('input[type="datetime-local"]').nth(0).fill(iso(start));
    await page.locator('input[type="datetime-local"]').nth(1).fill(iso(end));
    await page
      .getByRole("button", { name: /crear|guardar/i })
      .first()
      .click();
    // Éxito → redirect a la lista en ~1.2s.
    await expect(page).toHaveURL(/productor\/eventos/, { timeout: 15_000 });
    // La card completa es el link - getByText(name) puede pisar otro
    // nodo con el nombre (o el click espera nav con expect-timeout 5s
    // mientras la ruta compila en dev la primera vez).
    await page.getByRole("link", { name }).first().click();
    await expect(page).toHaveURL(/productor\/eventos\/.+/, {
      timeout: 30_000,
    });
    // DRAFT → publicar. Hay que esperar el commit del POST: navegar
    // antes cancele el publish in-flight (falló en mobile al irse
    // directo a /eventos).
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect(page.getByText(/evento publicado/i)).toBeVisible({
      timeout: 15_000,
    });
    // En la cartelera pública.
    await page.goto("/eventos");
    await expect(page.getByText(name).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
