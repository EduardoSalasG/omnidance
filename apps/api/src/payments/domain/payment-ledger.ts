// payment-ledger.ts
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

/**
 * Canonical JSON: ordena keys de objetos recursivamente (arrays conservan orden).
 * Postgres `jsonb` reordena keys almacenadas; sin canonicalización, releer un
 * payload y re-stringificarlo produce un string distinto y verifyPaymentChain
 * reportaría tampering falso. Emit y verify convergen al mismo string.
 */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, sortKeys(val)]),
    );
  }
  return v;
}

export function canonicalJson(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}

/**
 * Ledger BIAN: append-only, hash-chain por payment.
 * payloadHash = sha256(prevHash + canonicalJson({paymentId,seq,type,actor,payload}))
 * Debe llamarse DENTRO de la tx de negocio (el caller pasa el tx client).
 */
export async function emitPaymentEvent(
  tx: Prisma.TransactionClient,
  paymentId: string,
  type: string,
  actor: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  const last = await tx.paymentEvent.findFirst({
    where: { paymentId },
    orderBy: { seq: "desc" },
    select: { seq: true, payloadHash: true },
  });
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.payloadHash ?? "GENESIS";
  const canonical = canonicalJson({ paymentId, seq, type, actor, payload });
  const payloadHash = createHash("sha256")
    .update(prevHash + canonical)
    .digest("hex");
  await tx.paymentEvent.create({
    data: { paymentId, seq, type, actor, prevHash, payloadHash, payload },
  });
}

/** Re-calcula la cadena completa de un payment y reporta integridad. */
export async function verifyPaymentChain(
  prisma: {
    paymentEvent: {
      findMany(a: {
        where: { paymentId: string };
        orderBy: { seq: "asc" };
      }): Promise<
        Array<{
          seq: number;
          type: string;
          actor: string;
          prevHash: string;
          payloadHash: string;
          payload: unknown;
        }>
      >;
    };
  },
  paymentId: string,
): Promise<{ ok: boolean; events: number; firstBadSeq?: number }> {
  const events = await prisma.paymentEvent.findMany({
    where: { paymentId },
    orderBy: { seq: "asc" },
  });
  let prevHash = "GENESIS";
  for (const e of events) {
    const canonical = canonicalJson({
      paymentId,
      seq: e.seq,
      type: e.type,
      actor: e.actor,
      payload: e.payload,
    });
    const expected = createHash("sha256")
      .update(prevHash + canonical)
      .digest("hex");
    if (e.prevHash !== prevHash || e.payloadHash !== expected) {
      return { ok: false, events: events.length, firstBadSeq: e.seq };
    }
    prevHash = e.payloadHash;
  }
  return { ok: true, events: events.length };
}
