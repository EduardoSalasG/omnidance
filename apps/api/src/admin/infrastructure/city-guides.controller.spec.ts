import { describe, expect, it, vi } from "vitest";
import "../../auth/infrastructure/auth.controller"; // rompe el ciclo session.guard ⇄ auth.controller
import { AdminCityGuidesController } from "./city-guides.controller";
import type { AdminCityGuidesService } from "../application/city-guides.service";

// AdminCityGuidesController (spec city-guides): wiring de rutas:
// list/detail/update delegan al service con cityId + actor de sesión.

const req = (id = "adm-1") => ({ person: { id } }) as never;

function mkGuides() {
  return {
    list: vi.fn(async () => []),
    detail: vi.fn(async () => ({ city: { slug: "santiago-cl" } })),
    update: vi.fn(async () => ({ intro: "x" })),
  } as unknown as AdminCityGuidesService;
}

describe("AdminCityGuidesController", () => {
  it("list delega al service", async () => {
    const guides = mkGuides();
    const ctrl = new AdminCityGuidesController(guides);
    await ctrl.list();
    expect(guides.list).toHaveBeenCalledTimes(1);
  });

  it("detail pasa el cityId al service", async () => {
    const guides = mkGuides();
    const ctrl = new AdminCityGuidesController(guides);
    await ctrl.detail("city-stgo");
    expect(guides.detail).toHaveBeenCalledWith("city-stgo");
  });

  it("update delega cityId + dto + actor de sesión", async () => {
    const guides = mkGuides();
    const ctrl = new AdminCityGuidesController(guides);
    await ctrl.update(
      "city-stgo",
      { intro: "Hola", practical: "Metro" },
      req("adm-7"),
    );
    expect(guides.update).toHaveBeenCalledWith(
      "city-stgo",
      { intro: "Hola", practical: "Metro" },
      "adm-7",
    );
  });
});
