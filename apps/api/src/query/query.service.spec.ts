import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaService } from "../prisma.service";
import { QueryService } from "./query.service";

// QueryService - motor de consultas compartido (spec
// analytics/query-console): lente = PersonRole APPROVED ∩ QUERY_ROLES;
// el scope nunca se puede bypassear (scopeId ajeno → vacío, no 403 ni
// datos); enums por whitelist → 400; SavedReport validado contra el
// catálogo y aislado por (personId, role).

interface FakePersonRole {
  personId: string;
  role: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface FakePerson {
  id: string;
  name: string | null;
  proTier?: string;
  proTrialEndsAt?: Date | null;
}

interface FakeEvent {
  id: string;
  producerId: string;
  seriesId?: string;
  name: string;
  startsAt: Date;
  status?: string;
}

interface FakeSeries {
  id: string;
  producerId: string;
  name: string;
}

interface FakeAcademy {
  id: string;
  ownerId: string;
  name: string;
}

interface FakeTicket {
  eventId: string;
  ownerId: string;
  buyerId?: string;
  listPrice?: number;
  serviceFee?: number;
  status?: string;
  paymentId?: string | null;
  createdAt?: Date;
}

interface FakePayment {
  id: string;
  channel?: string;
}

interface FakeEnrollment {
  id: string;
  academyId: string;
  personId: string;
  status: string;
  startedAt: Date;
  endsAt: Date | null;
  plan: { id: string; name: string };
}

interface FakeGuestList {
  id: string;
  eventId: string;
  ownerId: string;
  label: string | null;
}

interface FakeReport {
  id: string;
  personId: string;
  role: string;
  name: string;
  params: object;
  createdAt: Date;
}

interface EventWhere {
  seriesId?: string;
  producerId?: string;
  status?: string;
  name?: { contains: string };
  startsAt?: { gte?: Date; lte?: Date };
  OR?: EventWhere[];
}

const matchEventId = (v: string, cond: string | { in: string[] }) =>
  typeof cond === "object" ? cond.in.includes(v) : v === cond;

const matchIn = <T>(v: T, cond: T | { in: T[] }) =>
  typeof cond === "object" && cond !== null && "in" in cond
    ? (cond as { in: T[] }).in.includes(v)
    : v === cond;

class FakePrisma {
  personRoles: FakePersonRole[] = [];
  people = new Map<string, FakePerson>();
  events: FakeEvent[] = [];
  seriesRows: FakeSeries[] = [];
  academies: FakeAcademy[] = [];
  tickets: FakeTicket[] = [];
  payments: FakePayment[] = [];
  enrollments: FakeEnrollment[] = [];
  guestLists: FakeGuestList[] = [];
  plans: { id: string; academyId: string; name: string }[] = [];
  reports: FakeReport[] = [];
  reportSeq = 0;

  personRole = {
    findFirst: async ({
      where,
    }: {
      where: { personId: string; role: string; status: string };
    }) =>
      this.personRoles.find(
        (r) =>
          r.personId === where.personId &&
          r.role === where.role &&
          r.status === where.status,
      ) ?? null,
  };

  person = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.people.get(where.id) ?? null,
    findMany: async ({ where }: { where: { id?: { in: string[] } } }) =>
      [...this.people.values()].filter(
        (p) => !where.id || where.id.in.includes(p.id),
      ),
  };

  private matchEvent(e: FakeEvent, w: EventWhere): boolean {
    if (w.OR && !w.OR.some((c) => this.matchEvent(e, c))) return false;
    if (w.seriesId !== undefined && e.seriesId !== w.seriesId) return false;
    if (w.producerId && e.producerId !== w.producerId) return false;
    if (w.status && e.status !== w.status) return false;
    if (
      w.name &&
      !(e.name ?? "").toLowerCase().includes(w.name.contains.toLowerCase())
    )
      return false;
    if (w.startsAt) {
      if (w.startsAt.gte && e.startsAt < w.startsAt.gte) return false;
      if (w.startsAt.lte && e.startsAt > w.startsAt.lte) return false;
    }
    return true;
  }

