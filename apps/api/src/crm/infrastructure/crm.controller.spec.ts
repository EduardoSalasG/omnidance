import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller
import { invalidateRoleCatalog } from "../../common/rbac/roles.guard";
import { CrmController } from "./crm.controller";
import type { CrmService } from "../domain/crm.service";

// CrmController.assertActorAccess - gating por suscripción (spec
// unified-actor-entitlements): cuando el actor resuelto es PRODUCER y el
// caller es ese productor, todas las features CRM (people, campañas,
// triggers, scores) exigen Pro vigente con la feature crm (matriz
// producer-pro: arranca en PRO_GROWTH) → 403 {error:"tier.required",
// upgrade:true, requiredTier:"PRO_GROWTH", feature:"crm"}. Actores ACADEMY
// y llamadas admin pasan sin gate de suscripción.

interface FakePersonRow {
  id: string;
  proTier: string;
  proTrialEndsAt: Date | null;
  roles?: { status: string }[];
}

interface FakeRole {
  key: string;
  isSuperuser: boolean;
  permissionKeys: string[];
}

class FakePrisma {
  people = new Map<string, FakePersonRow>();
  academies: { id: string; ownerId: string; tier?: string | null }[] = [];
  roles: FakeRole[] = [];

  person = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const p = this.people.get(where.id) ?? null;
      return p ? { ...p, roles: p.roles ?? [{ status: "APPROVED" }] } : null;
    },
  };

  academy = {
    findFirst: async ({
      where,
    }: {
      where: { id: string; ownerId: string };
    }) =>
      this.academies.find(
        (a) => a.id === where.id && a.ownerId === where.ownerId,
      ) ?? null,
    // Gate de tier (academy-tier-cobros): assertActorFeature lee el tier
    // de la academia por findUnique.
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.academies.find((a) => a.id === where.id) ?? null,
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
}

const reqAs = (personId: string, roles: string[] = []) =>
  ({ person: { id: personId, roles } }) as unknown as Request;

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

describe("CrmController - gating Producer Pro", () => {
  let prisma: FakePrisma;
  let crm: {
    listPeople: ReturnType<typeof vi.fn>;
    createCampaign: ReturnType<typeof vi.fn>;
    previewCampaign: ReturnType<typeof vi.fn>;
    listTriggers: ReturnType<typeof vi.fn>;
    createTrigger: ReturnType<typeof vi.fn>;
    recomputeScores: ReturnType<typeof vi.fn>;
  };
  let ctrl: CrmController;

  beforeEach(() => {
    invalidateRoleCatalog();
    prisma = new FakePrisma();
    crm = {
      listPeople: vi.fn(async () => []),
      createCampaign: vi.fn(async () => ({ id: "camp-1" })),
      previewCampaign: vi.fn(async () => ({ audience: 3 })),
      listTriggers: vi.fn(async () => []),
      createTrigger: vi.fn(async () => ({ id: "trg-1" })),
      recomputeScores: vi.fn(async () => ({ recomputed: 0 })),
    };
    ctrl = new CrmController(
      crm as unknown as CrmService,
      prisma as unknown as PrismaService,
    );
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
    prisma.people.set("prod-1", mkProducer("prod-1"));
    // El CRM de academia es feature PRO (academy-tier-cobros).
    prisma.academies.push({ id: "ac-1", ownerId: "owner-1", tier: "PRO" });
  });

  const campaignDto = {
    actorType: "PRODUCER",
    actorId: "prod-1",
    name: "Vuelve al social",
    segment: {},
    action: { type: "NOTIFY", title: "hola" },
  };

  it("productor FREE sin trial → 403 tier.required en campaigns/people/triggers/scores", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const err = await ctrl
      .createCampaign(campaignDto, reqAs("prod-1"))
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err)).toMatchObject({
      error: "tier.required",
      upgrade: true,
      requiredTier: "PRO_GROWTH",
      feature: "crm",
    });
    expect(crm.createCampaign).not.toHaveBeenCalled();

    for (const call of [
      () => ctrl.listPeople({ actorType: "PRODUCER", actorId: "prod-1" }, reqAs("prod-1")),
      () =>
        ctrl.previewCampaign(
          { actorType: "PRODUCER", actorId: "prod-1", segment: {} },
          reqAs("prod-1"),
        ),
      () =>
        ctrl.listTriggers(
          { actorType: "PRODUCER", actorId: "prod-1" },
          reqAs("prod-1"),
        ),
      () =>
        ctrl.recompute(
          { actorType: "PRODUCER", actorId: "prod-1" },
          reqAs("prod-1"),
        ),
    ]) {
      const e = await call().catch((x: unknown) => x);
      expect(errBody(e).error).toBe("tier.required");
    }
  });

  it("productor FREE con trial vigente (PRO_STARTER efectivo) → 403 tier.required PRO_GROWTH", async () => {
    // mkProducer default: trial vigente → el trial vende el piso Pro
    // (spec producer-pro) - crm arranca en PRO_GROWTH.
    const err = await ctrl
      .createCampaign(campaignDto, reqAs("prod-1"))
      .catch((e: unknown) => e);
    expect(errBody(err)).toMatchObject({
      error: "tier.required",
      requiredTier: "PRO_GROWTH",
      feature: "crm",
    });
    expect(crm.createCampaign).not.toHaveBeenCalled();
  });

  it("productor PRO_GROWTH sin trial → pasa", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "PRO_GROWTH", proTrialEndsAt: null }),
    );
    await ctrl.createCampaign(campaignDto, reqAs("prod-1"));
    expect(crm.createCampaign).toHaveBeenCalledOnce();
  });

  it("actor ACADEMY no se gatea por Pro (va por billing de academia)", async () => {
    const res = await ctrl.createCampaign(
      { ...campaignDto, actorType: "ACADEMY", actorId: "ac-1" },
      reqAs("owner-1"),
    );
    expect(res).toEqual({ id: "camp-1" });
    expect(crm.createCampaign).toHaveBeenCalledOnce();
  });

  it("actor ACADEMY con tier COBROS → 403 tier.required (CRM es PRO)", async () => {
    prisma.academies = [{ id: "ac-1", ownerId: "owner-1", tier: "COBROS" }];
    const err = await ctrl
      .createCampaign(
        { ...campaignDto, actorType: "ACADEMY", actorId: "ac-1" },
        reqAs("owner-1"),
      )
      .catch((e: unknown) => e);
    expect(errBody(err).error).toBe("tier.required");
    expect(errBody(err).requiredTier).toBe("PRO");
  });

  it("admin operando el CRM de un productor FREE → pasa sin gate", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const res = await ctrl.listPeople(
      { actorType: "PRODUCER", actorId: "prod-1" },
      reqAs("soporte", ["ADMIN"]),
    );
    expect(res).toEqual([]);
    expect(crm.listPeople).toHaveBeenCalledOnce();
  });

  it("productor ajeno sin admin → 403 de acceso (no tier.required)", async () => {
    const err = await ctrl
      .listPeople(
        { actorType: "PRODUCER", actorId: "prod-1" },
        reqAs("otro", ["PRODUCER"]),
      )
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err).error).not.toBe("tier.required");
  });
});
