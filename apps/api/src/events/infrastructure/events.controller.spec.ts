import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import { EventsController } from "./events.controller";

// EventsController.friendsGoing — prueba social del detalle: solo amigos
// ACCEPTED del solicitante con ticket ACTIVE del evento, dedup por
// persona (un amigo con 2 tickets aparece una vez).

interface FakeFriendship {
  aId: string;
  bId: string;
  status: "PENDING" | "ACCEPTED";
}

interface FakeTicket {
  eventId: string;
  ownerId: string;
  status: "ACTIVE" | "USED" | "CANCELLED";
}

interface FakePerson {
  id: string;
  name: string;
  photoUrl: string | null;
}

class FakePrisma {
  friendships: FakeFriendship[] = [];
  tickets: FakeTicket[] = [];
  people = new Map<string, FakePerson>();

  friendship = {
    findMany: async ({
      where,
    }: {
      where: {
        OR: { aId?: string; bId?: string }[];
        status: string;
      };
    }) =>
      this.friendships.filter(
        (f) =>
          f.status === where.status &&
          where.OR.some(
            (c) =>
              (c.aId !== undefined && f.aId === c.aId) ||
              (c.bId !== undefined && f.bId === c.bId),
          ),
      ),
  };

  ticket = {
    findMany: async ({
      where,
      distinct,
    }: {
      where: { eventId: string; ownerId: { in: string[] }; status: string };
      distinct?: string[];
    }) => {
      const rows = this.tickets.filter(
        (t) =>
          t.eventId === where.eventId &&
          t.status === where.status &&
          where.ownerId.in.includes(t.ownerId),
      );
      // distinct: ["ownerId"] → una fila por dueño.
      if (distinct?.includes("ownerId")) {
        const seen = new Set<string>();
        return rows.filter((t) => !seen.has(t.ownerId) && seen.add(t.ownerId));
      }
      return rows;
    },
  };

  person = {
    findMany: async ({
      where,
      orderBy,
    }: {
      where: { id: { in: string[] } };
      orderBy?: { name: "asc" };
    }) => {
      const rows = [...this.people.values()].filter((p) =>
        where.id.in.includes(p.id),
      );
      if (orderBy?.name === "asc") {
        rows.sort((a, b) => a.name.localeCompare(b.name));
      }
      return rows;
    },
  };
}

const reqAs = (personId: string) =>
  ({ person: { id: personId } }) as unknown as Request;

describe("EventsController.friendsGoing", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      // ParamsService mockeado — friendsGoing no toca defaults de productor.
      { getProducerParams: async () => null } as never,
    );
    prisma.people.set("me", { id: "me", name: "Yo", photoUrl: null });
    prisma.people.set("cami", {
      id: "cami",
      name: "Camila",
      photoUrl: null,
    });
    prisma.people.set("jose", {
      id: "jose",
      name: "Josefa",
      photoUrl: null,
    });
    prisma.people.set("str", {
      id: "str",
      name: "Desconocido",
      photoUrl: null,
    });
  });

  it("lista solo amigos ACCEPTED con ticket ACTIVE del evento", async () => {
    prisma.friendships.push(
      { aId: "me", bId: "cami", status: "ACCEPTED" },
      { aId: "jose", bId: "me", status: "ACCEPTED" }, // inversa
      { aId: "me", bId: "str", status: "PENDING" }, // no confirmado
    );
    prisma.tickets.push(
      { eventId: "ev-1", ownerId: "cami", status: "ACTIVE" },
      { eventId: "ev-1", ownerId: "jose", status: "ACTIVE" },
      { eventId: "ev-1", ownerId: "str", status: "ACTIVE" }, // no es amigo
      { eventId: "ev-2", ownerId: "cami", status: "ACTIVE" }, // otro evento
      { eventId: "ev-1", ownerId: "jose", status: "CANCELLED" },
    );

    const res = await ctrl.friendsGoing("ev-1", reqAs("me"));
    expect(res.map((p) => p.id).sort()).toEqual(["cami", "jose"]);
  });

  it("dedup: un amigo con varios tickets aparece una vez", async () => {
    prisma.friendships.push({ aId: "me", bId: "cami", status: "ACCEPTED" });
    prisma.tickets.push(
      { eventId: "ev-1", ownerId: "cami", status: "ACTIVE" },
      { eventId: "ev-1", ownerId: "cami", status: "ACTIVE" }, // compró 2
    );

    const res = await ctrl.friendsGoing("ev-1", reqAs("me"));
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("cami");
  });

  it("sin amigos o sin tickets → []", async () => {
    expect(await ctrl.friendsGoing("ev-1", reqAs("me"))).toEqual([]);

    prisma.friendships.push({ aId: "me", bId: "cami", status: "ACCEPTED" });
    expect(await ctrl.friendsGoing("ev-1", reqAs("me"))).toEqual([]);
  });
});
