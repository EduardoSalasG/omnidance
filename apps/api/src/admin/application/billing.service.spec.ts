import { describe, expect, it, vi } from "vitest";
import { AdminBillingService } from "./billing.service";

// AdminBillingService (spec admin-billing-documents): emisión de la nota
// interna de cobro por comisión desde un Payout. Reglas bajo prueba:
// - folio correlativo atómico (BillingCounter con increment)
// - idempotencia por payoutId (re-emitir devuelve el doc existente, sin
//   consumir folio)
// - líneas agregadas por tipo de cargo; payout sin cargos → 400
// - receptor resuelto por actorType (PRODUCER→actorId, ACADEMY→owner)
// - void con motivo, conserva PDF como evidencia
// - listMine solo ISSUED del actor

function mkPrisma() {
  const docs: Record<string, unknown>[] = [];
  let counterNext = 1;
  const payouts = new Map<string, Record<string, unknown>>();
  const persons = new Map<string, Record<string, unknown>>();
  const academies = new Map<string, Record<string, unknown>>();
  const audit: Record<string, unknown>[] = [];
  const tx = {
    billingDocument: {
      findUnique: vi.fn(
        async ({ where }: { where: { payoutId?: string; id?: string } }) =>
          docs.find(
            (d) =>
              (where.payoutId && d.payoutId === where.payoutId) ||
              (where.id && d.id === where.id),
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          status: "ISSUED",
          issuedAt: new Date(),
          ...data,
          id: `doc-${docs.length}`,
        };
        docs.push(row);
        return row;
      }),
    },
    billingCounter: {
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: { next: number };
          update: { next: { increment: number } };
        }) => {
          counterNext =
            counterNext === 1 && !upserted
              ? create.next
              : counterNext + update.next.increment;
          upserted = true;
          return { next: counterNext };
        },
      ),
    },
  };
  let upserted = false;
  const prisma = {
    payout: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          payouts.get(where.id) ?? null,
      ),
      findMany: vi.fn(async () => [...payouts.values()]),
    },
    person: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          persons.get(where.id) ?? null,
      ),
    },
    academy: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          academies.get(where.id) ?? null,
      ),
    },
    billingDocument: {
      findUnique: tx.billingDocument.findUnique,
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const w = args?.where ?? {};
        return docs.filter(
          (d) =>
            (!w.receiverId || d.receiverId === w.receiverId) &&
            (!w.status || d.status === w.status),
        );
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = docs.find((d) => d.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      ),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    _docs: docs,
    _payouts: payouts,
    _persons: persons,
    _academies: academies,
    _audit: audit,
  };
  return prisma;
}

const storage = {
  save: vi.fn(async () => `billing/${Math.random()}.pdf`),
  read: vi.fn(async () => Buffer.from("pdf")),
};

function mkPayout(over: Record<string, unknown> = {}) {
  return {
    id: "po-1",
    actorType: "PRODUCER",
    actorId: "p-1",
    periodStart: new Date("2026-09-01"),
    periodEnd: new Date("2026-10-01"),
    gross: 1000000,
    net: 900000,
    lines: [
      { type: "PLATFORM_FEE_NET", amount: 42000 },
      { type: "PLATFORM_FEE_VAT", amount: 7980 },
      { type: "MANUAL_ADJUSTMENT", amount: -5000 },
    ],
    ...over,
  };
}

function svc(prisma: unknown) {
  return new AdminBillingService(prisma as never, storage as never);
}

