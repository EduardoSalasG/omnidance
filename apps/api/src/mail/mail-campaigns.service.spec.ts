import { describe, expect, it, vi } from "vitest";
import { MailCampaignsService } from "./mail-campaigns.service";
import { JobRegistry } from "../jobs/registry";

// MailCampaignsService (spec admin-jobs-mail-campaigns): reglas bajo
// prueba:
// - audiencias ALL/ROLE/EVENT (solo con email; EVENT dedup por owner)
// - schedule: ONCE requiere runAt, CRON valida expr (400 si inválida)
// - sendRun: recipients por run, envío secuencial, SENT|FAILED|SKIPPED,
//   cancelación mid-send corta y marca SKIPPED
// - dispatchDue: solo SCHEDULED vencidas; ONCE→DONE, CRON re-agenda
// - update: SENDING/DONE/FAILED/CANCELLED → 409
// - testSend al email del admin sin crear run

type Row = Record<string, unknown>;

function mkPrisma() {
  const campaigns = new Map<string, Row>();
  const runs: Row[] = [];
  const recipients: Row[] = [];
  const sents: Row[] = [];
  const audit: Row[] = [];
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
  const people = new Map<string, Row>([
    ["p1", { id: "p1", email: "a@test.cl", name: "Ana" }],
    ["p2", { id: "p2", email: "b@test.cl", name: "Beto" }],
    ["p3", { id: "p3", email: null, name: "Coro" }],
    ["admin", { id: "admin", email: "admin@test.cl", name: "Root" }],
  ]);
  const personRoles: Row[] = [
    { personId: "p1", role: "PRODUCER", status: "APPROVED" },
    { personId: "p3", role: "PRODUCER", status: "APPROVED" }, // sin email
    { personId: "p2", role: "PRODUCER", status: "PENDING" }, // no aprueba
  ];
  const tickets: Row[] = [
    { ownerId: "p1", eventId: "ev1", status: "ACTIVE" },
    { ownerId: "p1", eventId: "ev1", status: "ACTIVE" }, // duplicado owner
    { ownerId: "p3", eventId: "ev1", status: "ACTIVE" }, // sin email
    { ownerId: "p2", eventId: "ev1", status: "USED" }, // no ACTIVE
    { ownerId: "p2", eventId: "ev2", status: "ACTIVE" }, // otro evento
  ];
  const enrollments: Row[] = [
    {
      id: "e1", personId: "p1", status: "ACTIVE", endsAt: inDays(3),
      academy: { name: "La Gozadera" }, plan: { name: "Mensual" },
    },
    {
      id: "e2", personId: "p2", status: "ACTIVE", endsAt: inDays(4),
      academy: { name: "Clave" }, plan: null, // sin plan
    },
    {
      id: "e3", personId: "p3", status: "ACTIVE", endsAt: inDays(3),
      academy: { name: "Clave" }, plan: { name: "Trimestral" }, // sin email
    },
    {
      id: "e4", personId: "p1", status: "TRIAL", endsAt: inDays(3),
      academy: { name: "Clave" }, plan: { name: "Trial" }, // TRIAL no aplica
    },
    {
      id: "e5", personId: "p1", status: "ACTIVE", endsAt: inDays(-2),
      academy: { name: "La Gozadera" }, plan: { name: "Mensual" }, // gracia
    },
    {
      id: "e6", personId: "p1", status: "ACTIVE", endsAt: null,
      academy: { name: "Clave" }, plan: { name: "Mensual" }, // sin vigencia
    },
  ];
  const psubs: Row[] = [
    { id: "s1", personId: "p1", status: "ACTIVE", nextInvoiceAt: inDays(4), tierCode: "PRO" },
    { id: "s2", personId: "p2", status: "CANCELED", nextInvoiceAt: inDays(4), tierCode: "PRO" },
    { id: "s3", personId: "p2", status: "ACTIVE", nextInvoiceAt: null, tierCode: "PRO" },
  ];
  const match = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o = v as Row;
        if ("gte" in o || "gt" in o || "lt" in o || "lte" in o) {
          const d = row[k] as Date;
          if (!(d instanceof Date)) return false;
          if ("gte" in o && d < (o.gte as Date)) return false;
          if ("gt" in o && d <= (o.gt as Date)) return false;
          if ("lt" in o && d >= (o.lt as Date)) return false;
          if ("lte" in o && d > (o.lte as Date)) return false;
          return true;
        }
        if ("not" in o) return row[k] !== o.not;
        if ("in" in o) return (o.in as unknown[]).includes(row[k]);
        if ("status" in o) {
          return (o.status as Row)?.not === undefined
            ? row[k] === v
            : row[k] !== (v as { not: unknown }).not;
        }
      }
      return row[k] === v;
    });
  return {
    campaigns,
    runs,
    recipients,
    sents,
    audit,
    person: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        [...people.values()].filter((p) => match(p, where)),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        people.get(where.id) ?? null,
      ),
    },
    personRole: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        personRoles.filter((r) => {
          if (where.role && r.role !== where.role) return false;
          if (where.status && r.status !== where.status) return false;
          if ((where.person as Row | undefined)?.email != null && ((where.person as Row).email as Row).not === null) {
            return people.get(r.personId as string)?.email != null;
          }
          return true;
        }),
      ),
    },
    ticket: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        tickets.filter((t) => match(t, where)),
      ),
    },
    enrollment: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        enrollments.filter((e) => match(e, where)),
      ),
    },
    platformSubscription: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        psubs.filter((s) => match(s, where)),
      ),
    },
    mailCampaignSent: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        sents.filter((s) => match(s, where)),
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (sents.some((s) => s.campaignId === data.campaignId && s.dedupKey === data.dedupKey)) {
          throw new Error("unique constraint");
        }
        sents.push({ ...data, id: `ms-${sents.length}` });
        return data;
      }),
    },
    mailCampaign: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        [...campaigns.values()].filter((c) => match(c, where)),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        campaigns.get(where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = {
          status: "DRAFT",
          sentCount: 0,
          failCount: 0,
          timezone: "America/Santiago",
          ...data,
          id: `c-${campaigns.size}`,
        };
        campaigns.set(row.id as string, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = campaigns.get(where.id);
        if (!row) throw new Error("not found");
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as Row)) {
            row[k] = (row[k] as number) + ((v as Row).increment as number);
          } else {
            row[k] = v;
          }
        }
        return row;
      }),
    },
    mailCampaignRun: {
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        runs.filter((r) => match(r, where)),
      ),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row: Row = { sentCount: 0, failCount: 0, ...data, id: `r-${runs.length}` };
        runs.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = runs.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    mailCampaignRecipient: {
      createMany: vi.fn(async ({ data }: { data: Row[] }) => {
        for (const d of data) {
          if (!recipients.some((r) => r.runId === d.runId && r.personId === d.personId)) {
            recipients.push({ status: "PENDING", ...d, id: `rc-${recipients.length}` });
          }
        }
        return { count: data.length };
      }),
      findMany: vi.fn(async ({ where }: { where: Row }) =>
        recipients.filter((r) => match(r, where)),
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = recipients.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        for (const r of recipients) if (match(r, where)) Object.assign(r, data);
        return { count: 0 };
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        audit.push(data);
        return data;
      }),
    },
  };
}

