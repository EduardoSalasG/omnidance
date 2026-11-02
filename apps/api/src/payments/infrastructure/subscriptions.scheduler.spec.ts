import { describe, it, expect, vi } from "vitest";
import { SubscriptionsScheduler } from "./subscriptions.scheduler";
import { JobRegistry } from "../../jobs/registry";

// Scheduler (spec admin-jobs-mail-campaigns): ya no agenda node-cron -
// registra el job `subscriptions.reconcile` en el JOB_REGISTRY. El
// horario vive en ScheduledJob (DB); el handler agrupa los barridos
// (tarjeta + renovación manual TRANSFER + bloqueos) y reporta sus
// contadores a JobRun.meta.

function mkSubs() {
  return {
    reconcileAll: vi.fn(async () => ({ checked: 4, settled: 1 })),
    reconcileManualRenewals: vi.fn(async () => ({ checked: 1, issued: 1 })),
  };
}

/** PlatformSubscriptionsService stub - reconcileAll + manual + enforceAcademyBlocks. */
function mkPlatSubs() {
  return {
    reconcileAll: vi.fn(async () => ({ checked: 2, settled: 0 })),
    reconcileManualRenewals: vi.fn(async () => ({ checked: 1, issued: 0 })),
    enforceAcademyBlocks: vi.fn(async () => ({ blocked: 3 })),
  };
}

describe("SubscriptionsScheduler", () => {
  it("registra subscriptions.reconcile con default 09:00", () => {
    const registry = new JobRegistry();
    new SubscriptionsScheduler(
      mkSubs() as never,
      mkPlatSubs() as never,
      registry,
    ).onModuleInit();
    const reg = registry.get("subscriptions.reconcile");
    expect(reg).toBeDefined();
    expect(reg!.defaultCron).toBe("0 9 * * *");
    expect(reg!.label).toBeTruthy();
  });

  it("el handler corre los barridos y reporta contadores a meta", async () => {
    const registry = new JobRegistry();
    const subs = mkSubs();
    const platSubs = mkPlatSubs();
    new SubscriptionsScheduler(
      subs as never,
      platSubs as never,
      registry,
    ).onModuleInit();
    const meta = await registry.get("subscriptions.reconcile")!.handler();
    expect(subs.reconcileAll).toHaveBeenCalledWith("cron");
    expect(subs.reconcileManualRenewals).toHaveBeenCalledWith("cron");
    expect(platSubs.reconcileAll).toHaveBeenCalledWith("cron");
    expect(platSubs.reconcileManualRenewals).toHaveBeenCalledWith("cron");
    expect(platSubs.enforceAcademyBlocks).toHaveBeenCalled();
    expect(meta).toEqual({
      memberships: { checked: 4, settled: 1 },
      manualMemberships: { checked: 1, issued: 1 },
      platform: { checked: 2, settled: 0 },
      manualPlatform: { checked: 1, issued: 0 },
      blocks: { blocked: 3 },
    });
  });

  it("un barrido que rechaza propaga el error al JobRun", async () => {
    const registry = new JobRegistry();
    const subs = {
      reconcileAll: vi.fn(async () => {
        throw new Error("flow caído");
      }),
    };
    new SubscriptionsScheduler(
      subs as never,
      mkPlatSubs() as never,
      registry,
    ).onModuleInit();
    await expect(
      registry.get("subscriptions.reconcile")!.handler(),
    ).rejects.toThrow("flow caído");
  });
});
