import { describe, expect, it, vi } from "vitest";
import { FeaturesController } from "./features.controller";
import type { FeatureFlagsService } from "./feature-flags.service";

// FeaturesController (spec feature-flags-admin): GET /features público
// delega el mapa {key: enabled} al service - el header Cache-Control
// corto va declarado en el método (@Header), testeado por contrato.

function mkFlags() {
  return {
    publicMap: vi.fn(async () => ({
      social_pass: false,
      trip_planner: true,
    })),
  } as unknown as FeatureFlagsService;
}

describe("FeaturesController", () => {
  it("map() devuelve el mapa público del service", async () => {
    const flags = mkFlags();
    const ctrl = new FeaturesController(flags);
    expect(await ctrl.map()).toEqual({
      social_pass: false,
      trip_planner: true,
    });
    expect(flags.publicMap).toHaveBeenCalledTimes(1);
  });
});
