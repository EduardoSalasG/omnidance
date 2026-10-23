-- CreateEnum
CREATE TYPE "PlatformPromoDiscountType" AS ENUM ('PERCENT', 'FIXED_CLP');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "platformPromoId" TEXT;

-- AlterTable
ALTER TABLE "PlatformSubscription" ADD COLUMN     "pendingReprice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planChargeClp" INTEGER,
ADD COLUMN     "promoId" TEXT;

-- CreateTable
CREATE TABLE "PlatformPromo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlatformSubKind",
    "discountType" "PlatformPromoDiscountType" NOT NULL,
    "percentOff" INTEGER,
    "amountOffClp" INTEGER,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "maxCycles" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PlatformPromoProducers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_AcademyToPlatformPromo" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_PlatformPromoProducers_AB_unique" ON "_PlatformPromoProducers"("A", "B");

-- CreateIndex
CREATE INDEX "_PlatformPromoProducers_B_index" ON "_PlatformPromoProducers"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_AcademyToPlatformPromo_AB_unique" ON "_AcademyToPlatformPromo"("A", "B");

-- CreateIndex
CREATE INDEX "_AcademyToPlatformPromo_B_index" ON "_AcademyToPlatformPromo"("B");

-- CreateIndex
CREATE INDEX "Payment_platformPromoId_idx" ON "Payment"("platformPromoId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_platformPromoId_fkey" FOREIGN KEY ("platformPromoId") REFERENCES "PlatformPromo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSubscription" ADD CONSTRAINT "PlatformSubscription_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PlatformPromo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformPromo" ADD CONSTRAINT "PlatformPromo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlatformPromoProducers" ADD CONSTRAINT "_PlatformPromoProducers_A_fkey" FOREIGN KEY ("A") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlatformPromoProducers" ADD CONSTRAINT "_PlatformPromoProducers_B_fkey" FOREIGN KEY ("B") REFERENCES "PlatformPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AcademyToPlatformPromo" ADD CONSTRAINT "_AcademyToPlatformPromo_A_fkey" FOREIGN KEY ("A") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AcademyToPlatformPromo" ADD CONSTRAINT "_AcademyToPlatformPromo_B_fkey" FOREIGN KEY ("B") REFERENCES "PlatformPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
