const { PrismaClient } = require("@prisma/client");
const { createHash } = require("node:crypto");
const prisma = new PrismaClient();

// Canonical JSON — mismo algoritmo que src/payments/domain/payment-ledger.ts
// (duplicado inline: este script es JS plano, no puede importar el .ts).
// jsonb reordena keys; sin canonicalización verifyPaymentChain daría falsos positivos.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, val]) => [k, sortKeys(val)]),
    );
  }
  return v;
}
function canonicalJson(v) {
  // Round-trip a JSON puro primero: Date→ISO, Decimal→número, toJSON→serializado.
  // Sin esto un Date canonicaliza como {} pero jsonb lo guarda como string.
  return JSON.stringify(sortKeys(JSON.parse(JSON.stringify(v))));
}

(async () => {
  const payments = await prisma.payment.findMany({
    where: { events: { none: {} } }, // requiere relation Payment.events
  });
  // NOTA: agregar `events PaymentEvent[]` al model Payment para el where
  let n = 0;
  for (const p of payments) {
    const payload = { status: p.status, amount: p.amount, orderType: p.orderType, refId: p.refId, gateway: p.gateway, createdAt: p.createdAt };
    const canonical = canonicalJson({ paymentId: p.id, seq: 1, type: "IMPORTED", actor: "migration", payload });
    await prisma.paymentEvent.create({
      data: { paymentId: p.id, seq: 1, type: "IMPORTED", actor: "migration", prevHash: "GENESIS", payloadHash: createHash("sha256").update("GENESIS" + canonical).digest("hex"), payload },
    });
    n++;
  }
  console.log(`backfill: ${n} PaymentEvent IMPORTED`);
  await prisma.$disconnect();
})();
