-- CreateEnum
CREATE TYPE "AcademyTier" AS ENUM ('STARTER', 'PRO', 'STUDIO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ProducerProTier" AS ENUM ('FREE', 'PRO_STARTER', 'PRO_GROWTH', 'PRO_BIG');

-- CreateEnum
CREATE TYPE "PlatformSubKind" AS ENUM ('ACADEMY', 'PRODUCER');

-- AlterTable
ALTER TABLE "Academy" ADD COLUMN     "billingBlockedAt" TIMESTAMP(3),
ADD COLUMN     "billingCycle" "BillingCycle",
ADD COLUMN     "billingGraceUntil" TIMESTAMP(3),
ADD COLUMN     "tier" "AcademyTier",
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- Backfill (spec academy-saas-billing): academias existentes reciben grace
-- de lanzamiento de 60 días — la base actual no pagaba.
UPDATE "Academy" SET "trialEndsAt" = now() + interval '60 days' WHERE "trialEndsAt" IS NULL;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "proTier" "ProducerProTier" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "PlatformSubscription" (
    "id" TEXT NOT NULL,
    "kind" "PlatformSubKind" NOT NULL,
    "academyId" TEXT,
    "producerId" TEXT,
    "personId" TEXT NOT NULL,
    "tierCode" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "flowSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CARD',
    "nextInvoiceAt" TIMESTAMP(3),
    "lastInvoiceId" TEXT,
    "reminderSentFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "PlatformSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSubscription_flowSubscriptionId_key" ON "PlatformSubscription"("flowSubscriptionId");

-- CreateIndex
CREATE INDEX "PlatformSubscription_kind_academyId_idx" ON "PlatformSubscription"("kind", "academyId");

-- CreateIndex
CREATE INDEX "PlatformSubscription_kind_producerId_idx" ON "PlatformSubscription"("kind", "producerId");

-- CreateIndex
CREATE INDEX "PlatformSubscription_personId_idx" ON "PlatformSubscription"("personId");

-- AddForeignKey
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
