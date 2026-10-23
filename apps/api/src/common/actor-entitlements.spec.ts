import { describe, it, expect, beforeEach } from "vitest";
import type { PrismaService } from "../prisma.service";
import {
  assertActorFeature,
  assertAnyOwnedAcademyMeets,
  resolveAcademyEntitlements,
  resolveProducerEntitlement,
} from "./actor-entitlements";
import {
  producerEntitlement,
  producerRequiredTierFor,
} from "../payments/domain/actor-entitlements";

// Gate unificado por suscripción (spec unified-actor-entitlements): un
// solo assert + un solo error 403 {error:"tier.required", upgrade:true,
// requiredTier, feature} para productor y academia. El bypass de admin
// es estructural (los call sites chequean identidad antes de llamar) -
// acá se prueba el gate del actor resuelto.

interface FakePersonRow {
  id: string;
  proTier: string;
  proTrialEndsAt: Date | null;
  roles?: { status: string }[];
}

interface FakeAcademy {
  id: string;
  ownerId: string;
  tier: string | null;
}

class FakePrisma {
  people = new Map<string, FakePersonRow>();
  academies: FakeAcademy[] = [];

  person = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const p = this.people.get(where.id) ?? null;
      return p ? { ...p, roles: p.roles ?? [{ status: "APPROVED" }] } : null;
    },
  };

  academy = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.academies.find((a) => a.id === where.id) ?? null,
    findMany: async ({ where }: { where: { ownerId: string } }) =>
      this.academies.filter((a) => a.ownerId === where.ownerId),
  };
}

const errBody = (e: unknown): Record<string, unknown> =>
  ((e as { getResponse?: () => unknown }).getResponse?.() ?? {}) as Record<
    string,
    unknown
  >;

const mkProducer = (
  id: string,
  over: Partial<FakePersonRow> = {},
): FakePersonRow => ({
  id,
  proTier: "FREE",
  proTrialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
  ...over,
});

