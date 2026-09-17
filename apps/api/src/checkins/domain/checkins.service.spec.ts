import { describe, it, expect, beforeEach } from "vitest";
import type { Checkin, EntryPass, Ticket } from "@prisma/client";
import {
  AlreadyVoidedError,
  CheckinForbiddenError,
  CheckinNotFoundError,
  CheckinsService,
  DoorCapReachedError,
  DuplicateCheckinError,
  EventNotFoundError,
  PersonNotFoundError,
} from "./checkins.service";
import type {
  CheckinsRepo,
  CreateCheckinData,
  DoorSaleTxInput,
  EventDoorInfo,
  ListedCheckin,
  ResolvedPass,
  VoidCheckinInput,
} from "./ports";

// ─── Fake repo in-memory ───
class FakeCheckinsRepo implements CheckinsRepo {
  events = new Map<string, EventDoorInfo>();
  people = new Map<
    string,
    { id: string; name: string; photoUrl: string | null; phone?: string }
  >();
  checkins: Checkin[] = [];
  tickets: Ticket[] = [];
  entryPasses: EntryPass[] = [];
  createdWith: { data: CreateCheckinData; pass: ResolvedPass | null }[] = [];
  auditLogs: { actorId: string; action: string; payload: unknown }[] = [];
  /** RBAC simulado: permisos por personId + flags. */
  permissions = new Map<string, Set<string>>();
  superusers = new Set<string>();
  staffAssignments = new Set<string>(); // `${eventId}:${personId}`
  params = new Map<string, number>();

  addEvent(id: string, over: Partial<EventDoorInfo> = {}) {
    this.events.set(id, {
      id,
      status: "PUBLISHED",
      doorPrice: null,
      doorCap: null,
      producerId: null,
      ...over,
    });
  }

  async findEventById(id: string) {
    return this.events.get(id) ?? null;
  }

  async findPersonById(id: string) {
    return this.people.get(id) ?? null;
  }

  async findCheckinById(id: string) {
    return this.checkins.find((c) => c.id === id) ?? null;
  }

  async personHasPermission(personId: string, permissionKey: string) {
    return (
      this.superusers.has(personId) ||
      (this.permissions.get(personId)?.has(permissionKey) ?? false)
    );
  }

  async isSuperuser(personId: string) {
    return this.superusers.has(personId);
  }

  async isStaffAssigned(eventId: string, personId: string) {
    return this.staffAssignments.has(`${eventId}:${personId}`);
  }

  async closeCheckin(id: string) {
    const c = this.checkins.find((x) => x.id === id)!;
    c.outAt = new Date();
    return c;
  }

  async voidCheckin(input: VoidCheckinInput) {
    const c = this.checkins.find((x) => x.id === input.checkinId)!;
    c.voidedAt = new Date();
    c.voidReason = input.reason;
    if (c.passId) {
      const t = this.tickets.find((x) => x.id === c.passId);
      if (t?.status === "USED") t.status = "ACTIVE";
      const p = this.entryPasses.find((x) => x.id === c.passId);
      if (p?.status === "USED") p.status = "ACTIVE";
    }
    this.auditLogs.push({
      actorId: input.actorId,
      action: "CHECKIN_VOID",
      payload: {
        checkinId: c.id,
        eventId: c.eventId,
        reason: input.reason,
        prevOutAt: c.outAt?.toISOString() ?? null,
      },
    });
    return c;
  }

  async countDoorSales(eventId: string) {
    return this.checkins.filter(
      (c) => c.eventId === eventId && c.method === "MANUAL" && !c.voidedAt,
    ).length;
  }

  async findPersonByPhone(phone: string) {
    for (const p of this.people.values()) {
      if (p.phone === phone) return { id: p.id, name: p.name };
    }
    return null;
  }

  async createLightPerson(input: { name: string; phone: string }) {
    const id = `per-${this.people.size + 1}`;
    this.people.set(id, {
      id,
      name: input.name,
      photoUrl: null,
      phone: input.phone,
    });
    return { id, name: input.name };
  }

