import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TripService } from "./trip.service";
import { FeatureFlagsService } from "../features/feature-flags.service";
import type { PrismaService } from "../prisma.service";

// TripService (spec mi-viaje). Reglas bajo prueba:
// - Flag trip_planner OFF → 404 en todos los métodos (fail-closed).
// - GET /me/trip: evento expandido (feed + city{name,slug}), orden por
//   startsAt asc, pasados fuera por defecto / includePast los incluye.
// - PUT upsert idempotente: re-PUT con nota la actualiza sin duplicar;
//   PUT sin nota no pisa la existente; evento inexistente → 404.
// - DELETE: quita solo del propio person; no existía → 404.
// - Aislamiento: todas las queries filtran por personId.

type FakeFlag = { key: string; enabled: boolean };
type FakeEvent = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  presalePrice: number | null;
  doorPrice: number | null;
  genres: string[];
  genreMix: unknown[] | null;
  platformFeePct: number | null;
  series?: {
    id: string;
    name: string;
    genres: string[];
    genreMix: unknown[] | null;
  } | null;
  venue?: {
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  city?: { name: string; slug: string } | null;
};
type FakeTripItem = {
  personId: string;
  eventId: string;
  note: string | null;
  addedAt: Date;
  event: FakeEvent;
};

/** Aplica el `select` de Prisma (anidado incluido) a la fila fake. */
function applySelect(row: unknown, select: Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) {
      out[k] = r[k];
    } else if (v && typeof v === "object" && "select" in v) {
      const sub = (v as { select: Record<string, unknown> }).select;
      const val = r[k];
      out[k] = val == null ? val : applySelect(val, sub);
    }
  }
  return out;
}

function mkPrisma(data: { flags?: FakeFlag[]; events?: FakeEvent[] }) {
  const flags = new Map((data.flags ?? []).map((f) => [f.key, f]));
  const events = data.events ?? [];
  const items: FakeTripItem[] = [];

  const prisma = {
    featureFlag: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        flags.get(where.key) ?? null,
    },
    event: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        events.find((e) => e.id === where.id) ?? null,
    },
    tripItem: {
      findMany: async (args: {
        where?: {
          personId?: string;
          event?: { startsAt?: { gt?: Date } };
        };
        orderBy?: { event?: { startsAt?: "asc" | "desc" } };
        select?: Record<string, unknown>;
      }) => {
        let rows = items.filter((i) => {
          const w = args.where ?? {};
          if (w.personId !== undefined && i.personId !== w.personId)
            return false;
          const gt = w.event?.startsAt?.gt;
          if (gt && !(i.event.startsAt > gt)) return false;
          return true;
        });
        if (args.orderBy?.event?.startsAt === "asc")
          rows = [...rows].sort(
            (a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime(),
          );
        return args.select
          ? rows.map((i) => applySelect(i, args.select!))
          : rows;
      },
      upsert: async (args: {
        where: { personId_eventId: { personId: string; eventId: string } };
        create: { personId: string; eventId: string; note: string | null };
        update: { note?: string | null };
        select?: Record<string, unknown>;
      }) => {
        const { personId, eventId } = args.where.personId_eventId;
        let item = items.find(
          (i) => i.personId === personId && i.eventId === eventId,
        );
        if (!item) {
          const event = events.find((e) => e.id === eventId)!;
          item = {
            personId,
            eventId,
            note: args.create.note,
            addedAt: new Date(),
            event,
          };
          items.push(item);
        } else {
          // undefined = campo no enviado → Prisma no lo toca.
          if (args.update.note !== undefined) item.note = args.update.note;
        }
        return args.select ? applySelect(item, args.select) : item;
      },
      deleteMany: async (args: {
        where: { personId: string; eventId: string };
      }) => {
        const before = items.length;
        const { personId, eventId } = args.where;
        for (let i = items.length - 1; i >= 0; i--) {
          if (items[i].personId === personId && items[i].eventId === eventId)
            items.splice(i, 1);
        }
        return { count: before - items.length };
      },
    },
    // Acceso de prueba al estado persistido.
    __items: items,
  };
  return prisma as unknown as PrismaService & { __items: FakeTripItem[] };
}

const flag = (enabled: boolean): FakeFlag => ({
  key: "trip_planner",
  enabled,
});

let seq = 0;
const FUTURE = new Date(Date.now() + 72 * 60 * 60 * 1000);
const ev = (over: Partial<FakeEvent>): FakeEvent => ({
  id: `ev-${++seq}`,
  name: "Social",
  type: "SOCIAL",
  status: "PUBLISHED",
  startsAt: FUTURE,
  endsAt: new Date(FUTURE.getTime() + 4 * 60 * 60 * 1000),
  presalePrice: 8000,
  doorPrice: 10000,
  genres: ["SALSA"],
  genreMix: null,
  platformFeePct: null,
  series: null,
  venue: null,
  city: null,
  ...over,
});

function mkService(prisma: PrismaService) {
  return new TripService(prisma, new FeatureFlagsService(prisma));
}

