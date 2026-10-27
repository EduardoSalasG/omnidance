import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import { EventsController } from "./events.controller";

// Moneda del evento (spec platform-multicountry): POST /events acepta
// `currency` ISO-4217 validada contra el catálogo Country.currency -
// default = moneda del país del venue (venue sin país → CLP).
// PATCH solo la cambia mientras el evento no tiene Payment.

interface FakeVenue {
  id: string;
  city?: { country?: { currency?: string } | null } | null;
}

interface FakeCountry {
  id: string;
  currency: string;
}

interface FakeEvent {
  id: string;
  producerId: string;
  status: string;
  currency: string;
}

class FakePrisma {
  venues = new Map<string, FakeVenue>();
  countries: FakeCountry[] = [];
  events = new Map<string, FakeEvent>();
  payments: { eventId: string }[] = [];
  lastCreate: Record<string, unknown> | null = null;
  lastUpdateData: Record<string, unknown> | null = null;
  createCalls = 0;

  venue = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.venues.get(where.id) ?? null,
  };

  country = {
    findFirst: async ({ where }: { where: { currency: string } }) =>
      this.countries.find((c) => c.currency === where.currency) ?? null,
  };

  event = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.events.get(where.id) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.createCalls += 1;
      this.lastCreate = data;
      return { id: "ev-new", ...data };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      this.lastUpdateData = data;
      return { ...this.events.get(where.id), ...data };
    },
  };

  payment = {
    count: async ({ where }: { where: { eventId: string } }) =>
      this.payments.filter((p) => p.eventId === where.eventId).length,
  };

  $transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(this);
}

const reqAs = (personId: string, roles: string[] = []) =>
  ({ person: { id: personId, roles } }) as unknown as Request;

const body = (over: Record<string, unknown> = {}) => ({
  name: "Social",
  startsAt: "2026-12-01T22:00:00.000Z",
  endsAt: "2026-12-02T03:00:00.000Z",
  ...over,
});

describe("EventsController - currency del evento", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      { getProducerParams: async () => null } as never,
    );
    prisma.countries.push(
      { id: "country-cl", currency: "CLP" },
      { id: "country-es", currency: "EUR" },
    );
  });

  it("sin currency declarada → hereda la del país del venue", async () => {
    prisma.venues.set("v-es", {
      id: "v-es",
      city: { country: { currency: "EUR" } },
    });
    await ctrl.create(body({ venueId: "v-es" }), reqAs("prod-1"));
    expect(prisma.lastCreate?.currency).toBe("EUR");
  });

  it("venue sin ciudad/país o sin venue → CLP", async () => {
    prisma.venues.set("v-sin-ciudad", { id: "v-sin-ciudad", city: null });
    await ctrl.create(body({ venueId: "v-sin-ciudad" }), reqAs("prod-1"));
    expect(prisma.lastCreate?.currency).toBe("CLP");

    await ctrl.create(body(), reqAs("prod-1"));
    expect(prisma.lastCreate?.currency).toBe("CLP");
  });

  it("currency del catálogo se persiste; fuera del catálogo → 400", async () => {
    await ctrl.create(body({ currency: "EUR" }), reqAs("prod-1"));
    expect(prisma.lastCreate?.currency).toBe("EUR");

    const calls = prisma.createCalls;
    await expect(
      ctrl.create(body({ currency: "XXX" }), reqAs("prod-1")),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.createCalls).toBe(calls); // el 400 corta antes del create
  });

  it("PATCH cambia la moneda solo sin pagos registrados", async () => {
    prisma.events.set("ev-1", {
      id: "ev-1",
      producerId: "prod-1",
      status: "DRAFT",
      currency: "CLP",
    });
    await ctrl.update("ev-1", { currency: "EUR" }, reqAs("prod-1"));
    expect(prisma.lastUpdateData?.currency).toBe("EUR");
    prisma.events.get("ev-1")!.currency = "EUR"; // fake no muta en update

    // Con un Payment ligado al evento la moneda queda congelada → 409.
    prisma.payments.push({ eventId: "ev-1" });
    await expect(
      ctrl.update("ev-1", { currency: "CLP" }, reqAs("prod-1")),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("PATCH con la misma moneda es no-op (no consulta pagos)", async () => {
    prisma.events.set("ev-1", {
      id: "ev-1",
      producerId: "prod-1",
      status: "PUBLISHED",
      currency: "CLP",
    });
    prisma.payments.push({ eventId: "ev-1" });
    await ctrl.update("ev-1", { currency: "CLP" }, reqAs("prod-1"));
    expect(prisma.lastUpdateData?.currency).toBeUndefined();
  });

  it("PATCH con moneda fuera del catálogo → 400", async () => {
    prisma.events.set("ev-1", {
      id: "ev-1",
      producerId: "prod-1",
      status: "DRAFT",
      currency: "CLP",
    });
    await expect(
      ctrl.update("ev-1", { currency: "BTC" }, reqAs("prod-1")),
    ).rejects.toMatchObject({ status: 400 });
  });
});