const mkService = (sendImpl?: () => Promise<void>) => {
  const prisma = mkPrisma();
  const mailer = { send: vi.fn(sendImpl ?? (async () => {})) };
  const registry = new JobRegistry();
  const svc = new MailCampaignsService(prisma as never, mailer as never, registry);
  return { prisma, mailer, registry, svc };
};

const baseInput = {
  name: "Lanzamiento",
  subject: "Hola",
  htmlBody: "<p>hi</p>",
  audience: { kind: "ALL" } as const,
};

describe("resolveAudience", () => {
  const ids = (entries: { personId: string }[]) => entries.map((e) => e.personId);

  it("ALL devuelve personas con email", async () => {
    const { svc } = mkService();
    expect(ids(await svc.resolveAudience({ kind: "ALL" }))).toEqual(["p1", "p2", "admin"]);
  });

  it("ROLE filtra por roleKey APPROVED con email", async () => {
    const { svc } = mkService();
    expect(ids(await svc.resolveAudience({ kind: "ROLE", roleKey: "PRODUCER" }))).toEqual(["p1"]);
  });

  it("EVENT devuelve owners de tickets ACTIVE con email, deduplicados", async () => {
    const { svc } = mkService();
    expect(ids(await svc.resolveAudience({ kind: "EVENT", eventId: "ev1" }))).toEqual(["p1"]);
  });

  it("ENROLLMENTS_EXPIRING trae ctx + dedupKey; excluye TRIAL, sin email y sin endsAt", async () => {
    const { svc } = mkService();
    const entries = await svc.resolveAudience({ kind: "ENROLLMENTS_EXPIRING", days: 5 });
    expect(ids(entries)).toEqual(["p1", "p2"]);
    const e1 = entries.find((e) => e.personId === "p1")!;
    expect(e1.ctx.academy).toBe("La Gozadera");
    expect(e1.ctx.plan).toBe("Mensual");
    expect(e1.ctx.endsAt).toMatch(/\d{4}/);
    expect(e1.dedupKey).toMatch(/^enr:e1:/);
    // p2 sin plan → placeholder legible
    expect(entries.find((e) => e.personId === "p2")!.ctx.plan).toBe("tu plan");
  });

  it("ENROLLMENTS_EXPIRED trae las de gracia (endsAt pasado dentro de days)", async () => {
    const { svc } = mkService();
    const entries = await svc.resolveAudience({ kind: "ENROLLMENTS_EXPIRED", days: 5 });
    expect(ids(entries)).toEqual(["p1"]);
  });

  it("PLATFORM_SUB_EXPIRING trae solo ACTIVE con nextInvoiceAt en ventana", async () => {
    const { svc } = mkService();
    const entries = await svc.resolveAudience({ kind: "PLATFORM_SUB_EXPIRING", days: 7 });
    expect(ids(entries)).toEqual(["p1"]);
    expect(entries[0].ctx).toMatchObject({ plan: "PRO" });
    expect(entries[0].dedupKey).toMatch(/^psub:s1:/);
  });

  it("audiencias inválidas → 400", async () => {
    const { svc } = mkService();
    await expect(svc.resolveAudience({ kind: "ROLE", roleKey: "" })).rejects.toThrow("roleKey");
    await expect(
      svc.resolveAudience({ kind: "ENROLLMENTS_EXPIRING", days: 0 }),
    ).rejects.toThrow("days");
  });
});

