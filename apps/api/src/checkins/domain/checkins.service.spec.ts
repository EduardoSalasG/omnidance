import { describe, it, expect, beforeEach } from "vitest";
import type { Checkin, EntryPass, Ticket } from "@prisma/client";
import {
  CheckinsService,
  DuplicateCheckinError,
  EventNotFoundError,
  PersonNotFoundError,
} from "./checkins.service";
import type {
  CheckinsRepo,
  CreateCheckinData,
  ListedCheckin,
  ResolvedPass,
} from "./ports";

// ─── Fake repo in-memory ───
class FakeCheckinsRepo implements CheckinsRepo {
  events = new Set<string>();
  people = new Map<
    string,
    { id: string; name: string; photoUrl: string | null }
  >();
  checkins: Checkin[] = [];
  tickets: Ticket[] = [];
  entryPasses: EntryPass[] = [];
  createdWith: { data: CreateCheckinData; pass: ResolvedPass | null }[] = [];

  async findEventById(id: string) {
    return this.events.has(id) ? { id } : null;
  }

  async findPersonById(id: string) {
    return this.people.get(id) ?? null;
  }

  async findOpenCheckin(eventId: string, personId: string) {
    return (
      this.checkins.find(
        (c) =>
          c.eventId === eventId && c.personId === personId && c.outAt === null,
      ) ?? null
    );
  }

  async findActiveTicket(eventId: string, ownerId: string) {
    return (
      this.tickets.find(
        (t) =>
          t.eventId === eventId &&
          t.ownerId === ownerId &&
          t.status === "ACTIVE",
      ) ?? null
    );
  }

  async findActiveEntryPass(eventId: string, personId: string) {
    return (
      this.entryPasses.find(
        (p) =>
          p.eventId === eventId &&
          p.personId === personId &&
          p.status === "ACTIVE",
      ) ?? null
    );
  }

  async createCheckin(data: CreateCheckinData, pass: ResolvedPass | null) {
    this.createdWith.push({ data, pass });
    const checkin: Checkin = {
      id: `chk-${this.checkins.length + 1}`,
      eventId: data.eventId,
      personId: data.personId,
      passId: data.passId,
      staffId: data.staffId,
      method: data.method,
      inAt: new Date(),
      outAt: null,
      syncedAt: new Date(),
      voidedAt: null,
      voidReason: null,
      note: data.note,
    };
    this.checkins.push(checkin);
    if (pass?.kind === "TICKET") {
      const t = this.tickets.find((x) => x.id === pass.id);
      if (t) t.status = "USED";
    }
    if (pass?.kind === "ENTRY_PASS") {
      const p = this.entryPasses.find((x) => x.id === pass.id);
      if (p) p.status = "USED";
    }
    return checkin;
  }

  async listEventCheckins(eventId: string): Promise<ListedCheckin[]> {
    return this.checkins
      .filter((c) => c.eventId === eventId)
      .map((c) => ({
        ...c,
        person: this.people.get(c.personId) ?? {
          id: c.personId,
          name: "?",
          photoUrl: null,
        },
      }));
  }
}

const mkTicket = (over: Partial<Ticket>): Ticket => ({
  id: "tkt-1",
  eventId: "evt-1",
  eventDayId: null,
  ownerId: "per-1",
  buyerId: "per-1",
  listPrice: 5000,
  serviceFee: 500,
  status: "ACTIVE",
  giftedFromId: null,
  discountCodeId: null,
  createdAt: new Date(),
  ...over,
});

const mkEntryPass = (over: Partial<EntryPass>): EntryPass => ({
  id: "pass-1",
  eventId: "evt-1",
  personId: "per-1",
  type: "COMP",
  price: 0,
  validUntil: null,
  status: "ACTIVE",
  createdAt: new Date(),
  ...over,
});

