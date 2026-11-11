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
  roles?: { status: string }[];
  createdAt?: Date;
  acquisitionSource?: string | null;
}

interface FakeReferral {
  referredId: string;
  source: string;
  createdAt: Date;
}

interface FakeAnalyticsEvent {
  type: string;
  payload?: Record<string, unknown> | null;
  createdAt?: Date;
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
  // Tier de suscripción SaaS - las consultas del lente ACADEMY_OWNER
  // exigen la feature `analytics` (PRO) en alguna academia propia
  // (spec academy-tier-v2). null/omiso = nivel STUDIO.
  tier?: string | null;
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
  referrals: FakeReferral[] = [];
  analyticsEvents: FakeAnalyticsEvent[] = [];
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
    findUnique: async ({ where }: { where: { id: string } }) => {
      const p = this.people.get(where.id) ?? null;
      return p ? { ...p, roles: p.roles ?? [{ status: "APPROVED" }] } : null;
    },
    findMany: async ({
      where,
    }: {
      where: {
        id?: { in: string[] };
        createdAt?: { gte?: Date; lte?: Date };
      };
    }) =>
      [...this.people.values()].filter(
        (p) =>
          (!where.id || where.id.in.includes(p.id)) &&
          (!where.createdAt?.gte ||
            (p.createdAt ?? new Date(0)) >= where.createdAt.gte) &&
          (!where.createdAt?.lte ||
            (p.createdAt ?? new Date(0)) <= where.createdAt.lte),
      ),
  };

  referral = {
    findMany: async ({
      where,
    }: {
      where: { referredId: { in: string[] } };
    }) =>
      this.referrals
        .filter((r) => where.referredId.in.includes(r.referredId))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };

  analyticsEvent = {
    findMany: async ({
      where,
    }: {
      where: { type: string; createdAt?: { gte?: Date; lte?: Date } };
    }) =>
      this.analyticsEvents.filter(
        (e) =>
          e.type === where.type &&
          (!where.createdAt?.gte ||
            (e.createdAt ?? new Date(0)) >= where.createdAt.gte) &&
          (!where.createdAt?.lte ||
            (e.createdAt ?? new Date(0)) <= where.createdAt.lte),
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

  it("PRODUCER sin Pro vigente → 403 tier.required en run/catalog", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    await expect(
      svc.run("prod-1", { role: "PRODUCER", entity: "sales" }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        error: "tier.required",
        requiredTier: "PRO_STARTER",
        feature: "analytics",
      }),
    });
    // pero el CRUD de consultas guardadas NO gatea la suscripción
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
      // PRO = cubre `analytics` - la consola de consultas del lente
      // academia quedó como feature PRO (spec academy-tier-v2).
      { id: "ac-1", ownerId: "acad-1", name: "Mía", tier: "PRO" },
      { id: "ac-ajena", ownerId: "otro", name: "Ajena", tier: "PRO" },
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
      // Celda suplementaria personId (drill a la ficha persona) - va
      // después de la última columna, fuera de headers.
      "asist",
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

  // Consultas del lente academia = feature `analytics` (PRO) desde
  // academy-tier-v2 - antes bastaba `exports` (STUDIO).
  it("run ACADEMY_OWNER sin analytics (STUDIO) → 403 tier.required", async () => {
    prisma.academies.push({
      id: "ac-1",
      ownerId: "acad-1",
      name: "Studio",
      tier: "STUDIO",
    });
    await expect(
      svc.run("acad-1", {
        role: "ACADEMY_OWNER",
        entity: "students",
        filters: {},
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        error: "tier.required",
        requiredTier: "PRO",
        feature: "analytics",
      }),
    });
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

  it("run adjunta personId como celda suplementaria; exportTable no", async () => {
    prisma.academies.push({
      id: "ac-1",
      ownerId: "acad-1",
      name: "Mía",
      tier: "PRO",
    });
    prisma.enrollments.push({
      id: "en-1",
      academyId: "ac-1",
      personId: "asist",
      status: "ACTIVE",
      startedAt: new Date("2026-08-01T00:00:00Z"),
      endsAt: null,
      plan: { id: "pl-1", name: "Mensual" },
    });
    const res = await svc.run("acad-1", {
      role: "ACADEMY_OWNER",
      entity: "students",
      filters: {},
    });
    // La celda suplementaria va al final del row, fuera de headers.
    expect(res.rows[0]).toHaveLength(res.headers.length + 1);
    expect(res.rows[0][res.headers.length]).toBe("asist");
    // exportTable NO propaga la celda: el CSV/PDF no gana columna oculta.
    const exp = await svc.exportTable(
      "acad-1",
      "ACADEMY_OWNER",
      "students",
      {},
    );
    expect(exp.table.rows[0]).toHaveLength(exp.table.headers.length);
    expect(exp.table.rows[0]).not.toContain("asist");
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

  it("options academy sin scopeId → unión de academias propias", async () => {
    prisma.academies.push(
      { id: "ac-1", ownerId: "acad-1", name: "Alfa", tier: "PRO" },
      { id: "ac-2", ownerId: "acad-1", name: "Beta", tier: "PRO" },
      { id: "ac-ajena", ownerId: "otro", name: "Ajena", tier: "PRO" },
    );
    prisma.plans.push(
      { id: "pl-1", academyId: "ac-1", name: "Mensual" },
      { id: "pl-2", academyId: "ac-2", name: "Mensual" },
      { id: "pl-x", academyId: "ac-ajena", name: "Ajeno" },
    );
    // Sin scopeId: unión de las propias; >1 academia → sufijo · academia.
    const res = await svc.options(
      "acad-1",
      "ACADEMY_OWNER",
      "academyPlans",
      undefined,
    );
    expect(res.options).toEqual([
      { value: "pl-1", label: "Mensual · Alfa" },
      { value: "pl-2", label: "Mensual · Beta" },
    ]);
    // Una sola academia → labels sin sufijo.
    const solo = await svc.options(
      "acad-1",
      "ACADEMY_OWNER",
      "academyPlans",
      "ac-1",
    );
    expect(solo.options).toEqual([{ value: "pl-1", label: "Mensual" }]);
    // scopeId ajeno → vacío, nunca datos de otra academia.
    const foreign = await svc.options(
      "acad-1",
      "ACADEMY_OWNER",
      "academyPlans",
      "ac-ajena",
    );
    expect(foreign.options).toEqual([]);
  });
});

describe("QueryService - acquisition (lente ADMIN)", () => {
  let prisma: FakePrisma;
  let svc: QueryService;

  const alta = (id: string, over: Partial<FakePerson> = {}): FakePerson => ({
    id,
    name: id,
    createdAt: new Date("2026-11-05T12:00:00Z"),
    ...over,
  });
  const run = (filters: Record<string, string> = {}) =>
    svc.run("admin-1", { role: "ADMIN", entity: "acquisition", filters });

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new QueryService(prisma as unknown as PrismaService);
    approve(prisma, "admin-1", "ADMIN");
  });

  it("agrega altas por canal: orden por conteo + canal, pct del total", async () => {
    prisma.people.set("u1", alta("u1", { acquisitionSource: "utm:instagram" }));
    prisma.people.set("u2", alta("u2", { acquisitionSource: "utm:instagram" }));
    prisma.people.set("u3", alta("u3", { acquisitionSource: "utm:tiktok" }));
    prisma.people.set("u4", alta("u4", { acquisitionSource: "direct" }));
    prisma.people.set("u5", alta("u5", { acquisitionSource: "direct" }));
    prisma.people.set("u6", alta("u6", { acquisitionSource: "ref:google.com" }));
    // Invite: el alta por token no escribe acquisitionSource - su canal
    // es el Referral.
    prisma.people.set("u7", alta("u7"));
    prisma.referrals.push({
      referredId: "u7",
      source: "INVITE",
      createdAt: new Date("2026-11-05T12:00:00Z"),
    });
    // Sin capture ni referral → sin_dato (cuentas pre-capture).
    prisma.people.set("u8", alta("u8"));

    const res = await run();
    expect(res.headers).toEqual(["canal", "altas", "pct"]);
    // 8 altas, 6 canales; empates ordenados por canal.
    expect(res.total).toBe(6);
    expect(res.rows).toEqual([
      ["direct", 2, 25],
      ["utm:instagram", 2, 25],
      ["invite", 1, 13],
      ["ref:google.com", 1, 13],
      ["sin_dato", 1, 13],
      ["utm:tiktok", 1, 13],
    ]);
    // Filas agregadas: sin celda suplementaria personId.
    expect(res.rows[0]).toHaveLength(res.headers.length);
    expect(res.summary[0]).toContain("8");
  });

  it("referral gana aunque haya acquisitionSource (relación sobre click)", async () => {
    prisma.people.set("u1", alta("u1", { acquisitionSource: "utm:instagram" }));
    prisma.referrals.push(
      {
        referredId: "u1",
        source: "GIFT_TICKET",
        createdAt: new Date("2026-11-04T00:00:00Z"),
      },
      // La referral más antigua define el canal si hubiera más de una.
      {
        referredId: "u1",
        source: "INVITE",
        createdAt: new Date("2026-11-06T00:00:00Z"),
      },
    );
    const res = await run();
    expect(res.rows).toEqual([["gift_ticket", 1, 100]]);
  });

  it("kind filtra por prefijo de canal y viaja CSV (multi)", async () => {
    prisma.people.set("u1", alta("u1", { acquisitionSource: "utm:instagram" }));
    prisma.people.set("u2", alta("u2", { acquisitionSource: "ref:google.com" }));
    prisma.people.set("u3", alta("u3", { acquisitionSource: "direct" }));
    prisma.people.set("u4", alta("u4"));

    const paid = await run({ kind: "utm" });
    expect(paid.rows.map((r) => r[0])).toEqual(["utm:instagram"]);

    const multi = await run({ kind: "utm,ref" });
    expect(multi.rows.map((r) => r[0])).toEqual([
      "ref:google.com",
      "utm:instagram",
    ]);

    const none = await run({ kind: "none" });
    expect(none.rows).toEqual([["sin_dato", 1, 100]]);

    await expect(run({ kind: "foo" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(run({ kind: "utm,foo" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("from/to acotan por Person.createdAt", async () => {
    prisma.people.set(
      "old",
      alta("old", {
        acquisitionSource: "direct",
        createdAt: new Date("2026-10-01T12:00:00Z"),
      }),
    );
    prisma.people.set("new", alta("new", { acquisitionSource: "direct" }));
    const res = await run({ from: "2026-11-01", to: "2026-11-30" });
    expect(res.rows).toEqual([["direct", 1, 100]]);
    expect(res.total).toBe(1);
  });
});

describe("QueryService - dispositivos (lente ADMIN)", () => {
  let prisma: FakePrisma;
  let svc: QueryService;

  const launch = (
    displayMode: string | null,
    platform: string | null,
    createdAt = new Date("2026-11-05T12:00:00Z"),
  ) =>
    prisma.analyticsEvents.push({
      type: "app.launch",
      payload: { displayMode, platform, ua: "UA" },
      createdAt,
    });
  const run = (filters: Record<string, string> = {}) =>
    svc.run("admin-1", { role: "ADMIN", entity: "dispositivos", filters });

  beforeEach(() => {
    prisma = new FakePrisma();
    svc = new QueryService(prisma as unknown as PrismaService);
    approve(prisma, "admin-1", "ADMIN");
  });

  it("agrega por modo × plataforma: orden por conteo, pct del total", async () => {
    launch("standalone", "Android");
    launch("standalone", "Android");
    launch("standalone", "iOS");
    launch("browser", "Windows");
    launch("browser", "Android");
    // Otros tipos de evento no cuentan; payload ausente → sin_dato.
    prisma.analyticsEvents.push({
      type: "page_view",
      payload: { displayMode: "browser", platform: "Android" },
      createdAt: new Date("2026-11-05T12:00:00Z"),
    });
    launch(null, null);

    const res = await run();
    expect(res.headers).toEqual(["modo", "plataforma", "altas", "pct"]);
    // 6 launches en 5 combinaciones; empates ordenados por modo+plataforma.
    expect(res.total).toBe(5);
    expect(res.rows).toEqual([
      ["standalone", "android", 2, 33],
      ["browser", "android", 1, 17],
      ["browser", "windows", 1, 17],
      ["sin_dato", "sin_dato", 1, 17],
      ["standalone", "ios", 1, 17],
    ]);
    // Filas agregadas: sin celda suplementaria personId.
    expect(res.rows[0]).toHaveLength(res.headers.length);
    expect(res.summary[0]).toContain("6");
  });

  it("normaliza plataforma al vocabulario canónico", async () => {
    launch("browser", "macOS");
    launch("browser", "iPhone");
    launch("browser", "Chrome OS");
    launch("browser", "FreeBSD");
    const res = await run();
    expect(res.rows.map((r) => [r[1], r[2]])).toEqual([
      ["chromeos", 1],
      ["ios", 1],
      ["macos", 1],
      ["other", 1],
    ]);
  });

  it("platform filtra CSV multi; `none` agrupa sin_dato; inválido → 400", async () => {
    launch("standalone", "Android");
    launch("browser", "iOS");
    launch("browser", "Windows");
    launch("browser", null);

    const only = await run({ platform: "android" });
    expect(only.rows).toEqual([["standalone", "android", 1, 100]]);

    const multi = await run({ platform: "ios,windows" });
    expect(multi.rows.map((r) => r[1])).toEqual(["ios", "windows"]);

    const none = await run({ platform: "none" });
    expect(none.rows).toEqual([["browser", "sin_dato", 1, 100]]);

    await expect(run({ platform: "foo" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(run({ platform: "ios,foo" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("from/to acotan por AnalyticsEvent.createdAt", async () => {
    launch("browser", "Android", new Date("2026-10-01T12:00:00Z"));
    launch("standalone", "Android", new Date("2026-11-05T12:00:00Z"));
    const res = await run({ from: "2026-11-01", to: "2026-11-30" });
    expect(res.rows).toEqual([["standalone", "android", 1, 100]]);
    expect(res.total).toBe(1);
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
