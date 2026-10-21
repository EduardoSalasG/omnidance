import { describe, expect, it, vi } from "vitest";
// Ciclo session.guard ⇄ auth.controller (SESSION_COOKIE): si session.guard
// entra primero, los @UseGuards de auth.controller evalúan con SessionGuard
// undefined. Cargar auth.controller antes rompe el ciclo a favor del test.
import "../auth/infrastructure/auth.controller";
import { TripController } from "./trip.controller";
import type { TripService } from "./trip.service";
import type { Request } from "express";

// Wiring del controller de "Mi viaje": delega en el service con el
// person del request (nunca un id externo) y traduce includePast del
// query string a booleano.

const reqAs = (personId: string) =>
  ({ person: { id: personId } }) as unknown as Request;

describe("TripController", () => {
  it("GET /me/trip pasa el person del request; includePast solo con 'true'", async () => {
    const list = vi.fn(async () => []);
    const ctrl = new TripController({ list } as never as TripService);
    await ctrl.list(reqAs("p1"), undefined);
    await ctrl.list(reqAs("p1"), "true");
    await ctrl.list(reqAs("p1"), "1");
    expect(list).toHaveBeenNthCalledWith(1, "p1", false);
    expect(list).toHaveBeenNthCalledWith(2, "p1", true);
    expect(list).toHaveBeenNthCalledWith(3, "p1", false);
  });

  it("GET /me/trip/ids devuelve los ids del person", async () => {
    const ids = vi.fn(async () => ["e1"]);
    const ctrl = new TripController({ ids } as never as TripService);
    expect(await ctrl.ids(reqAs("p1"))).toEqual(["e1"]);
    expect(ids).toHaveBeenCalledWith("p1");
  });

  it("PUT /me/trip/:eventId pasa eventId + nota del DTO al service", async () => {
    const save = vi.fn(async () => ({ eventId: "e1", note: "x" }));
    const ctrl = new TripController({ save } as never as TripService);
    await ctrl.save(reqAs("p1"), "e1", { note: "hotel" });
    expect(save).toHaveBeenCalledWith("p1", "e1", "hotel");
    await ctrl.save(reqAs("p1"), "e2", {});
    expect(save).toHaveBeenCalledWith("p1", "e2", undefined);
  });

  it("DELETE /me/trip/:eventId delega con el person del request", async () => {
    const remove = vi.fn(async () => ({ removed: true }));
    const ctrl = new TripController({ remove } as never as TripService);
    await ctrl.remove(reqAs("p1"), "e1");
    expect(remove).toHaveBeenCalledWith("p1", "e1");
  });
});
