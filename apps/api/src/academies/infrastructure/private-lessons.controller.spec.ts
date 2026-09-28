import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller (ver classes.controller.spec)
import type { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";
import { PrivateLessonsController } from "./private-lessons.controller";
import { AcademiesController } from "./academies.controller";

// Comisión del instructor (role-console-polish): PATCH
// /academies/:id/instructors/:personId (owner/admin), snapshot del
// commissionPct al crear la PrivateLesson, y netClp/commissionClp en
// GET /private-lessons/mine?as=instructor (el alumno no ve la comisión).

interface FakeAcademy {
  id: string;
  ownerId: string;
  active: boolean;
}

interface FakeInstructor {
  academyId: string;
  personId: string;
  commissionPct: number | null;
}

interface FakeLesson {
  id: string;
  academyId: string;
  instructorId: string;
  personId: string;
  scheduledAt: Date;
  price: number;
  commissionPct: number;
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

  beforeEach(() => {
    prisma = new FakePrisma();
    const access = new AcademyAccess(prisma as unknown as PrismaService);
    lessons = new PrivateLessonsController(
      prisma as unknown as PrismaService,
      access,
    );
    academies = new AcademiesController(
      prisma as unknown as PrismaService,
      access,
      {} as never, // SubscriptionsService — no se usa en estos endpoints
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
    const lesson = await lessons.request(
      "ac-1",
      {
        instructorId: "inst",
        scheduledAt: new Date("2026-10-01T20:00:00Z").toISOString(),
        price: 40000,
      },
      reqAs("alumno"),
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
