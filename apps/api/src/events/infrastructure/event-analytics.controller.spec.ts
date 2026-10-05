import { describe, it, expect, beforeEach } from "vitest";
import type { Request } from "express";
import type { PrismaService } from "../../prisma.service";
import "../../auth/infrastructure/auth.controller"; // ciclo session.guard ⇄ auth.controller
import { invalidateRoleCatalog } from "../../common/rbac/roles.guard";
import { EventAnalyticsController } from "./event-analytics.controller";

// EventAnalyticsController.analytics - solo owner del evento o
// admin.access; splits y ratings se ocultan bajo EXPOSURE_THRESHOLD
// (k-anonymity). roleSplit se calcula por rol en estilos del género del
// evento (heredado de la serie si el evento no declara).

interface FakeEvent {
  id: string;
  producerId: string | null;
  genres: string[];
  series: { genres: string[] } | null;
}

interface FakeCheckin {
  eventId: string;
  personId: string;
  voidedAt: Date | null;
}

interface FakePersonRow {
  id: string;
  gender: string | null;
  styleRoles: { role: string; style: { genre: string } }[];
  // Gating Producer Pro (S5) - solo se consultan para el owner.
  proTier?: string;
  proTrialEndsAt?: Date | null;
}

interface FakeRating {
  eventId: string;
  overall: number | null;
  music: number | null;
  occupation: number | null;
  organization: number | null;
  floorComfort: number | null;
  temperature: number | null;
  lightingSound: number | null;
}

interface FakeRole {
  key: string;
  isSuperuser: boolean;
  permissionKeys: string[];
}

class FakePrisma {
  events: FakeEvent[] = [];
  checkins: FakeCheckin[] = [];
  people = new Map<string, FakePersonRow>();
  ratings: FakeRating[] = [];
  roles: FakeRole[] = [];

