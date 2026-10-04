import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import { AcademyAccess } from "./academy-access.service";
import { PrivateLessonsController } from "./private-lessons.controller";
import { AcademiesController } from "./academies.controller";

// Comisión del instructor (role-console-polish): PATCH
// /academies/:id/instructors/:personId (owner/admin), snapshot del
// commissionPct al crear la PrivateLesson, y netClp/commissionClp en
// GET /private-lessons/mine?as=instructor (el alumno no ve la comisión).
// private-lesson-product: particular comprable (assign por el owner,
// POST solo-staff, joins toleran instructorId/scheduledAt null).

interface FakeAcademy {
  id: string;
  ownerId: string;
  active: boolean;
  privateLessonPrice?: number | null;
}

interface FakeInstructor {
  academyId: string;
  personId: string;
  commissionPct: number | null;
}

interface FakeLesson {
  id: string;
  academyId: string;
  instructorId: string | null;
  personId: string;
  scheduledAt: Date | null;
  price: number;
  commissionPct: number;
  commissionPaidAt?: Date | null;
  paymentId?: string | null;
  status: string;
  createdAt: Date;
}

class FakePrisma {
  academies: FakeAcademy[] = [];
  instructors: FakeInstructor[] = [];
  lessons: FakeLesson[] = [];
  roles: { key: string; isSuperuser: boolean; permissionKeys: string[] }[] =
    [];
  private seq = 0;

  academy = {
    findUnique: async ({
      where,
      include,
    }: {
      where: { id: string };
      include?: { instructors: { select: Record<string, boolean> } };
    }) => {
      const a = this.academies.find((x) => x.id === where.id);
      if (!a) return null;
      if (!include?.instructors) return { ...a };
      const sel = include.instructors.select;
      return {
        ...a,
        instructors: this.instructors
          .filter((i) => i.academyId === a.id)
          .map((i) => {
            const row: Record<string, unknown> = {};
            if (sel["personId"]) row["personId"] = i.personId;
            if (sel["commissionPct"]) row["commissionPct"] = i.commissionPct;
            return row;
          }),
      };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeAcademy>;
    }) => {
      const a = this.academies.find((x) => x.id === where.id);
      if (!a) throw new Error("P2025");
      Object.assign(a, data);
      return a;
    },
  };

  academyInstructor = {
    findFirst: async ({
      where,
    }: {
      where: {
        academyId: string;
        OR?: { personId?: string; id?: string }[];
      };
    }) =>
      this.instructors.find(
        (i) =>
          i.academyId === where.academyId &&
          (where.OR ?? []).some(
            (c) => c.personId === i.personId,
          ),
      ) ?? null,
    findUnique: async ({
      where,
    }: {
      where: { academyId_personId: { academyId: string; personId: string } };
    }) =>
      this.instructors.find(
        (i) =>
          i.academyId === where.academyId_personId.academyId &&
          i.personId === where.academyId_personId.personId,
      ) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { academyId_personId: { academyId: string; personId: string } };
      data: { commissionPct?: number };
    }) => {
      const i = this.instructors.find(
        (x) =>
          x.academyId === where.academyId_personId.academyId &&
          x.personId === where.academyId_personId.personId,
      );
      if (!i) throw new Error("P2025");
      Object.assign(i, data);
      return i;
    },
  };

  privateLesson = {
    create: async ({
      data,
    }: {
      data: Omit<FakeLesson, "id" | "createdAt">;
    }) => {
      const l: FakeLesson = {
        ...data,
        id: `les-${++this.seq}`,
        createdAt: new Date(),
      };
      this.lessons.push(l);
      return l;
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.lessons.find((l) => l.id === where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeLesson>;
    }) => {
      const l = this.lessons.find((x) => x.id === where.id);
      if (!l) throw new Error("P2025");
      Object.assign(l, data);
      return l;
    },
    findMany: async ({
      where,
    }: {
      where: { academyId?: string; personId?: string; instructorId?: string };
    }) =>
      this.lessons.filter(
        (l) =>
          (where.academyId === undefined || l.academyId === where.academyId) &&
          (where.personId === undefined || l.personId === where.personId) &&
          (where.instructorId === undefined ||
            l.instructorId === where.instructorId),
      ),
  };

  person = {
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({ id, name: `Nombre ${id}` })),
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

  enrollment = { count: async () => 0 };
  membershipPlan = { count: async () => 0 };
  classSlot = { count: async () => 0 };
}

