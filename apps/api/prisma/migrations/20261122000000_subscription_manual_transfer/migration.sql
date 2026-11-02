-- AlterTable
ALTER TABLE "TicketClaim" ADD COLUMN     "academyId" TEXT,
ADD COLUMN     "domain" TEXT NOT NULL DEFAULT 'PRODUCER',
ALTER COLUMN "producerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MembershipSubscription" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'CARD';

-- AlterTable
ALTER TABLE "PlatformSubscription" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'CARD';

-- CreateIndex
CREATE INDEX "TicketClaim_academyId_status_idx" ON "TicketClaim"("academyId", "status");

-- CreateIndex
CREATE INDEX "TicketClaim_domain_status_idx" ON "TicketClaim"("domain", "status");

-- AddForeignKey
ALTER TABLE "TicketClaim" ADD CONSTRAINT "TicketClaim_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
