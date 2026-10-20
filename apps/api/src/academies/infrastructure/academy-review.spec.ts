import { describe, it, expect, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import {
  checksComplete,
  evaluateAcademyChecks,
  isAcademyVisible,
  promoteCompletedAcademies,
  type AcademyReviewChecks,
} from "./academy-review";

// Control de calidad por academia (spec academies/approval-gate):
// PENDING solo es visible con checklist completo (auto-aprobación
// best-effort en el GET público); APPROVED siempre; REJECTED nunca.

const FULL: AcademyReviewChecks = {
  name: true,
  description: true,
  address: true,
  contact: true,
  photo: true,
  activeSeries: true,
  upcomingClass: true,
  plan: true,
  ownerApproved: true,
};

function mkPrisma(over: {
  academies?: unknown[];
  series?: { academyId: string; _count: { _all: number } }[];
  slots?: { id: string; academyId: string }[];
  plans?: { academyId: string; _count: { _all: number } }[];
  owners?: { personId: string }[];
  classes?: { classSlotId: string; _count: { _all: number } }[];
}) {
  return {
    academy: {
      findMany: vi.fn(async () => over.academies ?? []),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    classSeries: {
      groupBy: vi.fn(async () => over.series ?? []),
    },
    classSlot: {
      findMany: vi.fn(async () => over.slots ?? []),
    },
    membershipPlan: {
      groupBy: vi.fn(async () => over.plans ?? []),
    },
    personRole: {
      findMany: vi.fn(async () => over.owners ?? []),
    },
    class: {
      groupBy: vi.fn(async () => over.classes ?? []),
    },
  } as unknown as PrismaService;
}

const mkAcademy = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: "Academia X",
  description: "desc",
  address: "dir",
  instagram: "@ig",
  whatsapp: null,
  website: null,
  photoUrl: "https://x/f.jpg",
  ownerId: "p1",
  ...over,
});

describe("isAcademyVisible / checksComplete", () => {
  it("APPROVED siempre visible, REJECTED nunca", () => {
    expect(isAcademyVisible("APPROVED", FULL)).toBe(true);
    expect(isAcademyVisible("REJECTED", FULL)).toBe(false);
  });

  it("PENDING visible solo con checklist completo", () => {
    expect(isAcademyVisible("PENDING", FULL)).toBe(true);
    expect(isAcademyVisible("PENDING", { ...FULL, photo: false })).toBe(false);
    expect(checksComplete({ ...FULL, plan: false })).toBe(false);
  });
});

describe("evaluateAcademyChecks", () => {
  it("evalúa el checklist por campo en batch", async () => {
    const prisma = mkPrisma({
      academies: [
        mkAcademy("a-full"),
        mkAcademy("a-no-photo", { photoUrl: null }),
        mkAcademy("a-empty", {
          description: null,
          address: "",
          instagram: null,
          website: null,
        }),
      ],
      series: [{ academyId: "a-full", _count: { _all: 2 } }],
      slots: [
        { id: "s1", academyId: "a-full" },
        { id: "s2", academyId: "a-no-photo" },
      ],
      plans: [
        { academyId: "a-full", _count: { _all: 1 } },
        { academyId: "a-no-photo", _count: { _all: 1 } },
      ],
      owners: [{ personId: "p1" }],
      classes: [
        { classSlotId: "s1", _count: { _all: 3 } },
        { classSlotId: "s2", _count: { _all: 1 } },
      ],
    });

    const checks = await evaluateAcademyChecks(prisma, [
      "a-full",
      "a-no-photo",
      "a-empty",
    ]);

    expect(checksComplete(checks.get("a-full")!)).toBe(true);
    expect(checks.get("a-no-photo")).toMatchObject({ photo: false });
    expect(checksComplete(checks.get("a-no-photo")!)).toBe(false);
    expect(checks.get("a-empty")).toMatchObject({
      description: false,
      address: false,
      contact: false,
      activeSeries: false,
      upcomingClass: false,
      plan: false,
    });
  });

  it("ownerApproved=false si el owner no tiene rol ACADEMY_OWNER APPROVED", async () => {
    const prisma = mkPrisma({
      academies: [mkAcademy("a1", { ownerId: "p-sin-rol" })],
      owners: [],
    });
    const checks = await evaluateAcademyChecks(prisma, ["a1"]);
    expect(checks.get("a1")!.ownerApproved).toBe(false);
  });

  it("sin academias → mapa vacío sin queries extra", async () => {
    const prisma = mkPrisma({});
    const checks = await evaluateAcademyChecks(prisma, []);
    expect(checks.size).toBe(0);
    expect(prisma.academy.findMany).not.toHaveBeenCalled();
  });
});

describe("promoteCompletedAcademies", () => {
  it("promueve solo las PENDING con checklist completo", async () => {
    const prisma = mkPrisma({
      academies: [
        mkAcademy("a-ok"),
        mkAcademy("a-falta-foto", { photoUrl: "  " }),
      ],
      series: [
        { academyId: "a-ok", _count: { _all: 1 } },
        { academyId: "a-falta-foto", _count: { _all: 1 } },
      ],
      slots: [
        { id: "s1", academyId: "a-ok" },
        { id: "s2", academyId: "a-falta-foto" },
      ],
      plans: [
        { academyId: "a-ok", _count: { _all: 1 } },
        { academyId: "a-falta-foto", _count: { _all: 1 } },
      ],
      owners: [{ personId: "p1" }],
      classes: [
        { classSlotId: "s1", _count: { _all: 1 } },
        { classSlotId: "s2", _count: { _all: 1 } },
      ],
    });

    const promoted = await promoteCompletedAcademies(prisma, [
      "a-ok",
      "a-falta-foto",
    ]);

    expect([...promoted]).toEqual(["a-ok"]);
    expect(prisma.academy.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a-ok"] }, reviewStatus: "PENDING" },
      data: { reviewStatus: "APPROVED" },
    });
  });

  it("nada que promover → no toca la DB", async () => {
    const prisma = mkPrisma({ academies: [mkAcademy("a1", { description: null })] });
    const promoted = await promoteCompletedAcademies(prisma, ["a1"]);
    expect(promoted.size).toBe(0);
    expect(prisma.academy.updateMany).not.toHaveBeenCalled();
  });
});