describe("create / update", () => {
  it("ONCE requiere runAt; CRON requiere cronExpr válido", async () => {
    const { svc } = mkService();
    await expect(
      svc.create("admin", { ...baseInput, scheduleKind: "ONCE" }),
    ).rejects.toThrow("requiere runAt");
    await expect(
      svc.create("admin", { ...baseInput, scheduleKind: "CRON", cronExpr: "basura" }),
    ).rejects.toThrow("expresión cron inválida");
  });

  it("SCHEDULED computa nextRunAt; DRAFT queda sin agenda", async () => {
    const { svc } = mkService();
    const scheduled = await svc.create("admin", {
      ...baseInput,
      scheduleKind: "CRON",
      cronExpr: "0 10 * * *",
      status: "SCHEDULED",
    });
    expect(scheduled.nextRunAt).toBeInstanceOf(Date);
    const draft = await svc.create("admin", { ...baseInput, scheduleKind: "CRON", cronExpr: "0 10 * * *" });
    expect(draft.status).toBe("DRAFT");
    expect(draft.nextRunAt).toBeNull();
  });

  it("409 al editar una campaña terminal o en envío", async () => {
    const { prisma, svc } = mkService();
    prisma.campaigns.set("c1", { id: "c1", status: "SENDING", scheduleKind: "ONCE" });
    prisma.campaigns.set("c2", { id: "c2", status: "DONE", scheduleKind: "ONCE" });
    await expect(svc.update("c1", "admin", { name: "x" })).rejects.toThrow("en envío");
    await expect(svc.update("c2", "admin", { name: "x" })).rejects.toThrow("inmutable");
  });
});

