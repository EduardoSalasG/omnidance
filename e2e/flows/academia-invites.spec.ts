import { test, expect } from "@playwright/test";
import {
  apiAs,
  dismissTours,
  gotoStable,
  myAcademyId,
  statePath,
  USERS,
} from "../helpers";

// Camino push de la invitación de academia (spec
// academies/student-invites): la cuenta existente recibe
// `academy.invite` y su tap en el centro consume la invite
// (POST /academies/invites/:id/consume), persiste la lente academy y
// aterriza en la ficha pública - equivalente al verify del magic link.
// El camino del push de dispositivo (/i/:inviteId) converge en el
// mismo endpoint + lente; no se cubre aquí porque requiere emitir
// push real a un dispositivo.

test.describe("academia invites: tap del push in-app", () => {
  test.use({ storageState: statePath("dancer") });

  test("tap en academy.invite consume y entra con lente academy a la ficha", async ({
    page,
  }) => {
    // Arrange: el owner invita al dancer (cuenta existente → push
    // in-app). Idempotente entre corridas: invite consumida → crea una
    // nueva; pendiente → reenvía y el push sale igual.
    const academyId = await myAcademyId();
    const api = await apiAs("academy");
    const res = await api.post(`/api/academies/${academyId}/invites`, {
      data: { email: USERS.dancer, name: "Dancer" },
    });
    await api.dispose();
    expect(res.ok()).toBeTruthy();

    // Act: el dancer abre el centro y toca la card de la invite.
    await gotoStable(page, "/notificaciones");
    await dismissTours(page);
    const card = page.getByRole("button", {
      name: /te invitó a Omnidance/i,
    });
    await expect(card.first()).toBeVisible({ timeout: 15_000 });
    await card.first().click();

    // Assert: consume + lente academy + ficha pública de la academia.
    await page.waitForURL(new RegExp(`/academias/${academyId}`), {
      timeout: 15_000,
    });
    await expect
      .poll(async () =>
        page.evaluate(() =>
          window.localStorage.getItem("omnidance:view-mode"),
        ),
      )
      .toBe("academy");
  });
});
