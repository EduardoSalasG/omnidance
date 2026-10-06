-- CreateEnum
CREATE TYPE "BillingDocStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateTable
CREATE TABLE "BillingDocument" (
    "id" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FEE_NOTE',
    "payoutId" TEXT,
    "actorType" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "receiverRut" TEXT,
    "receiverName" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lines" JSONB NOT NULL,
    "netClp" INTEGER NOT NULL,
    "vatClp" INTEGER NOT NULL,
    "totalClp" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "status" "BillingDocStatus" NOT NULL DEFAULT 'ISSUED',
    "pdfKey" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "BillingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCounter" (
    "id" TEXT NOT NULL DEFAULT 'billing',
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BillingCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_folio_key" ON "BillingDocument"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_payoutId_key" ON "BillingDocument"("payoutId");

-- CreateIndex
CREATE INDEX "BillingDocument_receiverId_status_idx" ON "BillingDocument"("receiverId", "status");

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
