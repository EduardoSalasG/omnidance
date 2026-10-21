import { describe, expect, it, vi } from "vitest";
import {
  CitiesController,
  EventsNearController,
} from "./cities.controller";
import type { CitiesService } from "./cities.service";

// Wiring de los controllers de descubrimiento: delegan al service y
// propagan su contrato (flag OFF → NotFoundException del service).

describe("CitiesController / EventsNearController", () => {
  it("GET /cities delega en service.list()", async () => {
    const list = vi.fn(async () => [{ slug: "santiago-cl" }]);
    const ctrl = new CitiesController({ list } as never as CitiesService);
    expect(await ctrl.list()).toEqual([{ slug: "santiago-cl" }]);
    expect(list).toHaveBeenCalledOnce();
  });

  it("GET /cities/:slug pasa el slug al service", async () => {
    const detail = vi.fn(async () => ({ slug: "santiago-cl" }));
    const ctrl = new CitiesController({ detail } as never as CitiesService);
    expect(await ctrl.detail("santiago-cl")).toEqual({
      slug: "santiago-cl",
    });
    expect(detail).toHaveBeenCalledWith("santiago-cl");
  });

  it("GET /events/near pasa lat/lng/radiusKm del DTO al service", async () => {
    const nearEvents = vi.fn(async () => ({ events: [] }));
    const ctrl = new EventsNearController({
      nearEvents,
    } as never as CitiesService);
    await ctrl.near({ lat: -33.45, lng: -70.66, radiusKm: 50 });
    expect(nearEvents).toHaveBeenCalledWith(-33.45, -70.66, 50);
  });
});
