import { describe, it, expect, beforeEach } from "vitest";
import { StreamableFile } from "@nestjs/common";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import { EventsController } from "./events.controller";

// EventsController.friendsGoing - prueba social del detalle: solo amigos
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
  status: "ACTIVE" | "USED" | "CANCELLED" | "TRANSFERRED";
  buyerId?: string;
  listPrice?: number;
  serviceFee?: number;
  paymentId?: string | null;
  claimToken?: string | null;
  createdAt?: Date;
}

interface FakePerson {
  id: string;
  name: string;
  photoUrl: string | null;
  // Gating Producer Pro (S5) - solo se consultan cuando el caller es el
  // productor dueño del recurso.
  proTier?: string;
  proTrialEndsAt?: Date | null;
}

interface FakeEvent {
  id: string;
  producerId: string;
  seriesId?: string;
  name?: string;
  startsAt?: Date;
}

interface FakeSeries {
  id: string;
  producerId: string;
  name?: string;
}

interface FakeCheckin {
  eventId: string;
  personId: string;
  method: string;
  inAt: Date;
  outAt: Date | null;
  voidedAt: Date | null;
  note: string | null;
}

interface FakeGuestEntry {
  personId: string;
  status: string;
  createdAt: Date;
}

interface FakeGuestList {
  id: string;
  eventId: string;
  ownerId: string;
  label: string | null;
  entries: FakeGuestEntry[];
}

interface FakePayment {
  id: string;
  channel: string;
}

interface FakeRole {
  key: string;
  isSuperuser: boolean;
  permissionKeys: string[];
}

// eventId puede ser string o { in: string[] } (scope del export por serie).
const matchEventId = (v: string, cond: string | { in: string[] }) =>
  typeof cond === "object" ? cond.in.includes(v) : v === cond;

class FakePrisma {
  friendships: FakeFriendship[] = [];
  tickets: FakeTicket[] = [];
  events: FakeEvent[] = [];
  eventSeriesRows: FakeSeries[] = [];
  checkins: FakeCheckin[] = [];
  guestLists: FakeGuestList[] = [];
  payments: FakePayment[] = [];
  roles: FakeRole[] = [];
  people = new Map<string, FakePerson>();
  /** Último `where` recibido por event.findMany - tests de mine() lo inspeccionan. */
  eventLastWhere: unknown = null;

  event = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.events.find((e) => e.id === where.id) ?? null,
    findMany: async (args: { where?: { seriesId?: string } }) => {
      const where = args.where ?? {};
      this.eventLastWhere = where;
      return this.events.filter(
        (e) => where.seriesId === undefined || e.seriesId === where.seriesId,
      );
    },
    count: async ({ where }: { where?: { seriesId?: string } }) =>
      this.events.filter(
        (e) =>
          !where ||
          where.seriesId === undefined ||
          e.seriesId === where.seriesId,
      ).length,
  };

  eventSeries = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.eventSeriesRows.find((s) => s.id === where.id) ?? null,
  };

  checkin = {
    findMany: async ({
      where,
    }: {
      where: { eventId: string | { in: string[] } };
    }) =>
      this.checkins.filter((c) => matchEventId(c.eventId, where.eventId)),
    // mine() agrega el pulso por groupBy - stub vacío (sin stats).
    groupBy: async () => [] as { eventId: string; _count: { _all: number } }[],
  };

  guestList = {
    findMany: async ({
      where,
    }: {
      where: { eventId: string | { in: string[] } };
    }) =>
      this.guestLists.filter((l) => matchEventId(l.eventId, where.eventId)),
  };

  payment = {
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      this.payments.filter((p) => where.id.in.includes(p.id)),
    // mine() agrega el bruto por groupBy - stub vacío.
    groupBy: async () => [] as { eventId: string; _sum: { amount: number | null } }[],
  };

  role = {
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      this.roles
        .filter((r) => where.key.in.includes(r.key))
        .map((r) => ({
          key: r.key,
          isSuperuser: r.isSuperuser,
          permissions: r.permissionKeys.map((permissionKey) => ({
            permissionKey,
          })),
        })),
  };

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
      where: {
        eventId: string | { in: string[] };
        ownerId?: { in: string[] };
        status?: string;
      };
      distinct?: string[];
    }) => {
      const rows = this.tickets.filter(
        (t) =>
          matchEventId(t.eventId, where.eventId) &&
          (where.status === undefined || t.status === where.status) &&
          (where.ownerId === undefined ||
            where.ownerId.in.includes(t.ownerId)),
      );
      // distinct: ["ownerId"] → una fila por dueño.
      if (distinct?.includes("ownerId")) {
        const seen = new Set<string>();
        return rows.filter((t) => !seen.has(t.ownerId) && seen.add(t.ownerId));
      }
      return rows;
    },
    // mine() agrega vendidas por groupBy - stub vacío.
    groupBy: async () => [] as { eventId: string; _count: { _all: number } }[],
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
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.people.get(where.id) ?? null,
  };

  staffAssignment = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { eventId_personId: { eventId: string; personId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => ({ id: "sa-1", ...create, ...update, ...where.eventId_personId }),
  };
}