  async createDoorSale(input: DoorSaleTxInput) {
    const ticket: Ticket = {
      id: `tkt-${this.tickets.length + 1}`,
      eventId: input.eventId,
      eventDayId: null,
      ownerId: input.personId,
      buyerId: input.personId,
      listPrice: input.listPrice,
      serviceFee: input.serviceFee,
      status: "USED",
      giftedFromId: null,
      discountCodeId: null,
      createdAt: new Date(),
    };
    this.tickets.push(ticket);
    const checkin = await this.createCheckin(
      {
        eventId: input.eventId,
        personId: input.personId,
        staffId: input.staffId,
        method: "MANUAL",
        passId: ticket.id,
        note: null,
      },
      null, // el ticket ya nace USED — no hay pase que marcar
    );
    return { ticket, checkin };
  }

  async getParamNumber(key: string, fallback: number) {
    return this.params.get(key) ?? fallback;
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
    repo.addEvent("evt-1");
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
    repo.addEvent("evt-1");
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

describe("CheckinsService.closeCheckin", () => {
  let repo: FakeCheckinsRepo;
  let svc: CheckinsService;

  beforeEach(async () => {
    repo = new FakeCheckinsRepo();
    repo.addEvent("evt-1");
    repo.people.set("per-1", {
      id: "per-1",
      name: "Bailarín Uno",
      photoUrl: null,
    });
    repo.people.set("per-2", { id: "per-2", name: "Otra", photoUrl: null });
    svc = new CheckinsService(repo);
    await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "SCAN",
    });
  });

  it("owner cierra su propio check-in → outAt seteado", async () => {
    const res = await svc.closeCheckin(repo.checkins[0].id, { id: "per-1" });
    expect(res.outAt).not.toBeNull();
  });

  it("staff con checkins.write cierra check-in ajeno", async () => {
    repo.permissions.set("staff-2", new Set(["checkins.write"]));
    const res = await svc.closeCheckin(repo.checkins[0].id, { id: "staff-2" });
    expect(res.outAt).not.toBeNull();
  });

  it("idempotente: segundo out devuelve el mismo outAt sin error", async () => {
    const first = await svc.closeCheckin(repo.checkins[0].id, { id: "per-1" });
    const second = await svc.closeCheckin(repo.checkins[0].id, { id: "per-1" });
    expect(second.outAt?.getTime()).toBe(first.outAt?.getTime());
  });

  it("ni owner ni staff → CheckinForbiddenError", async () => {
    await expect(
      svc.closeCheckin(repo.checkins[0].id, { id: "per-2" }),
    ).rejects.toBeInstanceOf(CheckinForbiddenError);
    expect(repo.checkins[0].outAt).toBeNull();
  });

  it("check-in inexistente → CheckinNotFoundError", async () => {
    await expect(
      svc.closeCheckin("chk-ghost", { id: "per-1" }),
    ).rejects.toBeInstanceOf(CheckinNotFoundError);
  });
});

describe("CheckinsService.voidCheckin", () => {
  let repo: FakeCheckinsRepo;
  let svc: CheckinsService;

  beforeEach(async () => {
    repo = new FakeCheckinsRepo();
    repo.addEvent("evt-1");
    repo.people.set("per-1", {
      id: "per-1",
      name: "Bailarín Uno",
      photoUrl: null,
    });
    repo.tickets.push(mkTicket({ id: "tkt-1" }));
    svc = new CheckinsService(repo);
    await svc.register({
      eventId: "evt-1",
      personId: "per-1",
      staffId: "staff-1",
      method: "SCAN",
    });
  });

  it("admin anula → voidedAt+reason, ticket vuelve ACTIVE, audit CHECKIN_VOID", async () => {
    repo.superusers.add("admin-1");
    const res = await svc.voidCheckin(repo.checkins[0].id, "error de puerta", {
      id: "admin-1",
    });
    expect(res.voidedAt).not.toBeNull();
    expect(res.voidReason).toBe("error de puerta");
    expect(repo.tickets[0].status).toBe("ACTIVE");
    expect(repo.auditLogs).toHaveLength(1);
    expect(repo.auditLogs[0].action).toBe("CHECKIN_VOID");
    expect(repo.auditLogs[0].actorId).toBe("admin-1");
  });

  it("staff asignado con permiso anula; staff sin asignación → forbidden", async () => {
    repo.permissions.set("staff-9", new Set(["checkins.write"]));
    await expect(
      svc.voidCheckin(repo.checkins[0].id, "x", { id: "staff-9" }),
    ).rejects.toBeInstanceOf(CheckinForbiddenError);

    repo.staffAssignments.add("evt-1:staff-9");
    const res = await svc.voidCheckin(repo.checkins[0].id, "dup", {
      id: "staff-9",
    });
    expect(res.voidedAt).not.toBeNull();
  });

  it("ya anulado → AlreadyVoidedError", async () => {
    repo.superusers.add("admin-1");
    await svc.voidCheckin(repo.checkins[0].id, "r", { id: "admin-1" });
    await expect(
      svc.voidCheckin(repo.checkins[0].id, "r2", { id: "admin-1" }),
    ).rejects.toBeInstanceOf(AlreadyVoidedError);
    expect(repo.auditLogs).toHaveLength(1);
  });
});

