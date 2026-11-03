-- Drift acumulado por db-push: PaymentClaim.kind (PLAN|PRIVATE_CLASS,
-- spec private-class-checkout) y la FK de TicketClaim.producerId
-- (opcional -> ON DELETE SET NULL segun el schema).

-- AlterTable
ALTER TABLE "PaymentClaim" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PLAN';

-- DropForeignKey + re-crear con SET NULL
ALTER TABLE "TicketClaim" DROP CONSTRAINT "TicketClaim_producerId_fkey";
ALTER TABLE "TicketClaim" ADD CONSTRAINT "TicketClaim_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
