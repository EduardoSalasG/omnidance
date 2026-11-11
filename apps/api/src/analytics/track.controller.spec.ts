import { describe, it, expect, beforeEach } from "vitest";
import { validate } from "class-validator";
import type { Request } from "express";
import type { PrismaService } from "../prisma.service";
import "../auth/infrastructure/auth.controller"; // ciclo session.guard ↔ auth.controller (SESSION_COOKIE)
import { AnalyticsTrackController, TrackEventDto } from "./track.controller";

// AnalyticsTrackController - POST /analytics/track (spec auth-sessions):
// beacon público y opcionalmente autenticado; persiste app.launch en
// AnalyticsEvent con metadata {displayMode, platform, ua del header} -
// sin identificadores estables de dispositivo (evento agregable).

interface FakeAnalyticsEvent {
  type: string;
  personId: string | null;
  payload: unknown;
}

class FakePrisma {
  events: FakeAnalyticsEvent[] = [];
  analyticsEvent = {
    create: async ({
      data,
    }: {
      data: { type: string; personId: string | null; payload: unknown };
    }) => {
      this.events.push(data);
      return data;
    },
  };
}

const reqWith = (over: Partial<Request> = {}): Request =>
  ({
    headers: { "user-agent": "TestAgent/1.0" },
    ...over,
  }) as Request;

describe("AnalyticsTrackController - POST /analytics/track", () => {
  let prisma: FakePrisma;
  let ctl: AnalyticsTrackController;

  beforeEach(() => {
    prisma = new FakePrisma();
    ctl = new AnalyticsTrackController(prisma as unknown as PrismaService);
  });

  it("persiste app.launch anónimo (personId null) con metadata", async () => {
    const res = await ctl.track(
      { event: "app.launch", displayMode: "standalone", platform: "Android" },
      reqWith(),
    );
    expect(res).toEqual({ ok: true });
    expect(prisma.events).toHaveLength(1);
    expect(prisma.events[0]).toMatchObject({
      type: "app.launch",
      personId: null,
      payload: {
        displayMode: "standalone",
        platform: "Android",
        ua: "TestAgent/1.0",
      },
    });
  });

  it("con sesión válida asocia req.person.id", async () => {
    const req = reqWith();
    req.person = { id: "p-1", roles: [], roleStates: [] };
    await ctl.track(
      { event: "app.launch", displayMode: "browser", platform: "Windows" },
      req,
    );
    expect(prisma.events[0].personId).toBe("p-1");
    expect(prisma.events[0].payload).toMatchObject({
      displayMode: "browser",
      platform: "Windows",
    });
  });

  it("campos opcionales ausentes quedan null; sin UA header → ua null", async () => {
    const req = { headers: {} } as Request;
    await ctl.track({ event: "app.launch" }, req);
    expect(prisma.events[0].payload).toEqual({
      displayMode: null,
      platform: null,
      ua: null,
    });
  });

  it("el DTO rechaza event/displayMode fuera de whitelist", async () => {
    const bad = new TrackEventDto();
    bad.event = "page.custom";
    expect((await validate(bad)).length).toBeGreaterThan(0);

    const badMode = new TrackEventDto();
    badMode.event = "app.launch";
    badMode.displayMode = "fullscreen";
    expect((await validate(badMode)).length).toBeGreaterThan(0);

    const ok = new TrackEventDto();
    ok.event = "app.launch";
    ok.displayMode = "standalone";
    ok.platform = "iOS";
    expect(await validate(ok)).toHaveLength(0);
  });
});
