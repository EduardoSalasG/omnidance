-- DropForeignKey
ALTER TABLE "ProducerGatewayAccount" DROP CONSTRAINT "ProducerGatewayAccount_producerId_fkey";

-- AlterTable
ALTER TABLE "Academy" ADD COLUMN     "collectionsBlockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MembershipSubscription" ADD COLUMN     "gatewayAccountId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "academyStatementId" TEXT,
ADD COLUMN     "academyTakeClp" INTEGER,
ADD COLUMN     "academyTakeRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProducerGatewayAccount" ADD COLUMN     "academyId" TEXT,
ALTER COLUMN "producerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AcademyCollectionsStatement" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "grossClp" INTEGER NOT NULL,
    "takeRate" DOUBLE PRECISION NOT NULL,
    "takeNetClp" INTEGER NOT NULL,
    "takeVatClp" INTEGER NOT NULL,
    "totalClp" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyCollectionsStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCollectionsStatement_paymentId_key" ON "AcademyCollectionsStatement"("paymentId");

-- CreateIndex
CREATE INDEX "AcademyCollectionsStatement_status_dueAt_idx" ON "AcademyCollectionsStatement"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCollectionsStatement_academyId_period_key" ON "AcademyCollectionsStatement"("academyId", "period");

-- CreateIndex
CREATE INDEX "MembershipSubscription_gatewayAccountId_idx" ON "MembershipSubscription"("gatewayAccountId");

-- CreateIndex
CREATE INDEX "ProducerGatewayAccount_academyId_status_idx" ON "ProducerGatewayAccount"("academyId", "status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_academyStatementId_fkey" FOREIGN KEY ("academyStatementId") REFERENCES "AcademyCollectionsStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCollectionsStatement" ADD CONSTRAINT "AcademyCollectionsStatement_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCollectionsStatement" ADD CONSTRAINT "AcademyCollectionsStatement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerGatewayAccount" ADD CONSTRAINT "ProducerGatewayAccount_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerGatewayAccount" ADD CONSTRAINT "ProducerGatewayAccount_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipSubscription" ADD CONSTRAINT "MembershipSubscription_gatewayAccountId_fkey" FOREIGN KEY ("gatewayAccountId") REFERENCES "ProducerGatewayAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