describe("CheckinsService.doorSale", () => {
  let repo: FakeCheckinsRepo;
  let svc: CheckinsService;

  beforeEach(() => {
    repo = new FakeCheckinsRepo();
    repo.addEvent("evt-1", { doorPrice: 10000, doorCap: 2 });
    repo.superusers.add("admin-1");
    repo.params.set("service_fee.door_cash_clp", 0);
    repo.params.set("service_fee.door_app_clp", 700);
    svc = new CheckinsService(repo);
  });

  it("CASH con persona nueva → cuenta ligera, ticket USED fee 0, checkin MANUAL", async () => {
    const res = await svc.doorSale(
      {
        eventId: "evt-1",
        channel: "CASH",
        name: "Puerta Nuevo",
        phone: "010-1111-2222",
      },
      { id: "admin-1" },
    );
    expect(res.person.name).toBe("Puerta Nuevo");
    expect(res.ticket.status).toBe("USED");
    expect(res.ticket.serviceFee).toBe(0);
    expect(res.ticket.listPrice).toBe(10000);
    expect(res.checkin.method).toBe("MANUAL");
    expect(res.checkin.staffId).toBe("admin-1");
    expect(res.checkin.passId).toBe(res.ticket.id);
  });

  it("APP cobra service_fee.door_app_clp (700)", async () => {
    const res = await svc.doorSale(
      { eventId: "evt-1", channel: "APP", name: "App Buyer", phone: "010-3" },
      { id: "admin-1" },
    );
    expect(res.ticket.serviceFee).toBe(700);
  });

  it("phone existente → reutiliza la Person, no duplica", async () => {
    repo.people.set("per-9", {
      id: "per-9",
      name: "Ya Existe",
      photoUrl: null,
      phone: "010-9",
    });
    const res = await svc.doorSale(
      { eventId: "evt-1", channel: "CASH", name: "Otro Nombre", phone: "010-9" },
      { id: "admin-1" },
    );
    expect(res.person.id).toBe("per-9");
    expect(res.person.name).toBe("Ya Existe");
    expect(repo.people.size).toBe(1);
  });

  it("staff asignado con checkins.write puede vender", async () => {
    repo.permissions.set("staff-5", new Set(["checkins.write"]));
    repo.staffAssignments.add("evt-1:staff-5");
    const res = await svc.doorSale(
      { eventId: "evt-1", channel: "CASH", name: "N", phone: "010-5" },
      { id: "staff-5" },
    );
    expect(res.checkin.staffId).toBe("staff-5");
  });

  it("staff sin asignación → CheckinForbiddenError", async () => {
    repo.permissions.set("staff-6", new Set(["checkins.write"]));
    await expect(
      svc.doorSale(
        { eventId: "evt-1", channel: "CASH", name: "N", phone: "010-6" },
        { id: "staff-6" },
      ),
    ).rejects.toBeInstanceOf(CheckinForbiddenError);
  });

  it("doorCap alcanzado → DoorCapReachedError", async () => {
    await svc.doorSale(
      { eventId: "evt-1", channel: "CASH", name: "A", phone: "010-a" },
      { id: "admin-1" },
    );
    await svc.doorSale(
      { eventId: "evt-1", channel: "CASH", name: "B", phone: "010-b" },
      { id: "admin-1" },
    );
    await expect(
      svc.doorSale(
        { eventId: "evt-1", channel: "CASH", name: "C", phone: "010-c" },
        { id: "admin-1" },
      ),
    ).rejects.toBeInstanceOf(DoorCapReachedError);
  });

  it("evento inexistente → EventNotFoundError", async () => {
    await expect(
      svc.doorSale(
        { eventId: "no-hay", channel: "CASH", name: "N", phone: "010-x" },
        { id: "admin-1" },
      ),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  });
});
