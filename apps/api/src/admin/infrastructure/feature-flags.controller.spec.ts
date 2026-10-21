import { describe, expect, it, vi } from "vitest";
import "../../auth/infrastructure/auth.controller"; // rompe el ciclo session.guard ⇄ auth.controller
import { AdminFeatureFlagsController } from "./feature-flags.controller";
import type { FeatureFlagsService } from "../../features/feature-flags.service";

// AdminFeatureFlagsController (spec feature-flags-admin): wiring de
// rutas — list/setEnabled delegan al service con key + actor de sesión.

const req = (id = "adm-1") => ({ person: { id } }) as never;

function mkFlags() {
  return {
    list: vi.fn(async () => []),
    setEnabled: vi.fn(async (key: string, enabled: boolean) => ({
      key,
      enabled,
    })),
  } as unknown as FeatureFlagsService;
}

describe("AdminFeatureFlagsController", () => {
  it("list delega al service", async () => {
    const flags = mkFlags();
    const ctrl = new AdminFeatureFlagsController(flags);
    await ctrl.list();
    expect(flags.list).toHaveBeenCalledTimes(1);
  });

  it("setEnabled delega key + enabled + actor de sesión", async () => {
    const flags = mkFlags();
    const ctrl = new AdminFeatureFlagsController(flags);
    const row = await ctrl.setEnabled(
      "social_pass",
      { enabled: true },
      req("adm-7"),
    );
    expect(flags.setEnabled).toHaveBeenCalledWith(
      "social_pass",
      true,
      "adm-7",
    );
    expect(row).toEqual({ key: "social_pass", enabled: true });
  });
});
