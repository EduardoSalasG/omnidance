// payment-ledger.spec.ts — prisma fake con findFirst/create/findMany
import { describe, expect, it } from "vitest";
import { emitPaymentEvent, verifyPaymentChain } from "./payment-ledger";

// fake mínimo: events[] in-memory con la API que usa el ledger
function makeFake() {
  const events: any[] = [];
  const tx = {
    paymentEvent: {
      findFirst: async ({ where }: any) =>
        events
          .filter((e) => e.paymentId === where.paymentId)
          .sort((a, b) => b.seq - a.seq)[0] ?? null,
      create: async ({ data }: any) => {
        events.push(data);
        return data;
      },
      findMany: async ({ where }: any) =>
        events
          .filter((e) => e.paymentId === where.paymentId)
          .sort((a, b) => a.seq - b.seq),
    },
  };
  return { tx, events };
}

describe("emitPaymentEvent", () => {
  it("primer evento: seq 1, prevHash GENESIS", async () => {
    const { tx, events } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "ORDER_CREATED", "system", {
      amount: 100,
    });
    expect(events[0].seq).toBe(1);
    expect(events[0].prevHash).toBe("GENESIS");
    expect(events[0].payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("segundo evento encadena el hash del primero", async () => {
    const { tx, events } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "ORDER_CREATED", "system", { a: 1 });
    await emitPaymentEvent(tx as any, "p1", "SETTLED", "webhook", { b: 2 });
    expect(events[1].prevHash).toBe(events[0].payloadHash);
  });
});

describe("verifyPaymentChain", () => {
  it("cadena intacta → ok", async () => {
    const { tx } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "A", "system", {});
    await emitPaymentEvent(tx as any, "p1", "B", "webhook", {});
    const r = await verifyPaymentChain(tx as any, "p1");
    expect(r).toEqual({ ok: true, events: 2 });
  });

  it("payload adulterado → detecta el seq", async () => {
    const { tx, events } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "A", "system", { amount: 100 });
    await emitPaymentEvent(tx as any, "p1", "B", "webhook", {});
    events[0].payload = { amount: 999999 }; // adulteración
    const r = await verifyPaymentChain(tx as any, "p1");
    expect(r.ok).toBe(false);
    expect(r.firstBadSeq).toBe(1);
  });

  it("jsonb reordena keys al leer → la cadena sigue OK", async () => {
    const { tx, events } = makeFake();
    await emitPaymentEvent(tx as any, "p1", "A", "system", {
      zebra: 1,
      alpha: { nestedB: 2, nestedA: 1 },
      mid: [3, { y: 1, x: 2 }],
    });
    await emitPaymentEvent(tx as any, "p1", "B", "webhook", { k1: 1, k2: 2 });
    // Simula que Postgres jsonb devuelve las keys en otro orden (al revés).
    for (const e of events) {
      e.payload = reverseKeys(e.payload);
    }
    const r = await verifyPaymentChain(tx as any, "p1");
    expect(r).toEqual({ ok: true, events: 2 });
  });
});

function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .reverse()
        .map(([k, val]) => [k, reverseKeys(val)]),
    );
  }
  return v;
}
