-- AlterTable
ALTER TABLE "MembershipSubscription" ADD COLUMN     "academyPromoId" TEXT,
ADD COLUMN     "pendingReprice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planChargeClp" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "academyPromoId" TEXT;

-- AlterTable
ALTER TABLE "PaymentClaim" ADD COLUMN     "academyPromoId" TEXT;

-- CreateTable
CREATE TABLE "AcademyPromo" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

    CONSTRAINT "AcademyPromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AcademyPromoToMembershipPlan" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_AcademyPromoPersons" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_AcademyPromoToMembershipPlan_AB_unique" ON "_AcademyPromoToMembershipPlan"("A", "B");

-- CreateIndex
CREATE INDEX "_AcademyPromoToMembershipPlan_B_index" ON "_AcademyPromoToMembershipPlan"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_AcademyPromoPersons_AB_unique" ON "_AcademyPromoPersons"("A", "B");

-- CreateIndex
CREATE INDEX "_AcademyPromoPersons_B_index" ON "_AcademyPromoPersons"("B");

-- CreateIndex
CREATE INDEX "AcademyPromo_academyId_idx" ON "AcademyPromo"("academyId");

-- CreateIndex
CREATE INDEX "Payment_academyPromoId_idx" ON "Payment"("academyPromoId");

-- AddForeignKey
ALTER TABLE "AcademyPromo" ADD CONSTRAINT "AcademyPromo_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyPromo" ADD CONSTRAINT "AcademyPromo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipSubscription" ADD CONSTRAINT "MembershipSubscription_academyPromoId_fkey" FOREIGN KEY ("academyPromoId") REFERENCES "AcademyPromo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_academyPromoId_fkey" FOREIGN KEY ("academyPromoId") REFERENCES "AcademyPromo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_academyPromoId_fkey" FOREIGN KEY ("academyPromoId") REFERENCES "AcademyPromo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AcademyPromoToMembershipPlan" ADD CONSTRAINT "_AcademyPromoToMembershipPlan_A_fkey" FOREIGN KEY ("A") REFERENCES "AcademyPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AcademyPromoToMembershipPlan" ADD CONSTRAINT "_AcademyPromoToMembershipPlan_B_fkey" FOREIGN KEY ("B") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AcademyPromoPersons" ADD CONSTRAINT "_AcademyPromoPersons_A_fkey" FOREIGN KEY ("A") REFERENCES "AcademyPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AcademyPromoPersons" ADD CONSTRAINT "_AcademyPromoPersons_B_fkey" FOREIGN KEY ("B") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
