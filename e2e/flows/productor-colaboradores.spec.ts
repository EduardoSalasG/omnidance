import { test, expect } from "@playwright/test";
import { apiAs, dismissTours, statePath } from "../helpers";

// Colaboradores del productor (inventario §5): alta por búsqueda de
// nombre → aparece en la nómina → quitar por UI con ConfirmSheet.
// El alta no tiene cupo en ningún tier (4730aceb eliminó
// staff_quota/free_staff_max del roster: el cupo free aplica al
// staff POR EVENTO, no a la nómina). El spec deja la nómina como
// estaba: lo que agrega se quita por UI y se re-verifica por API
// (DELETE /producer/staff/:personId es idempotente en el finally).
test.describe("@productor @colaboradores nómina", () => {
  test.use({ storageState: statePath("producer") });

  test("alta por búsqueda → visible en nómina → quitar", async ({
    page,
  }) => {
    const api = await apiAs("producer");
    const added: string[] = [];
    try {
      const rosterRes = await api.get("/api/producer/staff");
      const roster = (await rosterRes.json().catch(() => [])) as {
        person: { id: string; name: string | null };
      }[];
      const taken = new Set(roster.map((r) => r.person.id));

      // Candidato del directorio (mismo endpoint que la página) que
      // no esté ya en la nómina.
      const searchRes = await api.get("/api/people/search?q=dj");
      const djs = (await searchRes.json().catch(() => [])) as {
        id: string;
        name: string;
      }[];
      const pick = djs.find((p) => !taken.has(p.id));
      expect(pick, "directorio sin DJ libre para el alta").toBeTruthy();

      // Alta por UI: búsqueda → click en candidato → vuelve a la
      // nómina con la persona visible.
      await page.goto("/productor/colaboradores/nuevo");
      await dismissTours(page);
      await page.getByPlaceholder(/escribe el nombre/i).fill(pick!.name);
      await page
        .getByRole("listbox")
        .getByRole("button", { name: pick!.name })
        .first()
        .click();
      await expect(page).toHaveURL(/\/productor\/colaboradores$/, {
        timeout: 30_000,
      });
      added.push(pick!.id);
      const row = page
        .getByRole("listitem")
        .filter({ hasText: pick!.name });
      await expect(row).toBeVisible({ timeout: 30_000 });

      // Quitar por UI: botón de la fila → ConfirmSheet → la fila
      // desaparece y el API confirma la baja.
      await row.getByRole("button", { name: /quitar/i }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /quitar/i })
        .click();
      await expect(row).toHaveCount(0, { timeout: 15_000 });
      const afterRes = await api.get("/api/producer/staff");
      const after = (await afterRes.json().catch(() => [])) as {
        person: { id: string };
      }[];
      expect(after.some((r) => r.person.id === pick!.id)).toBeFalsy();
      added.length = 0;
    } finally {
      for (const id of added) {
        await api.delete(`/api/producer/staff/${id}`).catch(() => {});
      }
      await api.dispose();
    }
  });
});
