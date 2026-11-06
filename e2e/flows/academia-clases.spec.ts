import { test, expect } from "@playwright/test";
import { apiAs, dismissTours, myAcademyId, statePath } from "../helpers";

// Roster del instructor (inventario §8 / diseño §8 #7): /academia/clases
// lista sus clases → roster → marcar presente dentro de la ventana
// ±30min; fuera de ventana no hay control (badge "Sin confirmar" +
// hint del horario). El escenario se crea por API en cada test (taller
// one-off con profe de instructor + reserva del dancer, que es alumno
// ACTIVE de la academia) porque depender del clock del seed haría el
// spec horario-dependiente. Limpieza: borrado lógico de la serie.
test.describe("@academia @clases roster del instructor", () => {
  test.use({ storageState: statePath("profe") });

  const DAY = 86_400_000;

  // classStart del API = medianoche UTC del date + HH:MM del slot:
  // los horarios se componen en UTC para que la ventana caiga donde
  // el test quiere, sin depender de la TZ del server.
  function hhmmUtc(inMin: number): string {
    return new Date(Date.now() + inMin * 60_000).toISOString().slice(11, 16);
  }

  async function createClass(opts: { dayOffset: number; startInMin: number }) {
    const academyId = await myAcademyId();
    const profeApi = await apiAs("profe");
    const me = await profeApi.get("/api/me");
    const profeId = ((await me.json()) as { id: string }).id;
    await profeApi.dispose();

    const api = await apiAs("academy");
    const res = await api.post(`/api/academies/${academyId}/series`, {
      data: {
        name: `QA Profe ${Date.now()}`,
        instructorIds: [profeId],
        slots: [
          {
            date: new Date(Date.now() + opts.dayOffset * DAY)
              .toISOString()
              .slice(0, 10),
            startTime: hhmmUtc(opts.startInMin),
            endTime: hhmmUtc(opts.startInMin + 60),
            instructorIds: [profeId],
          },
        ],
      },
    });
    const series = (await res.json().catch(() => null)) as {
      id: string;
    } | null;
    expect(res.ok()).toBeTruthy();
    const classesRes = await api.get(
      `/api/academies/${academyId}/series/${series!.id}/classes`,
    );
    // El endpoint parte upcoming/past por `date` (medianoche UTC) vs
    // now: una clase de HOY ya cae en `past` aunque no haya empezado.
    const classes = (await classesRes.json()) as {
      upcoming: { id: string }[];
      past: { id: string }[];
    };
    await api.dispose();
    const classId = [...classes.upcoming, ...classes.past][0]?.id;
    expect(classId, "clase del taller no materializada").toBeTruthy();
    return { academyId, seriesId: series!.id, classId };
  }

  async function bookAsDancer(classId: string) {
    const api = await apiAs("dancer");
    const res = await api.post(`/api/classes/${classId}/book`);
    await api.dispose();
    expect(res.ok()).toBeTruthy();
  }

  async function dropSeries(academyId: string, seriesId: string) {
    const api = await apiAs("academy");
    await api.delete(`/api/academies/${academyId}/series/${seriesId}`);
    await api.dispose();
  }

  test("marcar presente dentro de la ventana ±30min", async ({ page }) => {
    // Inicio en ~15min (UTC): la ventana ya está abierta y la clase
    // aún es reservable (book rechaza "ya pasó" solo tras el inicio).
    const fx = await createClass({ dayOffset: 0, startInMin: 15 });
    await bookAsDancer(fx.classId);
    try {
      // Directo al roster (la tarjeta del teaching-list es navegación
      // cubierta por transversal-gates; el sujeto del test es el
      // marcaje de la ventana).
      await page.goto(`/academia/clases/${fx.classId}`);
      await dismissTours(page);
      await page
        .getByRole("button", { name: "Marcar presente" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: /asistencia marcada/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByText("Presente", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await dropSeries(fx.academyId, fx.seriesId);
    }
  });

  test("fuera de ventana no hay marcaje (badge Sin confirmar + hint)", async ({
    page,
  }) => {
    // Clase de mañana: ventana cerrada - el control se oculta y queda
    // el hint del horario de marcaje (spec class-series).
    const fx = await createClass({ dayOffset: 1, startInMin: 60 * 20 });
    await bookAsDancer(fx.classId);
    try {
      await page.goto(`/academia/clases/${fx.classId}`);
      await dismissTours(page);
      await expect(
        page.getByText("Sin confirmar", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("button", { name: "Marcar presente" }),
      ).toHaveCount(0);
      await expect(
        page.getByText(/la asistencia se marca desde 30 minutos/i),
      ).toBeVisible();
    } finally {
      await dropSeries(fx.academyId, fx.seriesId);
    }
  });
});
