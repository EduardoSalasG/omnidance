import { test, expect } from "@playwright/test";
import { apiAs, dismissTours, statePath } from "../helpers";

// Colaboradores del productor (inventario §4 - diseño §8 #10): alta
// por búsqueda de nombre y cupo de la nómina - lleno, el alta
// siguiente recibe 403 y la página muestra el aviso "sube de tier"
// (staff_quota con tier, tier.required en free). El spec deja la
// nómina como estaba: todo lo que agrega por UI/API se borra por API
// al final (DELETE /producer/staff/:personId es idempotente).
test.describe("@productor @colaboradores nómina", () => {
  test.use({ storageState: statePath("producer") });

  const QUOTA = 2;

  test("alta por búsqueda → cupo lleno → siguiente alta rechazada", async ({
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
      let count = roster.length;

      // Candidatos del directorio (mismo endpoint que la página).
      const searchRes = await api.get("/api/people/search?q=dj");
      const djs = (await searchRes.json().catch(() => [])) as {
        id: string;
        name: string;
      }[];
      const pool = djs.filter((p) => !taken.has(p.id));
      expect(pool.length).toBeGreaterThanOrEqual(3);

      // Si la nómina no está llena, el primer alta va por UI (cubre el
      // happy path: búsqueda → click → alta → visible en la lista).
      let uiPick: { id: string; name: string } | null = null;
      if (count < QUOTA) {
        uiPick = pool.shift()!;
        count += 1;
      }
      // Rellenar el cupo por API para llegar al estado de prueba.
      while (count < QUOTA) {
        const p = pool.shift()!;
        const res = await api.post("/api/producer/staff", {
          data: { personId: p.id },
        });
        expect(res.ok()).toBeTruthy();
        added.push(p.id);
        count += 1;
      }
      // La víctima del 403: fuera de la nómina y de lo agregado.
      const victim = pool.find((p) => !added.includes(p.id))!;

      await page.goto("/productor/colaboradores/nuevo");
      await dismissTours(page);
      const search = page.getByPlaceholder(/escribe el nombre/i);

      if (uiPick) {
        await search.fill(uiPick.name);
        await page
          .getByRole("listbox")
          .getByRole("button", { name: uiPick.name })
          .first()
          .click();
        await expect(page).toHaveURL(/\/productor\/colaboradores$/, {
          timeout: 30_000,
        });
        await expect(page.getByText(uiPick.name)).toBeVisible({
          timeout: 30_000,
        });
        added.push(uiPick.id);
        await page.goto("/productor/colaboradores/nuevo");
        await dismissTours(page);
      }

      // Cupo lleno: el alta siguiente es rechazada por el API y la
      // página lo comunica con el aviso de tier (sin navegar). El
      // ActionNotice de error es role=alert (éxito=status) y
      // auto-cierra ~3s - el filtro por texto descarta el announcer
      // de Next que también es role=alert.
      await search.fill(victim.name);
      await page
        .getByRole("listbox")
        .getByRole("button", { name: victim.name })
        .first()
        .click();
      await expect(
        page.getByRole("alert").filter({ hasText: /sube de tier/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/productor\/colaboradores\/nuevo$/);
    } finally {
      for (const id of added) {
        await api.delete(`/api/producer/staff/${id}`).catch(() => {});
      }
      await api.dispose();
    }
  });
});
