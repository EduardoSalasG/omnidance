import "../../auth/infrastructure/auth.controller";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { SeriesEngagementController } from "./series-engagement.controller";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";

vi.mock("../../common/rbac/roles.guard", () => ({
  roleKeysHavePermission: vi.fn(),
}));

const SERIES = { id: "s1", producerId: "prod-1", name: "La Gozadera" };

function fakePrisma(overrides: {
  checkins?: { eventId: string; personId: string }[];
  reviews?: { seriesId: string; personId: string; score: number; comment?: string | null }[];
  genders?: { gender: string | null }[];
  styleRoles?: { personId: string; role: string }[];
  eventIds?: string[];
} = {}) {
  const eventIds = overrides.eventIds ?? ["e1", "e2"];
  const checkins = overrides.checkins ?? [];
  const reviews = overrides.reviews ?? [];
  return {
    eventSeries: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "s1" ? SERIES : null,
      ),
    },
    event: {
      findMany: vi.fn(async () => eventIds.map((id) => ({ id }))),
    },
    checkin: {
      findFirst: vi.fn(async ({ where }: { where: { personId: string } }) => {
        const hit = checkins.find(
          (c) => c.personId === where.personId && eventIds.includes(c.eventId),
        );
        return hit ? { id: "ci" } : null;
      }),
      findMany: vi.fn(async () =>
        [...new Set(checkins.map((c) => c.personId))].map((personId) => ({
          personId,
        })),
      ),
      groupBy: vi.fn(async () => {
        const byEvent = new Map<string, number>();
        for (const c of checkins) {
          byEvent.set(c.eventId, (byEvent.get(c.eventId) ?? 0) + 1);
        }
        return [...byEvent.entries()].map(([eventId, n]) => ({
          eventId,
          _count: { eventId: n },
        }));
      }),
    },
    person: {
      groupBy: vi.fn(async () => {
        const byGender = new Map<string, number>();
        for (const g of overrides.genders ?? []) {
          const k = g.gender ?? "undeclared";
          byGender.set(k, (byGender.get(k) ?? 0) + 1);
        }
        return [...byGender.entries()].map(([gender, n]) => ({
          gender: gender === "undeclared" ? null : gender,
          _count: { gender: n },
        }));
      }),
    },
    personStyleRole: {
      findMany: vi.fn(async () => overrides.styleRoles ?? []),
    },
    seriesReview: {
      aggregate: vi.fn(async () => ({
        _avg: {
          score: reviews.length
            ? reviews.reduce((a, r) => a + r.score, 0) / reviews.length
            : null,
        },
        _count: { _all: reviews.length },
      })),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () =>
        reviews.map((r, i) => ({
          id: `r${i}`,
          score: r.score,
          comment: r.comment ?? null,
          createdAt: new Date(0),
        })),
      ),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        id: "r-new",
        score: create.score,
        comment: create.comment,
      })),
    },
  } as never;
}

function req(person: { id: string; roles?: string[] }) {
  return { person: { id: person.id, roles: person.roles ?? [] } } as Request;
}

describe("SeriesEngagementController", () => {
  it("engagement: serie inexistente → 404", async () => {
    const ctrl = new SeriesEngagementController(fakePrisma());
    await expect(
      ctrl.engagement("otra", req({ id: "u1" })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("engagement: stats agregadas correctas", async () => {
    const ctrl = new SeriesEngagementController(
      fakePrisma({
        checkins: [
          { eventId: "e1", personId: "p1" },
          { eventId: "e1", personId: "p2" },
          { eventId: "e1", personId: "p3" },
          { eventId: "e2", personId: "p1" },
        ],
        genders: [{ gender: "M" }, { gender: "F" }, { gender: null }],
        styleRoles: [
          { personId: "p1", role: "LEADER" },
          { personId: "p2", role: "FOLLOWER" },
          { personId: "p2", role: "LEADER" }, // p2 tiene ambos → gana LEADER
        ],
        reviews: [
          { seriesId: "s1", personId: "p1", score: 5 },
          { seriesId: "s1", personId: "p2", score: 4 },
        ],
      }),
    );
    const res = await ctrl.engagement("s1", req({ id: "u1" }));
    expect(res.avgAttendance).toBe(2); // (3 + 1) / 2 eventos
    expect(res.attendees).toBe(3);
    expect(res.gender).toEqual({ M: 1, F: 1, OTHER: 0, undeclared: 1 });
    expect(res.danceRoles).toEqual({
      leader: 2, // p1 + p2 (ambos → leader)
      follower: 0,
      declared: 2,
    });
    expect(res.review).toEqual({ avg: 4.5, count: 2 });
    expect(res.canReview).toBe(false); // u1 sin check-in
  });

  it("review: sin check-in → 403", async () => {
    const ctrl = new SeriesEngagementController(fakePrisma());
    await expect(
      ctrl.review("s1", { score: 5 }, req({ id: "u1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("review: con check-in → upsert", async () => {
    const prisma = fakePrisma({
      checkins: [{ eventId: "e1", personId: "u1" }],
    });
    const ctrl = new SeriesEngagementController(prisma);
    const res = await ctrl.review(
      "s1",
      { score: 4, comment: "buena vibra" },
      req({ id: "u1" }),
    );
    expect(res.score).toBe(4);
  });

  it("reviews: no-productor → 403", async () => {
    vi.mocked(roleKeysHavePermission).mockResolvedValue(false);
    const ctrl = new SeriesEngagementController(fakePrisma());
    await expect(
      ctrl.reviews("s1", req({ id: "u1" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("reviews: productor → comentarios anónimos (sin personId)", async () => {
    const ctrl = new SeriesEngagementController(
      fakePrisma({
        reviews: [{ seriesId: "s1", personId: "p1", score: 5, comment: "top" }],
      }),
    );
    const res = await ctrl.reviews("s1", req({ id: "prod-1" }));
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({
      id: "r0",
      score: 5,
      comment: "top",
      createdAt: new Date(0),
    });
    expect(res[0]).not.toHaveProperty("personId");
  });
});
