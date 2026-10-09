import { BadRequestException } from "@nestjs/common";
import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import { AcademyAccess } from "./academy-access.service";
import { PrivateLessonsController } from "./private-lessons.controller";
import { AcademiesController } from "./academies.controller";

// Acuerdo económico del instructor (instructor-commission-subtype):
// PATCH /academies/:id/instructors/:personId (owner/admin) sobre
// payType/payAmount/payClasses/commissionPct - COMMISSION es un subtipo
// del acuerdo que se snapshottea a la lección al crear/asignar;
// pay-commission liquida las pendientes y mine?as=instructor deriva
// netClp solo en lecciones con comisión >0.
// private-lesson-product: particular comprable (assign por el owner,
// POST solo-staff, joins toleran instructorId/scheduledAt null).

interface FakeAcademy {
  id: string;
  ownerId: string;
  name: string;
  active: boolean;
  billingBlockedAt?: Date | null;
  privateLessonPrice?: number | null;
}

interface FakeInstructor {
  academyId: string;
  personId: string;
  // Tasa del acuerdo COMMISSION (o histórica legacy si payType es
  // null) - la lección la snapshottea solo si payType=COMMISSION.
  commissionPct: number | null;
  payType?: string | null;
  payAmount?: number | null;
  payClasses?: number | null;
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

// Where del fake - cubre las formas que el controller usa: escalares,
// `{not: null}`, `null` literal y OR anidado (conteos de la cola
// pendiente: `OR: [{instructorId: null}, {scheduledAt: null}]`).
interface FakeLessonWhere {
  academyId?: string;
  personId?: string;
  instructorId?: string | { not: null } | null;
  scheduledAt?: { not: null } | null;
  status?: string;
  commissionPct?: { gt: number };
  commissionPaidAt?: { not: null } | null;
  createdAt?: { gte?: Date; lte?: Date };
  OR?: FakeLessonWhere[];
}

// escalar = igualdad; {not: null} = no nulo; null literal = es nulo.
function matchesNullable<T>(value: T | null, f: T | { not: null } | null | undefined): boolean {
  if (f === undefined) return true;
  if (f === null) return value == null;
  if (typeof f === "object" && "not" in f) return value != null;
  return value === f;
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
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      this.academies
        .filter((a) => where.id.in.includes(a.id))
        .map((a) => ({ id: a.id, name: a.name })),
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
      data: {
        commissionPct?: number;
        payType?: string | null;
        payAmount?: number | null;
        payClasses?: number | null;
      };
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
      data: Omit<FakeLesson, "id" | "createdAt" | "commissionPct"> & {
        commissionPct?: number;
      };
    }) => {
      const l: FakeLesson = {
        // @default(0) del schema real - el controller ya no lo escribe.
        commissionPct: 0,
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
    findMany: async ({ where }: { where: FakeLessonWhere }) => {
      // skip/take se ignoran: los fixtures son más chicos que una página.
      return this.lessons.filter((l) => this.matchLesson(l, where));
    },
    count: async ({ where }: { where: FakeLessonWhere }) =>
      this.lessons.filter((l) => this.matchLesson(l, where)).length,
  };

  person = {
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({
        id,
        name: `Nombre ${id}`,
        photoUrl: null,
        instagram: null,
      })),
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

  private matchLesson(l: FakeLesson, where: FakeLessonWhere): boolean {
    const base =
      (where.academyId === undefined || l.academyId === where.academyId) &&
      (where.personId === undefined || l.personId === where.personId) &&
      matchesNullable(l.instructorId, where.instructorId) &&
      matchesNullable(l.scheduledAt, where.scheduledAt) &&
      (where.status === undefined || l.status === where.status) &&
      (where.commissionPct === undefined ||
        l.commissionPct > where.commissionPct.gt) &&
      (where.commissionPaidAt === undefined ||
        (where.commissionPaidAt === null
          ? l.commissionPaidAt == null
          : l.commissionPaidAt != null)) &&
      (where.createdAt === undefined ||
        ((where.createdAt.gte === undefined ||
          l.createdAt >= where.createdAt.gte) &&
          (where.createdAt.lte === undefined ||
            l.createdAt <= where.createdAt.lte)));
    return (
      base &&
      (where.OR === undefined ||
        where.OR.some((w) => this.matchLesson(l, w)))
    );
  }
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
      {} as never, // SubscriptionsService - no se usa en estos endpoints
      {} as never, // ParamsService - idem
    );
    prisma.academies.push({ id: "ac-1", ownerId: "owner", name: "Academia Uno", active: true });
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

  it("owner fija el acuerdo económico via PATCH", async () => {
    const res = await academies.updateInstructor(
      "ac-1",
      "inst",
      { payType: "PER_CLASS", payAmount: 15000 },
      reqAs("owner"),
    );
    expect(res.payType).toBe("PER_CLASS");
    expect(res.payAmount).toBe(15000);
  });

  it("instructor no-owner no puede fijar el acuerdo → 403; inexistente → 404", async () => {
    await expect(
      academies.updateInstructor(
        "ac-1",
        "inst",
        { payType: "PER_CLASS", payAmount: 15000 },
        reqAs("inst"), // instructor pero no owner
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      academies.updateInstructor(
        "ac-1",
        "otro",
        { payType: "PER_CLASS", payAmount: 15000 },
        reqAs("owner"),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("admin.access puede fijar el acuerdo", async () => {
    const res = await academies.updateInstructor(
      "ac-1",
      "inst",
      { payType: "MONTHLY", payAmount: 300000, payClasses: 8 },
      reqAs("root", ["ADMIN"]),
    );
    expect(res.payType).toBe("MONTHLY");
  });

  it("request() sin acuerdo COMMISSION no snapshottea: commissionPct=0", async () => {
    // POST es staff-only desde private-lesson-product - el owner crea la
    // lección manual. El instructor del fixture tiene commissionPct
    // histórico 25 pero payType null → el snapshot es 0.
    const lesson = await lessons.request(
      "ac-1",
      {
        instructorId: "inst",
        scheduledAt: new Date("2026-10-01T20:00:00Z").toISOString(),
        price: 40000,
      },
      reqAs("owner"),
    );
    expect(lesson.commissionPct).toBe(0);
  });

  it("request() con acuerdo COMMISSION snapshottea la tasa", async () => {
    prisma.instructors[0].payType = "COMMISSION";
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
  });

  it("updateInstructor: COMMISSION fija la tasa y limpia montos; cambiar de subtipo limpia la tasa", async () => {
    const res = await academies.updateInstructor(
      "ac-1",
      "inst",
      { payType: "COMMISSION", commissionPct: 30 },
      reqAs("owner"),
    );
    expect(res).toMatchObject({
      payType: "COMMISSION",
      commissionPct: 30,
      payAmount: null,
      payClasses: null,
    });
    const res2 = await academies.updateInstructor(
      "ac-1",
      "inst",
      { payType: "PER_CLASS", payAmount: 15000 },
      reqAs("owner"),
    );
    expect(res2.commissionPct).toBeNull();
    expect(res2.payAmount).toBe(15000);
  });

  it("updateInstructor: pct fuera de 0-100 → 400", async () => {
    prisma.instructors[0].payType = "COMMISSION";
    await expect(
      academies.updateInstructor(
        "ac-1",
        "inst",
        { commissionPct: 101 },
        reqAs("owner"),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("mine?as=instructor devuelve commissionClp/netClp", async () => {
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
  });

  it("mine sin ?as=instructor rechaza - la vista alumno vive en /classes/mine", async () => {
    await expect(lessons.mine(undefined, reqAs("alumno"))).rejects.toThrow(
      BadRequestException,
    );
    await expect(lessons.mine("alumno", reqAs("alumno"))).rejects.toThrow(
      BadRequestException,
    );
  });

  it("GET /academies/:id expone solo personId del instructor (la comisión legacy salió del contrato)", async () => {
    const detail = await academies.detail("ac-1", reqAs("owner"));
    const inst = (
      detail as unknown as {
        instructors: { personId: string; commissionPct?: number | null }[];
      }
    ).instructors.find((i) => i.personId === "inst");
    expect(inst?.commissionPct).toBeUndefined();
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
    prisma.academies.push({ id: "ac-1", ownerId: "owner", name: "Academia Uno", active: true });
    prisma.instructors.push(
      { academyId: "ac-1", personId: "inst", commissionPct: 25 },
      { academyId: "ac-2", personId: "ajeno", commissionPct: 10 },
    );
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
    prisma.lessons.push(pendingLesson());
  });

  it("owner asigna instructor+fecha → CONFIRMED, sin snapshot de comisión + notifica", async () => {
    const when = new Date("2026-10-05T21:00:00Z").toISOString();
    const res = await lessons.act(
      "les-p",
      { action: "assign", instructorId: "inst", scheduledAt: when },
      reqAs("owner"),
    );
    expect(res.status).toBe("CONFIRMED");
    expect(res.instructorId).toBe("inst");
    expect(res.commissionPct).toBe(0);
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

  it("POST request: alumno externo → 403; owner crea manual sin comisión", async () => {
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
    expect(res.commissionPct).toBe(0);
  });

  it("list tolera instructorId/scheduledAt null (lección por asignar)", async () => {
    const rows = (await lessons.list("ac-1", reqAs("owner"))).items;
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
// transfiere - el owner marca `commissionPaidAt` cuando paga por fuera
// (mismo criterio que Payout evidenceUrl), y el instructor lo ve.
describe("pay-commission - liquidación de la comisión", () => {
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
    prisma.academies.push({ id: "ac-1", ownerId: "owner", name: "Academia Uno", active: true });
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
    // - casteo al shape instructor para la aserción.
    expect(
      (instRows[0] as { commissionPaidAt?: Date }).commissionPaidAt,
    ).toBeInstanceOf(Date);

    const list = (await lessons.list("ac-1", reqAs("owner"))).items;
    expect(
      (list[0] as { commissionPaidAt?: Date }).commissionPaidAt,
    ).toBeInstanceOf(Date);
  });
});

// GET /private-lessons/:id - ficha del alumno en /clases/[id] (la
// particular es una reserva más; cancelar vive ahí). La comisión es
// acuerdo academia↔instructor: nunca viaja al alumno.
describe("GET /private-lessons/:id - ficha de la particular", () => {
  let prisma: FakePrisma;
  let lessons: PrivateLessonsController;
  const notifications = { notifySafe: async () => {} };

  beforeEach(() => {
    prisma = new FakePrisma();
    const access = new AcademyAccess(prisma as unknown as PrismaService);
    lessons = new PrivateLessonsController(
      prisma as unknown as PrismaService,
      access,
      notifications as unknown as NotificationsService,
    );
    prisma.academies.push({
      id: "ac-1",
      ownerId: "owner",
      name: "Academia Uno",
      active: true,
    });
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
    prisma.lessons.push({
      id: "les-1",
      academyId: "ac-1",
      instructorId: "inst",
      personId: "alumno",
      scheduledAt: new Date("2026-10-05T21:00:00Z"),
      price: 40000,
      commissionPct: 25,
      paymentId: "pay-1",
      status: "CONFIRMED",
      createdAt: new Date(),
    });
  });

  it("el alumno dueño ve su ficha sin campos de comisión", async () => {
    const res = (await lessons.detail("les-1", reqAs("alumno"))) as Record<
      string,
      unknown
    >;
    expect(res.academy).toMatchObject({ id: "ac-1", name: "Academia Uno" });
    expect(res.instructor).toMatchObject({ id: "inst", name: "Nombre inst" });
    expect(res.price).toBe(40000);
    expect(res).not.toHaveProperty("commissionPct");
    expect(res).not.toHaveProperty("commissionPaidAt");
  });

  it("instructor asignado y owner ven la comisión", async () => {
    const inst = (await lessons.detail(
      "les-1",
      reqAs("inst"),
    )) as Record<string, unknown>;
    expect(inst.commissionPct).toBe(25);
    const owner = (await lessons.detail(
      "les-1",
      reqAs("owner"),
    )) as Record<string, unknown>;
    expect(owner.commissionPct).toBe(25);
  });

  it("ajeno → 403; inexistente → 404", async () => {
    await expect(
      lessons.detail("les-1", reqAs("otro")),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      lessons.detail("no-hay", reqAs("alumno")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("particular sin asignar: instructor null, academy resuelto", async () => {
    prisma.lessons[0]!.instructorId = null;
    prisma.lessons[0]!.scheduledAt = null;
    prisma.lessons[0]!.status = "REQUESTED";
    const res = (await lessons.detail("les-1", reqAs("alumno"))) as Record<
      string,
      unknown
    >;
    expect(res.instructor).toBeNull();
    expect(res.scheduledAt).toBeNull();
    expect(res.academy).toMatchObject({ name: "Academia Uno" });
  });
});

// Filtros del listado staff (spec analytics/query-console, entidad
// `private_lessons` del catálogo): status/instructorId/commission/
// from,to con la misma semántica del query engine; enums por whitelist.
describe("list staff - filtros del contrato compartido", () => {
  let prisma: FakePrisma;
  let lessons: PrivateLessonsController;

  beforeEach(() => {
    prisma = new FakePrisma();
    const access = new AcademyAccess(prisma as unknown as PrismaService);
    lessons = new PrivateLessonsController(
      prisma as unknown as PrismaService,
      access,
      { notifySafe: async () => undefined } as unknown as NotificationsService,
    );
    prisma.academies.push({
      id: "ac-1",
      ownerId: "owner",
      name: "Academia Uno",
      active: true,
    });
    prisma.instructors.push({
      academyId: "ac-1",
      personId: "inst",
      commissionPct: 25,
    });
    prisma.lessons.push(
      {
        id: "les-done",
        academyId: "ac-1",
        instructorId: "inst",
        personId: "alumno",
        scheduledAt: new Date(),
        price: 40000,
        commissionPct: 25,
        commissionPaidAt: new Date(),
        status: "DONE",
        createdAt: new Date("2026-01-10T12:00:00Z"),
      },
      {
        id: "les-conf",
        academyId: "ac-1",
        instructorId: "inst",
        personId: "alumno",
        scheduledAt: new Date(),
        price: 40000,
        commissionPct: 25,
        commissionPaidAt: null,
        status: "CONFIRMED",
        createdAt: new Date("2026-02-10T12:00:00Z"),
      },
      {
        id: "les-req",
        academyId: "ac-1",
        instructorId: null,
        personId: "alumno",
        scheduledAt: null,
        price: 40000,
        commissionPct: 0,
        status: "REQUESTED",
        createdAt: new Date("2026-03-15T12:00:00Z"),
      },
    );
  });

  it("sin params devuelve todo; status e instructorId filtran", async () => {
    const all = (await lessons.list("ac-1", reqAs("owner"))).items;
    expect(all).toHaveLength(3);
    const done = (await lessons.list("ac-1", reqAs("owner"), "DONE")).items;
    expect(done.map((l) => l.id)).toEqual(["les-done"]);
    const byInstructor = (await lessons.list(
      "ac-1",
      reqAs("owner"),
      undefined,
      "inst",
    )).items;
    expect(byInstructor.map((l) => l.id)).toEqual(["les-done", "les-conf"]);
  });

  it("enum inválido → 400 (status y commission)", async () => {
    await expect(
      lessons.list("ac-1", reqAs("owner"), "NOPE"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      lessons.list("ac-1", reqAs("owner"), undefined, undefined, "quizas"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("commission=paid/pending mapea a commissionPaidAt sobre comisiones >0", async () => {
    const paid = (await lessons.list(
      "ac-1",
      reqAs("owner"),
      undefined,
      undefined,
      "paid",
    )).items;
    expect(paid.map((l) => l.id)).toEqual(["les-done"]);
    // "pending" = comisión histórica >0 sin liquidar - les-req
    // (commissionPct=0, era acuerdo) no cuenta como pendiente.
    const pending = (await lessons.list(
      "ac-1",
      reqAs("owner"),
      undefined,
      undefined,
      "pending",
    )).items;
    expect(pending.map((l) => l.id)).toEqual(["les-conf"]);
    const todo = (await lessons.list(
      "ac-1",
      reqAs("owner"),
      undefined,
      undefined,
      "all",
    )).items;
    expect(todo).toHaveLength(3);
  });

  it("from/to acotan createdAt por día inclusivo; fecha inválida → 400", async () => {
    const feb = (await lessons.list(
      "ac-1",
      reqAs("owner"),
      undefined,
      undefined,
      undefined,
      "2026-02-01",
      "2026-02-28",
    )).items;
    expect(feb.map((l) => l.id)).toEqual(["les-conf"]);
    // `to` del mismo día incluye createdAt a cualquier hora del día.
    const mismoDia = (await lessons.list(
      "ac-1",
      reqAs("owner"),
      undefined,
      undefined,
      undefined,
      "2026-02-10",
      "2026-02-10",
    )).items;
    expect(mismoDia.map((l) => l.id)).toEqual(["les-conf"]);
    await expect(
      lessons.list(
        "ac-1",
        reqAs("owner"),
        undefined,
        undefined,
        undefined,
        "no-es-fecha",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("pending cuenta la cola REQUESTED (por asignar / por confirmar) sin importar el filtro", async () => {
    // REQUESTED asignada+agendada: espera confirm (les-req queda como
    // por asignar: sin instructor ni fecha).
    prisma.lessons.push({
      id: "les-req-ok",
      academyId: "ac-1",
      instructorId: "inst",
      personId: "alumno",
      scheduledAt: new Date(),
      price: 40000,
      commissionPct: 0,
      status: "REQUESTED",
      createdAt: new Date("2026-03-20T12:00:00Z"),
    });
    const res = await lessons.list("ac-1", reqAs("owner"));
    expect(res.pending).toEqual({ toAssign: 1, toConfirm: 1 });
    // Los KPIs de la cola son de la academia entera: un filtro activo
    // (status=DONE) no los altera.
    const done = await lessons.list("ac-1", reqAs("owner"), "DONE");
    expect(done.pending).toEqual({ toAssign: 1, toConfirm: 1 });
  });
});