describe("dispatchDue + sendRun", () => {
  const seedCampaign = (prisma: ReturnType<typeof mkPrisma>, over: Row = {}) => {
    prisma.campaigns.set("c1", {
      id: "c1",
      name: "c",
      subject: "S",
      htmlBody: "<p>x</p>",
      audience: { kind: "ROLE", roleKey: "PRODUCER" },
      scheduleKind: "ONCE",
      status: "SCHEDULED",
      nextRunAt: new Date(Date.now() - 60_000),
      cronExpr: null,
      timezone: "America/Santiago",
      sentCount: 0,
      failCount: 0,
      ...over,
    });
  };

  it("despacha una ONCE vencida: recipients, envíos y DONE", async () => {
    const { prisma, mailer, svc } = mkService();
    seedCampaign(prisma);
    const meta = await svc.dispatchDue();
    expect(meta).toMatchObject({ dispatched: 1, sent: 1, failed: 0 });
    expect(mailer.send).toHaveBeenCalledWith("a@test.cl", "S", "<p>x</p>");
    const c = prisma.campaigns.get("c1")!;
    expect(c.status).toBe("DONE");
    expect(c.sentCount).toBe(1);
    expect(prisma.runs[0].status).toBe("OK");
    expect(prisma.recipients[0].status).toBe("SENT");
  });

  it("una CRON queda SCHEDULED con nextRunAt recalculado", async () => {
    const { prisma, svc } = mkService();
    seedCampaign(prisma, { scheduleKind: "CRON", cronExpr: "0 10 * * *" });
    await svc.dispatchDue();
    const c = prisma.campaigns.get("c1")!;
    expect(c.status).toBe("SCHEDULED");
    expect((c.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("fallo parcial: FAILED por destinatario y el envío continúa", async () => {
    const { prisma, mailer, svc } = mkService(async () => {
      throw new Error("resend caído");
    });
    seedCampaign(prisma);
    const meta = await svc.dispatchDue();
    expect(meta.failed).toBe(1);
    expect(prisma.recipients[0].status).toBe("FAILED");
    expect(prisma.runs[0].status).toBe("OK");
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("ignora campañas no vencidas o no SCHEDULED", async () => {
    const { prisma, svc } = mkService();
    seedCampaign(prisma, { nextRunAt: new Date(Date.now() + 86_400_000) });
    prisma.campaigns.set("c2", { id: "c2", status: "DRAFT", nextRunAt: new Date(0) });
    expect(await svc.dispatchDue()).toMatchObject({ dispatched: 0 });
  });
});

describe("variables de plantilla + dedup por ciclo", () => {
  const seedCtxCampaign = (prisma: ReturnType<typeof mkPrisma>) =>
    prisma.campaigns.set("c1", {
      id: "c1",
      name: "vencimientos",
      subject: "Tu plan {{plan}} en {{academy}} vence",
      htmlBody: "<p>hasta el {{endsAt}}</p>",
      audience: { kind: "ENROLLMENTS_EXPIRING", days: 5 },
      scheduleKind: "CRON",
      cronExpr: "0 9 * * *",
      status: "SCHEDULED",
      nextRunAt: new Date(Date.now() - 60_000),
      timezone: "America/Santiago",
      sentCount: 0,
      failCount: 0,
    });

  it("guardar con variable no soportada por la audiencia → 400", async () => {
    const { svc } = mkService();
    await expect(
      svc.create("admin", {
        ...baseInput,
        subject: "Vence {{nextInvoiceAt}}",
        audience: { kind: "ENROLLMENTS_EXPIRING", days: 5 },
        scheduleKind: "CRON",
        cronExpr: "0 9 * * *",
      }),
    ).rejects.toThrow("no soportadas");
    // {{endsAt}} sí la aporta esa audiencia
    const ok = await svc.create("admin", {
      ...baseInput,
      subject: "Vence {{endsAt}}",
      audience: { kind: "ENROLLMENTS_EXPIRING", days: 5 },
      scheduleKind: "CRON",
      cronExpr: "0 9 * * *",
    });
    expect(ok.id).toBeTruthy();
  });

  it("interpola ctx por destinatario y marca el ciclo enviado", async () => {
    const { prisma, mailer, svc } = mkService();
    seedCtxCampaign(prisma);
    await svc.dispatchDue();
    expect(mailer.send).toHaveBeenCalledTimes(2);
    const calls = mailer.send.mock.calls as unknown as [string, string, string][];
    const toAna = calls.find((c) => c[0] === "a@test.cl")!;
    expect(toAna[1]).toBe("Tu plan Mensual en La Gozadera vence");
    expect(toAna[2]).toContain("hasta el");
    const toBeto = calls.find((c) => c[0] === "b@test.cl")!;
    expect(toBeto[1]).toContain("tu plan");
    expect(prisma.sents).toHaveLength(2);
    expect(prisma.sents.map((s) => s.dedupKey)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^enr:e1:/), expect.stringMatching(/^enr:e2:/)]),
    );
  });

  it("la segunda corrida salta el mismo ciclo (SKIPPED) sin re-enviar", async () => {
    const { prisma, mailer, svc } = mkService();
    seedCtxCampaign(prisma);
    await svc.dispatchDue();
    expect(prisma.sents).toHaveLength(2);
    const res = await svc.runNow("c1", "admin");
    expect(res.sent).toBe(0);
    expect(mailer.send).toHaveBeenCalledTimes(2); // no envió de nuevo
    const run2 = prisma.recipients.filter((r) => r.runId === prisma.runs[1].id);
    expect(run2.every((r) => r.status === "SKIPPED")).toBe(true);
  });

  it("fallo de envío no quema la dedup: el próximo run reintenta", async () => {
    const { prisma, mailer, svc } = mkService(async () => {
      throw new Error("resend caído");
    });
    seedCtxCampaign(prisma);
    await svc.dispatchDue();
    expect(prisma.sents).toHaveLength(0);
    mailer.send.mockImplementation(async () => {});
    const res = await svc.runNow("c1", "admin");
    expect(res.sent).toBe(2);
    expect(prisma.sents).toHaveLength(2);
  });
});

describe("cancelación mid-send", () => {
  it("cancelar durante el envío corta y marca los restantes SKIPPED", async () => {
    const prisma = mkPrisma();
    // Segunda persona con email en la audiencia ALL: p1, p2, admin.
    prisma.mailCampaign.create;
    const mailer = {
      send: vi.fn(async () => {
        // Tras el primer envío la campaña queda CANCELLED.
        prisma.campaigns.get("c1")!.status = "CANCELLED";
      }),
    };
    const registry = new JobRegistry();
    const svc = new MailCampaignsService(prisma as never, mailer as never, registry);
    prisma.campaigns.set("c1", {
      id: "c1",
      subject: "S",
      htmlBody: "<p>x</p>",
      audience: { kind: "ALL" },
      scheduleKind: "ONCE",
      status: "SCHEDULED",
      nextRunAt: new Date(Date.now() - 60_000),
      timezone: "America/Santiago",
      sentCount: 0,
      failCount: 0,
    });
    await svc.dispatchDue();
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(prisma.runs[0].status).toBe("CANCELLED");
    expect(prisma.campaigns.get("c1")!.status).toBe("CANCELLED");
    const skipped = prisma.recipients.filter((r) => r.status === "SKIPPED");
    expect(skipped.length).toBe(2);
  });
});

describe("testSend / runNow / cancel", () => {
  const seed = (prisma: ReturnType<typeof mkPrisma>, status: string) => {
    prisma.campaigns.set("c1", {
      id: "c1",
      subject: "S",
      htmlBody: "<p>x</p>",
      audience: { kind: "ROLE", roleKey: "PRODUCER" },
      scheduleKind: "ONCE",
      status,
      timezone: "America/Santiago",
      sentCount: 0,
      failCount: 0,
    });
  };

  it("testSend envía al email del admin sin crear run", async () => {
    const { prisma, mailer, svc } = mkService();
    seed(prisma, "DRAFT");
    const res = await svc.testSend("c1", "admin");
    expect(res).toEqual({ sent: "admin@test.cl" });
    expect(mailer.send).toHaveBeenCalledWith("admin@test.cl", "[TEST] S", "<p>x</p>");
    expect(prisma.runs).toHaveLength(0);
  });

  it("runNow dispara una corrida MANUAL sobre un DRAFT y vuelve a DRAFT", async () => {
    const { prisma, svc } = mkService();
    seed(prisma, "DRAFT");
    // DRAFT ONCE tras corrida manual → DONE (la única corrida se consumió).
    const res = await svc.runNow("c1", "admin");
    expect(res.sent).toBe(1);
    expect(prisma.runs[0].trigger).toBe("MANUAL");
  });

  it("runNow rechaza SENDING/CANCELLED; cancel pasa a CANCELLED", async () => {
    const { prisma, svc } = mkService();
    seed(prisma, "SENDING");
    await expect(svc.runNow("c1", "admin")).rejects.toThrow("en envío");
    const cancelled = await svc.cancel("c1", "admin");
    expect(cancelled.status).toBe("CANCELLED");
    await expect(svc.runNow("c1", "admin")).rejects.toThrow("cancelada");
    await expect(svc.cancel("c1", "admin")).rejects.toThrow("no se puede cancelar");
  });
});
