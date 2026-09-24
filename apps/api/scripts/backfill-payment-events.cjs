const { PrismaClient } = require("@prisma/client");
const { createHash } = require("node:crypto");
const prisma = new PrismaClient();
(async () => {
  const payments = await prisma.payment.findMany({
    where: { events: { none: {} } }, // requiere relation Payment.events
  });
  // NOTA: agregar `events PaymentEvent[]` al model Payment para el where
  let n = 0;
  for (const p of payments) {
    const payload = { status: p.status, amount: p.amount, orderType: p.orderType, refId: p.refId, gateway: p.gateway, createdAt: p.createdAt };
    const canonical = JSON.stringify({ paymentId: p.id, seq: 1, type: "IMPORTED", actor: "migration", payload });
    await prisma.paymentEvent.create({
      data: { paymentId: p.id, seq: 1, type: "IMPORTED", actor: "migration", prevHash: "GENESIS", payloadHash: createHash("sha256").update("GENESIS" + canonical).digest("hex"), payload },
    });
    n++;
  }
  console.log(`backfill: ${n} PaymentEvent IMPORTED`);
  await prisma.$disconnect();
})();
