import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Academy } from "@prisma/client";
import type { Request } from "express";
import type { AcademyAccess } from "./academy-access.service";
import type { AuthService } from "../../auth/domain/auth.service";
// Ciclo session.guard ⇄ auth.controller (SESSION_COOKIE) - mismo patrón
// que academy-billing.controller.spec.ts.
import "../../auth/infrastructure/auth.controller";
import { AcademyStaffController } from "./academy-staff.controller";

// AcademyStaffController - endpoints de instructores
// (academy-team-instructors): gate por capacidad `team`, find-or-stub +
// invitación al agregar, upsert sin duplicar, guardas owner/self, baja.

const ACADEMY = { id: "ac1", name: "Academia X", ownerId: "p1" } as Academy;
const req = (id: string) =>
  ({ person: { id, roles: [] } }) as unknown as Request;

function mkAccess(behavior: "ok" | "forbidden" = "ok") {
  return {
    requireCapability: vi.fn(async () => {
      if (behavior === "forbidden") {
        throw new ForbiddenException("capacidad team requerida");
      }
      return { academy: ACADEMY, ctx: { staff: [], instructorIds: [] } };
    }),
    requireCapabilityWrite: vi.fn(async () => {
      if (behavior === "forbidden") {
        throw new ForbiddenException("capacidad team requerida");
      }
      return { academy: ACADEMY };
    }),
  };
}

function mkPrisma() {
  return {
    person: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => [
        { id: "i1", name: "Profe Uno", email: "profe@x.cl" },
      ]),
      create: vi.fn(
        async (args: { data: { email: string; name?: string } }) => ({
        id: "new1",
        email: args.data.email,
        name: args.data.name ?? null,
      })),
    },
    academyStaff: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    academyInstructor: {
      findMany: vi.fn(async () => [
        { personId: "i1", payType: "PER_CLASS", payAmount: 15000, createdAt: new Date() },
      ]),
      count: vi.fn(async () => 1),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

function mkAuth() {
  return { createMagicToken: vi.fn(async () => "tok") };
}

function mkMailer() {
  return { send: vi.fn(async () => undefined) };
}

describe("AcademyStaffController - instructores", () => {
  let prisma: ReturnType<typeof mkPrisma>;
  let access: ReturnType<typeof mkAccess>;
  let auth: ReturnType<typeof mkAuth>;
  let mailer: ReturnType<typeof mkMailer>;
  let ctrl: AcademyStaffController;

  beforeEach(() => {
    prisma = mkPrisma();
    access = mkAccess();
    auth = mkAuth();
    mailer = mkMailer();
    ctrl = new AcademyStaffController(
      prisma as never,
      access as unknown as AcademyAccess,
      auth as unknown as AuthService,
      mailer as never,
    );
  });

  it("GET /instructors - lista con person + acuerdo, gate team", async () => {
    const r = await ctrl.listInstructors("ac1", req("p1"));
    expect(access.requireCapability).toHaveBeenCalledWith(
      "ac1",
      expect.objectContaining({ id: "p1" }),
      "team",
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      person: { id: "i1", name: "Profe Uno" },
      payType: "PER_CLASS",
      payAmount: 15000,
    });
    // commissionPct solo viaja con valor cuando el acuerdo es
    // COMMISSION - con PER_CLASS/MONTHLY va null (subtipo activo).
    expect(r.items[0]).toMatchObject({ commissionPct: null });
  });

  it("GET /instructors - sin cap team → 403", async () => {
    access = mkAccess("forbidden");
    ctrl = new AcademyStaffController(
      prisma as never,
      access as unknown as AcademyAccess,
      auth as unknown as AuthService,
      mailer as never,
    );
    await expect(ctrl.listInstructors("ac1", req("s1"))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.academyInstructor.findMany).not.toHaveBeenCalled();
  });

  it("POST /instructors - email nuevo → stub + membresía + invitación", async () => {
    const r = await ctrl.addInstructor(
      "ac1",
      {
        email: " NUEVO@x.cl ",
        name: "Profe Nuevo",
        payType: "PER_CLASS",
        payAmount: 15000,
      },
      req("p1"),
    );
    expect(prisma.person.create).toHaveBeenCalledWith({
      data: { email: "nuevo@x.cl", name: "Profe Nuevo" },
    });
    expect(prisma.academyInstructor.upsert).toHaveBeenCalledWith({
      where: { academyId_personId: { academyId: "ac1", personId: "new1" } },
      create: {
        academyId: "ac1",
        personId: "new1",
        payType: "PER_CLASS",
        payAmount: 15000,
        payClasses: null,
        commissionPct: null,
      },
      update: { payType: "PER_CLASS", commissionPct: null, payAmount: 15000 },
    });
    expect(mailer.send).toHaveBeenCalledWith(
      "nuevo@x.cl",
      expect.stringContaining("Academia X"),
      expect.any(String),
    );
    expect(r).toEqual({ personId: "new1", invited: true });
  });

  it("POST /instructors - email existente → upsert sin invitación", async () => {
    prisma.person.findUnique.mockResolvedValueOnce({
      id: "i9",
      email: "ya@x.cl",
      name: "Ya",
    } as never);
    const r = await ctrl.addInstructor(
      "ac1",
      { email: "ya@x.cl" },
      req("p1"),
    );
    expect(prisma.person.create).not.toHaveBeenCalled();
    expect(prisma.academyInstructor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
        create: expect.objectContaining({ payType: null }),
      }),
    );
    expect(mailer.send).not.toHaveBeenCalled();
    expect(r).toEqual({ personId: "i9", invited: false });
  });

  it("POST /instructors - target = owner → 400", async () => {
    prisma.person.findUnique.mockResolvedValueOnce({
      id: "p1",
      email: "owner@x.cl",
    } as never);
    await expect(
      ctrl.addInstructor("ac1", { email: "owner@x.cl" }, req("p1")),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.academyInstructor.upsert).not.toHaveBeenCalled();
  });

  it("POST /instructors - auto-gestión → 400 cannot_modify_self", async () => {
    prisma.person.findUnique.mockResolvedValueOnce({
      id: "s2",
      email: "staff@x.cl",
    } as never);
    await expect(
      ctrl.addInstructor("ac1", { email: "staff@x.cl" }, req("s2")),
    ).rejects.toThrow(BadRequestException);
  });

  it("DELETE /instructors/:personId - elimina la membresía", async () => {
    const r = await ctrl.removeInstructor("ac1", "i1", req("p1"));
    expect(prisma.academyInstructor.deleteMany).toHaveBeenCalledWith({
      where: { academyId: "ac1", personId: "i1" },
    });
    expect(r).toEqual({ removed: true });
  });

  it("DELETE /instructors/:personId - inexistente → 404", async () => {
    prisma.academyInstructor.deleteMany.mockResolvedValueOnce({
      count: 0,
    } as never);
    await expect(
      ctrl.removeInstructor("ac1", "i-x", req("p1")),
    ).rejects.toThrow(NotFoundException);
  });
});
