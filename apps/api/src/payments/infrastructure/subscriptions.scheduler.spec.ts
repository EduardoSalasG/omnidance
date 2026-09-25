import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node-cron", () => ({ schedule: vi.fn() }));

import { schedule } from "node-cron";
import { SubscriptionsScheduler } from "./subscriptions.scheduler";

// Scheduler T7 — patrón crm-triggers: cron diario 09:00 → reconcileAll
// ("cron"); en NODE_ENV=test no se registra (los specs ejercen
// reconcileAll directo).

const scheduleMock = vi.mocked(schedule);

function mkSubs() {
  return {
    reconcileAll: vi.fn(async () => ({ checked: 0, settled: 0 })),
  };
}

describe("SubscriptionsScheduler", () => {
  beforeEach(() => {
    scheduleMock.mockClear();
  });

  it("registra cron '0 9 * * *' cuyo tick dispara reconcileAll('cron')", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const subs = mkSubs();
      new SubscriptionsScheduler(subs as never).onModuleInit();
      expect(scheduleMock).toHaveBeenCalledWith(
        "0 9 * * *",
        expect.any(Function),
      );
      const tick = scheduleMock.mock.calls[0]![1] as () => void;
      tick();
      expect(subs.reconcileAll).toHaveBeenCalledWith("cron");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("un reconcileAll que rechaza no rompe el scheduler (catch+log)", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const subs = {
        reconcileAll: vi.fn(async () => {
          throw new Error("flow caído");
        }),
      };
      new SubscriptionsScheduler(subs as never).onModuleInit();
      const tick = scheduleMock.mock.calls[0]![1] as () => void;
      expect(() => tick()).not.toThrow();
      // el catch interno absorbe el rechazo — esperar el tick async
      await new Promise((r) => setTimeout(r, 10));
      expect(subs.reconcileAll).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("NODE_ENV=test → no registra el cron", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      new SubscriptionsScheduler(mkSubs() as never).onModuleInit();
      expect(scheduleMock).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