describe("assertActorFeature - PRODUCER", () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = new FakePrisma();
    prisma.people.set("prod-1", mkProducer("prod-1"));
  });

  it("productor FREE sin trial → 403 tier.required con requiredTier PRO y la feature", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const err = await assertActorFeature(
      prisma as unknown as PrismaService,
      "PRODUCER",
      "prod-1",
      "exports",
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err)).toMatchObject({
      error: "tier.required",
      upgrade: true,
      requiredTier: "PRO",
      feature: "exports",
    });
  });

  it("productor sin rol PRODUCER aprobado → gate (no 404)", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { roles: [{ status: "PENDING" }] }),
    );
    const err = await assertActorFeature(
      prisma as unknown as PrismaService,
      "PRODUCER",
      "prod-1",
      "crm",
    ).catch((e: unknown) => e);
    expect(errBody(err).error).toBe("tier.required");
  });

  it("persona inexistente → gate (mismo criterio: no revela existencia)", async () => {
    const err = await assertActorFeature(
      prisma as unknown as PrismaService,
      "PRODUCER",
      "ghost",
      "crm",
    ).catch((e: unknown) => e);
    expect(errBody(err).error).toBe("tier.required");
  });

  it("trial vigente o tier pago → pasa todas las features", async () => {
    for (const feature of [
      "analytics",
      "crm",
      "exports",
      "multiStaff",
      "campaigns",
      "benchmark",
    ] as const) {
      await expect(
        assertActorFeature(
          prisma as unknown as PrismaService,
          "PRODUCER",
          "prod-1",
          feature,
        ),
      ).resolves.toBeUndefined();
    }
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "PRO_GROWTH", proTrialEndsAt: null }),
    );
    await expect(
      assertActorFeature(
        prisma as unknown as PrismaService,
        "PRODUCER",
        "prod-1",
        "analytics",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("assertActorFeature - ACADEMY", () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = new FakePrisma();
    prisma.academies.push({ id: "ac-1", ownerId: "o-1", tier: "COBROS" });
  });

  it("tier insuficiente → 403 tier.required con requiredTier del mínimo", async () => {
    const err = await assertActorFeature(
      prisma as unknown as PrismaService,
      "ACADEMY",
      "ac-1",
      "classes",
    ).catch((e: unknown) => e);
    expect(errBody(err)).toMatchObject({
      error: "tier.required",
      requiredTier: "STUDIO",
      feature: "classes",
    });
  });

  it("academia inexistente → 404", async () => {
    await expect(
      assertActorFeature(
        prisma as unknown as PrismaService,
        "ACADEMY",
        "nope",
        "classes",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("assertAnyOwnedAcademyMeets", () => {
  it("ninguna academia del owner cubre → tier.required; una basta", async () => {
    const prisma = new FakePrisma();
    prisma.academies.push(
      { id: "ac-1", ownerId: "o-1", tier: "COBROS" },
      { id: "ac-2", ownerId: "o-1", tier: "COBROS" },
    );
    const err = await assertAnyOwnedAcademyMeets(
      prisma as unknown as PrismaService,
      "o-1",
      "exports",
    ).catch((e: unknown) => e);
    expect(errBody(err)).toMatchObject({
      error: "tier.required",
      requiredTier: "STUDIO",
      feature: "exports",
    });
    prisma.academies[1].tier = "STUDIO";
    await expect(
      assertAnyOwnedAcademyMeets(
        prisma as unknown as PrismaService,
        "o-1",
        "exports",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("resolveProducerEntitlement / resolveAcademyEntitlements", () => {
  let prisma: FakePrisma;

  beforeEach(() => {
    prisma = new FakePrisma();
  });

  it("productor aprobado con Pro → {tier:'PRO', features}; FREE sin trial → tier null", async () => {
    prisma.people.set("prod-1", mkProducer("prod-1"));
    const pro = await resolveProducerEntitlement(
      prisma as unknown as PrismaService,
      "prod-1",
    );
    expect(pro).toEqual({
      tier: "PRO",
      features: expect.arrayContaining([
        "analytics",
        "crm",
        "exports",
        "multiStaff",
        "campaigns",
        "benchmark",
      ]),
    });

    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const free = await resolveProducerEntitlement(
      prisma as unknown as PrismaService,
      "prod-1",
    );
    expect(free).toEqual({ tier: null, features: [] });
  });

  it("sin rol PRODUCER aprobado o inexistente → null", async () => {
    expect(
      await resolveProducerEntitlement(
        prisma as unknown as PrismaService,
        "ghost",
      ),
    ).toBeNull();
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { roles: [{ status: "PENDING" }] }),
    );
    expect(
      await resolveProducerEntitlement(
        prisma as unknown as PrismaService,
        "prod-1",
      ),
    ).toBeNull();
  });

  it("academias del owner → {id, tier, features} reusa la matriz", async () => {
    prisma.academies.push(
      { id: "ac-1", ownerId: "o-1", tier: "COBROS" },
      { id: "ac-2", ownerId: "o-1", tier: null },
    );
    const list = await resolveAcademyEntitlements(
      prisma as unknown as PrismaService,
      "o-1",
    );
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("ac-1");
    expect(list[0].features).toEqual(["billing", "students"]);
    // null → nivel STUDIO (trial = gestión completa)
    expect(list[1].features).toContain("classes");
    expect(list[1].features).not.toContain("crm");
  });
});

describe("dominio puro", () => {
  it("producerEntitlement: Pro activo → PRO; FREE/trial vencido → null", () => {
    const now = new Date("2026-10-23T00:00:00Z");
    expect(
      producerEntitlement({ proTier: "PRO_STARTER", proTrialEndsAt: null }, now)
        .tier,
    ).toBe("PRO");
    expect(
      producerEntitlement({ proTier: "FREE", proTrialEndsAt: null }, now),
    ).toEqual({ tier: null, features: [] });
    expect(
      producerEntitlement(
        { proTier: "FREE", proTrialEndsAt: new Date("2026-10-01") },
        now,
      ).tier,
    ).toBeNull();
  });

  it("producerRequiredTierFor: hoy todo requiere PRO", () => {
    expect(producerRequiredTierFor("crm")).toBe("PRO");
    expect(producerRequiredTierFor("exports")).toBe("PRO");
  });
});
