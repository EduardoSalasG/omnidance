import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller
import { EventsController } from "./events.controller";

// Spec internal-academy-socials: filtro de visibilidad del feed, gate de
// detalle (404 sin revelar) y validación del rol owner+producer al crear.

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const v = row[key];
    if (cond !== null && typeof cond === "object") {
      const c = cond as Row;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      if ("not" in c && v === c.not) return false;
      const structural = ["in", "not", "gte", "lte", "lt", "gt", "hasSome", "isEmpty"].some(
        (k) => k in c,
      );
      if (!structural) {
        if (v === null || typeof v !== "object") return false;
        if (!matchWhere(v as Row, c)) return false;
      }
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

class FakePrisma {
  eventRows: Row[] = [];
  enrollmentRows: Row[] = [];
  academyRows: Row[] = [];
  personRoleRows: Row[] = [];
  roleRows: Row[] = [];
  staffRows: Row[] = [];
  lastListWhere: Row | null = null;
  lastCreateData: Row | null = null;

  event = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.eventRows.find((e) => e.id === where.id) ?? null,
    findMany: async ({ where }: { where: Row }) => {
      this.lastListWhere = where;
      return this.eventRows.filter((e) => matchWhere(e, where));
    },
    create: async ({ data }: { data: Row }) => {
      this.lastCreateData = data;
      return { id: "ev-new", ...data };
    },
  };
  enrollment = {
    findMany: async ({ where }: { where: Row }) =>
      this.enrollmentRows.filter((e) => matchWhere(e, where)),
    findFirst: async ({ where }: { where: Row }) =>
      this.enrollmentRows.find((e) => matchWhere(e, where)) ?? null,
  };
  academy = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.academyRows.find((a) => a.id === where.id) ?? null,
  };
  personRole = {
    findMany: async ({ where }: { where: Row }) =>
      this.personRoleRows.filter((r) => matchWhere(r, where)),
  };
  role = {
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      this.roleRows
        .filter((r) => where.key.in.includes(r.key as string))
        .map((r) => ({
          key: r.key,
          isSuperuser: r.isSuperuser,
          permissions: (r.permissionKeys as string[]).map((k) => ({
            permissionKey: k,
          })),
        })),
  };
  staffAssignment = {
    findUnique: async ({
      where,
    }: {
      where: { eventId_personId: { eventId: string; personId: string } };
    }) =>
      this.staffRows.find(
        (s) =>
          s.eventId === where.eventId_personId.eventId &&
          s.personId === where.eventId_personId.personId,
      ) ?? null,
  };
}

const reqAs = (personId?: string, roles: string[] = []) =>
  ({ person: personId ? { id: personId, roles } : undefined }) as Request;

const mkCtrl = (prisma: FakePrisma) =>
  new EventsController(
    prisma as unknown as PrismaService,
    {
      getProducerParams: async () => null,
      getNumber: async (_k: string, d: number) => d,
    } as never,
  );

const baseEvent = (over: Row = {}): Row => ({
  id: "ev-1",
  name: "Social",
  status: "PUBLISHED",
  visibility: "PUBLIC",
  type: "SOCIAL",
  producerId: "prod-1",
  academyId: null,
  genres: [],
  _count: { rsvps: 0 },
  ...over,
});

const createDto = (over: Row = {}) => ({
  name: "Social interno",
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  endsAt: new Date(Date.now() + 90000000).toISOString(),
  ...over,
});

