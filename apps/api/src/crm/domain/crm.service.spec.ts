import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaService } from "../../prisma.service";
import type { NotificationsService } from "../../notifications/domain/notifications.service";
import type { ParamsService } from "../../params/params.service";
import { CrmService } from "./crm.service";

// Audiencias de academia en campañas: CampaignSegment suma allStudents /
// enrollmentStatus / planId / seriesId (OR con tags/segment/personIds),
// solo válidos para actorType ACADEMY. PrismaService se simula in-memory
// con matching mínimo de `where` (mismo criterio que payouts.controller.spec).

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const v = row[key];
    if (cond !== null && typeof cond === "object") {
      const c = cond as Row;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
      if ("not" in c && v === c.not) return false;
      if (!("in" in c) && !("not" in c)) {
        // Relación anidada materializada (p.ej. class: {slot: {...}}).
        if (v === null || typeof v !== "object") return false;
        if (!matchWhere(v as Row, c)) return false;
      }
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

class FakePrisma {
  enrollments: Row[] = [];
  bookings: Row[] = [];
  plans: Row[] = [];
  seriesRows: Row[] = [];
  actorTags: Row[] = [];
  scores: Row[] = [];
  campaigns: Row[] = [];
  private seq = 0;

  enrollment = {
    findMany: async ({ where }: { where: Row }) =>
      this.enrollments.filter((e) => matchWhere(e, where)),
  };
  classBooking = {
    findMany: async ({ where }: { where: Row }) =>
      this.bookings.filter((b) => matchWhere(b, where)),
  };
  membershipPlan = {
    findFirst: async ({ where }: { where: Row }) =>
      this.plans.find((p) => matchWhere(p, where)) ?? null,
  };
  classSeries = {
    findFirst: async ({ where }: { where: Row }) =>
      this.seriesRows.find((s) => matchWhere(s, where)) ?? null,
  };
  actorTag = {
    findMany: async ({ where }: { where: Row }) =>
      this.actorTags.filter((t) => matchWhere(t, where)),
  };
  relationshipScore = {
    findMany: async ({ where }: { where: Row }) =>
      this.scores.filter((s) => matchWhere(s, where)),
  };
  campaign = {
    create: async ({ data }: { data: Row }) => {
      const c: Row = {
        id: `cmp-${++this.seq}`,
        status: "DRAFT",
        result: null,
        createdAt: new Date(),
        ...data,
      };
      this.campaigns.push(c);
      return c;
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.campaigns.find((c) => c.id === where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Row;
    }) => {
      const c = this.campaigns.find((x) => x.id === where.id)!;
      Object.assign(c, data);
      return c;
    },
  };
}

const ACADEMY = "acad-1"; // actorId de la academia (actorType "ACADEMY")
const OTHER_ACADEMY = "acad-2";
const PRODUCER = "prod-1";

describe("CrmService - audiencias por grupo (ACADEMY)", () => {
  let prisma: FakePrisma;
  let notifySafe: ReturnType<typeof vi.fn>;
  let svc: CrmService;

  beforeEach(() => {
    prisma = new FakePrisma();
    notifySafe = vi.fn(async () => ({}));
    svc = new CrmService(
      prisma as unknown as PrismaService,
      { notifySafe } as unknown as NotificationsService,
      { getNumber: async () => 21 } as unknown as ParamsService,
    );

    prisma.enrollments.push(
      {
        id: "e1",
        academyId: ACADEMY,
        personId: "p-active",
        planId: "plan-1",
        status: "ACTIVE",
      },
      {
        id: "e2",
        academyId: ACADEMY,
        personId: "p-trial",
        planId: "plan-1",
        status: "TRIAL",
      },
      {
        id: "e3",
        academyId: ACADEMY,
        personId: "p-frozen",
        planId: "plan-2",
        status: "FROZEN",
      },
      {
        id: "e4",
        academyId: OTHER_ACADEMY,
        personId: "p-other",
        planId: "plan-1",
        status: "TRIAL",
      },
    );
    prisma.plans.push(
      { id: "plan-1", academyId: ACADEMY },
      { id: "plan-2", academyId: ACADEMY },
      { id: "plan-x", academyId: OTHER_ACADEMY },
    );
    prisma.seriesRows.push(
      { id: "series-1", academyId: ACADEMY },
      { id: "series-x", academyId: OTHER_ACADEMY },
    );
    prisma.bookings.push(
      {
        personId: "p-booker",
        status: "BOOKED",
        class: { slot: { seriesId: "series-1", academyId: ACADEMY } },
      },
      {
        personId: "p-cancelled",
        status: "CANCELLED",
        class: { slot: { seriesId: "series-1", academyId: ACADEMY } },
      },
      {
        personId: "p-other-series",
        status: "BOOKED",
        class: { slot: { seriesId: "series-1", academyId: OTHER_ACADEMY } },
      },
    );
  });

  it("allStudents → todas las personas con enrollment en la academia", async () => {
    const res = await svc.previewCampaign("ACADEMY", ACADEMY, {
      allStudents: true,
    });
    expect(res.count).toBe(3);
  });

  it("enrollmentStatus → solo enrollments en esos estados", async () => {
    const res = await svc.previewCampaign("ACADEMY", ACADEMY, {
      enrollmentStatus: ["TRIAL", "FROZEN"],
    });
    expect(res.count).toBe(2);
  });

  it("planId → enrollments de ese plan en la academia", async () => {
    const res = await svc.previewCampaign("ACADEMY", ACADEMY, {
      planId: "plan-1",
    });
    expect(res.count).toBe(2);
  });

  it("seriesId → bookings no CANCELLED en clases de la serie", async () => {
    const res = await svc.previewCampaign("ACADEMY", ACADEMY, {
      seriesId: "series-1",
    });
    expect(res.count).toBe(1); // p-cancelled y p-other-series quedan fuera
  });

  it("los criterios se unen (OR) con personIds y tags", async () => {
    prisma.actorTags.push({
      actorType: "ACADEMY",
      actorId: ACADEMY,
      personId: "p-tagged",
      tag: "VIP",
    });
    const res = await svc.previewCampaign("ACADEMY", ACADEMY, {
      allStudents: true,
      seriesId: "series-1",
      personIds: ["p-extra", "p-active"], // p-active ya alcanzada
      tags: ["VIP"],
    });
    // 3 alumnos + p-booker (serie) + p-tagged - p-extra no tiene
    // universo con la academia (ni enrollment/tag/score) y se descarta
    expect(res.count).toBe(5);
  });

  it("personIds se intersecta con el universo del actor", async () => {
    // p-trial está inscrito → alcanzable por personIds aunque sin score/tag
    // p-stranger no pertenece a la academia en absoluto → fuera
    const res = await svc.previewCampaign("ACADEMY", ACADEMY, {
      personIds: ["p-trial", "p-stranger"],
    });
    expect(res.count).toBe(1);
  });

  it("personIds alcanza a alguien solo taggeado", async () => {
    prisma.actorTags.push({
      actorType: "ACADEMY",
      actorId: ACADEMY,
      personId: "p-tagged",
      tag: "VIP",
    });
    const res = await svc.previewCampaign("ACADEMY", ACADEMY, {
      personIds: ["p-tagged"],
    });
    expect(res.count).toBe(1);
  });

  it("preview no crea campaña ni notifica", async () => {
    await svc.previewCampaign("ACADEMY", ACADEMY, { allStudents: true });
    expect(prisma.campaigns).toHaveLength(0);
    expect(notifySafe).not.toHaveBeenCalled();
  });

  it("criterios de academia con actor PRODUCER → BAD_REQUEST", async () => {
    for (const segment of [
      { allStudents: true },
      { enrollmentStatus: ["TRIAL"] },
      { planId: "plan-1" },
      { seriesId: "series-1" },
    ]) {
      await expect(
        svc.previewCampaign("PRODUCER", PRODUCER, segment),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("planId o seriesId de otra academia → BAD_REQUEST", async () => {
    await expect(
      svc.previewCampaign("ACADEMY", ACADEMY, { planId: "plan-x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      svc.previewCampaign("ACADEMY", ACADEMY, { seriesId: "series-x" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enrollmentStatus con valor fuera del enum → BAD_REQUEST", async () => {
    await expect(
      svc.previewCampaign("ACADEMY", ACADEMY, {
        enrollmentStatus: ["NOPE"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("sendCampaign con allStudents notifica a cada alumno y marca SENT", async () => {
    const campaign = await svc.createCampaign(
      "ACADEMY",
      ACADEMY,
      "Vuelve a clases",
      { allStudents: true },
      { type: "NOTIFY", title: "Te esperamos" },
    );
    const sent = await svc.sendCampaign(campaign.id as string);
    expect(sent.status).toBe("SENT");
    expect((sent.result as { sent: number }).sent).toBe(3);
    expect(notifySafe).toHaveBeenCalledTimes(3);
    const notified = notifySafe.mock.calls.map((c) => c[0]).sort();
    expect(notified).toEqual(["p-active", "p-frozen", "p-trial"]);
  });
});