  private matchEventCond(e: FakeEvent, c: EventWhere): boolean {
    // Rama {series:{producerId}} del OR de scope del productor.
    const seriesOwner = c as EventWhere & {
      series?: { producerId?: string };
    };
    if (seriesOwner.series?.producerId) {
      const s = this.seriesRows.find((x) => x.id === e.seriesId);
      return s?.producerId === seriesOwner.series.producerId;
    }
    return this.matchEvent(e, c);
  }

  event = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.events.find((e) => e.id === where.id) ?? null,
    findMany: async ({ where }: { where: EventWhere }) =>
      this.events.filter(
        (e) =>
          this.matchEvent(e, where) &&
          (!where.OR || where.OR.some((c) => this.matchEventCond(e, c))),
      ),
    count: async ({ where }: { where: EventWhere }) =>
      this.events.filter((e) => this.matchEvent(e, where)).length,
  };

  eventSeries = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.seriesRows.find((s) => s.id === where.id) ?? null,
    findMany: async ({ where }: { where: { producerId: string } }) =>
      this.seriesRows.filter((s) => s.producerId === where.producerId),
  };

  academy = {
    findMany: async ({ where }: { where: { ownerId: string } }) =>
      this.academies.filter((a) => a.ownerId === where.ownerId),
    findFirst: async ({
      where,
    }: {
      where: { id: string; ownerId: string };
    }) =>
      this.academies.find(
        (a) => a.id === where.id && a.ownerId === where.ownerId,
      ) ?? null,
  };

  ticket = {
    findMany: async ({
      where,
    }: {
      where: {
        eventId: string | { in: string[] };
        status?: string;
      };
    }) =>
      this.tickets.filter(
        (t) =>
          matchEventId(t.eventId, where.eventId) &&
          (where.status === undefined || t.status === where.status),
      ),
  };

  payment = {
    findMany: async ({
      where,
    }: {
      where: { id: { in: string[] }; channel?: string };
    }) =>
      this.payments.filter(
        (p) =>
          where.id.in.includes(p.id) &&
          (where.channel === undefined || p.channel === where.channel),
      ),
  };

  enrollment = {
    findMany: async ({
      where,
    }: {
      where: { academyId: string | { in: string[] }; status?: string };
    }) =>
      this.enrollments.filter(
        (en) =>
          matchIn(en.academyId, where.academyId) &&
          (where.status === undefined || en.status === where.status),
      ),
    count: async ({
      where,
    }: {
      where: { academyId: string | { in: string[] }; status?: string };
    }) =>
      this.enrollments.filter(
        (en) =>
          matchIn(en.academyId, where.academyId) &&
          (where.status === undefined || en.status === where.status),
      ).length,
  };

  membershipPlan = {
    findMany: async ({ where }: { where: { academyId: string } }) =>
      this.plans.filter((p) => p.academyId === where.academyId),
  };

  guestList = {
    findMany: async ({
      where,
    }: {
      where: { eventId: string | { in: string[] } };
    }) =>
      this.guestLists.filter((l) => matchEventId(l.eventId, where.eventId)),
  };

  savedReport = {
    findMany: async ({
      where,
    }: {
      where: { personId: string; role: string };
    }) =>
      this.reports.filter(
        (r) => r.personId === where.personId && r.role === where.role,
      ),
    findFirst: async ({
      where,
    }: {
      where: { id: string; personId: string };
    }) =>
      this.reports.find(
        (r) => r.id === where.id && r.personId === where.personId,
      ) ?? null,
    create: async ({
      data,
    }: {
      data: { personId: string; role: string; name: string; params: object };
    }) => {
      const r: FakeReport = {
        id: `rep-${++this.reportSeq}`,
        createdAt: new Date(),
        ...data,
      };
      this.reports.push(r);
      return r;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { name: string };
    }) => {
      const r = this.reports.find((x) => x.id === where.id);
      if (!r) throw new Error("not found");
      r.name = data.name;
      return r;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const i = this.reports.findIndex((x) => x.id === where.id);
      if (i < 0) throw new Error("not found");
      const [r] = this.reports.splice(i, 1);
      return r;
    },
  };
}

