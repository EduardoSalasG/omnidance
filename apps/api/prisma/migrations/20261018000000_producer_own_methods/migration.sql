-- CreateTable
CREATE TABLE "ProducerPaymentMethod" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducerPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketClaim" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "receiptKey" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "methodLabel" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProducerPaymentMethod_producerId_active_idx" ON "ProducerPaymentMethod"("producerId", "active");

-- CreateIndex
CREATE INDEX "TicketClaim_producerId_status_idx" ON "TicketClaim"("producerId", "status");

-- CreateIndex
CREATE INDEX "TicketClaim_paymentId_idx" ON "TicketClaim"("paymentId");

-- AddForeignKey
ALTER TABLE "ProducerPaymentMethod" ADD CONSTRAINT "ProducerPaymentMethod_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketClaim" ADD CONSTRAINT "TicketClaim_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketClaim" ADD CONSTRAINT "TicketClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketClaim" ADD CONSTRAINT "TicketClaim_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketClaim" ADD CONSTRAINT "TicketClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
