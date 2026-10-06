import { describe, expect, it, vi } from "vitest";
import "../auth/infrastructure/auth.controller"; // rompe el ciclo session.guard ⇄ auth.controller
import { MailCampaignsController } from "./mail-campaigns.controller";
import type { MailCampaignsService } from "./mail-campaigns.service";

// MailCampaignsController (spec admin-jobs-mail-campaigns): wiring de
// rutas — create/update/test/run/cancel delegan con actor de sesión y
// audience-count mapea el spec ALL/ROLE/EVENT.

const req = (id = "adm-1") => ({ person: { id } }) as never;

function mkCampaigns() {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ id: "c1" })),
    listRuns: vi.fn(async () => []),
    create: vi.fn(async (_a: string, input: unknown) => ({ id: "c1", input })),
    update: vi.fn(async () => ({ id: "c1" })),
    cancel: vi.fn(async () => ({ id: "c1", status: "CANCELLED" })),
    testSend: vi.fn(async () => ({ sent: "admin@test.cl" })),
    runNow: vi.fn(async () => ({ runId: "r1", sent: 3, failed: 0 })),
    audienceCount: vi.fn(async () => ({ count: 42 })),
  } as unknown as MailCampaignsService;
}

const baseDto = {
  name: "N",
  subject: "S",
  htmlBody: "<p>x</p>",
  scheduleKind: "ONCE" as const,
  runAt: "2026-11-01T12:00:00Z",
};

describe("MailCampaignsController", () => {
  it("create mapea audience ROLE y runAt a Date", async () => {
    const svc = mkCampaigns();
    const ctrl = new MailCampaignsController(svc);
    await ctrl.create(
      { ...baseDto, audience: { kind: "ROLE", roleKey: "PRODUCER" } },
      req("adm-7"),
    );
    expect(svc.create).toHaveBeenCalledWith("adm-7", {
      name: "N",
      subject: "S",
      htmlBody: "<p>x</p>",
      audience: { kind: "ROLE", roleKey: "PRODUCER" },
      scheduleKind: "ONCE",
      runAt: new Date("2026-11-01T12:00:00Z"),
      cronExpr: null,
      timezone: undefined,
      status: undefined,
    });
  });

  it("audience-count mapea el kind EVENT", async () => {
    const svc = mkCampaigns();
    const ctrl = new MailCampaignsController(svc);
    const res = await ctrl.audienceCount({ kind: "EVENT", eventId: "ev1" });
    expect(svc.audienceCount).toHaveBeenCalledWith({ kind: "EVENT", eventId: "ev1" });
    expect(res).toEqual({ count: 42 });
  });

  it("test/run/cancel pasan id + actor de sesión", async () => {
    const svc = mkCampaigns();
    const ctrl = new MailCampaignsController(svc);
    await ctrl.test("c1", req("adm-3"));
    await ctrl.run("c1", req("adm-3"));
    await ctrl.cancel("c1", req("adm-3"));
    expect(svc.testSend).toHaveBeenCalledWith("c1", "adm-3");
    expect(svc.runNow).toHaveBeenCalledWith("c1", "adm-3");
    expect(svc.cancel).toHaveBeenCalledWith("c1", "adm-3");
  });

  it("update delega el patch al service", async () => {
    const svc = mkCampaigns();
    const ctrl = new MailCampaignsController(svc);
    await ctrl.update("c1", { subject: "Nuevo" }, req("adm-4"));
    expect(svc.update).toHaveBeenCalledWith("c1", "adm-4", {
      subject: "Nuevo",
      name: undefined,
      htmlBody: undefined,
      audience: undefined,
      scheduleKind: undefined,
      runAt: undefined,
      cronExpr: undefined,
      timezone: undefined,
      status: undefined,
    });
  });
});