/** Productor con Pro vigente vía trial (default de los seeds). */
const mkProducer = (id: string, over: Partial<FakePerson> = {}): FakePerson => ({
  id,
  name: "Prod",
  proTier: "FREE",
  proTrialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
  ...over,
});

const approve = (p: FakePrisma, personId: string, role: string) =>
  p.personRoles.push({ personId, role, status: "APPROVED" });

describe("QueryService - lentes y scope", () => {
  let prisma: FakePrisma;
  let svc: QueryService;

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new QueryService(prisma as unknown as PrismaService);
    approve(prisma, "prod-1", "PRODUCER");
    approve(prisma, "acad-1", "ACADEMY_OWNER");
    approve(prisma, "admin-1", "ADMIN");
    prisma.people.set("prod-1", mkProducer("prod-1"));
    prisma.people.set("otro", mkProducer("otro"));
    prisma.people.set("asist", { id: "asist", name: "Luis Asiste" });
    prisma.events.push(
      {
        id: "ev-1",
        producerId: "prod-1",
        name: "Gozadera",
        startsAt: new Date("2026-09-05T00:00:00Z"),
      },
      {
        id: "ev-ajeno",
        producerId: "otro",
        name: "Ajeno",
        startsAt: new Date("2026-09-06T00:00:00Z"),
      },
    );
  });

  it("lente inválido o no aprobado → 403", async () => {
    await expect(
      svc.run("prod-1", { role: "SUPERUSER", entity: "sales" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      svc.run("prod-1", { role: "ACADEMY_OWNER", entity: "students" }),
    ).rejects.toMatchObject({ status: 403 }); // rol existe pero no aprobado
    await expect(
      svc.catalog("sin-roles", "PRODUCER"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("PRODUCER sin Pro vigente → 403 pro.required en run/catalog", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    await expect(
      svc.run("prod-1", { role: "PRODUCER", entity: "sales" }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ error: "pro.required" }),
    });
    // pero el CRUD de consultas guardadas NO gatea Pro
    const saved = await svc.listSaved("prod-1", "PRODUCER");
    expect(saved.system.length).toBeGreaterThan(0);
  });

  it("run PRODUCER sin scopeId: solo eventos propios", async () => {
    prisma.tickets.push(
      {
        eventId: "ev-1",
        ownerId: "asist",
        buyerId: "asist",
        listPrice: 10000,
        serviceFee: 500,
        status: "ACTIVE",
        createdAt: new Date("2026-09-01T20:00:00Z"),
      },
      {
        eventId: "ev-ajeno",
        ownerId: "asist",
        buyerId: "asist",
        listPrice: 99999,
        serviceFee: 0,
        status: "ACTIVE",
        createdAt: new Date("2026-09-01T20:00:00Z"),
      },
    );
    const res = await svc.run("prod-1", {
      role: "PRODUCER",
      entity: "sales",
      filters: {},
    });
    expect(res.total).toBe(1);
    expect(res.headers[0]).toBe("fecha");
    expect(res.rows[0]).toContain(10000);
  });

  it("run PRODUCER con scopeId ajeno → vacío, nunca datos", async () => {
    prisma.tickets.push({
      eventId: "ev-ajeno",
      ownerId: "asist",
      listPrice: 99999,
      serviceFee: 0,
      status: "ACTIVE",
      createdAt: new Date("2026-09-01T20:00:00Z"),
    });
    const res = await svc.run("prod-1", {
      role: "PRODUCER",
      entity: "sales",
      filters: { scopeId: "ev-ajeno" },
    });
    expect(res.total).toBe(0);
    expect(res.rows).toEqual([]);
  });

  it("run PRODUCER con scopeId de serie propia → columna evento", async () => {
    prisma.seriesRows.push({ id: "ser-1", producerId: "prod-1", name: "Goz" });
    prisma.events.push({
      id: "ev-b",
      producerId: "prod-1",
      seriesId: "ser-1",
      name: "Gozadera",
      startsAt: new Date("2026-09-12T00:00:00Z"),
    });
    prisma.tickets.push({
      eventId: "ev-b",
      ownerId: "asist",
      buyerId: "asist",
      listPrice: 8000,
      serviceFee: 0,
      status: "USED",
      createdAt: new Date("2026-09-12T20:00:00Z"),
    });
    const res = await svc.run("prod-1", {
      role: "PRODUCER",
      entity: "sales",
      filters: { scopeId: "ser-1" },
    });
    expect(res.headers[0]).toBe("evento");
    expect(res.total).toBe(1);
    expect(res.rows[0][0]).toBe("Gozadera (2026-09-12)");
  });

  it("enum fuera de whitelist → 400; filtro desconocido → ignorado", async () => {
    await expect(
      svc.run("prod-1", {
        role: "PRODUCER",
        entity: "sales",
        filters: { status: "NOPE" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    // clave desconocida se ignora (no 400, no filtra)
    const res = await svc.run("prod-1", {
      role: "PRODUCER",
      entity: "sales",
      filters: { inyectado: "1=1" },
    });
    expect(res.total).toBe(0); // sin tickets, pero no explota
    // fecha inválida → 400 (no se ignora en silencio)
    await expect(
      svc.run("prod-1", {
        role: "PRODUCER",
        entity: "sales",
        filters: { from: "ayer" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("entity fuera del catálogo del lente → 400", async () => {
    await expect(
      svc.run("prod-1", { role: "PRODUCER", entity: "payouts" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("run ACADEMY_OWNER: academia ajena → vacío; propia → filas", async () => {
    prisma.academies.push(
      { id: "ac-1", ownerId: "acad-1", name: "Mía" },
      { id: "ac-ajena", ownerId: "otro", name: "Ajena" },
    );
    prisma.enrollments.push(
      {
        id: "en-1",
        academyId: "ac-1",
        personId: "asist",
        status: "ACTIVE",
        startedAt: new Date("2026-08-01T00:00:00Z"),
        endsAt: null,
        plan: { id: "pl-1", name: "Mensual" },
      },
      {
        id: "en-2",
        academyId: "ac-ajena",
        personId: "asist",
        status: "ACTIVE",
        startedAt: new Date("2026-08-01T00:00:00Z"),
        endsAt: null,
        plan: { id: "pl-2", name: "Otro" },
      },
    );
    // sin academyId → todas las propias
    const all = await svc.run("acad-1", {
      role: "ACADEMY_OWNER",
      entity: "students",
      filters: {},
    });
    expect(all.total).toBe(1);
    expect(all.rows[0]).toEqual([
      "Luis Asiste",
      "Mensual",
      "ACTIVE",
      expect.any(String),
      "",
    ]);
    // academyId ajena → scope {in:[]} → vacío
    const foreign = await svc.run("acad-1", {
      role: "ACADEMY_OWNER",
      entity: "students",
      filters: { academyId: "ac-ajena" },
    });
    expect(foreign.total).toBe(0);
    expect(foreign.rows).toEqual([]);
  });

  it("run pagina el preview: page/pageSize con total real", async () => {
    for (let i = 0; i < 5; i++) {
      prisma.tickets.push({
        eventId: "ev-1",
        ownerId: "asist",
        buyerId: "asist",
        listPrice: 5000,
        serviceFee: 0,
        status: "ACTIVE",
        createdAt: new Date(`2026-09-0${i + 1}T20:00:00Z`),
      });
    }
    const p1 = await svc.run("prod-1", {
      role: "PRODUCER",
      entity: "sales",
      filters: {},
      page: 1,
      pageSize: 2,
    });
    expect(p1.rows).toHaveLength(2);
    expect(p1.total).toBe(5);
    expect(p1.page).toBe(1);
    expect(p1.pageSize).toBe(2);
    const p3 = await svc.run("prod-1", {
      role: "PRODUCER",
      entity: "sales",
      filters: {},
      page: 3,
      pageSize: 2,
    });
    expect(p3.rows).toHaveLength(1);
    expect(p3.total).toBe(5);
    expect(p3.page).toBe(3);
    // página fuera de rango → vacío, total intacto
    const pFar = await svc.run("prod-1", {
      role: "PRODUCER",
      entity: "sales",
      filters: {},
      page: 9,
      pageSize: 2,
    });
    expect(pFar.rows).toEqual([]);
    expect(pFar.total).toBe(5);
  });

  it("options scope-dependiente valida ownership (eventGuestLists ajeno → [])", async () => {
    const res = await svc.options(
      "prod-1",
      "PRODUCER",
      "eventGuestLists",
      "ev-ajeno",
    );
    expect(res.options).toEqual([]);
    // source no declarado por el lente → 400
    await expect(
      svc.options("prod-1", "PRODUCER", "producers"),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("QueryService - consultas guardadas", () => {
  let prisma: FakePrisma;
  let svc: QueryService;

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new QueryService(prisma as unknown as PrismaService);
    approve(prisma, "prod-1", "PRODUCER");
    prisma.people.set("prod-1", mkProducer("prod-1"));
  });

  it("params validados contra el catálogo del lente", async () => {
    // entity inválido para el rol → 400
    await expect(
      svc.createSaved("prod-1", {
        role: "PRODUCER",
        name: "x",
        params: { entity: "payouts", filters: {} },
      }),
    ).rejects.toMatchObject({ status: 400 });
    // filtro desconocido → 400 (a diferencia de run, no se ignora)
    await expect(
      svc.createSaved("prod-1", {
        role: "PRODUCER",
        name: "x",
        params: { entity: "sales", filters: { hack: "1" } },
      }),
    ).rejects.toMatchObject({ status: 400 });
    // enum inválido → 400
    await expect(
      svc.createSaved("prod-1", {
        role: "PRODUCER",
        name: "x",
        params: { entity: "sales", filters: { status: "NOPE" } },
      }),
    ).rejects.toMatchObject({ status: 400 });
    // params no-objeto → 400
    await expect(
      svc.createSaved("prod-1", {
        role: "PRODUCER",
        name: "x",
        params: "sales",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("guarda params normalizados y los lista por (persona, lente)", async () => {
    const saved = await svc.createSaved("prod-1", {
      role: "PRODUCER",
      name: "Ventas activas",
      params: { entity: "sales", filters: { status: "ACTIVE" } },
    });
    expect(saved.params).toEqual({
      entity: "sales",
      filters: { status: "ACTIVE" },
    });
    const list = await svc.listSaved("prod-1", "PRODUCER");
    expect(list.saved.map((r) => r.name)).toEqual(["Ventas activas"]);
    expect(list.system.length).toBeGreaterThan(0); // plantillas del sistema
    // otro lente de la misma persona no la ve (aislada por role)
    approve(prisma, "prod-1", "ADMIN");
    const adminList = await svc.listSaved("prod-1", "ADMIN");
    expect(adminList.saved).toEqual([]);
  });

  it("rename/delete de id ajeno → 404 (no revela existencia)", async () => {
    const saved = await svc.createSaved("prod-1", {
      role: "PRODUCER",
      name: "mía",
      params: { entity: "sales", filters: {} },
    });
    await expect(
      svc.renameSaved("otra-persona", saved.id, "hack"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      svc.deleteSaved("otra-persona", saved.id),
    ).rejects.toMatchObject({ status: 404 });
    // el dueño sí puede
    const renamed = await svc.renameSaved("prod-1", saved.id, "nueva");
    expect(renamed.name).toBe("nueva");
    expect(await svc.deleteSaved("prod-1", saved.id)).toEqual({ ok: true });
    expect(prisma.reports).toHaveLength(0);
  });
});