describe("CheckinsService.register", () => {
  let repo: FakeCheckinsRepo;
  let svc: CheckinsService;

  beforeEach(() => {
    repo = new FakeCheckinsRepo();
    repo.events.add("evt-1");
    repo.people.set("per-1", {
      id: "per-1",
      name: "Bailarín Uno",
      photoUrl: "https://x/y.jpg",
    });
    svc = new CheckinsService(repo);
  });

  it("con ticket ACTIVE → checkin con passId=ticket.id y ticket queda USED", async () => {
    repo.tickets.push(mkTicket({ id: "tkt-9" }));
    const res = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "SCAN",
    });
    expect(res.checkin.passId).toBe("tkt-9");
    expect(res.checkin.staffId).toBe("staff-1");
    expect(res.checkin.method).toBe("SCAN");
    expect(res.ticket).toEqual({ id: "tkt-9", status: "USED" });
    expect(res.passType).toBeNull();
    expect(repo.tickets[0].status).toBe("USED");
    expect(res.person).toEqual({
      name: "Bailarín Uno",
      photoUrl: "https://x/y.jpg",
    });
  });

  it("sin ticket → checkin igual se crea con passId null, ticket null y staffId auditado", async () => {
    const res = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "MANUAL",
    });
    expect(res.checkin.passId).toBeNull();
    expect(res.checkin.staffId).toBe("staff-1");
    expect(res.ticket).toBeNull();
    expect(res.passType).toBeNull();
  });

  it("sin ticket pero con EntryPass ACTIVE → resuelve el pase, lo marca USED y expone passType", async () => {
    repo.entryPasses.push(mkEntryPass({ id: "pass-7", type: "LIST" }));
    const res = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "SCAN",
    });
    expect(res.checkin.passId).toBe("pass-7");
    expect(repo.entryPasses[0].status).toBe("USED");
    expect(res.ticket).toBeNull();
    expect(res.passType).toBe("LIST");
  });

  it("note del staff se persiste en el checkin", async () => {
    const res = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "MANUAL",
      note: "cortesía cumpleaños",
    });
    expect(repo.createdWith[0].data.note).toBe("cortesía cumpleaños");
    expect(res.checkin.note).toBe("cortesía cumpleaños");
  });

  it("sin note → Checkin.note queda null", async () => {
    const res = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "MANUAL",
    });
    expect(res.checkin.note).toBeNull();
  });

  it("ticket tiene prioridad sobre EntryPass cuando ambos existen", async () => {
    repo.tickets.push(mkTicket({ id: "tkt-1" }));
    repo.entryPasses.push(mkEntryPass({ id: "pass-1" }));
    const res = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "SCAN",
    });
    expect(res.checkin.passId).toBe("tkt-1");
    expect(repo.entryPasses[0].status).toBe("ACTIVE");
  });

  it("ticket USED/CANCELLED no se reutiliza → checkin con passId null", async () => {
    repo.tickets.push(mkTicket({ id: "tkt-used", status: "USED" }));
    const res = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "SCAN",
    });
    expect(res.checkin.passId).toBeNull();
    expect(res.ticket).toBeNull();
  });

  it("doble check-in (abierto) → DuplicateCheckinError con el checkin existente", async () => {
    await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "s",
      method: "SCAN",
    });
    const err = await svc
      .register({
        eventId: "evt-1",
        personId: "per-1",
        staffId: "s",
        method: "SCAN",
      })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DuplicateCheckinError);
    expect((err as DuplicateCheckinError).existing.id).toBe(repo.checkins[0].id);
    expect(repo.checkins).toHaveLength(1);
  });

  it("checkin ya cerrado (outAt) no bloquea un nuevo ingreso", async () => {
    const first = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "s",
      method: "SCAN",
    });
    first.checkin.outAt = new Date();
    const second = await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "s",
      method: "SCAN",
    });
    expect(second.checkin.id).not.toBe(first.checkin.id);
    expect(repo.checkins).toHaveLength(2);
  });

  it("evento inexistente → EventNotFoundError", async () => {
    await expect(
      svc.register({
        eventId: "no-hay",
        personId: "per-1",
        staffId: "s",
        method: "SCAN",
      }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });

  it("persona inexistente → PersonNotFoundError", async () => {
    await expect(
      svc.register({
        eventId: "evt-1",
        personId: "ghost",
        staffId: "s",
        method: "MANUAL",
      }),
    ).rejects.toBeInstanceOf(PersonNotFoundError);
  });
});

describe("CheckinsService.listByEvent", () => {
  let repo: FakeCheckinsRepo;
  let svc: CheckinsService;

  beforeEach(() => {
    repo = new FakeCheckinsRepo();
    repo.events.add("evt-1");
    repo.people.set("per-1", {
      id: "per-1",
      name: "Bailarín Uno",
      photoUrl: null,
    });
    svc = new CheckinsService(repo);
  });

  it("lista checkins del evento con datos de person", async () => {
    await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "s",
      method: "SCAN",
    });
    const list = await svc.listByEvent("evt-1");
    expect(list).toHaveLength(1);
    expect(list[0].person.name).toBe("Bailarín Uno");
    expect(list[0].method).toBe("SCAN");
  });

  it("evento inexistente → EventNotFoundError", async () => {
    await expect(svc.listByEvent("no-hay")).rejects.toBeInstanceOf(
      EventNotFoundError,
    );
  });
});