describe("EventsController internal-academy-socials", () => {
  let prisma: FakePrisma;
  let ctrl: EventsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctrl = mkCtrl(prisma);
    prisma.personRoleRows.push({
      role: "PRODUCER",
      status: "APPROVED",
      personId: "prod-1",
    });
    prisma.academyRows.push({ id: "acad-1", ownerId: "prod-1" });
    prisma.roleRows.push({
      key: "ADMIN",
      isSuperuser: true,
      permissionKeys: [],
    });
  });

  // ─── Feed GET /events ───

  it("feed anónimo: where exige visibility PUBLIC", async () => {
    await ctrl.list({} as Request);
    const ands = (prisma.lastListWhere?.AND ?? []) as Row[];
    expect(ands[1]).toEqual({ visibility: "PUBLIC" });
  });

  it("feed con sesión sin enrollments → solo PUBLIC", async () => {
    await ctrl.list(reqAs("p-x"));
    const ands = (prisma.lastListWhere?.AND ?? []) as Row[];
    expect(ands[1]).toEqual({ visibility: "PUBLIC" });
  });

  it("feed con enrollment ACTIVE → OR con internos de su academia", async () => {
    prisma.enrollmentRows.push({
      personId: "p1",
      academyId: "acad-1",
      status: "ACTIVE",
    });
    await ctrl.list(reqAs("p1"));
    const ands = (prisma.lastListWhere?.AND ?? []) as Row[];
    expect(ands[1]).toEqual({
      OR: [
        { visibility: "PUBLIC" },
        { visibility: "INTERNAL_ACADEMY", academyId: { in: ["acad-1"] } },
      ],
    });
  });

  // ─── Detalle GET /events/:id ───

  const internal = () =>
    prisma.eventRows.push(
      baseEvent({ visibility: "INTERNAL_ACADEMY", academyId: "acad-1" }),
    );

  it("detalle interno sin sesión → 404 (no revela)", async () => {
    internal();
    await expect(ctrl.detail("ev-1", {} as Request)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("detalle interno a persona sin enrollment → 404", async () => {
    internal();
    await expect(
      ctrl.detail("ev-1", reqAs("p-x")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("detalle interno a alumno ACTIVE → lo devuelve", async () => {
    internal();
    prisma.enrollmentRows.push({
      personId: "p1",
      academyId: "acad-1",
      status: "ACTIVE",
    });
    const res = (await ctrl.detail("ev-1", reqAs("p1"))) as Row;
    expect(res.id).toBe("ev-1");
  });

  it("detalle interno a enrollment INACTIVE → 404", async () => {
    internal();
    prisma.enrollmentRows.push({
      personId: "p1",
      academyId: "acad-1",
      status: "INACTIVE",
    });
    await expect(
      ctrl.detail("ev-1", reqAs("p1")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("detalle interno al productor dueño, staff y admin → lo devuelven", async () => {
    internal();
    expect(
      ((await ctrl.detail("ev-1", reqAs("prod-1"))) as Row).id,
    ).toBe("ev-1");
    prisma.staffRows.push({ eventId: "ev-1", personId: "door-1" });
    expect(
      ((await ctrl.detail("ev-1", reqAs("door-1"))) as Row).id,
    ).toBe("ev-1");
    expect(
      ((await ctrl.detail("ev-1", reqAs("root", ["ADMIN"]))) as Row).id,
    ).toBe("ev-1");
  });

  // ─── Create con visibility ───

  it("INTERNAL_ACADEMY sin academyId → 400", async () => {
    await expect(
      ctrl.create(
        createDto({ visibility: "INTERNAL_ACADEMY" }) as never,
        reqAs("prod-1"),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("INTERNAL_ACADEMY con academia ajena → 403", async () => {
    prisma.academyRows.push({ id: "acad-2", ownerId: "otro" });
    await expect(
      ctrl.create(
        createDto({
          visibility: "INTERNAL_ACADEMY",
          academyId: "acad-2",
        }) as never,
        reqAs("prod-1"),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("INTERNAL_ACADEMY con academia propia → crea con visibility", async () => {
    const res = await ctrl.create(
      createDto({
        visibility: "INTERNAL_ACADEMY",
        academyId: "acad-1",
      }) as never,
      reqAs("prod-1"),
    );
    expect(prisma.lastCreateData?.visibility).toBe("INTERNAL_ACADEMY");
    expect(prisma.lastCreateData?.academyId).toBe("acad-1");
    expect((res as Row).id).toBe("ev-new");
  });

  it("admin también puede crear interno de academia ajena", async () => {
    prisma.academyRows.push({ id: "acad-2", ownerId: "otro" });
    await ctrl.create(
      createDto({
        visibility: "INTERNAL_ACADEMY",
        academyId: "acad-2",
      }) as never,
      reqAs("root", ["ADMIN"]),
    );
    expect(prisma.lastCreateData?.visibility).toBe("INTERNAL_ACADEMY");
  });

  it("sin visibility → crea PUBLIC", async () => {
    await ctrl.create(createDto() as never, reqAs("prod-1"));
    expect(prisma.lastCreateData?.visibility).toBe("PUBLIC");
  });
});