const reqAs = (personId: string, roles: string[] = []) =>
  ({ person: { id: personId, roles } }) as unknown as Request;

describe("comisión del instructor en clases particulares", () => {
  let prisma: FakePrisma;
  let lessons: PrivateLessonsController;
  let academies: AcademiesController;
  const notified: { personId: string; type: string }[] = [];
  const notifications: { notifySafe: (p: string, i: { type: string }) => Promise<void> } = {
    notifySafe: async (personId, input) => {
      notified.push({ personId, type: input.type });
    },
  };

  beforeEach(() => {
    notified.length = 0;
    prisma = new FakePrisma();
    const access = new AcademyAccess(prisma as unknown as PrismaService);
    lessons = new PrivateLessonsController(
      prisma as unknown as PrismaService,
      access,
      notifications as unknown as NotificationsService,
    );
    academies = new AcademiesController(
      prisma as unknown as PrismaService,
      access,
      {} as never, // SubscriptionsService — no se usa en estos endpoints
      {} as never, // ParamsService — idem
    );
    prisma.academies.push({ id: "ac-1", ownerId: "owner", active: true });
    prisma.instructors.push({
      academyId: "ac-1",
      personId: "inst",
      commissionPct: 25,
    });
    prisma.roles.push({
      key: "ADMIN",
      isSuperuser: true,
      permissionKeys: [],
    });
  });

  it("owner fija commissionPct via PATCH", async () => {
    const res = await academies.updateInstructor(
      "ac-1",
      "inst",
      { commissionPct: 40 },
      reqAs("owner"),
    );
    expect(res.commissionPct).toBe(40);
    expect(prisma.instructors[0].commissionPct).toBe(40);
  });

  it("instructor no-owner no puede fijar comisión → 403; inexistente → 404; rango → 400", async () => {
    await expect(
      academies.updateInstructor(
        "ac-1",
        "inst",
        { commissionPct: 40 },
        reqAs("inst"), // instructor pero no owner
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      academies.updateInstructor(
        "ac-1",
        "otro",
        { commissionPct: 40 },
        reqAs("owner"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      academies.updateInstructor(
        "ac-1",
        "inst",
        { commissionPct: 101 },
        reqAs("owner"),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("admin.access puede fijar la comisión", async () => {
    const res = await academies.updateInstructor(
      "ac-1",
      "inst",
      { commissionPct: 10 },
      reqAs("root", ["ADMIN"]),
    );
    expect(res.commissionPct).toBe(10);
  });

  it("request() snapshot: la lección copia el commissionPct vigente", async () => {
    // POST es staff-only desde private-lesson-product — el owner crea la
    // lección manual; el snapshot de comisión es el mismo.
    const lesson = await lessons.request(
      "ac-1",
      {
        instructorId: "inst",
        scheduledAt: new Date("2026-10-01T20:00:00Z").toISOString(),
        price: 40000,
      },
      reqAs("owner"),
    );
    expect(lesson.commissionPct).toBe(25);

    // snapshot: subir la comisión después no toca la lección creada
    prisma.instructors[0].commissionPct = 40;
    expect(prisma.lessons[0].commissionPct).toBe(25);
  });

  it("mine?as=instructor devuelve commissionClp/netClp; student no ve comisión", async () => {
    prisma.lessons.push({
      id: "les-1",
      academyId: "ac-1",
      instructorId: "inst",
      personId: "alumno",
      scheduledAt: new Date(),
      price: 40000,
      commissionPct: 25,
      status: "CONFIRMED",
      createdAt: new Date(),
    });

    const instRows = await lessons.mine("instructor", reqAs("inst"));
    expect(instRows[0]).toMatchObject({
      commissionClp: 10000,
      netClp: 30000,
    });

    const stuRows = await lessons.mine(undefined, reqAs("alumno"));
    expect(stuRows[0]).not.toHaveProperty("commissionClp");
    expect(stuRows[0]).not.toHaveProperty("netClp");
    expect(stuRows[0]).not.toHaveProperty("commissionPct");
  });

  it("GET /academies/:id (manage) expone commissionPct; /profile no lo filtra aquí", async () => {
    const detail = await academies.detail("ac-1", reqAs("owner"));
    const inst = (
      detail as unknown as {
        instructors: { personId: string; commissionPct: number | null }[];
      }
    ).instructors.find((i) => i.personId === "inst");
    expect(inst?.commissionPct).toBe(25);
  });
});

describe("private-lesson-product", () => {
  let prisma: FakePrisma;
  let lessons: PrivateLessonsController;
  let academies: AcademiesController;
  const notified: { personId: string; type: string }[] = [];
  const notifications = {
    notifySafe: async (personId: string, input: { type: string }) => {
      notified.push({ personId, type: input.type });
    },
  };

  const pendingLesson = (): FakeLesson => ({
    id: "les-p",
    academyId: "ac-1",
    instructorId: null,
    personId: "alumno",
    scheduledAt: null,
    price: 40000,
    commissionPct: 0,
    paymentId: "pay-1",
    status: "REQUESTED",
    createdAt: new Date(),
  });

  beforeEach(() => {
    notified.length = 0;
    prisma = new FakePrisma();
    const access = new AcademyAccess(prisma as unknown as PrismaService);
    lessons = new PrivateLessonsController(
      prisma as unknown as PrismaService,
      access,
      notifications as unknown as NotificationsService,
    );
    academies = new AcademiesController(
      prisma as unknown as PrismaService,
      access,
      {} as never,
      {} as never,
    );
    prisma.academies.push({ id: "ac-1", ownerId: "owner", active: true });
    prisma.instructors.push(
      { academyId: "ac-1", personId: "inst", commissionPct: 25 },
      { academyId: "ac-2", personId: "ajeno", commissionPct: 10 },
    );
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
    prisma.lessons.push(pendingLesson());
  });

  it("owner asigna instructor+fecha → CONFIRMED + snapshot comisión + notifica", async () => {
    const when = new Date("2026-10-05T21:00:00Z").toISOString();
    const res = await lessons.act(
      "les-p",
      { action: "assign", instructorId: "inst", scheduledAt: when },
      reqAs("owner"),
    );
    expect(res.status).toBe("CONFIRMED");
    expect(res.instructorId).toBe("inst");
    expect(res.commissionPct).toBe(25);
    expect(res.scheduledAt).toEqual(new Date(when));
    expect(notified.map((n) => n.personId).sort()).toEqual([
      "alumno",
      "inst",
    ]);
  });

  it("assign: instructor no-owner y alumno → 403; instructor ajeno → 404; sin campos → 400", async () => {
    const when = new Date("2026-10-05T21:00:00Z").toISOString();
    await expect(
      lessons.act(
        "les-p",
        { action: "assign", instructorId: "inst", scheduledAt: when },
        reqAs("inst"),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      lessons.act(
        "les-p",
        { action: "assign", instructorId: "inst", scheduledAt: when },
        reqAs("alumno"),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      lessons.act(
        "les-p",
        { action: "assign", instructorId: "ajeno", scheduledAt: when },
        reqAs("owner"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      lessons.act("les-p", { action: "assign" }, reqAs("owner")),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("assign sobre lección CONFIRMED → 409", async () => {
    prisma.lessons[0]!.status = "CONFIRMED";
    await expect(
      lessons.act(
        "les-p",
        {
          action: "assign",
          instructorId: "inst",
          scheduledAt: new Date().toISOString(),
        },
        reqAs("owner"),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("POST request: alumno externo → 403; owner crea manual con snapshot", async () => {
    await expect(
      lessons.request(
        "ac-1",
        {
          instructorId: "inst",
          scheduledAt: new Date().toISOString(),
          price: 1000,
        },
        reqAs("alumno"),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const res = await lessons.request(
      "ac-1",
      {
        instructorId: "inst",
        scheduledAt: new Date("2026-10-01T20:00:00Z").toISOString(),
        price: 40000,
      },
      reqAs("owner"),
    );
    expect(res.commissionPct).toBe(25);
  });

  it("list tolera instructorId/scheduledAt null (lección por asignar)", async () => {
    const rows = await lessons.list("ac-1", reqAs("owner"));
    const pending = rows.find((l) => l.id === "les-p")!;
    expect(pending.instructor).toBeNull();
    expect(pending.scheduledAt).toBeNull();
    expect(pending.person?.name).toBe("Nombre alumno");
  });

  it("settings: privateLessonPrice editable por owner, 403 al resto", async () => {
    const res = await academies.updateSettings(
      "ac-1",
      { privateLessonPrice: 40000 },
      reqAs("owner"),
    );
    expect(res.privateLessonPrice).toBe(40000);
    await expect(
      academies.updateSettings(
        "ac-1",
        { privateLessonPrice: 1 },
        reqAs("alumno"),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// Liquidación de la comisión (academia→instructor): la plataforma no
// transfiere — el owner marca `commissionPaidAt` cuando paga por fuera
// (mismo criterio que Payout evidenceUrl), y el instructor lo ve.
describe("pay-commission — liquidación de la comisión", () => {
  let prisma: FakePrisma;
  let lessons: PrivateLessonsController;
  const notified: { personId: string; type: string }[] = [];
  const notifications = {
    notifySafe: async (personId: string, input: { type: string }) => {
      notified.push({ personId, type: input.type });
    },
  };

  const confirmed = (): FakeLesson => ({
    id: "les-c",
    academyId: "ac-1",
    instructorId: "inst",
    personId: "alumno",
    scheduledAt: new Date("2026-10-05T21:00:00Z"),
    price: 40000,
    commissionPct: 25,
    commissionPaidAt: null,
    paymentId: "pay-1",
    status: "CONFIRMED",
    createdAt: new Date(),
  });

  beforeEach(() => {
    notified.length = 0;
    prisma = new FakePrisma();
    const access = new AcademyAccess(prisma as unknown as PrismaService);
    lessons = new PrivateLessonsController(
      prisma as unknown as PrismaService,
      access,
      notifications as unknown as NotificationsService,
    );
    prisma.academies.push({ id: "ac-1", ownerId: "owner", active: true });
    prisma.instructors.push({
      academyId: "ac-1",
      personId: "inst",
      commissionPct: 25,
    });
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
    prisma.lessons.push(confirmed());
  });

  it("owner marca la comisión pagada → commissionPaidAt + notifica al instructor", async () => {
    const res = await lessons.act(
      "les-c",
      { action: "pay-commission" },
      reqAs("owner"),
    );
    expect(res.commissionPaidAt).toBeInstanceOf(Date);
    expect(notified).toEqual([
      { personId: "inst", type: "private_lesson.commission_paid" },
    ]);
  });

  it("idempotencia no: ya pagada → 409; instructor/alumno → 403; admin sí", async () => {
    await lessons.act("les-c", { action: "pay-commission" }, reqAs("owner"));
    await expect(
      lessons.act("les-c", { action: "pay-commission" }, reqAs("owner")),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      lessons.act("les-c", { action: "pay-commission" }, reqAs("inst")),
    ).rejects.toMatchObject({ status: 403 });

    prisma.lessons[0]!.commissionPaidAt = null;
    const res = await lessons.act(
      "les-c",
      { action: "pay-commission" },
      reqAs("root", ["ADMIN"]),
    );
    expect(res.commissionPaidAt).toBeInstanceOf(Date);
  });

  it("sin instructor asignado o sin comisión → 409 (nada que liquidar)", async () => {
    prisma.lessons[0]!.instructorId = null;
    await expect(
      lessons.act("les-c", { action: "pay-commission" }, reqAs("owner")),
    ).rejects.toMatchObject({ status: 409 });

    prisma.lessons[0]!.instructorId = "inst";
    prisma.lessons[0]!.commissionPct = 0;
    await expect(
      lessons.act("les-c", { action: "pay-commission" }, reqAs("owner")),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("lección CANCELLED → 409", async () => {
    prisma.lessons[0]!.status = "CANCELLED";
    await expect(
      lessons.act("les-c", { action: "pay-commission" }, reqAs("owner")),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("mine?as=instructor y list del owner exponen commissionPaidAt", async () => {
    await lessons.act("les-c", { action: "pay-commission" }, reqAs("owner"));

    const instRows = await lessons.mine("instructor", reqAs("inst"));
    // La union de `mine` incluye la rama alumno (sin campos de comisión)
    // — casteo al shape instructor para la aserción.
    expect(
      (instRows[0] as { commissionPaidAt?: Date }).commissionPaidAt,
    ).toBeInstanceOf(Date);

    const list = await lessons.list("ac-1", reqAs("owner"));
    expect(
      (list[0] as { commissionPaidAt?: Date }).commissionPaidAt,
    ).toBeInstanceOf(Date);
  });
});