describe("TripService - gate del flag trip_planner", () => {
  it("flag OFF → 404 en list/ids/save/remove", async () => {
    const svc = mkService(mkPrisma({ flags: [flag(false)] }));
    await expect(svc.list("p1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.ids("p1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.save("p1", "e1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.remove("p1", "e1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("flag ausente → 404 (fail-closed)", async () => {
    const svc = mkService(mkPrisma({}));
    await expect(svc.list("p1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("TripService.list (GET /me/trip)", () => {
  const setup = async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      events: [
        ev({
          id: "ev-stgo",
          name: "Social Stgo",
          city: { name: "Santiago", slug: "santiago-cl" },
          genres: [],
          series: {
            id: "ser-1",
            name: "Bachatamania",
            genres: ["BACHATA"],
            genreMix: [{ genre: "BACHATA", pct: 70 }],
          },
        }),
        ev({
          id: "ev-valpo",
          name: "Social Valpo",
          city: { name: "Valparaíso", slug: "valparaiso-cl" },
          startsAt: new Date(FUTURE.getTime() - 60 * 60 * 1000),
        }),
        ev({
          id: "ev-past",
          name: "Pasado",
          startsAt: new Date(Date.now() - 60 * 60 * 1000),
          endsAt: new Date(Date.now() - 30 * 60 * 1000),
        }),
      ],
    });
    const svc = mkService(prisma);
    await svc.save("me", "ev-stgo", "hotel cerca");
    await svc.save("me", "ev-valpo");
    await svc.save("me", "ev-past");
    await svc.save("other", "ev-stgo");
    return { svc, prisma };
  };

  it("devuelve solo mis items, orden por fecha asc, sin pasados", async () => {
    const { svc } = await setup();
    const rows = await svc.list("me");
    // ev-past queda fuera por default; orden por startsAt (valpo < stgo).
    expect(rows.map((r) => r.id)).toEqual(["ev-valpo", "ev-stgo"]);
  });

  it("expansión feed + city + note + addedAt; géneros heredan la serie", async () => {
    const { svc } = await setup();
    const rows = await svc.list("me");
    const stgo = rows.find((r) => r.id === "ev-stgo")!;
    expect(stgo.city).toEqual({ name: "Santiago", slug: "santiago-cl" });
    expect(stgo.note).toBe("hotel cerca");
    expect(stgo.addedAt).toBeInstanceOf(Date);
    expect(stgo.genres).toEqual(["BACHATA"]);
    expect(stgo.series).toEqual({ id: "ser-1", name: "Bachatamania" });
    expect(stgo.venue).toBeNull();
  });

  it("includePast=true incluye eventos ya pasados", async () => {
    const { svc } = await setup();
    const rows = await svc.list("me", true);
    expect(rows.map((r) => r.id)).toContain("ev-past");
  });

  it("aislamiento: el viaje de otro usuario no se ve", async () => {
    const { svc } = await setup();
    const mine = await svc.list("me");
    const other = await svc.list("other");
    expect(mine.map((r) => r.id)).not.toEqual(other.map((r) => r.id));
    expect(other.map((r) => r.id)).toEqual(["ev-stgo"]);
  });
});

describe("TripService.ids (GET /me/trip/ids)", () => {
  it("devuelve solo los eventId propios", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      events: [ev({ id: "e1" }), ev({ id: "e2" }), ev({ id: "e3" })],
    });
    const svc = mkService(prisma);
    await svc.save("me", "e1");
    await svc.save("me", "e2");
    await svc.save("other", "e3");
    expect((await svc.ids("me")).sort()).toEqual(["e1", "e2"]);
  });
});

describe("TripService.save (PUT /me/trip/:eventId)", () => {
  it("evento inexistente → 404, no crea item", async () => {
    const prisma = mkPrisma({ flags: [flag(true)], events: [] });
    const svc = mkService(prisma);
    await expect(svc.save("me", "no-existe")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.__items).toHaveLength(0);
  });

  it("upsert idempotente: re-PUT con nota distinta actualiza sin duplicar", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      events: [ev({ id: "e1" })],
    });
    const svc = mkService(prisma);
    await svc.save("me", "e1", "nota 1");
    const saved = await svc.save("me", "e1", "nota 2");
    expect(saved.note).toBe("nota 2");
    expect(prisma.__items).toHaveLength(1);
  });

  it("PUT sin nota conserva la existente; nota vacía la borra", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      events: [ev({ id: "e1" })],
    });
    const svc = mkService(prisma);
    await svc.save("me", "e1", "llevar zapatos");
    await svc.save("me", "e1"); // toggle desde ficha: sin body.note
    expect(prisma.__items[0].note).toBe("llevar zapatos");
    const cleared = await svc.save("me", "e1", "   ");
    expect(cleared.note).toBeNull();
    expect(prisma.__items[0].note).toBeNull();
  });
});

describe("TripService.remove (DELETE /me/trip/:eventId)", () => {
  it("quita el item propio; no existía → 404", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      events: [ev({ id: "e1" })],
    });
    const svc = mkService(prisma);
    await svc.save("me", "e1");
    await expect(svc.remove("me", "e1")).resolves.toEqual({ removed: true });
    expect(prisma.__items).toHaveLength(0);
    await expect(svc.remove("me", "e1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("no borra el item de otra persona (404 para mí, intacto para ella)", async () => {
    const prisma = mkPrisma({
      flags: [flag(true)],
      events: [ev({ id: "e1" })],
    });
    const svc = mkService(prisma);
    await svc.save("other", "e1");
    await expect(svc.remove("me", "e1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.__items).toHaveLength(1);
  });
});
