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
      if ("gte" in c && !((v as number | Date) >= (c.gte as number | Date)))
        return false;
      if ("lte" in c && !((v as number | Date) <= (c.lte as number | Date)))
        return false;
      const structural = ["in", "not", "gte", "lte", "lt", "gt"].some(
        (k) => k in c,
      );
      if (!structural) {
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
  discountCodeRows: Row[] = [];
  paymentRows: Row[] = [];
  attendanceRows: Row[] = [];
  eventRows: Row[] = [];
  checkinRows: Row[] = [];
  personRows: Row[] = [];
  academyRows: Row[] = [];

  actorTag = {
    findMany: async ({ where }: { where: Row }) =>
      this.actorTags.filter((t) => matchWhere(t, where)),
    createMany: async ({ data }: { data: Row[] }) => {
      this.actorTags.push(
        ...data.map((d, i) => ({ id: `tag-${++this.seq}-${i}`, ...d })),
      );
      return { count: data.length };
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const before = this.actorTags.length;
      this.actorTags = this.actorTags.filter((t) => !matchWhere(t, where));
      return { count: before - this.actorTags.length };
    },
  };
  attendance = {
    findMany: async ({ where, distinct }: { where: Row; distinct?: string[] }) => {
      const rows = this.attendanceRows.filter((r) => matchWhere(r, where));
      if (distinct?.includes("personId")) {
        const seen = new Set<string>();
        return rows.filter((r) => {
          if (seen.has(r.personId as string)) return false;
          seen.add(r.personId as string);
          return true;
        });
      }
      return rows;
    },
  };
  event = {
    findMany: async ({ where }: { where: Row }) =>
      this.eventRows.filter((e) => matchWhere(e, where)),
  };
  checkin = {
    findMany: async ({ where, distinct }: { where: Row; distinct?: string[] }) => {
      const rows = this.checkinRows.filter((r) => matchWhere(r, where));
      if (distinct?.includes("personId")) {
        const seen = new Set<string>();
        return rows.filter((r) => {
          if (seen.has(r.personId as string)) return false;
          seen.add(r.personId as string);
          return true;
        });
      }
      return rows;
    },
  };
  discountCode = {
    findUnique: async ({ where }: { where: Row }) =>
      this.discountCodeRows.find((d) => matchWhere(d, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const d: Row = { id: `dc-${++this.seq}`, ...data };
      this.discountCodeRows.push(d);
      return d;
    },
  };
  payment = {
    count: async ({ where }: { where: Row }) =>
      this.paymentRows.filter((p) => matchWhere(p, where)).length,
  };
  person = {
    findMany: async ({ where }: { where?: Row }) =>
      where
        ? this.personRows.filter((p) => matchWhere(p, where))
        : [...this.personRows],
  };
  academy = {
    findUnique: async ({ where }: { where: Row }) =>
      this.academyRows.find((a) => matchWhere(a, where)) ?? null,
  };
  relationshipScore = {
    findMany: async ({ where }: { where: Row }) =>
      this.scores.filter((s) => matchWhere(s, where)),
    groupBy: async ({ by }: { by: string[] }) => {
      const seen = new Map<string, Row>();
      for (const s of this.scores) {
        const k = by.map((b) => String(s[b])).join("|");
        if (!seen.has(k)) {
          seen.set(
            k,
            Object.fromEntries(by.map((b) => [b, s[b]])),
          );
        }
      }
      return [...seen.values()];
    },
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
    findMany: async ({ where }: { where?: Row }) =>
      where
        ? this.campaigns.filter((c) => matchWhere(c, where))
        : [...this.campaigns],
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

describe("CrmService - campañas programadas y bulk tags (crm-campaign-ops)", () => {
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
      { id: "e1", academyId: ACADEMY, personId: "p1", status: "ACTIVE" },
      { id: "e2", academyId: ACADEMY, personId: "p2", status: "ACTIVE" },
    );
  });

  it("bulkTag add crea tags sin duplicar y remove los borra", async () => {
    const r1 = await svc.bulkTag("ACADEMY", ACADEMY, ["p1", "p2"], "VIP", "add");
    expect(r1.affected).toBe(2);
    const r2 = await svc.bulkTag("ACADEMY", ACADEMY, ["p1", "p2"], "VIP", "add");
    expect(r2.affected).toBe(0); // idempotente
    const r3 = await svc.bulkTag("ACADEMY", ACADEMY, ["p1"], "VIP", "remove");
    expect(r3.affected).toBe(1);
    expect(prisma.actorTags).toHaveLength(1);
  });

  it("bulkTag valida tag y personIds no vacíos", async () => {
    await expect(
      svc.bulkTag("ACADEMY", ACADEMY, ["p1"], "  ", "add"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      svc.bulkTag("ACADEMY", ACADEMY, [], "VIP", "add"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("scheduledAt futuro crea la campaña SCHEDULED y el job la envía", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const camp = await svc.createCampaign(
      "ACADEMY", ACADEMY, "Mañana",
      { allStudents: true },
      { type: "NOTIFY", title: "Hola" },
      future,
    );
    expect(camp.status).toBe("SCHEDULED");
    // Todavía no vencida → el job no envía nada
    expect((await svc.sendScheduledCampaigns()).sent).toBe(0);
    // Simula vencimiento
    const row = prisma.campaigns.find((c) => c.id === camp.id)!;
    row.scheduledAt = new Date(Date.now() - 1000);
    const r = await svc.sendScheduledCampaigns();
    expect(r.sent).toBe(1);
    expect(row.status).toBe("SENT");
    expect(row.scheduledAt).toBeNull();
    expect(notifySafe).toHaveBeenCalledTimes(2);
  });

  it("scheduledAt pasado → BAD_REQUEST", async () => {
    await expect(
      svc.createCampaign(
        "ACADEMY", ACADEMY, "Ayer",
        { allStudents: true },
        { type: "NOTIFY", title: "x" },
        new Date(Date.now() - 60_000).toISOString(),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("cancelCampaign vuelve SCHEDULED→DRAFT y limpia scheduledAt", async () => {
    const camp = await svc.createCampaign(
      "ACADEMY", ACADEMY, "Later",
      { allStudents: true },
      { type: "NOTIFY", title: "x" },
      new Date(Date.now() + 60_000).toISOString(),
    );
    const cancelled = await svc.cancelCampaign(camp.id as string);
    expect(cancelled.status).toBe("DRAFT");
    expect(cancelled.scheduledAt).toBeNull();
  });

  it("cancelCampaign sobre DRAFT o SENT → CONFLICT", async () => {
    const camp = await svc.createCampaign(
      "ACADEMY", ACADEMY, "x",
      { allStudents: true },
      { type: "NOTIFY", title: "x" },
    );
    await expect(
      svc.cancelCampaign(camp.id as string),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("metrics: engaged cuenta audiencia con attendance post-envío", async () => {
    const camp = await svc.createCampaign(
      "ACADEMY", ACADEMY, "Win",
      { allStudents: true },
      { type: "NOTIFY", title: "x" },
    );
    await svc.sendCampaign(camp.id as string);
    const at = new Date();
    prisma.attendanceRows.push(
      { personId: "p1", checkedAt: at, class: { slot: { academyId: ACADEMY } } },
      // p1 dos veces → distinct personId = 1
      { personId: "p1", checkedAt: at, class: { slot: { academyId: ACADEMY } } },
      // otra academia no cuenta
      { personId: "p2", checkedAt: at, class: { slot: { academyId: OTHER_ACADEMY } } },
    );
    const m = await svc.campaignMetrics(camp.id as string);
    expect(m.sent).toBe(2);
    expect(m.engaged).toBe(1);
    expect(m.redemptions).toBeNull(); // NOTIFY no genera código
  });

  it("metrics: redemptions cuenta pagos PAID con el código de campaña", async () => {
    const camp = await svc.createCampaign(
      "ACADEMY", ACADEMY, "Promo",
      { allStudents: true },
      { type: "DISCOUNT_CODE", percentOff: 20 },
    );
    // El código lo crea createCampaignCode en send (DiscountCode real
    // en el fake) - los pagos referencian su id generado.
    const sent = await svc.sendCampaign(camp.id as string);
    const code = (sent.result as { code?: string }).code!;
    const dc = prisma.discountCodeRows.find((d) => d.code === code)!;
    const sentAt = new Date();
    prisma.paymentRows.push(
      { discountCodeId: dc.id, status: "PAID", createdAt: sentAt },
      { discountCodeId: dc.id, status: "PAID", createdAt: sentAt },
      // pago con otro código → no cuenta
      { discountCodeId: "dc-x", status: "PAID", createdAt: sentAt },
      // pago con el código pero no PAID → no cuenta
      { discountCodeId: dc.id, status: "PENDING", createdAt: sentAt },
    );
    const m = await svc.campaignMetrics(camp.id as string);
    expect(m.redemptions).toBe(2);
  });
});

describe("CrmService - WhatsApp y digest (crm-channels-digest)", () => {
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
      { id: "e1", academyId: ACADEMY, personId: "p1", status: "ACTIVE" },
      { id: "e2", academyId: ACADEMY, personId: "p2", status: "ACTIVE" },
      { id: "e3", academyId: ACADEMY, personId: "p3", status: "ACTIVE" },
    );
    prisma.personRows.push(
      { id: "p1", name: "Ana", phone: "+56 9 1111 2222" },
      { id: "p2", name: "Beto", phone: null },
      { id: "p3", name: "Caro", phone: "56933334444" },
    );
    prisma.academyRows.push({ id: ACADEMY, ownerId: "owner-1" });
  });

  it("whatsappLinks devuelve wa.me solo a quienes tienen teléfono", async () => {
    const camp = await svc.createCampaign(
      "ACADEMY", ACADEMY, "Promo",
      { allStudents: true },
      { type: "NOTIFY", title: "x" },
    );
    await svc.sendCampaign(camp.id as string);
    const r = await svc.whatsappLinks(camp.id as string, "Hola, vuelve!");
    expect(r.total).toBe(3);
    expect(r.withoutPhone).toBe(1); // p2 sin phone
    expect(r.items).toHaveLength(2);
    const ana = r.items.find((i) => i.personId === "p1")!;
    // dígitos limpios + texto codificado
    expect(ana.url).toBe(
      `https://wa.me/56911112222?text=${encodeURIComponent("Hola, vuelve!")}`,
    );
  });

  it("digest notifica al owner con conteos por segmento", async () => {
    prisma.scores.push(
      { actorType: "ACADEMY", actorId: ACADEMY, personId: "p1", segment: "CORE" },
      { actorType: "ACADEMY", actorId: ACADEMY, personId: "p2", segment: "CORE" },
      { actorType: "ACADEMY", actorId: ACADEMY, personId: "p3", segment: "AT_RISK" },
      // un productor (owner = actorId mismo)
      { actorType: "PRODUCER", actorId: PRODUCER, personId: "q1", segment: "NEW" },
    );
    const r = await svc.sendDigests();
    expect(r.actors).toBe(2);
    expect(r.notified).toBe(2);
    const academyDigest = notifySafe.mock.calls.find(
      (c) => c[0] === "owner-1",
    )![1] as { title: string; body: string };
    expect(academyDigest.body).toContain("3 personas");
    expect(academyDigest.body).toContain("2 núcleo");
    expect(academyDigest.body).toContain("1 en riesgo");
    const prodDigest = notifySafe.mock.calls.find(
      (c) => c[0] === PRODUCER,
    )![1] as { body: string };
    expect(prodDigest.body).toContain("1 personas");
    expect(prodDigest.body).toContain("1 nuevas");
  });

  it("digest sin scores no notifica a nadie", async () => {
    const r = await svc.sendDigests();
    expect(r.notified).toBe(0);
    expect(notifySafe).not.toHaveBeenCalled();
  });
});
