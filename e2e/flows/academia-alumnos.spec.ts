import { test, expect } from "@playwright/test";
import { apiAs, dismissTours, myAcademyId, statePath } from "../helpers";

// Alumnos de la academia (inventario §8 / diseño §8 #5): lista →
// ficha, alta duplicada → 409 con aviso de error, y el editor de
// niveles por tipo de clase (PATCH /enrollments/:id/levels). Requiere
// seed + enrich (enrollments, catálogo de niveles). muvet es STUDIO:
// el strip de KPIs es feature PRO y no se aserta acá.
test.describe("@academia @alumnos lista y ficha", () => {
  test.use({ storageState: statePath("academy") });

  type StudentItem = {
    id: string;
    status: string;
    person: { id: string; name: string | null; email: string | null };
    plan: { id: string; name: string } | null;
  };

  async function activeStudent(academyId: string) {
    const api = await apiAs("academy");
    const res = await api.get(
      `/api/academies/${academyId}/students?pageSize=50`,
    );
    const data = (await res.json().catch(() => null)) as {
      items: StudentItem[];
    } | null;
    await api.dispose();
    expect(res.ok()).toBeTruthy();
    const s = data?.items.find((i) => i.status === "ACTIVE" && i.plan);
    expect(s, "seed sin alumno ACTIVE con plan").toBeTruthy();
    return s!;
  }

  test("lista → ficha del alumno", async ({ page }) => {
    await page.goto("/academia/alumnos");
    await dismissTours(page);
    const card = page
      .getByRole("link", { name: /ver perfil de/i })
      .first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForURL(/\/academia\/alumnos\/.+/),
      card.click(),
    ]);
    // La ficha resuelve plan + sección de pagos del enrollment.
    await expect(
      page.getByRole("heading", { name: "Pagos" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("alta duplicada muestra aviso de error (409)", async ({ page }) => {
    const academyId = await myAcademyId();
    const s = await activeStudent(academyId);

    await page.goto("/academia/alumnos/nuevo");
    await dismissTours(page);
    await page.getByLabel(/id de persona/i).fill(s.person.id);
    await page.getByLabel(/planes/i).selectOption(s.plan!.id);
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    // 409 DUPLICATE_ENROLLMENT: el notice de acción muestra el message
    // del server (role=alert por error:true).
    await expect(
      page.getByRole("alert").filter({ hasText: /ya existe un enrollment/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("editor de niveles guarda la selección", async ({ page }) => {
    const academyId = await myAcademyId();
    const s = await activeStudent(academyId);

    await page.goto(`/academia/alumnos/${s.person.id}`);
    await dismissTours(page);
    const editor = page.locator(
      'section[aria-label="Nivel por tipo de clase"]',
    );
    await expect(editor).toBeVisible({ timeout: 30_000 });
    // Marca un nivel sin marcar (el editor abre con la selección
    // vigente: clic en un chip ya marcado lo desmarca - corridas
    // anteriores dejan niveles persistidos). El chip se fija por
    // índice: un locator por aria-pressed="false" re-resuelve a OTRO
    // chip falso tras el toggle y el assert nunca ve "true".
    const chips = editor.locator("fieldset button");
    const idx = await chips.evaluateAll((els) =>
      els.findIndex((el) => el.getAttribute("aria-pressed") === "false"),
    );
    const chip = chips.nth(idx);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Guardar niveles" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: /niveles actualizados/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
