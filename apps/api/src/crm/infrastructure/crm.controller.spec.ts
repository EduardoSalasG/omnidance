import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller
import { invalidateRoleCatalog } from "../../common/rbac/roles.guard";
import { CrmController } from "./crm.controller";
import type { CrmService } from "../domain/crm.service";

// CrmController.assertActorAccess - gating Producer Pro (S5
// academy-saas-billing): cuando el actor resuelto es PRODUCER y el caller
// es ese productor, todas las features CRM (people, campañas, triggers,
// scores) exigen Pro vigente → 403 {error:"pro.required", upgrade:true}.
// Actores ACADEMY y llamadas admin pasan sin gate Pro.

interface FakePersonRow {
  id: string;
  proTier: string;
  proTrialEndsAt: Date | null;
}

interface FakeRole {
  key: string;
  isSuperuser: boolean;
  permissionKeys: string[];
}

class FakePrisma {
  people = new Map<string, FakePersonRow>();
  academies: { id: string; ownerId: string }[] = [];
  roles: FakeRole[] = [];

  person = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.people.get(where.id) ?? null,
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
    prisma.academies.push({ id: "ac-1", ownerId: "owner-1" });
  });

  const campaignDto = {
    actorType: "PRODUCER",
    actorId: "prod-1",
    name: "Vuelve al social",
    segment: {},
    action: { type: "NOTIFY", title: "hola" },
  };

  it("productor FREE sin trial → 403 pro.required en campaigns/people/triggers/scores", async () => {
    prisma.people.set(
      "prod-1",
      mkProducer("prod-1", { proTier: "FREE", proTrialEndsAt: null }),
    );
    const err = await ctrl
      .createCampaign(campaignDto, reqAs("prod-1"))
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err)).toMatchObject({
      error: "pro.required",
      upgrade: true,
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
      expect(errBody(e).error).toBe("pro.required");
    }
  });

  it("productor FREE con trial vigente → pasa al servicio", async () => {
    // mkProducer default: trial vigente
    const res = await ctrl.createCampaign(campaignDto, reqAs("prod-1"));
    expect(res).toEqual({ id: "camp-1" });
    expect(crm.createCampaign).toHaveBeenCalledOnce();
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

  it("productor ajeno sin admin → 403 de acceso (no pro.required)", async () => {
    const err = await ctrl
      .listPeople(
        { actorType: "PRODUCER", actorId: "prod-1" },
        reqAs("otro", ["PRODUCER"]),
      )
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err).error).not.toBe("pro.required");
  });
});
