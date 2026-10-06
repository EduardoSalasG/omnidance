import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Academy } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";
import type { PersonContext } from "../domain/academy.service";

// AcademyAccess - gate central de la consola de academia. S3 (spec
// academy-saas-billing): requireManage/requireAdminister siguen abiertos
// para lecturas; las variantes *Write rechazan con 403
// {error:"billing.blocked"} cuando billingBlockedAt está seteado.
// role.findMany → [] (sin roles = no ADMIN; el owner pasa por ownerId).

function mkAcademy(over: Partial<Academy> = {}): Academy {
  return {
    id: "ac-1",
    name: "Academia X",
    ownerId: "p1",
    billingBlockedAt: null,
    ...over,
  } as Academy;
}

function mkPrisma(academy: Academy | null, staff: unknown[] = []) {
  return {
    academy: {
      findUnique: vi.fn(async () =>
        academy
          ? { ...academy, instructors: [{ personId: "p-inst" }], staff }
          : null,
      ),
    },
    role: { findMany: vi.fn(async () => [] as unknown[]) },
  };
}

const owner: PersonContext = { id: "p1", roles: [] };
const instructor: PersonContext = { id: "p-inst", roles: [] };
const outsider: PersonContext = { id: "p-x", roles: [] };
const staffPerson: PersonContext = { id: "p-staff", roles: [] };

const STAFF_PAYMENTS = {
  personId: "p-staff",
  canStudents: false,
  canPayments: true,
  canPlans: false,
  canSchedule: false,
  canProfile: false,
  canTeam: false,
  canBilling: false,
};

/** Body de respuesta de una HttpException. */
function errBody(e: unknown): Record<string, unknown> {
  const res = (e as { getResponse?: () => unknown }).getResponse?.();
  return (res ?? {}) as Record<string, unknown>;
}

describe("AcademyAccess", () => {
  let prisma: ReturnType<typeof mkPrisma>;
  let access: AcademyAccess;

  beforeEach(() => {
    prisma = mkPrisma(mkAcademy());
    access = new AcademyAccess(prisma as unknown as PrismaService);
  });

  it("academia inexistente → 404", async () => {
    prisma = mkPrisma(null);
    access = new AcademyAccess(prisma as unknown as PrismaService);
    await expect(access.requireManage("ac-x", owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("outsider → 403 (RBAC/dominio sigue mandando)", async () => {
    await expect(
      access.requireAdministerWrite("ac-1", outsider),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      access.requireManageWrite("ac-1", outsider),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("academia sana: owner pasa write; instructor pasa manage-write", async () => {
    await expect(
      access.requireAdministerWrite("ac-1", owner),
    ).resolves.toMatchObject({ academy: expect.objectContaining({ id: "ac-1" }) });
    await expect(
      access.requireManageWrite("ac-1", instructor),
    ).resolves.toMatchObject({ academy: expect.objectContaining({ id: "ac-1" }) });
    // instructor NO administra ni en una academia sana
    await expect(
      access.requireAdministerWrite("ac-1", instructor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe("academia bloqueada por mora (billingBlockedAt)", () => {
    beforeEach(() => {
      prisma = mkPrisma(mkAcademy({ billingBlockedAt: new Date() }));
      access = new AcademyAccess(prisma as unknown as PrismaService);
    });

    it("requireManageWrite → 403 {error: 'billing.blocked'}", async () => {
      const err = await access
        .requireManageWrite("ac-1", owner)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(errBody(err).error).toBe("billing.blocked");
    });

    it("requireAdministerWrite → 403 {error: 'billing.blocked'}", async () => {
      const err = await access
        .requireAdministerWrite("ac-1", owner)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(errBody(err).error).toBe("billing.blocked");
    });

    it("el instructor también queda read-only", async () => {
      await expect(
        access.requireManageWrite("ac-1", instructor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("las lecturas siguen abiertas: requireManage/requireAdminister resuelven", async () => {
      await expect(access.requireManage("ac-1", owner)).resolves.toBeTruthy();
      await expect(
        access.requireAdminister("ac-1", owner),
      ).resolves.toBeTruthy();
      await expect(
        access.requireManage("ac-1", instructor),
      ).resolves.toBeTruthy();
    });

    it("la verificación de acceso va antes del bloqueo: outsider → 403 de acceso", async () => {
      const err = await access
        .requireAdministerWrite("ac-1", outsider)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      // no es el error de billing - es el de acceso
      expect(errBody(err).error).not.toBe("billing.blocked");
    });
  });

  describe("capacidades delegadas (spec academy-staff-roles)", () => {
    beforeEach(() => {
      prisma = mkPrisma(mkAcademy(), [STAFF_PAYMENTS]);
      access = new AcademyAccess(prisma as unknown as PrismaService);
    });

    it("staff con el flag pasa su capacidad", async () => {
      await expect(
        access.requireCapability("ac-1", staffPerson, "payments"),
      ).resolves.toBeTruthy();
      await expect(
        access.requireCapabilityWrite("ac-1", staffPerson, "payments"),
      ).resolves.toBeTruthy();
    });

    it("staff sin el flag → 403 academy.capability", async () => {
      const err = await access
        .requireCapability("ac-1", staffPerson, "schedule")
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(errBody(err).error).toBe("academy.capability");
      expect(errBody(err).capability).toBe("schedule");
    });

    it("outsider sin fila staff → 403 en cualquier capacidad", async () => {
      await expect(
        access.requireCapability("ac-1", outsider, "payments"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("owner y cualquier staff pasan requireStaff; instructor no", async () => {
      await expect(
        access.requireStaff("ac-1", owner),
      ).resolves.toBeTruthy();
      await expect(
        access.requireStaff("ac-1", staffPerson),
      ).resolves.toBeTruthy();
      await expect(
        access.requireStaff("ac-1", instructor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("staff pasa requireManage (nivel operativo ≥ instructor)", async () => {
      await expect(
        access.requireManage("ac-1", staffPerson),
      ).resolves.toBeTruthy();
    });

    it("requireCapabilityWrite respeta billing.blocked", async () => {
      prisma = mkPrisma(mkAcademy({ billingBlockedAt: new Date() }), [
        STAFF_PAYMENTS,
      ]);
      access = new AcademyAccess(prisma as unknown as PrismaService);
      const err = await access
        .requireCapabilityWrite("ac-1", staffPerson, "payments")
        .catch((e: unknown) => e);
      expect(errBody(err).error).toBe("billing.blocked");
    });
  });
});