describe("AdminBillingService", () => {
  it("genera el documento con folio 1, líneas agregadas y snapshot del receptor", async () => {
    const prisma = mkPrisma();
    prisma._payouts.set("po-1", mkPayout());
    prisma._persons.set("p-1", {
      id: "p-1",
      name: "Prod Uno",
      fiscalProfile: { rut: "76.543.210-1", legalName: "Prod Uno SpA" },
    });
    const s = svc(prisma);

    const doc = await s.generate("po-1", "admin-1");
    expect(doc.folio).toBe(1);
    expect(doc.payoutId).toBe("po-1");
    expect(doc.receiverId).toBe("p-1");
    expect(doc.receiverRut).toBe("76.543.210-1");
    expect(doc.receiverName).toBe("Prod Uno SpA");
    expect(doc.netClp).toBe(42000);
    expect(doc.vatClp).toBe(7980);
    expect(doc.totalClp).toBe(49980);
    expect(doc.status).toBe("ISSUED");
    // MANUAL_ADJUSTMENT no es cargo facturable - queda fuera
    expect(doc.lines).toEqual([
      { label: "Comisión de plataforma (neto)", amount: 42000 },
      { label: "IVA comisión de plataforma", amount: 7980 },
    ]);
    expect(prisma._audit[0].action).toBe("BILLING_ISSUE");
  });

  it("re-emitir sobre el mismo payout devuelve el doc existente sin consumir folio", async () => {
    const prisma = mkPrisma();
    prisma._payouts.set("po-1", mkPayout());
    prisma._persons.set("p-1", { id: "p-1", name: "P" });
    const s = svc(prisma);

    const first = await s.generate("po-1", "a");
    const second = await s.generate("po-1", "a");
    expect(second.id).toBe(first.id);
    expect(second.folio).toBe(1);
    expect(prisma._docs).toHaveLength(1);
  });

  it("folios consecutivos entre payouts distintos", async () => {
    const prisma = mkPrisma();
    prisma._payouts.set("po-1", mkPayout());
    prisma._payouts.set(
      "po-2",
      mkPayout({ id: "po-2", actorId: "p-2" }),
    );
    prisma._persons.set("p-1", { id: "p-1", name: "A" });
    prisma._persons.set("p-2", { id: "p-2", name: "B" });
    const s = svc(prisma);

    expect((await s.generate("po-1", "a")).folio).toBe(1);
    expect((await s.generate("po-2", "a")).folio).toBe(2);
  });

  it("payout sin líneas de cargo → error, no emite", async () => {
    const prisma = mkPrisma();
    prisma._payouts.set(
      "po-1",
      mkPayout({ lines: [{ type: "MANUAL_ADJUSTMENT", amount: 100 }] }),
    );
    prisma._persons.set("p-1", { id: "p-1", name: "P" });
    await expect(svc(prisma).generate("po-1", "a")).rejects.toThrow(/cargo/i);
  });

  it("ACADEMY resuelve al owner como receptor", async () => {
    const prisma = mkPrisma();
    prisma._payouts.set(
      "po-1",
      mkPayout({
        actorType: "ACADEMY",
        actorId: "ac-1",
        lines: [{ type: "GATEWAY_FEE_PASSTHROUGH", amount: 3000 }],
      }),
    );
    prisma._academies.set("ac-1", { id: "ac-1", ownerId: "p-owner" });
    prisma._persons.set("p-owner", { id: "p-owner", name: "Owner Ac" });
    const doc = await svc(prisma).generate("po-1", "a");
    expect(doc.receiverId).toBe("p-owner");
    expect(doc.netClp).toBe(3000);
    expect(doc.vatClp).toBe(0);
  });

  it("void con motivo marca VOID y audita; el doc sigue existiendo", async () => {
    const prisma = mkPrisma();
    prisma._payouts.set("po-1", mkPayout());
    prisma._persons.set("p-1", { id: "p-1", name: "P" });
    const s = svc(prisma);
    const doc = await s.generate("po-1", "a");

    const voided = await s.void(doc.id as string, "emisión duplicada", "adm");
    expect(voided.status).toBe("VOID");
    expect(voided.voidReason).toBe("emisión duplicada");
    expect(prisma._audit[1].action).toBe("BILLING_VOID");
    await expect(s.void(doc.id as string, "otra", "adm")).rejects.toThrow();
  });

  it("listMine solo expone ISSUED del propio actor", async () => {
    const prisma = mkPrisma();
    prisma._payouts.set("po-1", mkPayout());
    prisma._payouts.set("po-2", mkPayout({ id: "po-2", actorId: "p-2" }));
    prisma._persons.set("p-1", { id: "p-1", name: "P" });
    prisma._persons.set("p-2", { id: "p-2", name: "Q" });
    const s = svc(prisma);
    const mine = await s.generate("po-1", "a");
    await s.generate("po-2", "a");
    await s.void(mine.id as string, "x", "a");

    expect(await s.listMine("p-1")).toHaveLength(0);
    expect(await s.listMine("p-2")).toHaveLength(1);
  });
});