  event = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.events.find((e) => e.id === where.id) ?? null,
  };

  checkin = {
    findMany: async ({
      where,
      distinct,
    }: {
      where: { eventId: string; voidedAt: null };
      distinct?: string[];
    }) => {
      let rows = this.checkins.filter(
        (c) => c.eventId === where.eventId && c.voidedAt === null,
      );
      if (distinct?.includes("personId")) {
        const seen = new Set<string>();
        rows = rows.filter(
          (r) => !seen.has(r.personId) && seen.add(r.personId),
        );
      }
      return rows.map((r) => ({ personId: r.personId }));
    },
  };

  person = {
    findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
      [...this.people.values()].filter((p) => where.id.in.includes(p.id)),
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.people.get(where.id) ?? null,
  };

  eventRating = {
    findMany: async ({ where }: { where: { eventId: string } }) =>
      this.ratings.filter((r) => r.eventId === where.eventId),
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

/** Body de respuesta de una HttpException (mismo helper que academy-access). */
const errBody = (e: unknown): Record<string, unknown> =>
  ((e as { getResponse?: () => unknown }).getResponse?.() ?? {}) as Record<
    string,
    unknown
  >;

const mkRating = (eventId: string, overall: number): FakeRating => ({
  eventId,
  overall,
  music: overall,
  occupation: null,
  organization: overall,
  floorComfort: null,
  temperature: null,
  lightingSound: null,
});

const mkAttendee = (
  id: string,
  gender: string | null,
  styleRoles: { role: string; genre: string }[] = [],
): FakePersonRow => ({
  id,
  gender,
  styleRoles: styleRoles.map((r) => ({
    role: r.role,
    style: { genre: r.genre },
  })),
});

describe("EventAnalyticsController.analytics", () => {
  let prisma: FakePrisma;
  let ctrl: EventAnalyticsController;

  beforeEach(() => {
    invalidateRoleCatalog();
    prisma = new FakePrisma();
    ctrl = new EventAnalyticsController(prisma as unknown as PrismaService);
    prisma.roles.push({ key: "ADMIN", isSuperuser: true, permissionKeys: [] });
    prisma.events.push({
      id: "ev-1",
      producerId: "prod-1",
      genres: ["SALSA"],
      series: null,
    });
    // Owner con trial Pro vigente (S5) - los tests de agregados ejercen
    // el camino feliz; el gating se prueba aparte.
    prisma.people.set("prod-1", {
      id: "prod-1",
      gender: null,
      styleRoles: [],
      proTier: "FREE",
      proTrialEndsAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    });
  });

  it("evento inexistente → 404", async () => {
    await expect(ctrl.analytics("nope", reqAs("prod-1"))).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("no-owner sin admin → 403; admin → 200", async () => {
    await expect(
      ctrl.analytics("ev-1", reqAs("otro", ["PRODUCER"])),
    ).rejects.toMatchObject({ status: 403 });
    const res = await ctrl.analytics("ev-1", reqAs("otro", ["ADMIN"]));
    expect(res.attendees).toBe(0);
  });

  it("menos de 3 asistentes → attendees real pero splits y ratings null", async () => {
    prisma.checkins.push(
      { eventId: "ev-1", personId: "a", voidedAt: null },
      { eventId: "ev-1", personId: "b", voidedAt: null },
      { eventId: "ev-1", personId: "a", voidedAt: null }, // dup
      { eventId: "ev-1", personId: "c", voidedAt: new Date() }, // voided
    );
    const res = await ctrl.analytics("ev-1", reqAs("prod-1"));
    expect(res).toEqual({
      attendees: 2,
      genderSplit: null,
      roleSplit: null,
      ratings: null,
    });
  });

  it("con ≥3 asistentes: genderSplit, roleSplit por género del evento y byDim con overall", async () => {
    prisma.checkins.push(
      { eventId: "ev-1", personId: "a", voidedAt: null },
      { eventId: "ev-1", personId: "b", voidedAt: null },
      { eventId: "ev-1", personId: "c", voidedAt: null },
      { eventId: "ev-1", personId: "d", voidedAt: null },
    );
    prisma.people.set("a", mkAttendee("a", "M", [{ role: "LEADER", genre: "SALSA" }]));
    prisma.people.set(
      "b",
      mkAttendee("b", "F", [
        { role: "FOLLOWER", genre: "SALSA" },
        { role: "LEADER", genre: "BACHATA" }, // otro género → no cuenta
      ]),
    );
    // C baila ambos en salsa → "both"; sin género → unknown.
    prisma.people.set(
      "c",
      mkAttendee("c", null, [
        { role: "LEADER", genre: "SALSA" },
        { role: "FOLLOWER", genre: "SALSA" },
      ]),
    );
    prisma.people.set("d", mkAttendee("d", "F")); // sin styleRoles → no cuenta
    prisma.ratings.push(
      mkRating("ev-1", 4),
      mkRating("ev-1", 5),
      { ...mkRating("ev-1", 2), overall: null },
    );

    const res = await ctrl.analytics("ev-1", reqAs("prod-1"));
    expect(res.attendees).toBe(4);
    expect(res.genderSplit).toEqual({ M: 1, F: 2, OTHER: 0, unknown: 1 });
    expect(res.roleSplit).toEqual({ leader: 1, follower: 1, both: 1 });
    expect(res.ratings!.count).toBe(3);
    // overall tiene solo 2 valores no-nulos <3 → null (k-anonymity por dim)
    expect(res.ratings!.byDim.overall).toBeNull();
    expect(res.ratings!.byDim.music).toBeCloseTo(3.7, 1);
    expect(res.ratings!.byDim.organization).toBeCloseTo(3.7, 1);
    expect(res.ratings!.byDim.occupation).toBeNull(); // sin valores → null
  });

  it("pocas evaluaciones → count visible pero byDim todo null", async () => {
    prisma.checkins.push(
      { eventId: "ev-1", personId: "a", voidedAt: null },
      { eventId: "ev-1", personId: "b", voidedAt: null },
      { eventId: "ev-1", personId: "c", voidedAt: null },
    );
    prisma.people.set("a", mkAttendee("a", "M"));
    prisma.people.set("b", mkAttendee("b", "F"));
    prisma.people.set("c", mkAttendee("c", "F"));
    // 2 evaluaciones: su promedio expondría puntajes individuales
    prisma.ratings.push(mkRating("ev-1", 5), mkRating("ev-1", 4));

    const res = await ctrl.analytics("ev-1", reqAs("prod-1"));
    expect(res.ratings!.count).toBe(2);
    expect(Object.values(res.ratings!.byDim).every((v) => v === null)).toBe(
      true,
    );
  });

  it("géneros heredados de la serie cuando el evento no declara", async () => {
    prisma.events[0].genres = [];
    prisma.events[0].series = { genres: ["BACHATA"] };
    prisma.checkins.push(
      { eventId: "ev-1", personId: "a", voidedAt: null },
      { eventId: "ev-1", personId: "b", voidedAt: null },
      { eventId: "ev-1", personId: "c", voidedAt: null },
    );
    prisma.people.set("a", mkAttendee("a", "M", [{ role: "LEADER", genre: "BACHATA" }]));
    prisma.people.set("b", mkAttendee("b", "F", [{ role: "LEADER", genre: "SALSA" }]));
    prisma.people.set("c", mkAttendee("c", "F"));

    const res = await ctrl.analytics("ev-1", reqAs("prod-1"));
    // "a" lidera en bachata (género del evento); "b" solo lidera en salsa
    // (fuera del evento) → no cuenta.
    expect(res.roleSplit).toEqual({ leader: 1, follower: 0, both: 0 });
  });

  // ─── Gating Producer Pro (S5) ───

  const setProState = (proTier: string, proTrialEndsAt: Date | null) => {
    prisma.people.set("prod-1", {
      ...prisma.people.get("prod-1")!,
      proTier,
      proTrialEndsAt,
    });
  };

  it("owner FREE sin trial → 403 pro.required con upgrade", async () => {
    setProState("FREE", null);
    const err = await ctrl
      .analytics("ev-1", reqAs("prod-1"))
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403 });
    expect(errBody(err)).toMatchObject({
      error: "pro.required",
      upgrade: true,
    });
  });

  it("owner FREE con trial vencido → 403 pro.required", async () => {
    setProState("FREE", new Date(Date.now() - 24 * 3600 * 1000));
    const err = await ctrl
      .analytics("ev-1", reqAs("prod-1"))
      .catch((e: unknown) => e);
    expect(errBody(err).error).toBe("pro.required");
  });

  it("owner FREE con trial vigente → pasa", async () => {
    setProState("FREE", new Date(Date.now() + 24 * 3600 * 1000));
    const res = await ctrl.analytics("ev-1", reqAs("prod-1"));
    expect(res.attendees).toBe(0);
  });

  it("owner PRO_STARTER → pasa", async () => {
    setProState("PRO_STARTER", null);
    const res = await ctrl.analytics("ev-1", reqAs("prod-1"));
    expect(res.attendees).toBe(0);
  });

  it("admin sobre evento ajeno no se gatea aunque el owner sea FREE", async () => {
    setProState("FREE", null);
    const res = await ctrl.analytics("ev-1", reqAs("soporte", ["ADMIN"]));
    expect(res.attendees).toBe(0);
  });
});