const reqAs = (personId: string, roles: string[] = []) =>
  ({ person: { id: personId, roles } }) as unknown as Request;

/** Body de respuesta de una HttpException. */
const errBody = (e: unknown): Record<string, unknown> =>
  ((e as { getResponse?: () => unknown }).getResponse?.() ?? {}) as Record<
    string,
    unknown
  >;

// Productor con Pro vigente vía trial de lanzamiento (S5) - el default de
// los seeds; los tests de gating lo sobrescriben.
const mkProducer = (id: string, over: Partial<FakePerson> = {}): FakePerson => ({
  id,
  name: "Prod",
  photoUrl: null,
  proTier: "FREE",
  proTrialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
  ...over,
});

describe("EventsController.friendsGoing", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      // ParamsService mockeado - friendsGoing no toca defaults de productor.
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

// EventsController.exportCsv - exporte operativo del productor: tres
// datasets (sales/checkins/guestlist), auth owner/admin, CSV con BOM +
// escaping. Sin claimToken ni ids internos de persona.

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    res: {
      setHeader: (k: string, v: string) => {
        headers[k.toLowerCase()] = v;
      },
    } as never,
  };
}

const rows = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n");

describe("EventsController.exportCsv", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      { getProducerParams: async () => null } as never,
    );
    prisma.events.push({ id: "ev-1", producerId: "prod-1" });
    prisma.people.set("prod-1", mkProducer("prod-1"));
    prisma.people.set("buyer", { id: "buyer", name: "Ana, Compra", photoUrl: null });
    prisma.people.set("asist", { id: "asist", name: "Luis Asiste", photoUrl: null });
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
  });

  it("owner descarga sales con nombres, canal desde Payment y sin claimToken", async () => {
    prisma.payments.push({ id: "pay-1", channel: "WEB" });
    prisma.tickets.push({
      eventId: "ev-1",
      ownerId: "asist",
      buyerId: "buyer",
      listPrice: 10000,
      serviceFee: 500,
      status: "ACTIVE",
      paymentId: "pay-1",
      claimToken: "secret-token",
      createdAt: new Date("2026-09-01T20:00:00Z"),
    });

    const { res, headers } = fakeRes();
    const csv = await ctrl.exportCsv("ev-1", { dataset: "sales" }, reqAs("prod-1"), res);

    expect(headers["content-type"]).toContain("text/csv");
    expect(headers["content-disposition"]).toContain("attachment");
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const [head, row] = rows(csv);
    expect(head).toBe(
      "fecha,comprador,asistente,precio_lista,cargo_servicio,total,estado,canal,payment_id",
    );
    // "Ana, Compra" lleva coma → quoted
    expect(row).toBe(
      '2026-09-01T20:00:00.000Z,"Ana, Compra",Luis Asiste,10000,500,10500,ACTIVE,WEB,pay-1',
    );
    expect(csv).not.toContain("secret-token");
    expect(csv).not.toContain("buyer"); // ids internos no salen
  });

  it("ticket sin paymentId → canal y payment_id vacíos", async () => {
    prisma.tickets.push({
      eventId: "ev-1",
      ownerId: "asist",
      buyerId: "buyer",
      listPrice: 8000,
      serviceFee: 0,
      status: "USED",
      paymentId: null,
      createdAt: new Date("2026-09-01T21:00:00Z"),
    });
    const { res } = fakeRes();
    const csv = await ctrl.exportCsv("ev-1", { dataset: "sales" }, reqAs("prod-1"), res);
    expect(rows(csv)[1]).toMatch(/,USED,,$/);
  });

  it("checkins: incluye anulados con anulado=si y nota", async () => {
    prisma.checkins.push(
      {
        eventId: "ev-1",
        personId: "asist",
        method: "SCAN",
        inAt: new Date("2026-09-01T23:00:00Z"),
        outAt: null,
        voidedAt: null,
        note: null,
      },
      {
        eventId: "ev-1",
        personId: "buyer",
        method: "MANUAL",
        inAt: new Date("2026-09-01T23:30:00Z"),
        outAt: new Date("2026-09-02T02:00:00Z"),
        voidedAt: new Date("2026-09-02T01:00:00Z"),
        note: "cortesía",
      },
    );
    const { res } = fakeRes();
    const csv = await ctrl.exportCsv("ev-1", { dataset: "checkins" }, reqAs("prod-1"), res);
    const [head, r1, r2] = rows(csv);
    expect(head).toBe("entrada,salida,metodo,persona,anulado,nota");
    expect(r1).toBe(
      "2026-09-01T23:00:00.000Z,,SCAN,Luis Asiste,,",
    );
    expect(r2).toBe(
      '2026-09-01T23:30:00.000Z,2026-09-02T02:00:00.000Z,MANUAL,"Ana, Compra",si,cortesía',
    );
  });

  it("guestlist: una fila por entrada con lista, dueño e invitado", async () => {
    prisma.people.set("owner-gl", { id: "owner-gl", name: "Cumpleañera", photoUrl: null });
    prisma.guestLists.push({
      id: "gl-1",
      eventId: "ev-1",
      ownerId: "owner-gl",
      label: "Cumple de X",
      entries: [
        { personId: "asist", status: "ARRIVED", createdAt: new Date("2026-08-30T10:00:00Z") },
        { personId: "buyer", status: "PENDING", createdAt: new Date("2026-08-30T11:00:00Z") },
      ],
    });
    const { res } = fakeRes();
    const csv = await ctrl.exportCsv("ev-1", { dataset: "guestlist" }, reqAs("prod-1"), res);
    const [head, r1, r2] = rows(csv);
    expect(head).toBe("lista,dueno_lista,invitado,estado,creado");
    expect(r1).toBe(
      "Cumple de X,Cumpleañera,Luis Asiste,ARRIVED,2026-08-30T10:00:00.000Z",
    );
    expect(r2).toContain('"Ana, Compra",PENDING');
  });

  it("admin.access (isSuperuser) descarga aunque no sea owner", async () => {
    const { res } = fakeRes();
    const csv = await ctrl.exportCsv(
      "ev-1",
      { dataset: "sales" },
      reqAs("otro", ["ADMIN"]),
      res,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("otro productor (no owner, sin admin) → 403", async () => {
    const { res } = fakeRes();
    await expect(
      ctrl.exportCsv("ev-1", { dataset: "sales" }, reqAs("otro", ["PRODUCER"]), res),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("evento inexistente → 404", async () => {
    const { res } = fakeRes();
    await expect(
      ctrl.exportCsv("nope", { dataset: "sales" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("dataset inválido o ausente → 400", async () => {
    const { res } = fakeRes();
    await expect(
      ctrl.exportCsv("ev-1", { dataset: "nudes" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      ctrl.exportCsv("ev-1", { dataset: undefined as unknown as string }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("escaping: comillas internas se duplican", async () => {
    prisma.people.set("quot", { id: "quot", name: 'DJ "Nico"', photoUrl: null });
    prisma.checkins.push({
      eventId: "ev-1",
      personId: "quot",
      method: "SCAN",
      inAt: new Date("2026-09-01T23:00:00Z"),
      outAt: null,
      voidedAt: null,
      note: null,
    });
    const { res } = fakeRes();
    const csv = await ctrl.exportCsv("ev-1", { dataset: "checkins" }, reqAs("prod-1"), res);
    expect(rows(csv)[1]).toContain('"DJ ""Nico"""');
  });

  // ─── Gating Producer Pro (S5): exports son feature Pro ───

  it("owner FREE sin trial → 403 pro.required (csv y pdf)", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const { res } = fakeRes();
    const err = await ctrl
      .exportCsv("ev-1", { dataset: "sales" }, reqAs("prod-1"), res)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err)).toMatchObject({
      error: "pro.required",
      upgrade: true,
    });
    await expect(
      ctrl.exportPdf("ev-1", { dataset: "sales" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("owner FREE con trial vigente → exporta; PRO_* → exporta", async () => {
    const { res } = fakeRes();
    // trial vigente ya es el default del seed (mkProducer)
    const csv = await ctrl.exportCsv("ev-1", { dataset: "sales" }, reqAs("prod-1"), res);
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "PRO_GROWTH", proTrialEndsAt: null }),
    );
    const csv2 = await ctrl.exportCsv("ev-1", { dataset: "sales" }, reqAs("prod-1"), res);
    expect(csv2.charCodeAt(0)).toBe(0xfeff);
  });

  it("admin descarga aunque el owner sea FREE sin trial", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const { res } = fakeRes();
    const csv = await ctrl.exportCsv(
      "ev-1",
      { dataset: "sales" },
      reqAs("soporte", ["ADMIN"]),
      res,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("EventsController.exportSeriesCsv", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      { getProducerParams: async () => null } as never,
    );
    prisma.eventSeriesRows.push({ id: "ser-1", producerId: "prod-1" });
    prisma.events.push(
      {
        id: "ev-a",
        producerId: "prod-1",
        seriesId: "ser-1",
        name: "Gozadera",
        startsAt: new Date("2026-09-05T00:00:00Z"),
      },
      {
        id: "ev-b",
        producerId: "prod-1",
        seriesId: "ser-1",
        name: "Gozadera",
        startsAt: new Date("2026-09-12T00:00:00Z"),
      },
      { id: "ev-ajeno", producerId: "prod-1" }, // standalone, fuera de serie
    );
    prisma.people.set("prod-1", mkProducer("prod-1"));
    prisma.people.set("asist", { id: "asist", name: "Luis Asiste", photoUrl: null });
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
  });

  it("owner agrega los eventos de la serie con columna evento", async () => {
    prisma.checkins.push(
      {
        eventId: "ev-a",
        personId: "asist",
        method: "SCAN",
        inAt: new Date("2026-09-05T23:00:00Z"),
        outAt: null,
        voidedAt: null,
        note: null,
      },
      {
        eventId: "ev-b",
        personId: "asist",
        method: "MANUAL",
        inAt: new Date("2026-09-12T23:00:00Z"),
        outAt: null,
        voidedAt: null,
        note: null,
      },
      {
        eventId: "ev-ajeno",
        personId: "asist",
        method: "SCAN",
        inAt: new Date("2026-09-20T23:00:00Z"),
        outAt: null,
        voidedAt: null,
        note: null,
      },
    );
    const { res, headers } = fakeRes();
    const csv = await ctrl.exportSeriesCsv(
      "ser-1",
      { dataset: "checkins" },
      reqAs("prod-1"),
      res,
    );
    expect(headers["content-disposition"]).toContain("serie-ser-1");
    const [head, r1, r2] = rows(csv);
    expect(head).toBe("evento,entrada,salida,metodo,persona,anulado,nota");
    expect(r1).toContain("Gozadera (2026-09-05),");
    expect(r2).toContain("Gozadera (2026-09-12),");
    expect(csv).not.toContain("2026-09-20"); // evento fuera de la serie
  });

  it("sales de la serie agrega ambas fechas", async () => {
    prisma.tickets.push(
      {
        eventId: "ev-a",
        ownerId: "asist",
        buyerId: "asist",
        listPrice: 10000,
        serviceFee: 500,
        status: "USED",
        paymentId: null,
        createdAt: new Date("2026-09-05T20:00:00Z"),
      },
      {
        eventId: "ev-b",
        ownerId: "asist",
        buyerId: "asist",
        listPrice: 10000,
        serviceFee: 500,
        status: "ACTIVE",
        paymentId: null,
        createdAt: new Date("2026-09-12T20:00:00Z"),
      },
    );
    const { res } = fakeRes();
    const csv = await ctrl.exportSeriesCsv(
      "ser-1",
      { dataset: "sales" },
      reqAs("prod-1"),
      res,
    );
    const [head, ...body] = rows(csv);
    expect(head.startsWith("evento,")).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("serie inexistente → 404; otro productor → 403; dataset inválido → 400", async () => {
    const { res } = fakeRes();
    await expect(
      ctrl.exportSeriesCsv("nope", { dataset: "sales" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ctrl.exportSeriesCsv("ser-1", { dataset: "sales" }, reqAs("otro", ["PRODUCER"]), res),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ctrl.exportSeriesCsv("ser-1", { dataset: "nudes" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 400 });
    // admin siempre puede
    const csv = await ctrl.exportSeriesCsv(
      "ser-1",
      { dataset: "sales" },
      reqAs("otro", ["ADMIN"]),
      res,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("owner FREE sin trial → 403 pro.required también en export de serie", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const { res } = fakeRes();
    const err = await ctrl
      .exportSeriesCsv("ser-1", { dataset: "sales" }, reqAs("prod-1"), res)
      .catch((e: unknown) => e);
    expect(errBody(err).error).toBe("pro.required");
  });
});

// EventsController.exportPdf / exportSeriesPdf - mismo dataset y auth que
// el CSV, pero serializado como reporte imprimible (buildTablePdf) y
// servido como StreamableFile (un Buffer desnudo Nest lo serializa JSON).

const isPdf = (b: unknown) =>
  b instanceof StreamableFile && b.getStream() !== undefined;

describe("EventsController.exportPdf", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      { getProducerParams: async () => null } as never,
    );
    prisma.events.push({
      id: "ev-1",
      producerId: "prod-1",
      name: "Noche de Salsa",
      startsAt: new Date("2026-09-05T23:00:00Z"),
    });
    prisma.people.set("prod-1", mkProducer("prod-1"));
    prisma.people.set("asist", { id: "asist", name: "Luis Asiste", photoUrl: null });
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
  });

  it("owner descarga un PDF de ventas (magic bytes + content-type)", async () => {
    prisma.tickets.push({
      eventId: "ev-1",
      ownerId: "asist",
      buyerId: "asist",
      listPrice: 10000,
      serviceFee: 500,
      status: "ACTIVE",
      paymentId: null,
      claimToken: "secret-token",
      createdAt: new Date("2026-09-01T20:00:00Z"),
    });
    const { res, headers } = fakeRes();
    const pdf = await ctrl.exportPdf("ev-1", { dataset: "sales" }, reqAs("prod-1"), res);
    expect(headers["content-type"]).toBe("application/pdf");
    expect(headers["content-disposition"]).toContain("ev-1-sales.pdf");
    expect(isPdf(pdf)).toBe(true);
  });

  it("misma frontera que el CSV: stranger 403, evento 404, dataset 400", async () => {
    const { res } = fakeRes();
    await expect(
      ctrl.exportPdf("ev-1", { dataset: "sales" }, reqAs("otro", ["PRODUCER"]), res),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ctrl.exportPdf("nope", { dataset: "sales" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ctrl.exportPdf("ev-1", { dataset: "nudes" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("checkins y guestlist también generan PDF", async () => {
    const { res } = fakeRes();
    expect(
      isPdf(await ctrl.exportPdf("ev-1", { dataset: "checkins" }, reqAs("prod-1"), res)),
    ).toBe(true);
    expect(
      isPdf(await ctrl.exportPdf("ev-1", { dataset: "guestlist" }, reqAs("prod-1"), res)),
    ).toBe(true);
  });
});

describe("EventsController.exportSeriesPdf", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      { getProducerParams: async () => null } as never,
    );
    prisma.eventSeriesRows.push({
      id: "ser-1",
      producerId: "prod-1",
      name: "Gozadera",
    });
    prisma.events.push({
      id: "ev-a",
      producerId: "prod-1",
      seriesId: "ser-1",
      name: "Gozadera",
      startsAt: new Date("2026-09-05T00:00:00Z"),
    });
    prisma.people.set("prod-1", mkProducer("prod-1"));
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
  });

  it("owner descarga el PDF agregado de la serie", async () => {
    const { res, headers } = fakeRes();
    const pdf = await ctrl.exportSeriesPdf(
      "ser-1",
      { dataset: "checkins" },
      reqAs("prod-1"),
      res,
    );
    expect(headers["content-type"]).toBe("application/pdf");
    expect(headers["content-disposition"]).toContain(
      "serie-ser-1-checkins.pdf",
    );
    expect(isPdf(pdf)).toBe(true);
  });

  it("serie inexistente → 404; otro productor → 403", async () => {
    const { res } = fakeRes();
    await expect(
      ctrl.exportSeriesPdf("nope", { dataset: "sales" }, reqAs("prod-1"), res),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      ctrl.exportSeriesPdf("ser-1", { dataset: "sales" }, reqAs("otro", ["PRODUCER"]), res),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// EventsController.detail - presaleEndsAt: el instante de corte de la
// preventa expuesto al cliente (misma regla que CheckoutService.purchaseTicket:
// presale.cutoff_hour del PlatformParam, hora local del día del evento).
// El checkout lo usa para estimar preventa vs puerta sin replicar la regla.
describe("EventsController.detail - presaleEndsAt", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;
  const numbers = new Map<string, number>();

  beforeEach(() => {
    prisma = new FakePrisma();
    numbers.clear();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      {
        getProducerParams: async () => null,
        getNumber: async (k: string, fb: number) => numbers.get(k) ?? fb,
      } as never,
    );
    prisma.events.push(
      Object.assign(
        {
          id: "ev-1",
          producerId: "prod-1",
          // sábado 5-sep-2026 23:00 local → el corte cae ese día a las 19:00
          startsAt: new Date(2026, 8, 5, 23, 0, 0),
        },
        { _count: { rsvps: 0 } },
      ),
    );
  });

  it("expone presaleEndsAt = cutoff_hour (19) del día del evento, hora local", async () => {
    const res = (await ctrl.detail("ev-1")) as { presaleEndsAt: Date };
    const ends = new Date(res.presaleEndsAt);
    expect(ends.getFullYear()).toBe(2026);
    expect(ends.getMonth()).toBe(8);
    expect(ends.getDate()).toBe(5);
    expect(ends.getHours()).toBe(19);
    expect(ends.getMinutes()).toBe(0);
  });

  it("respeta presale.cutoff_hour del PlatformParam", async () => {
    numbers.set("presale.cutoff_hour", 21);
    const res = (await ctrl.detail("ev-1")) as { presaleEndsAt: Date };
    expect(new Date(res.presaleEndsAt).getHours()).toBe(21);
  });
});

// EventsController.addStaff - gestión multi-staff es feature Producer Pro
// (S5): el owner FREE sin trial recibe 403 pro.required; con trial/tier
// Pro o siendo admin, el upsert sigue.
describe("EventsController.addStaff - gating Producer Pro", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      { getProducerParams: async () => null } as never,
    );
    prisma.events.push({ id: "ev-1", producerId: "prod-1" });
    prisma.people.set("prod-1", mkProducer("prod-1"));
    prisma.people.set("door", { id: "door", name: "Puerta", photoUrl: null });
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
  });

  const dto = { personId: "door", role: "DOOR" as const };

  it("owner FREE sin trial → 403 pro.required", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const err = await ctrl
      .addStaff("ev-1", dto, reqAs("prod-1"))
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err).error).toBe("pro.required");
  });

  it("owner con trial vigente → asigna staff", async () => {
    const res = await ctrl.addStaff("ev-1", dto, reqAs("prod-1"));
    expect(res).toMatchObject({ eventId: "ev-1", personId: "door" });
  });

  it("admin asigna staff aunque el owner sea FREE", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const res = await ctrl.addStaff("ev-1", dto, reqAs("soporte", ["ADMIN"]));
    expect(res).toMatchObject({ personId: "door" });
  });
});

// EventsController.mine - filtros del contrato compartido (spec
// analytics/query-console): q sobre nombre, status/type como whitelist
// (los @IsIn del DTO hacen 400 en Nest; acá se verifica que bajen al
// where) y from/to acotando startsAt. Sin params → solo producerId.
describe("EventsController.mine - filtros", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = new EventsController(
      prisma as unknown as PrismaService,
      { getProducerParams: async () => null } as never,
    );
    prisma.events.push(
      { id: "ev-1", producerId: "prod-1", name: "Noche de Salsa" },
      { id: "ev-2", producerId: "prod-1", name: "Práctica" },
    );
  });

  it("sin filtros → where solo producerId", async () => {
    const res = await ctrl.mine(reqAs("prod-1"), {});
    expect(prisma.eventLastWhere).toEqual({ producerId: "prod-1" });
    expect(res.items).toHaveLength(2);
    expect(res.total).toBe(2);
  });

  it("q/status/type/from+to bajan al where", async () => {
    await ctrl.mine(reqAs("prod-1"), {
      q: "  goza  ",
      status: "PUBLISHED",
      type: "SOCIAL",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(prisma.eventLastWhere).toEqual({
      producerId: "prod-1",
      name: { contains: "goza", mode: "insensitive" },
      status: "PUBLISHED",
      type: "SOCIAL",
      startsAt: {
        gte: new Date("2026-10-01"),
        lte: new Date("2026-10-31"),
      },
    });
  });
});
