import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { Academy } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "./academy-access.service";
import { invalidateRoleCatalog } from "../../common/rbac/roles.guard";
import type { PersonContext } from "../domain/academy.service";

// Gate por tier en AcademyAccess (spec academy-tier-cobros): los
// require* con `feature` rechazan 403 {error:"tier.required"} cuando la
// suscripción de la academia no la cubre. ADMIN opera por otro y nunca
// se gatea; sin `feature` el comportamiento queda intacto.

function mkAcademy(over: Partial<Academy> = {}): Academy {
  return {
    id: "ac-1",
    name: "Academia X",
    ownerId: "p1",
    tier: "STUDIO",
    billingBlockedAt: null,
    ...over,
  } as Academy;
}

function mkPrisma(academy: Academy | null, isAdmin = false) {
  return {
    academy: {
      findUnique: vi.fn(async () =>
        academy
          ? { ...academy, instructors: [{ personId: "p-inst" }], staff: [] }
          : null,
      ),
    },
    role: {
      findMany: vi.fn(async () =>
        isAdmin
          ? [
              {
                key: "ADMIN",
                isSuperuser: true,
                permissions: [],
              },
            ]
          : [],
      ),
    },
  };
}

const owner: PersonContext = { id: "p1", roles: [] };
const instructor: PersonContext = { id: "p-inst", roles: [] };
const admin: PersonContext = { id: "p-admin", roles: ["ADMIN"] };

const errBody = (e: unknown): Record<string, unknown> =>
  ((e as { getResponse?: () => unknown }).getResponse?.() ?? {}) as Record<
    string,
    unknown
  >;

const access = (prisma: ReturnType<typeof mkPrisma>) =>
  new AcademyAccess(prisma as unknown as PrismaService);

beforeEach(() => {
  // El catálogo de roles tiene cache de 30s a nivel módulo - cada mock
  // de role.findMany necesita catálogo fresco (mismo patrón que
  // crm.controller.spec).
  invalidateRoleCatalog();
});

describe("gate de tier (academy-tier-cobros)", () => {
  it("COBROS → 403 tier.required en features STUDIO (crear clase = schedule+classes)", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "COBROS" })));
    const err = await a
      .requireCapabilityWrite("ac-1", owner, "schedule", "classes")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(errBody(err).error).toBe("tier.required");
    expect(errBody(err).requiredTier).toBe("STUDIO");
  });

  it("COBROS → 403 tier.required PRO en CRM-level features; pasa cobros/alumnos", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "COBROS" })));
    const err = await a
      .requireAdminister("ac-1", owner, "insights")
      .catch((e: unknown) => e);
    expect(errBody(err).error).toBe("tier.required");
    expect(errBody(err).requiredTier).toBe("PRO");
    // Features base (capacidades sin feature gateada) siguen abiertas.
    await expect(
      a.requireCapability("ac-1", owner, "payments"),
    ).resolves.toBeTruthy();
    await expect(
      a.requireCapability("ac-1", owner, "students"),
    ).resolves.toBeTruthy();
  });

  it("STUDIO → pasa features de operación; PRO requerido en insights", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "STUDIO" })));
    await expect(
      a.requireCapabilityWrite("ac-1", owner, "schedule", "classes"),
    ).resolves.toBeTruthy();
    await expect(
      a.requireCapability("ac-1", owner, "team", "staff"),
    ).resolves.toBeTruthy();
    const err = await a
      .requireAdminister("ac-1", owner, "insights")
      .catch((e: unknown) => e);
    expect(errBody(err).requiredTier).toBe("PRO");
  });

  it("PRO → pasa todo", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "PRO" })));
    await expect(
      a.requireAdminister("ac-1", owner, "insights"),
    ).resolves.toBeTruthy();
    await expect(
      a.requireCapabilityWrite("ac-1", owner, "schedule", "videos"),
    ).resolves.toBeTruthy();
  });

  it("STARTER legado se comporta como STUDIO (no degrada)", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "STARTER" })));
    await expect(
      a.requireCapabilityWrite("ac-1", owner, "schedule", "classes"),
    ).resolves.toBeTruthy();
  });

  it("sin suscripción (trial) → nivel STUDIO", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: null })));
    await expect(
      a.requireCapabilityWrite("ac-1", owner, "schedule", "classes"),
    ).resolves.toBeTruthy();
  });

  it("instructor también se gatea por la feature de SU academia", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "COBROS" })));
    const err = await a
      .requireManageWrite("ac-1", instructor, "attendance")
      .catch((e: unknown) => e);
    expect(errBody(err).error).toBe("tier.required");
  });

  it("ADMIN operando por otro nunca se gatea", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "COBROS" }), true));
    await expect(
      a.requireCapabilityWrite("ac-1", admin, "schedule", "classes"),
    ).resolves.toBeTruthy();
    await expect(
      a.requireAdminister("ac-1", admin, "insights"),
    ).resolves.toBeTruthy();
  });

  it("sin feature declarada el require pasa igual que antes", async () => {
    const a = access(mkPrisma(mkAcademy({ tier: "COBROS" })));
    await expect(
      a.requireCapabilityWrite("ac-1", owner, "schedule"),
    ).resolves.toBeTruthy();
  });
});
